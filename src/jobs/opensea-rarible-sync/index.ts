import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { redis } from "../../common/redis";
import { config } from "../../config";
import {
  OpenSeaRaribleOrder,
  parseOpenSeaRaribleOrder,
} from "../../utils/opensea-rarible";
import { addToRelayOrdersQueue } from "../relay-orders";

const QUEUE_NAME = "opensea-rarible-sync";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // Retry at most 20 times every 10 minutes
    attempts: 20,
    backoff: {
      type: "fixed",
      delay: 10 * 60 * 1000,
    },
    timeout: 60000,
    removeOnComplete: 100000,
    removeOnFail: 100000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

export const addToOpenSeaRaribleQueue = async (
  continuation: string | null,
  stop: number
) => {
  await queue.add(String(stop), { continuation, stop });
};

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { continuation, stop } = job.data;

      try {
        const baseRaribleUrl =
          config.chainId === 1
            ? "https://ethereum-api.rarible.org"
            : "https://ethereum-api-staging.rarible.org";
        let url = `${baseRaribleUrl}/v0.1/order/orders/sellByStatus`;
        url += "?platform=OPEN_SEA";
        url += "&status=ACTIVE";
        url += "&limit=50";
        url += "&sort=LAST_UPDATE_DESC";
        if (continuation) {
          url += `&continuation=${continuation}`;
        }

        await axios.get(url, { timeout: 10000 }).then(async (response: any) => {
          const orders: OpenSeaRaribleOrder[] = response.data.orders;
          if (orders.length) {
            const validOrders = await Promise.all(
              orders.map(parseOpenSeaRaribleOrder)
            ).then((o) => o.filter(Boolean).map((x) => x!));

            await saveOrders(validOrders);

            if (response.data.continuation) {
              const timestamp = Math.floor(
                Number(response.data.continuation.split("_")[0]) / 1000
              );
              if (timestamp >= stop) {
                await addToOpenSeaRaribleQueue(
                  response.data.continuation,
                  stop
                );
              }
            }

            // Wait for 1 seconds to avoid rate-limiting
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        });
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to fetch OpenSea orders from Rarible: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate() }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

// Disable for now
// if (!config.skipWatching) {
//   // Fetch new orders every 1 minute
//   cron.schedule("*/1 * * * *", async () => {
//     await Promise.race([
//       new Promise(async (resolve, reject) => {
//         try {
//           const cacheKey = "opensea_rarible_sync_continuation";

//           const limit = 50;

//           const baseRaribleUrl =
//             config.chainId === 1
//               ? "https://ethereum-api.rarible.org"
//               : "https://ethereum-api-staging.rarible.org";
//           let url = `${baseRaribleUrl}/v0.1/order/orders/sellByStatus?platform=OPEN_SEA&status=ACTIVE&limit=${limit}`;

//           let continuation = await redis.get(cacheKey);
//           if (!continuation) {
//             url += "&sort=LAST_UPDATE_DESC";

//             await axios
//               .get(url, { timeout: 10000 })
//               .then(async (response: any) => {
//                 const orders: OpenSeaRaribleOrder[] = response.data.orders;
//                 if (orders.length) {
//                   const validOrders = await Promise.all(
//                     orders.map(parseOpenSeaRaribleOrder)
//                   ).then((o) => o.filter(Boolean).map((x) => x!));

//                   await saveOrders(validOrders);

//                   await redis.set(
//                     cacheKey,
//                     new Date(orders[0].lastUpdateAt).getTime() +
//                       "_" +
//                       orders[0].hash
//                   );
//                 }
//               });
//           } else {
//             url += "&sort=LAST_UPDATE_ASC";

//             let done = false;
//             while (!done) {
//               await axios
//                 .get(`${url}&continuation=${continuation}`, { timeout: 10000 })
//                 .then(async (response: any) => {
//                   const orders: OpenSeaRaribleOrder[] = response.data.orders;
//                   if (orders.length) {
//                     const validOrders = await Promise.all(
//                       orders.map(parseOpenSeaRaribleOrder)
//                     ).then((o) => o.filter(Boolean).map((x) => x!));

//                     await saveOrders(validOrders);

//                     if (orders.length < limit || !response.data.continuation) {
//                       done = true;
//                       continuation =
//                         new Date(
//                           orders[orders.length - 1].lastUpdateAt
//                         ).getTime() +
//                         "_" +
//                         orders[orders.length - 1].hash;
//                     } else {
//                       continuation = response.data.continuation;
//                     }

//                     await redis.set(cacheKey, continuation!);
//                   } else {
//                     done = true;
//                   }
//                 });
//             }
//           }

//           resolve(true);
//         } catch (error) {
//           logger.error(
//             "opensea_rarible_sync",
//             `Failed to sync OpenSea orders from Rarible: ${error}`
//           );
//           reject(error);
//         }
//       }),
//       new Promise((_, reject) => setTimeout(reject, 55 * 1000)),
//     ]).catch(() => {
//       // Ignore any errors
//     });
//   });
// }

const saveOrders = async (
  data: {
    createdAt: string;
    order: Sdk.WyvernV2.Order;
  }[]
) => {
  if (data.length) {
    const columns = new pgp.helpers.ColumnSet(
      ["hash", "target", "maker", "created_at", "data"],
      {
        table: "orders",
      }
    );
    const values = pgp.helpers.values(
      data.map(({ createdAt, order }) => ({
        hash: order.prefixHash(),
        target: order.params.target,
        maker: order.params.maker,
        created_at: Math.floor(new Date(createdAt).getTime() / 1000),
        data: order.params as any,
      })),
      columns
    );
    const rowsInserted: { hash: string }[] = await db.manyOrNone(
      `
        insert into "orders"(
          "hash",
          "target",
          "maker",
          "created_at",
          "data"
        )
        values ${values}
        on conflict do nothing
        returning "hash"
      `
    );

    if (rowsInserted.length) {
      const newHashes = rowsInserted.map(({ hash }) => hash);
      const orders = data
        .filter(({ order }) => newHashes.includes(order.prefixHash()))
        .map(({ order }) => order);
      await addToRelayOrdersQueue(orders);

      const timestamp = Math.floor(
        new Date(data[data.length - 1].createdAt).getTime() / 1000
      );
      if (timestamp <= Math.floor(Date.now() / 1000) - 5 * 60) {
        logger.warn(
          "opensea_rarible_sync",
          `Got ${orders.length} old OpenSea orders from Rarible (near timestamp ${timestamp})`
        );
      } else {
        logger.info(
          "opensea_rarible_sync",
          `Got ${orders.length} new OpenSea orders from Rarible`
        );
      }
    }
  }
};
