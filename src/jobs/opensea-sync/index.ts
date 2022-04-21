import cron from "node-cron";

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { fetchOrders } from "./utils";
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
        await fetchOrders(0, 0, false, true);
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
}

if (config.doRealtimeWork) {
  // Fetch new orders every 1 minute
  cron.schedule("*/1 * * * *", async () => {
    const lockAcquired = await acquireLock("opensea-sync-lock", 55);
    if (lockAcquired) {
      const cacheKey = "opensea-sync-last-minute";

      const minute = Math.floor(Date.now() / 1000 / 60) - 4;
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
