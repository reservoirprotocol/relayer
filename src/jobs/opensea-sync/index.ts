import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { fetchOrders } from "./utils";
import { logger } from "../../common/logger";
import { acquireLock, redis } from "../../common/redis";
import { config } from "../../config";

// For real-time order syncing

const REALTIME_QUEUE_NAME = "realtime-opensea-sync";

const realtimeQueue = new Queue(REALTIME_QUEUE_NAME, {
  connection: redis,
});
new QueueScheduler(REALTIME_QUEUE_NAME, { connection: redis });

const realtimeWorker = new Worker(
  REALTIME_QUEUE_NAME,
  async (job: Job) => {
    const { minute } = job.data;

    try {
      const listedAfter = minute * 60 - 1;
      const listedBefore = listedAfter + 60 + 1;
      await fetchOrders(listedAfter, listedBefore);
    } catch (error) {
      // In case of any errors, retry the job via the backfill queue
      await addToBackfillQueue(minute, minute);
      throw error;
    }
  },
  { connection: redis }
);
realtimeWorker.on("error", (error) => {
  logger.error(REALTIME_QUEUE_NAME, `Worker errored: ${error}`);
});

const addToRealtimeQueue = async (minute: number) => {
  await realtimeQueue.add(minute.toString(), { minute });
};

// For backfill order syncing

const BACKFILL_QUEUE_NAME = "backfill-opensea-sync";

const backfillQueue = new Queue(BACKFILL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    // Lots of attempts with plenty of delay between them to allow both
    // rate-limiting failures and OpenSea downtime
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 120000,
    },
  },
});
new QueueScheduler(BACKFILL_QUEUE_NAME, { connection: redis });

const backfillWorker = new Worker(
  BACKFILL_QUEUE_NAME,
  async (job: Job) => {
    const { minute } = job.data;

    const listedAfter = minute * 60 - 1;
    const listedBefore = listedAfter + 60 + 1;
    await fetchOrders(listedAfter, listedBefore, true);
  },
  { connection: redis }
);
backfillWorker.on("error", (error) => {
  logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
});

export const addToBackfillQueue = async (
  fromMinute: number,
  toMinute: number
) => {
  const minutes = [];
  for (let minute = toMinute; minute >= fromMinute; minute--) {
    minutes.push(minute);
  }

  await backfillQueue.addBulk(
    minutes.map((minute) => ({
      name: minute.toString(),
      data: { minute },
    }))
  );
};

if (!config.skipWatching) {
  // Fetch new orders every 1 minute
  cron.schedule("*/1 * * * *", async () => {
    const lockAcquired = await acquireLock("opensea-sync-lock", 55);
    if (lockAcquired) {
      const cacheKey = "opensea-sync-last-minute";

      const minute = Math.floor(Date.now() / 1000 / 60);
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
