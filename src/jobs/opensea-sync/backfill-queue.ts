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

if (config.doBackfillWork) {
  const backfillWorker = new Worker(
    BACKFILL_QUEUE_NAME,
    async (job: Job) => {
      const { minute, second } = job.data;
      const currentMinute = Math.floor(getUnixTime(new Date()) / 60);
      const secondsTimeWindow = 20;

      // If we are still in the current minute delay the job
      if (currentMinute == minute) {
        logger.error(BACKFILL_QUEUE_NAME, `Delay minute ${minute}`);
        await addToBackfillQueue(minute, minute, 0,false, "", 60000);
        return;
      }

      if (!second) {
        let secondTimeWindow = (minute * 60) + secondsTimeWindow;
        while (secondTimeWindow <= (minute + 1) * 60) {
          await addToBackfillQueue(minute, minute, secondTimeWindow);
          secondTimeWindow += secondsTimeWindow;
        }

        return;
      }

      const listedAfter = second - secondsTimeWindow;
      const listedBefore = second;

      // Wait a random amount of time
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000));
      await fetchOrders(listedAfter, listedBefore, true);
    },
    { connection: redis.duplicate() }
  );

  backfillWorker.on("completed", (job) => {
    const { minute, second } = job.data;
    const maxAttempts = backfillQueue.defaultJobOptions.attempts;

    logger.info(
      BACKFILL_QUEUE_NAME,
      `Sync completed minute=${minute}, second=${second}, attempts=${job.attemptsMade} maxAttempts=${maxAttempts}`
    );
  });

  backfillWorker.on("failed", (job, error) => {
    const { minute, second } = job.data;
    const maxAttempts = backfillQueue.defaultJobOptions.attempts;

    logger.error(
      BACKFILL_QUEUE_NAME,
      `Sync failed minute=${minute}, second=${second}, attempts=${job.attemptsMade} maxAttempts=${maxAttempts}, error=${error}`
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
  second: number = 0,
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
      data: { minute, second },
      opts,
    }))
  );
};
