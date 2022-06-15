import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis, extendLock } from "../../common/redis";
import { fetchAllOrders, fetchOrders } from "./utils";
import { logger } from "../../common/logger";
import { config } from "../../config";

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

if (config.doBackfillWork) {
  const backfillWorker = new Worker(
    BACKFILL_QUEUE_NAME,
    async (job: Job) => {
      const { cursor } = job.data;

      try {
        // If this is the first run
        job.data.newCursor = await fetchAllOrders(cursor);
      } catch (error) {
        logger.error(
          BACKFILL_QUEUE_NAME,
          `SeaPort Sync failed attempts=${job.attemptsMade}, error=${error}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );

  backfillWorker.on("completed", async (job) => {
    // Schedule the next sync
    if (job.data.newCursor) {
      await addToBackfillQueue(job.data.newCursor);
    }

    if (job.attemptsMade > 0) {
      logger.info(BACKFILL_QUEUE_NAME, `Sync recover attempts=${job.attemptsMade}`);
    }
  });

  backfillWorker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToBackfillQueue = async (cursor: string | null = null, delayMs: number = 0) => {
  await backfillQueue.add(BACKFILL_QUEUE_NAME, { cursor }, { delay: delayMs });
};
