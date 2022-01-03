import { Order } from "@georgeroman/wyvern-v2-sdk";
import axios from "axios";
import { backOff } from "exponential-backoff";

import { db, pgp } from "../common/db";
import { logger } from "../common/logger";
import {
  OpenseaOrder,
  buildFetchOrdersURL,
  parseOpenseaOrder,
} from "../common/opensea";
import config from "../config";

const fetchOrders = async (listedAfter: number, listedBefore: number) => {
  logger.info(
    "fetch_orders",
    `(${listedAfter}, ${listedBefore}) Fetching orders from OpenSea`
  );

  let offset = 0;
  let limit = 50;

  let numOrders = 0;

  let done = false;
  while (!done) {
    await backOff(
      async () => {
        const url = buildFetchOrdersURL({
          listed_after: listedAfter,
          listed_before: listedBefore,
          offset,
          limit,
        });

        await axios
          .get(
            url,
            config.chainId === 1
              ? {
                  headers: { "x-api-key": config.openseaApiKey },
                }
              : // Skip including the API key on Rinkeby or else the request will fail
                undefined
          )
          .then(async (response: any) => {
            const orders: OpenseaOrder[] = response.data.orders;

            const validOrders: Order[] = [];
            const insertQueries: any[] = [];
            for (const order of orders) {
              const parsed = parseOpenseaOrder(order);
              if (parsed) {
                validOrders.push(parsed);
              }

              // Skip saving any irrelevant information
              delete (order as any).asset;

              // TODO: Use multi-row inserts for better performance
              insertQueries.push({
                query: `
                INSERT INTO "orders"(
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
                  Math.floor(new Date(order.created_date).getTime() / 1000),
                  order as any,
                ],
              });
            }

            if (insertQueries.length) {
              await db.none(pgp.helpers.concat(insertQueries));
            }

            // Post orders to Indexer V2
            if (process.env.BASE_INDEXER_V2_API_URL) {
              await axios
                .post(
                  `${process.env.BASE_INDEXER_V2_API_URL}/orders/wyvern-v2`,
                  {
                    orders: validOrders,
                  }
                )
                .catch((error) => {
                  logger.error(
                    "fetch_orders",
                    `(${listedAfter}, ${listedBefore}) Failed to post orders to Indexer V2: ${error}`
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
                    "fetch_orders",
                    `(${listedAfter}, ${listedBefore}) Failed to post orders to Indexer V3: ${error}`
                  );
                });
            }

            if (orders.length < limit) {
              done = true;
            } else {
              offset += limit;
            }

            numOrders += orders.length;
          });
      },
      { numOfAttempts: 3 }
    ).catch((error) => {
      logger.error(
        "fetch_orders",
        `(${listedAfter}, ${listedBefore}) Failed to fetch orders: ${error}`
      );
    });
  }

  logger.info(
    "fetch_orders",
    `(${listedAfter}, ${listedBefore}) Got ${numOrders} orders`
  );
};

export const sync = async (from: number, to: number) => {
  const MAX_SECONDS = 60;

  for (let before = to; before >= from; before -= MAX_SECONDS) {
    const after = Math.max(before - MAX_SECONDS + 1, from);
    await fetchOrders(after - 1, before + 1);
  }
};
