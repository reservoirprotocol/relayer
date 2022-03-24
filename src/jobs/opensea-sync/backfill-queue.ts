import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "../../common/redis";
import { config } from "../../config";
import { fetchOrders } from "./utils";
import { logger } from "../../common/logger";
import { getUnixTime } from "date-fns";

const BACKFILL_QUEUE_NAME = "backfill-opensea-sync";

export const backfillQueue = new Queue(BACKFILL_QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // Lots of attempts to handle both rate-limiting and OpenSea downtime
    // Retry at most 30 times every 1 hour
    attempts: 30,
    backoff: {
      type: "fixed",
      delay: 60 * 60 * 1000,
    },
    timeout: 60000,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(BACKFILL_QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const backfillWorker = new Worker(
    BACKFILL_QUEUE_NAME,
    async (job: Job) => {
      const { minute } = job.data;
      const currentMinute = Math.floor(getUnixTime(new Date()) / 60);

      // If we are still in the current minute delay the job
      if (currentMinute == minute) {
        logger.error(BACKFILL_QUEUE_NAME, `Delay minute ${minute}`);
        await addToBackfillQueue(minute, minute, false, "", 60000);
        return;
      }

      const listedAfter = minute * 60 - 1;
      const listedBefore = (minute + 1) * 60 + 1;
      // Wait a random amount of time
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000));
      await fetchOrders(listedAfter, listedBefore, true);
    },
    { connection: redis.duplicate() }
  );

  backfillWorker.on("failed", (job, error) => {
    const { minute } = job.data;
    const maxAttempts = backfillQueue.defaultJobOptions.attempts;

    logger.error(
      BACKFILL_QUEUE_NAME,
      `Sync failed minute=${minute}, attempts=${job.attemptsMade} maxAttempts=${maxAttempts}, error=${error}`
    );

    // If we reached the max attempts log it
    if (job.attemptsMade == maxAttempts) {
      logger.error(
        BACKFILL_QUEUE_NAME,
        `Max retries reached, attemptsMade= ${job.attemptsMade}, data=${JSON.stringify(job.data)}`
      );
    }
  });

  backfillWorker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToBackfillQueue = async (
  fromMinute: number,
  toMinute: number,
  prioritized = false,
  jobId: string = "",
  delayMs: number = 0
) => {
  const minutes = [];
  for (let minute = toMinute; minute >= fromMinute; minute--) {
    minutes.push(minute);
  }

  const opts = {
    delay: delayMs,
    priority: prioritized ? 1 : undefined,
  };

  if (jobId != "") {
    (opts as any).jobId = jobId;
  }

  await backfillQueue.addBulk(
    minutes.map((minute) => ({
      name: minute.toString(),
      data: { minute },
      opts,
    }))
  );
};
