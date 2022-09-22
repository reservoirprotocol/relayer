import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis, releaseLock } from "../../common/redis";
import { fetchCollectionOffers, getCollectionsToFetchOffers } from "./utils";
import { logger } from "../../common/logger";
import { config } from "../../config";

const REALTIME_QUEUE_NAME = "realtime-seaport-sync-collection-offers";

export const realtimeQueue = new Queue(REALTIME_QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "fixed",
      delay: 3,
    },
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
        const fetchOffersCollections = await getCollectionsToFetchOffers();

        for (const fetchOffersCollection of fetchOffersCollections) {
          try {
            await fetchCollectionOffers(
              fetchOffersCollection.contract,
              fetchOffersCollection.tokenId
            );
          } catch (error) {
            logger.error(
              REALTIME_QUEUE_NAME,
              `SeaPort Sync collection offers failed contract=${fetchOffersCollection.contract}, tokenId=${fetchOffersCollection.tokenId}, error=${error}`
            );
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        logger.error(REALTIME_QUEUE_NAME, `SeaPort Sync collection offers failed. error=${error}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );

  realtimeWorker.on("completed", async (job) => {
    // Release the lock and allow new job to be scheduled
    await releaseLock("seaport-sync-collection-offers-lock", false);
  });

  realtimeWorker.on("failed", async (job) => {
    // Release the lock and allow new job to be scheduled
    await releaseLock("seaport-sync-collection-offers-lock", false);
  });

  realtimeWorker.on("error", (error) => {
    logger.error(REALTIME_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToRealtimeQueue = async (delayMs: number = 0) => {
  await realtimeQueue.add(REALTIME_QUEUE_NAME, {}, { delay: delayMs });
};
