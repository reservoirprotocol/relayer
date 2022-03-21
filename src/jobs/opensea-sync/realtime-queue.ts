import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "../../common/redis";
import { config } from "../../config";
import { fetchOrders } from "./utils";
import { logger } from "../../common/logger";
import * as openseaSyncBackfill from "./backfill-queue";
import { backfillQueue } from "./backfill-queue";

const REALTIME_QUEUE_NAME = "realtime-opensea-sync";

export const realtimeQueue = new Queue(REALTIME_QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "fixed",
      delay: 1,
    },
    timeout: 60000,
    removeOnComplete: 10000,
    removeOnFail: 100,
  },
});
new QueueScheduler(REALTIME_QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const realtimeWorker = new Worker(
    REALTIME_QUEUE_NAME,
    async (job: Job) => {
      const second = job.data.second;
      const interval = job.data.interval;

      try {
        // OpenSea listed_after / listed_before are exclusive
        const listedAfter = second - interval - 1;
        await fetchOrders(listedAfter, second);
      } catch (error) {
        logger.error(REALTIME_QUEUE_NAME, `Realtime sync failed=${error}`);
      }
    },
    { connection: redis.duplicate() }
  );

  realtimeWorker.on("failed", async (job, err) => {
    // If we reached the max attempts log it
    if (job.attemptsMade == backfillQueue.defaultJobOptions.attempts) {
      const minute = job.data.minute;

      // In case we maxed the retries attempted, retry the job via the backfill queue
      await openseaSyncBackfill.addToBackfillQueue(minute, minute, true, minute);

      logger.error(
        REALTIME_QUEUE_NAME,
        `Max retries reached, attemptsMade= ${job.attemptsMade}, data=${JSON.stringify(job.data)}`
      );
    }
  });

  realtimeWorker.on("error", (error) => {
    logger.error(REALTIME_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToRealtimeQueue = async (minute: number, second: number, interval: number, delayMs: number = 0) => {
  await realtimeQueue.add(second.toString(), { minute, second, interval}, { delay: delayMs });
};