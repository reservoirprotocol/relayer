import _ from "lodash";

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis, extendLock } from "../../common/redis";
import { config } from "../../config";
import { fetchSeaportOrders } from "./utils";
import { logger } from "../../common/logger";

const REALTIME_QUEUE_NAME = "realtime-seaport-looksrare-v2-sync";

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

if (config.doRealtimeWork && config.doLooksrareWork) {
  const realtimeWorker = new Worker(
    REALTIME_QUEUE_NAME,
    async (job: Job) => {
      try {
        let { cursor } = job.data;

        const cacheKey = "looksrare-v2-seaport-sync-last";
        let lastSyncedHashCache = await redis.get(cacheKey);
        let lastSyncedHash;

        if (_.isNull(lastSyncedHashCache)) {
          lastSyncedHashCache = "";
        }

        [lastSyncedHash, cursor] = await fetchSeaportOrders(
          lastSyncedHashCache,
          cursor
        );

        if (cursor) {
          await addToRealtimeQueue(1000, cursor);
        }

        // If new last created hash was returned
        if (lastSyncedHash) {
          await redis.set(cacheKey, lastSyncedHash);
        }
      } catch (error) {
        logger.error(
          REALTIME_QUEUE_NAME,
          JSON.stringify({
            message: `Looksrare sync failed lastSyncedHashCache=(${job.data.lastSyncedHashCache}), attempts=${job.attemptsMade}, error=${error}`,
            error,
            attempts: job.attemptsMade,
            syncSource: "Looksrare",
            lastSyncedHashCache: job.data.lastSyncedHashCache,
          })
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );

  realtimeWorker.on("completed", async (job) => {
    let { cursor } = job.data;

    // Set the next sync attempt
    const lockExtended = await extendLock(
      "looksrare-v2-seaport-sync-lock",
      120
    );

    if (lockExtended && cursor == "") {
      await addToRealtimeQueue(10000);
    }

    if (job.attemptsMade > 0) {
      logger.debug(
        REALTIME_QUEUE_NAME,
        `Sync recover attempts=${job.attemptsMade}`
      );
    }
  });

  realtimeWorker.on("error", (error) => {
    logger.error(REALTIME_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToRealtimeQueue = async (
  delayMs: number = 0,
  cursor: string = ""
) => {
  await realtimeQueue.add(REALTIME_QUEUE_NAME, { cursor }, { delay: delayMs });
};
