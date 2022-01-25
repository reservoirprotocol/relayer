import { Order } from "@georgeroman/wyvern-v2-sdk";
import axios from "axios";

import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { config } from "../../config";
import {
  OpenseaOrder,
  buildFetchOrdersURL,
  parseOpenseaOrder,
} from "../../utils/opensea";
import { addToRelayOrdersQueue } from "../relay-orders";

export const fetchOrders = async (
  listedAfter: number,
  listedBefore: number,
  backfill = false
) => {
  logger.info(
    "fetch_orders",
    `(${listedAfter}, ${listedBefore}) Fetching orders from OpenSea`
  );

  let offset = 0;
  let limit = 50;

  let numOrders = 0;

  let done = false;
  while (!done) {
    const url = buildFetchOrdersURL({
      listedAfter,
      listedBefore,
      offset,
      limit,
    });

    await axios
      .get(
        url,
        config.chainId === 1
          ? {
              headers: {
                "x-api-key": backfill
                  ? config.backfillOpenseaApiKey
                  : config.realtimeOpenseaApiKey,
                // https://twitter.com/lefterisjp/status/1483222328595165187?s=21
                "user-agent":
                  "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
              },
              timeout: 5000,
            }
          : // Skip including the API key on Rinkeby or else the request will fail
            { timeout: 5000 }
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

        if (insertQueries.length) {
          await db.none(pgp.helpers.concat(insertQueries));
        }

        await addToRelayOrdersQueue(validOrders);

        numOrders += orders.length;

        if (orders.length < limit) {
          done = true;
        } else {
          offset += limit;
        }

        // Wait for one second to avoid rate-limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });
  }

  logger.info(
    "fetch_orders",
    `(${listedAfter}, ${listedBefore}) Got ${numOrders} orders`
  );
};
