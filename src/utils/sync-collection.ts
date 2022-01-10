import { Order } from "@georgeroman/wyvern-v2-sdk";
import axios from "axios";

import { db, pgp } from "../common/db";
import { logger } from "../common/logger";
import { buildFetchAssetsURL, parseOpenseaOrder } from "./opensea";

export const syncCollection = async (collection: string) => {
  logger.info("sync_collection", `(${collection}) Syncing`);

  let offset = 0;
  let limit = 20;

  let numOrders = 0;

  let done = false;
  while (!done) {
    const url = buildFetchAssetsURL({
      collection,
      offset,
      limit,
    });

    await axios.get(url).then(async (response: any) => {
      const validOrders: Order[] = [];
      const insertQueries: any[] = [];

      const assets = response.data.assets;
      for (const asset of assets) {
        if (asset.sell_orders) {
          for (const order of asset.sell_orders) {
            const parsed = parseOpenseaOrder(order);
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

      // Post orders to Indexer V2
      // TODO: Remove once Indexer V2 gets deprecated
      if (process.env.BASE_INDEXER_V2_API_URL) {
        await axios
          .post(`${process.env.BASE_INDEXER_V2_API_URL}/orders/wyvern-v2`, {
            orders: validOrders,
          })
          .catch((error) => {
            logger.error(
              "sync_collection",
              `(${collection}) Failed to post orders to Indexer V2: ${error}`
            );
          });
      }

      // Post orders to Indexer V3
      if (process.env.BASE_INDEXER_V3_API_URL) {
        await axios
          .post(`${process.env.BASE_INDEXER_V3_API_URL}/orders`, {
            orders: validOrders.map((data) => ({
              kind: "wyvern-v2",
              data,
            })),
          })
          .catch((error) => {
            logger.error(
              "sync_collection",
              `(${collection}) Failed to post orders to Indexer V3: ${error}`
            );
          });
      }

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
    });
  }

  logger.info("sync_collection", `(${collection}) Got ${numOrders} orders`);
};
