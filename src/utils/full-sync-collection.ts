import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { db, pgp } from "../common/db";
import { logger } from "../common/logger";
import { config } from "../config";
import { addToRelayOrdersQueue } from "../jobs/relay-orders";
import { buildFetchAssetsURL, parseOpenSeaOrder } from "./opensea";

export const fullSyncCollection = async (collection: string) => {
  logger.info(
    "full_sync_collection",
    `Full syncing collection ${collection} from OpenSea`
  );

  let offset = 3000;
  let limit = 20;

  let numOrders = 0;

  let done = false;
  while (!done) {
    const url = buildFetchAssetsURL({
      collection,
      offset,
      limit,
    });
    
    logger.info(
      "full_sync_collection",
      `${url}`
    );

    await axios
      .get(
        url,
        config.chainId === 1
          ? {
              headers: {
                "x-api-key": config.backfillOpenseaApiKey,
                // https://twitter.com/lefterisjp/status/1483222328595165187?s=21
                "user-agent":
                  "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
              },
              timeout: 15000,
            }
          : // Skip including the API key on Rinkeby or else the request will fail
            { timeout: 15000 }
      )
      .then(async (response: any) => {
        const validOrders: Sdk.WyvernV23.Order[] = [];
        const insertQueries: any[] = [];

        const assets = response.data.assets;
        for (const asset of assets) {
          if (asset.sell_orders) {
            for (const order of asset.sell_orders) {
              const parsed = await parseOpenSeaOrder(order);
              if (parsed) {
                validOrders.push(parsed);
              }

              // Skip saving any irrelevant information
              delete (order as any).asset;

              // TODO: Use multi-row inserts for better performance
              insertQueries.push({
                query: `
                  insert into "orders"(
                    "hash",
                    "target",
                    "maker",
                    "created_at",
                    "data"
                  )
                  values ($1, $2, $3, $4, $5)
                  on conflict do nothing
                `,
                values: [
                  order.prefixed_hash,
                  order.target,
                  order.maker.address,
                  Math.floor(new Date(order.created_date).getTime() / 1000),
                  order as any,
                ],
              });
            }
          }
        }

        if (insertQueries.length) {
          await db.none(pgp.helpers.concat(insertQueries));
        }

        await addToRelayOrdersQueue(
          validOrders.map((order) => ({
            kind: "wyvern-v2.3",
            data: order.params,
          })),
          true
        );

        numOrders += validOrders.length;

        if (assets.length < limit) {
          done = true;
        } else {
          offset += limit;
        }

        // OpenSea doesn't allow offset greater than 10.000
        if (offset >= 10000) {
          done = true;
        }

        // Wait for one second to avoid rate-limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });
  }

  logger.info(
    "full_sync_collection",
    `Got ${numOrders} orders for collection ${collection}`
  );
};
