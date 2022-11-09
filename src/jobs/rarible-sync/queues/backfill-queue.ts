import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { fetchOrdersByCursor } from "../utils";
import { redis, releaseLock } from "../../../common/redis";
import { logger } from "../../../common/logger";
import { config } from "../../../config";

const BACKFILL_QUEUE_NAME = "backfill-rarible-sync";

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
      try {
        const cacheKey = "rarible-backfill-cursor";
        let cursor = await redis.get(cacheKey);

        const newCursor = await fetchOrdersByCursor(cursor || "", "DB_UPDATE_ASC");

        if (newCursor == cursor) {
          logger.info(
            BACKFILL_QUEUE_NAME,
            `rarible backfill cursor didn't change cursor=${cursor}, newCursor=${newCursor}`
          );
        }

        // Set the new cursor for the next job
        if (newCursor) {
          await redis.set(cacheKey, newCursor);
        }
      } catch (error) {
        logger.error(
          BACKFILL_QUEUE_NAME,
          `Rarible backfill sync failed attempts=${job.attemptsMade}, error=${error}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );

  backfillWorker.on("completed", async (job) => {
    // Release the lock to allow the next sync
    await releaseLock("rarible-backfill-sync-lock", false);

    if (job.attemptsMade > 0) {
      logger.info(BACKFILL_QUEUE_NAME, `Sync recover attempts=${job.attemptsMade}`);
    }
  });

  backfillWorker.on("error", (error) => {
    logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToRaribleBackfillQueue = async (delayMs: number = 0) => {
  await backfillQueue.add(BACKFILL_QUEUE_NAME, {}, { delay: delayMs });
};

//TODO: Delete below after queue is set up

// import { Job, Queue, QueueScheduler, Worker } from "bullmq";

// import { backfillFetchOrders } from "../utils";
// import { logger } from "../../../common/logger";
// import { redis } from "../../../common/redis";
// import { config } from "../../../config";

// const BACKFILL_QUEUE_NAME = "backfill-rarible-sync";

// export const backfillQueue = new Queue(BACKFILL_QUEUE_NAME, {
//   connection: redis.duplicate(),
//   defaultJobOptions: {
//     attempts: 1,
//     backoff: {
//       type: "fixed",
//       delay: 3,
//     },
//     timeout: 60000,
//     removeOnComplete: 100,
//     removeOnFail: 1000,
//   },
// });
// new QueueScheduler(BACKFILL_QUEUE_NAME, { connection: redis.duplicate() });

// if (config.doBackfillWork) {
//   const backfillWorker = new Worker(
//     BACKFILL_QUEUE_NAME,
//     async (job: Job) => {
//       try {
//         await backfillFetchOrders();

//         logger.info(BACKFILL_QUEUE_NAME, `Rarible backfilled`);
//       } catch (error) {
//         logger.error(
//           BACKFILL_QUEUE_NAME,
//           `Rarible Sync failed attempts=${job.attemptsMade}, error=${error}`
//         );
//       }
//     },
//     { connection: redis.duplicate(), concurrency: 1 }
//   );

//   backfillWorker.on("completed", async (job: Job) => {
//     // If there's newStartTime schedule the next job
//     if (job.data.newStartTime) {
//       await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait to avoid rate-limiting
//       await addToRaribleBackfillQueue();
//     }
//   });

//   backfillWorker.on("error", (error) => {
//     logger.error(BACKFILL_QUEUE_NAME, `Worker errored: ${error}`);
//   });
// }

// export const addToRaribleBackfillQueue = async (delayMs: number = 0) => {
//   await backfillQueue.add(BACKFILL_QUEUE_NAME, {}, { delay: delayMs });
// };
