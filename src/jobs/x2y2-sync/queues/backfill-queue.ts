import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { fetchOrdersByDateCreated } from "../utils";
import { logger } from "../../../common/logger";
import { redis } from "../../../common/redis";
import { config } from "../../../config";

const BACKFILL_QUEUE_NAME = "backfill-x2y2-sync";

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

export type x2y2BackfillData = {
  startTime: number;
  endTime: number;
  contract?: string;
};

if (config.doBackfillWork) {
  const backfillWorker = new Worker(
    BACKFILL_QUEUE_NAME,
    async (job: Job) => {
      const { startTime, endTime, contract }: x2y2BackfillData = job.data;

      try {
        const lastCreatedAt = await fetchOrdersByDateCreated(
          "sell",
          startTime,
          endTime,
          contract
        );

        logger.info(
          BACKFILL_QUEUE_NAME,
          `X2Y2 backfilled from startTime=${startTime} to endTime=${endTime}`
        );

        // If there are more order within th given time frame
        if (lastCreatedAt <= endTime) {
          job.data.newStartTime = lastCreatedAt;
        }
      } catch (error) {
        logger.error(
          BACKFILL_QUEUE_NAME,
          `X2Y2 Sync failed attempts=${job.attemptsMade}, error=${error}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  backfillWorker.on("completed", async (job: Job) => {
    // If there's newStartTime schedule the next job
    if (job.data.newStartTime) {
      await addToX2Y2BackfillQueue(
        {
          startTime: job.data.newStartTime,
          endTime: job.data.endTime,
          contract: job.data.contract,
        },
        1000
      );
    }
  });

  backfillWorker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToX2Y2BackfillQueue = async (
  params: x2y2BackfillData,
  delayMs: number = 0
) => {
  // Make sure endTime is bigger than startTime
  if (params.endTime < params.startTime) {
    params.endTime = params.startTime + 1;
  }

  await backfillQueue.add(
    BACKFILL_QUEUE_NAME,
    {
      startTime: params.startTime,
      endTime: params.endTime,
      contract: params.contract,
    },
    { delay: delayMs }
  );
};
