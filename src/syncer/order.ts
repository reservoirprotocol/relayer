import { Order } from "@georgeroman/wyvern-v2-sdk";
import axios from "axios";
import { backOff } from "exponential-backoff";

import { db, pgp } from "../common/db";
import logger from "../common/logger";
import {
  OpenseaOrder,
  buildFetchOrdersURL,
  parseOpenseaOrder,
} from "../common/opensea";

const fetchOrders = async (listedAfter: number, listedBefore: number) => {
  logger.info(`(${listedAfter}, ${listedBefore}) Syncing orders`);

  let offset = 0;
  let limit = 50;

  let numOrders = 0;

  let done = false;
  while (!done) {
    await backOff(async () => {
      const url = buildFetchOrdersURL({
        listed_after: listedAfter,
        listed_before: listedBefore,
        offset,
        limit,
      });

      await axios.get(url).then(async (response: any) => {
        const orders: OpenseaOrder[] = response.data.orders;
        console.log(`Num orders: ${orders.length}`);

        const validOrders: Order[] = [];
        const insertQueries: any[] = [];
        for (const order of orders) {
          const parsed = parseOpenseaOrder(order);
          if (parsed) {
            validOrders.push(parsed);
          }

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

        if (process.env.BASE_RESERVOIR_CORE_API_URL) {
          await axios
            .post(
              `${process.env.BASE_RESERVOIR_CORE_API_URL}/orders/wyvern-v2`,
              {
                orders: validOrders,
              }
            )
            .catch((error) => {
              logger.error(
                `(${listedAfter}, ${listedBefore}) Failed to post orders to Reservoir: ${error}`
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
    }).catch((error) => {
      logger.error(`Failed to sync: ${error}`);
    });
  }

  logger.info(`Got ${numOrders} orders`);
};

export const sync = async (from: number, to: number) => {
  const MAX_SECONDS = 60;

  for (let before = to; before >= from; before -= MAX_SECONDS) {
    const after = Math.max(before - MAX_SECONDS + 1, from);
    await fetchOrders(after - 1, before + 1);
  }
};
