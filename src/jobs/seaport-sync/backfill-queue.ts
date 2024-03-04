import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "../../common/redis";
import { fetchAllOrders } from "./utils";
import { logger } from "../../common/logger";
import { config } from "../../config";
import _ from "lodash";

const BACKFILL_QUEUE_NAME = "backfill-seaport-sync";

export const backfillQueue = new Queue(BACKFILL_QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "fixed",
      delay: 3,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});
new QueueScheduler(BACKFILL_QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackfillWork && config.doOpenseaWork) {
  const backfillWorker = new Worker(
    BACKFILL_QUEUE_NAME,
    async (job: Job) => {
      const { fromTimestamp, toTimestamp, cursor } = job.data;

      try {
        // If this is the first run
        job.data.newCursor = await fetchAllOrders(
          fromTimestamp,
          toTimestamp,
          cursor
        );
      } catch (error: any) {
        job.data.newCursor = cursor;

        if ([429, 503].includes(error.response?.status)) {
          // Wait to avoid rate-limiting
          job.data.retry = true;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        logger.error(
          BACKFILL_QUEUE_NAME,
          `SeaPort Sync failed attempts=${job.attemptsMade}, fromTimestamp=${fromTimestamp}, toTimestamp=${toTimestamp}, cursor=${cursor}, error=${error}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  backfillWorker.on("completed", async (job) => {
    // Schedule the next sync
    if (job.data.newCursor) {
      await addToSeaportBackfillQueue(
        job.data.fromTimestamp,
        job.data.toTimestamp,
        job.data.newCursor,
        job.opts.priority
      );
    } else {
      if (_.isUndefined(job.data.retry)) {
        logger.info(
          "fetch_all_orders",
          `Seaport - COMPLETED - fromTimestamp=${job.data.fromTimestamp}, toTimestamp=${job.data.toTimestamp}`
        );
      }
    }

    if (job.attemptsMade > 0) {
      logger.info(
        BACKFILL_QUEUE_NAME,
        `Sync recover attempts=${job.attemptsMade}`
      );
    }
  });

  backfillWorker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const createTimeFrameForBackfill = async (
  fromTimestamp: number,
  toTimestamp: number,
  delayMs: number = 0
) => {
  let jobs = [];

  // Sync specific time frame
  for (
    let timestamp = fromTimestamp;
    timestamp <= toTimestamp;
    timestamp += 60
  ) {
    // Add to the queue with extra seconds to each side
    jobs.push({
      fromTimestamp: timestamp - 1,
      toTimestamp: timestamp + 61,
      cursor: null,
      priority: 0,
      delayMs,
    });
  }

  for (const job of _.chunk(jobs, 500)) {
    await addBulkToSeaportBackfillQueue(job);
  }
};

export const addToSeaportBackfillQueue = async (
  fromTimestamp: number | null = null,
  toTimestamp: number | null = null,
  cursor: string | null = null,
  priority: number = 0,
  delayMs: number = 0
) => {
  await backfillQueue.add(
    BACKFILL_QUEUE_NAME,
    { fromTimestamp, toTimestamp, cursor },
    { delay: delayMs, priority }
  );
};

export const addBulkToSeaportBackfillQueue = async (
  jobsData: {
    fromTimestamp: number | null;
    toTimestamp: number | null;
    cursor: string | null;
    priority: number;
    delayMs: number;
  }[]
) => {
  await backfillQueue.addBulk(
    _.map(jobsData, (data) => {
      return {
        name: BACKFILL_QUEUE_NAME,
        data: {
          fromTimestamp: data.fromTimestamp,
          toTimestamp: data.toTimestamp,
          cursor: data.cursor,
        },
        opts: { delay: data.delayMs, priority: data.priority },
      };
    })
  );
};
