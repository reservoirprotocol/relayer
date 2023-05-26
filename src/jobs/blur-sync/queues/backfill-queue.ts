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
      const { fromCursor, toCursor, contract, url, apiKey } = job.data as {
        fromCursor: string;
        toCursor: string;
        contract?: string;
        url?: string;
        apiKey?: string;
      };

      try {
        const { cursor: newCursor } = await fetchOrders(toCursor, 2, "desc", contract, url, apiKey);
        if (Number(newCursor) >= Number(fromCursor)) {
          await addToBlurBackfillQueue(fromCursor, newCursor, 0, contract, url, apiKey);
        }

        logger.info(BACKFILL_QUEUE_NAME, `Blur backfilled from cursor=${toCursor}`);
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
  fromCursor: string,
  toCursor: string,
  delayMs: number = 0,
  contract?: string,
  url?: string,
  apiKey?: string
) => {
  await backfillQueue.add(
    BACKFILL_QUEUE_NAME,
    { fromCursor, toCursor, contract, url, apiKey },
    { delay: delayMs }
  );
};
