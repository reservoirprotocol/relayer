import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis, extendLock } from "../../common/redis";
import { config } from "../../config";
import { fetchOrders } from "./utils";
import { logger } from "../../common/logger";
import { getUnixTime } from "date-fns";

const REALTIME_QUEUE_NAME = "realtime-opensea-sync";

export const realtimeQueue = new Queue(REALTIME_QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "fixed",
      delay: 3,
    },
    timeout: 60000,
    removeOnComplete: 10000,
    removeOnFail: 100,
  },
});
new QueueScheduler(REALTIME_QUEUE_NAME, { connection: redis.duplicate() });

if (config.doRealtimeWork) {
  const realtimeWorker = new Worker(
    REALTIME_QUEUE_NAME,
    async (job: Job) => {
      try {
        const cacheKey = "opensea-sync-last-second";
        const lastSyncedSecond = Number(await redis.get(cacheKey));
        job.data.lastSyncedSecond = lastSyncedSecond; // Set the last synced seconds to the job data

        const lastCreatedDate = await fetchOrders(lastSyncedSecond);
        const lastCreatedDateUnix = getUnixTime(new Date(lastCreatedDate));

        // If we have new last date created update the cache
        if (lastCreatedDateUnix > lastSyncedSecond) {
          await redis.set(cacheKey, lastCreatedDateUnix);
        }
      } catch (error) {
        logger.error(
          REALTIME_QUEUE_NAME,
          `Sync failed lastSyncedSecond=(${job.data.lastSyncedSecond}), attempts=${job.attemptsMade}, error=${error}`
        );
      }
    },
    { connection: redis.duplicate() }
  );

  realtimeWorker.on("completed", async (job) => {
    // Set the next sync attempt
    const lockExtended = await extendLock("opensea-sync-lock", 60);

    if (lockExtended) {
      await addToRealtimeQueue(1000);
    }

    if (job.attemptsMade > 0) {
      logger.info(
        REALTIME_QUEUE_NAME,
        `Sync recover lastSyncedSecond=(${job.data.lastSyncedSecond}) attempts=${job.attemptsMade}`
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
