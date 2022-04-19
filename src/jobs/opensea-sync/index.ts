import cron from "node-cron";

import "./realtime-queue";
import "./backfill-queue";

// import { acquireLock, redis } from "../../common/redis";
// import { config } from "../../config";
// import { logger } from "../../common/logger";
// import { realtimeQueue } from "./realtime-queue";

// import * as openseaSyncRealtime from "./realtime-queue";

// if (config.doRealtimeWork) {
//   // Fetch new orders every 1 minute
//   cron.schedule("*/1 * * * *", async () => {
//     const currentTimestamp = Math.floor(Date.now() / 1000);

//     const lockAcquired = await acquireLock("opensea-sync-lock", 120);

//     if (lockAcquired) {
//       const cacheKey = "opensea-sync-last-second";
//       let lastSyncedSecond = Number(await redis.get(cacheKey));

//       if (lastSyncedSecond === 0) {
//         // No cache, so we only sync the last minute
//         lastSyncedSecond = currentTimestamp - 60;
//         await redis.set(cacheKey, lastSyncedSecond);
//       }

//       await openseaSyncRealtime.addToRealtimeQueue();

//       logger.info(realtimeQueue.name, `Start sync from lastSyncedSecond=(${lastSyncedSecond})`);
//     }
//   });
// }

import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { fetchOrders } from "./utils";
import { logger } from "../../common/logger";
import { acquireLock, redis } from "../../common/redis";
import { config } from "../../config";

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

if (config.doBackgroundWork) {
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

if (config.doRealtimeWork) {
  // Fetch new orders every 1 minute
  cron.schedule("*/1 * * * *", async () => {
    const lockAcquired = await acquireLock("opensea-sync-lock", 55);
    if (lockAcquired) {
      const cacheKey = "opensea-sync-last-minute";

      const minute = Math.floor(Date.now() / 1000 / 60) - 2;
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
