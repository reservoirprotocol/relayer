import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { backfillFetchOrders } from "../utils";
import { logger } from "../../../common/logger";
import { redis } from "../../../common/redis";
import { config } from "../../../config";

const BACKFILL_QUEUE_NAME = "backfill-rarible-sync";

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
      try {
        await backfillFetchOrders("sell");

        logger.info(BACKFILL_QUEUE_NAME, `Rarible backfilled`);
      } catch (error) {
        logger.error(
          BACKFILL_QUEUE_NAME,
          `Rarible Sync failed attempts=${job.attemptsMade}, error=${error}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  backfillWorker.on("completed", async (job: Job) => {
    // If there's newStartTime schedule the next job
    if (job.data.newStartTime) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait to avoid rate-limiting
      await addToRaribleBackfillQueue();
    }
  });

  backfillWorker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToRaribleBackfillQueue = async (delayMs: number = 0) => {
  await backfillQueue.add(BACKFILL_QUEUE_NAME, {}, { delay: delayMs });
};
