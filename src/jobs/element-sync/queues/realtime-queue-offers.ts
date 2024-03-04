import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { fetchOrders } from "../utils";
import { redis, releaseLock } from "../../../common/redis";
import { logger } from "../../../common/logger";
import { config } from "../../../config";

const REALTIME_QUEUE_NAME = "realtime-element-sync-offers";

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
        const cacheKey = "element-sync-offers-cursor";
        let cursor = await redis.get(cacheKey);

        const newCursor = await fetchOrders("buy", cursor ? Number(cursor) : 0);

        if (cursor && newCursor == Number(cursor)) {
          logger.info(
            REALTIME_QUEUE_NAME,
            `Element offers cursor didn't change cursor=${cursor}, newCursor=${newCursor}`
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
            message: `Element offers sync failed attempts=${job.attemptsMade}, error=${error}`,
            error,
            attempts: job.attemptsMade,
            syncSource: "Element",
          })
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );

  realtimeWorker.on("completed", async (job) => {
    // Release the lock to allow the next sync
    await releaseLock("element-sync-offers-lock", false);

    if (job.attemptsMade > 0) {
      logger.info(
        REALTIME_QUEUE_NAME,
        `Sync offers recover attempts=${job.attemptsMade}`
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
