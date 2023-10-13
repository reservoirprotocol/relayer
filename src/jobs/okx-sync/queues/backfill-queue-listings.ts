import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "../../../common/logger";
import { redis } from "../../../common/redis";
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
      const { runId } = job.data;

      try {
        const createBefore = await redis
          .get(getCreateBeforeKey(runId))
          .then((c) => (c ? c : Math.floor(Date.now() / 1000)));

        logger.info(
          BACKFILL_QUEUE_NAME,
          `Start syncing OKX listings (runId=${runId} createBefore=${createBefore})`
        );

        const { minTimestamp } = await fetchOrders({
          side: "sell",
          createBefore: Number(createBefore),
          maxIterations: 10,
        });
        if (minTimestamp) {
          await redis.set(getCreateBeforeKey(runId), minTimestamp + 1);
          await addToOkxBackfillQueue(runId);
        }
      } catch (error) {
        logger.error(
          BACKFILL_QUEUE_NAME,
          JSON.stringify({
            message: `OKX listings sync failed (runId=${runId})`,
            error,
            stack: (error as any).stack,
            attempts: job.attemptsMade,
            syncSource: "OKX",
          })
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  realtimeWorker.on("error", async (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToOkxBackfillQueue = async (runId = "", delayMs = 0) => {
  await backfillQueue.add(BACKFILL_QUEUE_NAME, { runId }, { delay: delayMs });
};

const getCreateBeforeKey = (runId: string) => `${BACKFILL_QUEUE_NAME}-${runId}-create-before`;
export const getLockKey = (runId: string) => `${BACKFILL_QUEUE_NAME}-${runId}-lock`;
