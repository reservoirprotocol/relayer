import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import pLimit from "p-limit";
import _ from "lodash";

import { db, pgp } from "../../common/db";
import { config } from "../../config";
import { addToRelayOrdersQueue } from "../relay-orders";
import { fromUnixTime } from "date-fns";
import { logger } from "../../common/logger";
import { X2Y2, X2Y2Order } from "../../utils/x2y2";

export const fetchOrders = async (createdAfter: number = 0) => {
  logger.info("fetch_orders", `createdAfter = ${createdAfter} Fetching orders from X2Y2`);

  const x2y2 = new X2Y2();
  let limit = 50;
  let status = "open";
  let newCursor = 0;
  let numOrders = 0;

  let done = false;
  while (!done) {
    const url = x2y2.buildFetchOrdersURL({
      status,
      createdAfter,
      limit,
    });

    try {
      const response = await axios.get(url, {
        headers: {
          "x-api-key": config.x2y2ApiKey,
          "user-agent":
            "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
        },
        timeout: 10000,
      });

      const orders: X2Y2Order[] = response.data.data;
      const parsedOrders: Sdk.X2Y2.Order[] = [];

      const values: any[] = [];

      const handleOrder = async (order: X2Y2Order) => {
        const orderTarget = order.nft.token;
        const parsed = await x2y2.parseX2Y2Order(order);

        if (parsed) {
          parsedOrders.push(parsed);
        }

        values.push({
          hash: order.item_hash,
          target: orderTarget.toLowerCase(),
          maker: order.maker,
          created_at: fromUnixTime(order.created_at),
          data: order as any,
          source: "x2y2",
        });
      };

      const plimit = pLimit(20);
      await Promise.all(orders.map((order) => plimit(() => handleOrder(order))));

      if (values.length) {
        const columns = new pgp.helpers.ColumnSet(
          ["hash", "target", "maker", "created_at", "data", "source"],
          { table: "orders_v23" }
        );

        await db.manyOrNone(
          pgp.helpers.insert(values, columns) + " ON CONFLICT DO NOTHING RETURNING 1"
        );
      }

      if (parsedOrders.length) {
        await addToRelayOrdersQueue(
          parsedOrders.map((order) => ({
            kind: "x2y2",
            data: order.params,
          })),
          true
        );
      }

      numOrders += orders.length;

      if (!_.isEmpty(orders)) {
        const lastOrder = _.last(orders);

        if (lastOrder) {
          newCursor = lastOrder.created_at;
        }
      }

      done = true;
    } catch (error) {
      throw error;
    }
  }

  logger.info("fetch_orders", `FINAL - X2Y2 - (${createdAfter}) Got ${numOrders} orders`);

  return newCursor;
};
