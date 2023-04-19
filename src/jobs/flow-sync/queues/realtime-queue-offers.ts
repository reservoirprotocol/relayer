import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { cacheKeys, fetchOrders, lockNames } from "../utils";
import { redis, releaseLock } from "../../../common/redis";
import { logger } from "../../../common/logger";
import { config } from "../../../config";

const REALTIME_QUEUE_NAME = "realtime-flow-offers-sync";

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

if (config.doRealtimeWork) {
  const realtimeWorker = new Worker(
    REALTIME_QUEUE_NAME,
    async (job: Job) => {
      try {
        const cacheKey = cacheKeys.syncOffersCursor;
        let cursor = await redis.get(cacheKey);

        const { cursor: newCursor } = await fetchOrders("buy", cursor || "");

        if (newCursor === cursor) {
          logger.info(
            REALTIME_QUEUE_NAME,
            `Flow cursor didn't change cursor=${cursor}, newCursor=${newCursor}`
          );
        }

        // Set the new cursor for the next job
        if (newCursor) {
          await redis.set(cacheKey, newCursor);
        }
      } catch (error) {
        logger.error(
          REALTIME_QUEUE_NAME,
          JSON.stringify({
            message: 'sync failed',
            error,
            attempts: job.attemptsMade,
            syncSource: 'Flow',
          })
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );

  realtimeWorker.on("completed", async (job) => {
    // Release the lock to allow the next sync
    await releaseLock(lockNames.syncOffersLock, false);

    if (job.attemptsMade > 0) {
      logger.info(REALTIME_QUEUE_NAME, `Sync recover attempts=${job.attemptsMade}`);
    }
  });

  realtimeWorker.on("error", (error) => {
    logger.error(REALTIME_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToRealtimeQueue = async (delayMs: number = 0) => {
  await realtimeQueue.add(REALTIME_QUEUE_NAME, {}, { delay: delayMs });
};
