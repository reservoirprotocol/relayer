import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { fromUnixTime } from "date-fns";
import pLimit from "p-limit";

import { addToRelayOrdersQueue } from "../relay-orders";
import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { Okx, OkxOrder } from "../../utils/okx";

export const fetchOrders = async (options: {
  side: "buy" | "sell";
  createAfter?: number;
  createBefore?: number;
  cursor?: string;
  maxIterations?: number;
}) => {
  logger.info(
    "fetch_orders_okx",
    `START Fetching ${options.side} orders from OKX (createAfter=${options.createAfter}, cursor=${options.cursor})`
  );

  const okx = new Okx();

  let limit = 50;
  let cursor = options.cursor;

  let numOrders = 0;
  let maxTimestamp: number | undefined;
  let minTimestamp: number | undefined;

  let done = false;
  let numIterations = 0;
  while (!done) {
    const url = okx.buildFetchOrdersURL({
      side: options.side,
      createAfter: options.createAfter,
      createBefore: options.createBefore,
      cursor,
      limit,
    });

    try {
      const response = await axios.get(url, {
        headers: okx.buildAuthHeaders(url, "GET"),
        timeout: 10000,
      });

      const orders: OkxOrder[] = response.data.data.data;
      const parsedOrders: {
        order: Sdk.SeaportV15.Order;
        originatedAt: string;
      }[] = [];

      const values: any[] = [];

      const handleOrder = async (order: OkxOrder) => {
        try {
          const parsed = await okx.parseOrder(order);
          if (parsed) {
            parsedOrders.push({
              order: parsed,
              originatedAt: new Date(order.createTime * 1000).toISOString(),
            });

            values.push({
              hash: parsed.hash(),
              target: parsed.getInfo()!.contract.toLowerCase(),
              maker: parsed.params.offerer.toLowerCase(),
              created_at: fromUnixTime(order.createTime),
              data: order as any,
              source: "okx",
            });
          }
        } catch {
          // Skip errors
        }
      };

      const plimit = pLimit(20);
      await Promise.all(
        orders.map((order) => plimit(() => handleOrder(order)))
      );

      if (values.length) {
        const columns = new pgp.helpers.ColumnSet(
          ["hash", "target", "maker", "created_at", "data", "source"],
          { table: "orders_v23" }
        );

        await db.manyOrNone(
          pgp.helpers.insert(values, columns) +
            " ON CONFLICT DO NOTHING RETURNING 1"
        );
      }

      if (parsedOrders.length) {
        await addToRelayOrdersQueue(
          parsedOrders.map(({ order, originatedAt }) => ({
            kind: "seaport-v1.5",
            data: order.params,
            originatedAt,
            source: "okx",
          })),
          true
        );
      }

      numOrders += orders.length;

      if (orders.length) {
        cursor = response.data.data.cursor;

        maxTimestamp =
          !maxTimestamp || maxTimestamp < orders[0].createTime
            ? orders[0].createTime
            : maxTimestamp;

        minTimestamp =
          !minTimestamp || minTimestamp > orders[orders.length - 1].createTime
            ? orders[orders.length - 1].createTime
            : minTimestamp;
      } else {
        done = true;
      }

      numIterations++;
      if (options.maxIterations && numIterations >= options.maxIterations) {
        done = true;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      throw error;
    }
  }

  logger.info(
    "fetch_orders_okx",
    `END Fetching ${options.side} orders from OKX (createAfter=${options.createAfter}, createBefore=${options.createBefore}, cursor=${options.cursor}) - got ${numOrders} orders minTimestamp ${minTimestamp} maxTimestamp ${maxTimestamp}`
  );

  return { minTimestamp, maxTimestamp };
};
