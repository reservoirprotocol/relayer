import _ from "lodash";

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis, extendLock, releaseLock } from "../../common/redis";
import { config } from "../../config";
import { fetchOrders } from "./utils";
import { logger } from "../../common/logger";

const REALTIME_QUEUE_NAME = "realtime-manifold-sync";

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
        const cacheIdKey = "manifold-realtime-id";
        const cachePageKey = "manifold-realtime-page";

        let id = Number((await redis.get(cacheIdKey)) || 0);
        let page = Number((await redis.get(cachePageKey)) || 1);

        const [newId, newPage] = await fetchOrders(id, page);

        if (id === newId) {
          logger.info(REALTIME_QUEUE_NAME, `manifold realtime order id didn't change id=${id}`);
        } else {
          logger.info(
            REALTIME_QUEUE_NAME,
            `manifold realtime order id changed id=${id}, new id=${newId}`
          );
          await redis.set(cacheIdKey, newId);
        }

        if (page === newPage) {
          logger.info(REALTIME_QUEUE_NAME, `manifold realtime page didn't change page=${page}`);
        } else {
          logger.info(
            REALTIME_QUEUE_NAME,
            `manifold realtime page changed page=${page}, newPage=${newPage}`
          );
          await redis.set(cachePageKey, newPage);
        }
      } catch (error) {
        logger.error(
          REALTIME_QUEUE_NAME,
          JSON.stringify({
            message: `Manifold sync failed attempts=${job.attemptsMade}, error=${error}`,
            error,
            attempts: job.attemptsMade,
            syncSource: "Manifold",
          })
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );

  realtimeWorker.on("completed", async (job) => {
    // Release the lock to allow the next sync
    await releaseLock("manifold-sync-lock", false);

    if (job.attemptsMade > 0) {
      logger.info(REALTIME_QUEUE_NAME, `Sync recover attempts=${job.attemptsMade}`);
    }
  });

  realtimeWorker.on("error", (error) => {
    logger.error(REALTIME_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToRealtimeQueue = async (delayMs: number = 0, cursor: string = "") => {
  await realtimeQueue.add(REALTIME_QUEUE_NAME, { cursor }, { delay: delayMs });
};
