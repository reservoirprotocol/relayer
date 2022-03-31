import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "../../common/logger";
import { redis } from "../../common/redis";
import { config } from "../../config";

const QUEUE_NAME = "relay-orders";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    timeout: 60000,
    removeOnComplete: true,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

export const addToRelayOrdersQueue = async (orders: any[], prioritized?: boolean) => {
  await queue.add(
    "relay-orders",
    { orders },
    {
      priority: prioritized ? 1 : undefined,
    }
  );
};

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { orders } = job.data;

      if (orders.length) {
        logger.info("relay_orders", `Relaying ${orders.length} orders`);

        const requests: Promise<any>[] = [];

        // Post orders to Indexer V3
        if (process.env.BASE_INDEXER_V3_API_URL) {
          requests.push(
            axios
              .post(
                `${process.env.BASE_INDEXER_V3_API_URL}/orders`,
                { orders },
                { timeout: 3 * 60000 }
              )
              .catch((error) => {
                logger.error("relay_orders", `Failed to relay orders to Indexer V3: ${error}`);
                // throw error;
              })
          );
        }

        // Post orders to Indexer Lite
        if (process.env.BASE_INDEXER_LITE_API_URL) {
          requests.push(
            axios
              .post(
                `${process.env.BASE_INDEXER_LITE_API_URL}/orders/v1`,
                { orders },
                { timeout: 60000 }
              )
              .catch((error) => {
                logger.error("relay_orders", `Failed to relay orders to Indexer Lite: ${error}`);
                throw error;
              })
          );
        }

        await Promise.all(requests);
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}
