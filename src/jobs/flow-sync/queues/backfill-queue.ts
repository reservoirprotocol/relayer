import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { fetchOrders } from "../utils";
import { logger } from "../../../common/logger";
import { redis } from "../../../common/redis";
import { config } from "../../../config";

const BACKFILL_QUEUE_NAME = "backfill-flow-sync";

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
        side: "buy" | "sell";
      };

      const { startTime, endTime, side }: Data = job.data;

      try {
        const { lastCreatedAt } = await fetchOrders(side, "", startTime, endTime);

        logger.info(
          BACKFILL_QUEUE_NAME,
          `Flow backfilled from startTime=${startTime} to endTime=${endTime}`
        );

        // If there are more order within th given time frame
        if (lastCreatedAt <= endTime) {
          job.data.newStartTime = lastCreatedAt;
        }
      } catch (error) {
        logger.error(
          BACKFILL_QUEUE_NAME,
          `Flow Sync failed attempts=${job.attemptsMade}, error=${error}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  backfillWorker.on("completed", async (job: Job) => {
    // If there's newStartTime schedule the next job
    if (job.data.newStartTime) {
      await addToFlowBackfillQueue(job.data.newStartTime, job.data.endTime, job.data.side, 1000);
    }
  });

  backfillWorker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToFlowBackfillQueue = async (
  startTime: number,
  endTime: number,
  side: "buy" | "sell",
  delayMs: number = 0
) => {
  // Make sure endTime is bigger than startTime
  if (endTime < startTime) {
    endTime = startTime + 1;
  }

  await backfillQueue.add(BACKFILL_QUEUE_NAME, { startTime, side, endTime }, { delay: delayMs });
};
