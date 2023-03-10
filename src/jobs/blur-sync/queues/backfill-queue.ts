import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "../../../common/logger";
import { redis } from "../../../common/redis";
import { config } from "../../../config";
import { fetchOrders } from "../utils";

const BACKFILL_QUEUE_NAME = "backfill-blur-sync";

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
  const backfillWorker = new Worker(
    BACKFILL_QUEUE_NAME,
    async (job: Job) => {
      const { cursor, endTime } = job.data as {
        cursor: string;
        endTime: number;
      };

      try {
        await fetchOrders(cursor);

        logger.info(BACKFILL_QUEUE_NAME, `Blur backfilled to endTime=${endTime}`);
      } catch (error) {
        logger.error(
          BACKFILL_QUEUE_NAME,
          `Blur sync failed  - attempts=${job.attemptsMade} error=${error}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  backfillWorker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToBlurBackfillQueue = async (
  cursor: string,
  endTime: number,
  delayMs: number = 0
) => {
  await backfillQueue.add(BACKFILL_QUEUE_NAME, { cursor, endTime }, { delay: delayMs });
};
