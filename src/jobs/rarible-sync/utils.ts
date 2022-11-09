import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import _ from "lodash";
import pLimit from "p-limit";

import { addToRelayOrdersQueue } from "../relay-orders";
import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { Rarible, RaribleOrder } from "../../utils/rarible";

export const fetchOrdersByCursor = async (
  cursor: string = "",
  sort: "DB_UPDATE_DESC" | "DB_UPDATE_ASC",
  blockchain = "ETHEREUM"
) => {
  logger.info("fetch_orders_rarible", `cursor = ${cursor} Fetching orders from Rarible`);

  const rarible = new Rarible();
  let size = 50;
  let continuation = cursor;
  let numOrders = 0;
  let newOrders = 0;

  const url = rarible.buildFetchOrdersURL({
    blockchain,
    size,
    continuation,
    sort,
  });

  try {
    const response = await axios.get(url, {
      timeout: 10000,
    });

    let orders: RaribleOrder[] = response.data.orders.filter(
      (order: any) =>
        (order.type || "").toLowerCase().includes("rarible") ||
        (order.data["@type"] || "").toLowerCase().includes("rarible")
    );
    const parsedOrders: Sdk.Rarible.Order[] = [];

    const values: any[] = [];

    const handleOrder = async (order: RaribleOrder) => {
      const parsed = await rarible.parseRaribleOrder(order);

      if (parsed) {
        parsedOrders.push(parsed);
      }

      const orderTarget =
        parsed!.params.side === "buy"
          ? parsed?.params.take.assetType?.contract || ""
          : parsed?.params.make.assetType?.contract || "";

      values.push({
        hash: parsed?.params.hash,
        target: orderTarget!.toLowerCase(),
        maker: order.maker,
        created_at: order.createdAt,
        data: order as any,
        source: "rarible",
      });
    };

    const plimit = pLimit(20);
    await Promise.all(orders.map((order) => plimit(() => handleOrder(order))));

    if (values.length) {
      const columns = new pgp.helpers.ColumnSet(
        ["hash", "target", "maker", "created_at", "data", "source"],
        { table: "orders_v23" }
      );

      const result = await db.manyOrNone(
        pgp.helpers.insert(values, columns) + " ON CONFLICT DO NOTHING RETURNING 1"
      );

      newOrders = _.size(result); // Number of newly inserted rows
    }

    if (parsedOrders.length) {
      await addToRelayOrdersQueue(
        parsedOrders.map((order) => ({
          kind: "rarible",
          data: order.params,
        })),
        true
      );
    }

    numOrders = orders.length;
    continuation = response.data.continuation;
  } catch (error) {
    throw error;
  }

  logger.info(
    "fetch_orders_rarible",
    `FINAL - Rarible - (current = ${cursor} new = ${continuation}) total orders ${numOrders}, new orders ${newOrders}`
  );

  return continuation;
};
