import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { fetchOrders } from "../utils";
import { logger } from "../../../common/logger";
import { redis } from "../../../common/redis";
import { config } from "../../../config";

const BACKFILL_QUEUE_NAME = "backfill-element-sync";

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
      type Data = {
        startTime: number;
        endTime: number;
      };

      const { startTime, endTime }: Data = job.data;

      try {
        const cursor = await fetchOrders("sell", startTime, endTime);

        logger.info(
          BACKFILL_QUEUE_NAME,
          `Element backfilled from startTime=${startTime} to endTime=${endTime}`
        );

        // If there are more order within th given time frame
        if (cursor >= startTime) {
          job.data.newEndTime = cursor >= endTime ? endTime - 1 : cursor;
        }
      } catch (error) {
        logger.error(
          BACKFILL_QUEUE_NAME,
          `Element Sync failed attempts=${job.attemptsMade}, error=${error}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  backfillWorker.on("completed", async (job: Job) => {
    // If there's newEndTime schedule the next job
    if (job.data.newEndTime) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait to avoid rate-limiting
      await addToElementBackfillQueue(job.data.startTime, job.data.newEndTime);
    }
  });

  backfillWorker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToElementBackfillQueue = async (
  startTime: number,
  endTime: number,
  delayMs: number = 0
) => {
  // Make sure endTime is bigger than startTime
  if (endTime < startTime) {
    endTime = startTime + 1;
  }

  await backfillQueue.add(
    BACKFILL_QUEUE_NAME,
    { startTime, endTime },
    { delay: delayMs }
  );
};
