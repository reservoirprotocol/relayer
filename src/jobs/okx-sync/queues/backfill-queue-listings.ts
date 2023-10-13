import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "../../../common/logger";
import { redis, releaseLock } from "../../../common/redis";
import { config } from "../../../config";
import { fetchOrders } from "../utils";

const BACKFILL_QUEUE_NAME = "backfill-okx-listings-sync";

export const backfillQueue = new Queue(BACKFILL_QUEUE_NAME, {
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
new QueueScheduler(BACKFILL_QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackfillWork) {
  const realtimeWorker = new Worker(
    BACKFILL_QUEUE_NAME,
    async (job: Job) => {
      try {
        const createBefore = await redis
          .get(getCreateBeforeKey())
          .then((c) => (c ? c : Math.floor(Date.now() / 1000)));

        logger.info(
          BACKFILL_QUEUE_NAME,
          `Start syncing OKX listings (createBefore=${createBefore})`
        );

        const { minTimestamp } = await fetchOrders({
          side: "sell",
          createBefore: Number(createBefore),
          maxIterations: 10,
        });
        if (minTimestamp) {
          await redis.set(getCreateBeforeKey(), minTimestamp + 1);
          await addToOkxBackfillQueue();
        }
      } catch (error) {
        logger.error(
          BACKFILL_QUEUE_NAME,
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
      logger.info(
        BACKFILL_QUEUE_NAME,
        `OKX listings sync recovered (attempts=${job.attemptsMade})`
      );
    }
  });

  realtimeWorker.on("error", async (error) => {
    await releaseLock(getLockKey(), false);

    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToOkxBackfillQueue = async (delayMs: number = 0) => {
  await backfillQueue.add(BACKFILL_QUEUE_NAME, {}, { delay: delayMs });
};

const getCreateBeforeKey = () => `${BACKFILL_QUEUE_NAME}-create-before`;
export const getLockKey = () => `${BACKFILL_QUEUE_NAME}-lock`;
