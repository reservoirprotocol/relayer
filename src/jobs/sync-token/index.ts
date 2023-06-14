import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { redis } from "../../common/redis";
import { config } from "../../config";
import { Seaport } from "../../utils/seaport";
import { addToRelayOrdersQueue } from "../relay-orders";
import _ from "lodash";

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
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

export const addToSyncTokenQueue = async (token: string, limit?: number, prioritized?: boolean) => {
  await queue.add(
    "sync-token",
    {
      token,
      limit: limit ? limit : 20,
    },
    {
      priority: prioritized ? 1 : undefined,
    }
  );
};

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { token } = job.data;

      if (token) {
        logger.info("fast_sync_token", `Fast syncing token ${token} from OpenSea`);

        const parsedOrders: {
          kind: "seaport-v1.4" | "seaport-v1.5";
          data: Sdk.SeaportBase.Types.OrderComponents;
        }[] = [];
        const insertQueries: any[] = [];
        const [contract, tokenId] = token.split(":");
        let totalOrders = 0;

        let hostname = "api.opensea.io";
        let network = "ethereum";
        switch (config.chainId) {
          case 4:
            hostname = "testnets-api.opensea.io";
            network = "rinkeby";
            break;

          case 10:
            network = "optimism";
            break;

          case 137:
            network = "matic";
            break;

          case 42161:
            network = "arbitrum";
            break;

          case 42170:
            network = "arbitrum_nova";
            break;
        }

        // Fetch recent listings
        const url = `https://${hostname}/v2/orders/${network}/seaport/listings?asset_contract_address=${contract}&token_ids=${tokenId}&order_by=eth_price&order_direction=desc`;

        await axios
          .get(
            url,
            _.indexOf([1, 137], config.chainId) !== -1
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
            totalOrders = response.data.orders.length;

            for (const order of response.data.orders) {
              const parsed = await new Seaport().parseSeaportOrder(order);
              if (parsed) {
                parsedOrders.push({
                  kind: parsed.kind,
                  data: parsed.order.params as any,
                });
              }

              // Skip saving any irrelevant information
              delete (order as any).asset;

              // TODO: Use multi-row inserts for better performance
              insertQueries.push({
                query: `
                  INSERT INTO "orders_v23" (
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
                  order.order_hash.toLowerCase(),
                  order.maker_asset_bundle.asset_contract.address.toLowerCase(),
                  order.maker.address.toLowerCase(),
                  new Date(order.created_date),
                  order.protocol_data as any,
                ],
              });
            }

            // Wait for one second to avoid rate-limiting
            await new Promise((resolve) => setTimeout(resolve, 1000));
          })
          .catch((error) => {
            logger.error(QUEUE_NAME, `Error fetching token listings: ${error}`);
          });

        if (insertQueries.length) {
          await db.none(pgp.helpers.concat(insertQueries));
        }

        await addToRelayOrdersQueue(parsedOrders, true);

        logger.info(
          "fast_sync_token",
          `Got total ${totalOrders} valid ${parsedOrders.length} orders for token ${token}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}
