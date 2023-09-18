import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { redis } from "../../common/redis";
import { config } from "../../config";
import { fetchOrdersByDateCreated, fetchOrdersByPageToken } from "./utils";
import { logger } from "../../common/logger";
import { fromUnixTime, isBefore } from "date-fns";

const BACKFILL_QUEUE_NAME = "backfill-coinbase-sync";

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
        side: "sell" | "buy";
        startTime: number;
        endTime: number;
        pageToken?: string;
      };

      const { startTime, endTime, pageToken, side }: Data = job.data;

      let newPageToken;
      let lastCreatedAt;

      try {
        if (pageToken) {
          [newPageToken, lastCreatedAt] = await fetchOrdersByPageToken(side, pageToken);
        } else {
          const startTimeDate = fromUnixTime(startTime);
          [newPageToken, lastCreatedAt] = await fetchOrdersByDateCreated(
            startTimeDate.toISOString()
          );
        }

        // If there are more order within th given time frame
        if (lastCreatedAt && isBefore(new Date(lastCreatedAt), endTime)) {
          job.data.newPageToken = newPageToken;
        }
      } catch (error) {
        logger.error(
          BACKFILL_QUEUE_NAME,
          `Coinbase Sync failed attempts=${job.attemptsMade}, error=${error}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  backfillWorker.on("completed", async (job: Job) => {
    // If there's newStartTime schedule the next job
    if (job.data.newPageToken) {
      await addToCoinbaseBackfillQueue(
        job.data.side,
        job.data.newStartTime,
        job.data.endTime,
        job.data.newPageToken,
        1000
      );
    } else {
      logger.info(
        BACKFILL_QUEUE_NAME,
        `Coinbase backfilled from startTime=${job.data.newStartTime} to endTime=${job.data.endTime}`
      );
    }
  });

  backfillWorker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToCoinbaseBackfillQueue = async (
  side: "sell" | "buy",
  startTime: number,
  endTime: number,
  pageToken = "",
  delayMs: number = 0
) => {
  // Make sure endTime is bigger than startTime
  if (endTime < startTime) {
    endTime = startTime + 1;
  }

  await backfillQueue.add(
    BACKFILL_QUEUE_NAME,
    { startTime, endTime, pageToken, side },
    { delay: delayMs }
  );
};
