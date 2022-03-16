import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "../../common/logger";
import { redis } from "../../common/redis";
import { config } from "../../config";
import * as Sdk from "@reservoir0x/sdk";
import {buildFetchListingsURL, parseOpenSeaOrder} from "../../utils/opensea";
import {db, pgp} from "../../common/db";
import { addToRelayOrdersQueue } from "../relay-orders";

const QUEUE_NAME = "sync-token";

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
    removeOnFail: 50,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

export const addToSyncTokenQueue = async (
  token: string,
  limit: number,
  prioritized?: boolean
) => {
  await queue.add(
    "sync-token",
    { token, limit },
    {
      priority: prioritized ? 1 : undefined,
    }
  );
};

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { token, limit } = job.data;

      if (token) {
        logger.info(
          "fast_sync_token",
          `Fast syncing token ${token} from OpenSea`
        );

        const validOrders: Sdk.WyvernV23.Order[] = [];
        const insertQueries: any[] = [];
        const [contract, tokenId] = token.split(':');

        // Fetch recent listings
        const url = buildFetchListingsURL({
          contract,
          tokenId,
          limit,
        });

        console.log(url);

        await axios
          .get(
            url,
            config.chainId === 1
              ? {
                headers: {
                  "x-api-key": config.backfillOpenseaApiKey,
                  "user-agent":
                    "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
                },
                timeout: 5000,
              }
              : // Skip including the API key on Rinkeby or else the request will fail
              { timeout: 5000 }
          )
          .then(async (response: any) => {
            for (const order of response.data.listings) {
              const parsed = await parseOpenSeaOrder(order);

              if (parsed) {
                validOrders.push(parsed);
              }

              // Skip saving any irrelevant information
              delete (order as any).asset;

              // TODO: Use multi-row inserts for better performance
              insertQueries.push({
                query: `
              INSERT INTO "orders_v23"(
                "hash",
                "target",
                "maker",
                "created_at",
                "data"
              )
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT DO NOTHING
            `,
                values: [
                  order.prefixed_hash,
                  order.target,
                  order.maker.address,
                  new Date(order.created_date),
                  order as any,
                ],
              });
            }

            // Wait for one second to avoid rate-limiting
            await new Promise((resolve) => setTimeout(resolve, 1000));
          })
          .catch((e) => {
            console.log(e.message);
          });

        // if (insertQueries.length) {
        //   await db.none(pgp.helpers.concat(insertQueries));
        // }
        //
        // await addToRelayOrdersQueue(
        //   validOrders.map((order) => ({
        //     kind: "wyvern-v2.3",
        //     data: order.params,
        //   })),
        //   true
        // );

        logger.info(
          "fast_sync_token",
          `Got ${validOrders.length} orders for token ${tokenId}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}
