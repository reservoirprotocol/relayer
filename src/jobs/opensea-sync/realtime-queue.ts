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
    attempts: 6,
    backoff: {
      type: "fixed",
      delay: 3,
    },
    timeout: 60000,
    removeOnComplete: 10000,
    removeOnFail: 100,
  },
});
new QueueScheduler(REALTIME_QUEUE_NAME, { connection: redis.duplicate() });

if (config.doRealtimeWork) {
  const realtimeWorker = new Worker(
    REALTIME_QUEUE_NAME,
    async (job: Job) => {
      const second = job.data.second;
      const interval = job.data.interval;

      // OpenSea listed_after / listed_before are exclusive
      const listedAfter = second - interval - 1;

      try {
        await fetchOrders(listedAfter, second);
      } catch (error) {
        throw error;
      }
    },
    { connection: redis.duplicate() }
  );

  realtimeWorker.on("completed", (job) => {
    if (job.attemptsMade > 0) {
      const second = job.data.second;
      const interval = job.data.interval;
      const listedAfter = second - interval - 1;

      logger.info(
        REALTIME_QUEUE_NAME,
        `Realtime sync recover timeframe=(${listedAfter}, ${second}) attempts=${job.attemptsMade}`
      );
    }
  });

  realtimeWorker.on("failed", async (job, error) => {
    const second = job.data.second;
    const interval = job.data.interval;

    const minute = Math.floor(second / 60);
    const listedAfter = second - interval - 1;
    const maxAttempts = realtimeQueue.defaultJobOptions.attempts;

    logger.error(
      REALTIME_QUEUE_NAME,
      `Realtime sync failed timeframe=(${listedAfter}, ${second}), attempts=${job.attemptsMade} maxAttempts=${maxAttempts}, error=${error}`
    );

    // If we reached the max attempts log it
    if (job.attemptsMade == realtimeQueue.defaultJobOptions.attempts) {
      // In case we maxed the retries attempted, retry the job via the backfill queue
      await openseaSyncBackfill.addToBackfillQueue(minute, minute, true, `${minute}`);

      logger.error(
        REALTIME_QUEUE_NAME,
        `Max retries reached, attemptsMade=${
          job.attemptsMade
        }, minute=${minute}, data=${JSON.stringify(job.data)}`
      );
    }
  });

  realtimeWorker.on("error", (error) => {
    logger.error(REALTIME_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToRealtimeQueue = async (second: number, interval: number, delayMs: number = 0) => {
  await realtimeQueue.add(second.toString(), { second, interval }, { delay: delayMs });
};
