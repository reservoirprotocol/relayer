import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "../../../common/logger";
import { redis, releaseLock } from "../../../common/redis";
import { config } from "../../../config";
import { fetchOrders } from "../utils";

const REALTIME_QUEUE_NAME = "realtime-okx-listings-sync";

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
        const createAfter = await redis
          .get(getCreateAfterKey())
          .then((c) => (c ? c : Math.floor(Date.now() / 1000 - 30)));

        logger.debug(
          REALTIME_QUEUE_NAME,
          `Start syncing OKX listings (createAfter=${createAfter})`
        );

        const { maxTimestamp } = await fetchOrders({
          side: "sell",
          createAfter: Number(createAfter),
          maxIterations: 10,
        });

        if (maxTimestamp) {
          await redis.set(getCreateAfterKey(), maxTimestamp - 1);
        }
      } catch (error) {
        logger.error(
          REALTIME_QUEUE_NAME,
          JSON.stringify({
            message: "OKX listings sync failed",
            error,
            stack: (error as any).stack,
            attempts: job.attemptsMade,
            syncSource: "OKX",
          })
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );

  realtimeWorker.on("completed", async (job) => {
    await releaseLock(getLockKey(), false);

    if (job.attemptsMade > 0) {
      logger.debug(
        REALTIME_QUEUE_NAME,
        `OKX listings sync recovered (attempts=${job.attemptsMade})`
      );
    }
  });

  realtimeWorker.on("error", async (error) => {
    await releaseLock(getLockKey(), false);

    logger.error(REALTIME_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToRealtimeQueue = async (delayMs: number = 0) => {
  await realtimeQueue.add(REALTIME_QUEUE_NAME, {}, { delay: delayMs });
};

const getCreateAfterKey = () => `${REALTIME_QUEUE_NAME}-create-after`;
export const getLockKey = () => `${REALTIME_QUEUE_NAME}-lock`;
