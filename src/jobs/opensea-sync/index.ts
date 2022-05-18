import { Network, OpenSeaStreamClient } from "@opensea/stream-js";
import { WebSocket } from "ws";

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import cron from "node-cron";

import { fetchOrders } from "./utils";
import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { acquireLock, redis } from "../../common/redis";
import { config } from "../../config";

// For live order syncing

const LIVE_QUEUE_NAME = "live-opensea-sync";

export const liveQueue = new Queue(LIVE_QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    timeout: 2000,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(LIVE_QUEUE_NAME, { connection: redis.duplicate() });

if (config.doLiveWork) {
  const liveWorker = new Worker(
    LIVE_QUEUE_NAME,
    async (_job: Job) => {
      try {
        if (config.chainId === 1) {
          await Promise.all([fetchOrders(0, 0, false, true), fetchOrders(0, 0, false, true, 50)]);
        } else {
          await fetchOrders(0, 0, false, true);
        }
      } catch {
        // Skip in case of any errors
      }
    },
    { connection: redis.duplicate() }
  );
  liveWorker.on("error", (error) => {
    logger.error(LIVE_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

const addToLiveQueue = async () => {
  await liveQueue.add(randomUUID(), {});
};

// For real-time order syncing

const REALTIME_QUEUE_NAME = "realtime-opensea-sync";

export const realtimeQueue = new Queue(REALTIME_QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    timeout: 60000,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(REALTIME_QUEUE_NAME, { connection: redis.duplicate() });

if (config.doRealtimeWork) {
  const realtimeWorker = new Worker(
    REALTIME_QUEUE_NAME,
    async (job: Job) => {
      const { minute } = job.data;

      try {
        const listedAfter = minute * 60 - 1;
        const listedBefore = (minute + 1) * 60 + 1;
        await fetchOrders(listedAfter, listedBefore);
      } catch (error) {
        // In case of any errors, retry the job via the backfill queue
        await addToBackfillQueue(minute, minute, true);
        throw error;
      }
    },
    { connection: redis.duplicate() }
  );
  realtimeWorker.on("error", (error) => {
    logger.error(REALTIME_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

const addToRealtimeQueue = async (minute: number) => {
  await realtimeQueue.add(minute.toString(), { minute });
};

// For backfill order syncing

const BACKFILL_QUEUE_NAME = "backfill-opensea-sync";

export const backfillQueue = new Queue(BACKFILL_QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // Lots of attempts to handle both rate-limiting and OpenSea downtime
    // Retry at most 30 times every 1 hour
    attempts: 30,
    backoff: {
      type: "fixed",
      delay: 60 * 60 * 1000,
    },
    timeout: 60000,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(BACKFILL_QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const backfillWorker = new Worker(
    BACKFILL_QUEUE_NAME,
    async (job: Job) => {
      const { minute } = job.data;

      const listedAfter = minute * 60 - 1;
      const listedBefore = (minute + 1) * 60 + 1;
      await fetchOrders(listedAfter, listedBefore, true);
    },
    { connection: redis.duplicate() }
  );
  backfillWorker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToBackfillQueue = async (
  fromMinute: number,
  toMinute: number,
  prioritized = false
) => {
  const minutes = [];
  for (let minute = toMinute; minute >= fromMinute; minute--) {
    minutes.push(minute);
  }

  await backfillQueue.addBulk(
    minutes.map((minute) => ({
      name: minute.toString(),
      data: { minute },
      opts: {
        priority: prioritized ? 1 : undefined,
      },
    }))
  );
};

if (config.doLiveWork) {
  cron.schedule("*/2 * * * * *", async () => {
    await addToLiveQueue();
  });

  // Every day, clear the live queue which might lag behind
  cron.schedule("0 0 0 * * *", async () => {
    await liveQueue.clean(0, 1000, "wait");
  });

  // Connect to OpenSea listing events
  {
    const columns = new pgp.helpers.ColumnSet(
      ["maker", "contract", "token_id", "price", "listing_time", "event_date"],
      { table: "listing_events" }
    );

    const client = new OpenSeaStreamClient({
      token: config.realtimeOpenseaApiKey,
      connectOptions: {
        transport: WebSocket,
      },
      network: config.chainId === 1 ? Network.MAINNET : Network.TESTNET,
    });

    client.onItemListed("*", async (event) => {
      try {
        const [network, contract, tokenId] = event.payload.item.nft_id.split("/");
        if (network === "ethereum") {
          await db.manyOrNone(
            pgp.helpers.insert(
              {
                maker: event.payload.maker.address,
                contract: contract,
                token_id: tokenId,
                price: event.payload.base_price,
                listing_time: Math.floor(new Date(event.payload.listing_date).getTime() / 1000),
                event_date: event.payload.event_timestamp,
              },
              columns
            ) + " ON CONFLICT DO NOTHING"
          );
        }
      } catch (error) {
        logger.error("opensea_websocket", `Failed to save listing event: ${error}`);
      }
    });
  }
}

if (config.doRealtimeWork) {
  // Fetch new orders every 1 minute
  cron.schedule("*/1 * * * *", async () => {
    const lockAcquired = await acquireLock("opensea-sync-lock", 55);
    if (lockAcquired) {
      const cacheKey = "opensea-sync-last-minute";

      const minute = Math.floor(Date.now() / 1000 / 60) - 5;
      const lastSyncedMinute = Number(await redis.get(cacheKey));

      if (lastSyncedMinute === 0) {
        // No cache, so we only sync the last minute
        await addToBackfillQueue(minute, minute);
      } else if (lastSyncedMinute < minute) {
        // Sync from last synced minute up to current minute
        await addToRealtimeQueue(minute);
        if (lastSyncedMinute < minute - 1) {
          await addToBackfillQueue(lastSyncedMinute, minute - 1);
        }
      }

      await redis.set(cacheKey, String(minute));
    }
  });
}
