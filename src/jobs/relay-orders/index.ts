import { Order } from "@georgeroman/wyvern-v2-sdk";
import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "../../common/logger";
import { redis } from "../../common/redis";

const QUEUE_NAME = "relay-orders";

const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

export const addToRelayOrdersQueue = async (orders: Order[]) => {
  await queue.add("relay-orders", { orders });
};

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    const { orders } = job.data;

    logger.info("relay_orders", `Relaying ${orders.length} orders`);

    // Post orders to Indexer V3
    if (process.env.BASE_INDEXER_V3_API_URL) {
      await axios
        .post(
          `${process.env.BASE_INDEXER_V3_API_URL}/orders`,
          {
            orders: orders.map((data: any) => ({
              kind: "wyvern-v2",
              data,
            })),
          },
          { timeout: 60000 }
        )
        .catch((error) => {
          logger.error(
            "relay_orders",
            `Failed to relay orders to Indexer V3: ${error}`
          );
        });
    }
  },
  { connection: redis.duplicate() }
);
worker.on("error", (error) => {
  logger.error(QUEUE_NAME, `Worker errored: ${error}`);
});
