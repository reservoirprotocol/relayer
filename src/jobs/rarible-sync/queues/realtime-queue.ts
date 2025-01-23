import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { fetchOrdersByTimestamp } from "../utils";
import { redis, releaseLock } from "../../../common/redis";
import { logger } from "../../../common/logger";
import { config } from "../../../config";

const REALTIME_QUEUE_NAME = "realtime-rarible-sync";

export const realtimeQueue = new Queue(REALTIME_QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "fixed",
      delay: 3,
    },
    timeout: 60000,
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});
new QueueScheduler(REALTIME_QUEUE_NAME, { connection: redis.duplicate() });

if (config.doRealtimeWork && config.doRaribleWork) {
  const realtimeWorker = new Worker(
    REALTIME_QUEUE_NAME,
    async (job: Job) => {
      try {
        const cacheKey = "rarible-realtime-timestamp";

        let timestamp = Number((await redis.get(cacheKey)) || 0);

        // Using the cursor with DESC sorting goes back in time. Do not use cursor for realtime fetching.
        const newTimestamp = await fetchOrdersByTimestamp(1000, timestamp);

        if (timestamp == newTimestamp) {
          logger.info(
            REALTIME_QUEUE_NAME,
            `rarible realtime timestamp didn't change timestamp=${timestamp}, newTimestamp=${newTimestamp}`
          );
        } else {
          await redis.set(cacheKey, newTimestamp);
        }
      } catch (error: any) {
        logger.error(
          REALTIME_QUEUE_NAME,
          JSON.stringify({
            message: `Rarible sync failed attempts=${job.attemptsMade}, error=${error}`,
            error,
            stack: error.stack,
            attempts: job.attemptsMade,
            syncSource: "Rarible",
          })
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );

  realtimeWorker.on("completed", async (job) => {
    // Release the lock to allow the next sync
    await releaseLock("rarible-sync-lock", false);

    if (job.attemptsMade > 0) {
      logger.info(
        REALTIME_QUEUE_NAME,
        `Sync recover attempts=${job.attemptsMade}`
      );
    }
  });

  realtimeWorker.on("error", (error) => {
    logger.error(REALTIME_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToRealtimeQueue = async (delayMs: number = 0) => {
  await realtimeQueue.add(REALTIME_QUEUE_NAME, {}, { delay: delayMs });
};
