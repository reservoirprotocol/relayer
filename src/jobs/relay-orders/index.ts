import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "../../common/logger";
import { redis } from "../../common/redis";
import { config } from "../../config";

const QUEUE_NAME = "relay-orders";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
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

        logger.info("relay_orders_debug", JSON.stringify(orders[0]));

        const requests: Promise<any>[] = [];

        // Post orders to Indexer Lite
        if (process.env.BASE_INDEXER_LITE_API_URL) {
          const headers = {};
          if (process.env.INDEXER_ADMIN_API_KEY) {
            (headers as any)["X-Admin-Api-Key"] = process.env.INDEXER_ADMIN_API_KEY;
          }

          if (process.env.INDEXER_API_KEY) {
            (headers as any)["X-Api-Key"] = process.env.INDEXER_API_KEY;
          }

          requests.push(
            axios
              .post(
                `${process.env.BASE_INDEXER_LITE_API_URL}/orders/v1`,
                { orders },
                {
                  timeout: 60000,
                  headers,
                }
              )
              .catch((error) => {
                logger.error(
                  "relay_orders",
                  `Failed to relay orders to Indexer Lite: ${error}, ${JSON.stringify(
                    error.response?.data
                  )}`
                );
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
