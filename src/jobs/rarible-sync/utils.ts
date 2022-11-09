import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { fromUnixTime } from "date-fns";
import _ from "lodash";
import pLimit from "p-limit";

import { addToRelayOrdersQueue } from "../relay-orders";
import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { Rarible, RaribleOrder } from "../../utils/rarible";

export const backfillFetchOrders = async (side: "sell" | "buy") => {
  logger.info("fetch_orders_rarible", `Fetching orders from Rarible`);

  const rarible = new Rarible();
  let size = 50;
  let continuation = "";
  let numOrders = 0;

  let done = false;
  while (!done) {
    const url = rarible.buildFetchOrdersURL({
      blockchain: "ETHEREUM",
      continuation,
      size,
      sort: "DB_UPDATE_ASC",
    });

    try {
      const response = await axios.get(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
        },
        timeout: 10000,
      });

      const orders: RaribleOrder[] = response.data.orders;
      const parsedOrders: Sdk.Rarible.Order[] = [];

      const values: any[] = [];

      // Filter for rarible orders only
      const handleOrder = async (order: RaribleOrder) => {
        const parsed = await rarible.parseRaribleOrder(order);
        const orderTarget =
          parsed!.params.side === "buy"
            ? order.take.assetType?.contract
            : order.make.assetType?.contract;

        if (parsed && parsed.params.side === side) {
          parsedOrders.push(parsed);
        }

        values.push({
          hash: order.hash,
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

        await db.manyOrNone(
          pgp.helpers.insert(values, columns) + " ON CONFLICT DO NOTHING RETURNING 1"
        );
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

      numOrders += orders.length;
      continuation = response.data.continuation;
      done = true;
    } catch (error) {
      throw error;
    }
  }

  logger.info("fetch_orders_rarible", `FINAL - Rarible - Got ${numOrders} orders`);

  return continuation;
};

export const fetchOrdersByCursor = async (side: "sell" | "buy", cursor: string = "") => {
  logger.info("fetch_orders_rarible", `cursor = ${cursor} Fetching orders from Rarible`);

  const rarible = new Rarible();
  let size = 50;
  let continuation = "";
  let numOrders = 0;
  let newOrders = 0;

  const url = rarible.buildFetchOrdersURL({
    blockchain: "ETHEREUM",
    size,
    continuation,
    sort: "DB_UPDATE_DESC",
  });

  try {
    const response = await axios.get(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
      },
      timeout: 10000,
    });

    const orders: RaribleOrder[] = response.data.data;
    const parsedOrders: Sdk.Rarible.Order[] = [];

    const values: any[] = [];

    const handleOrder = async (order: RaribleOrder) => {
      const parsed = await rarible.parseRaribleOrder(order);
      const orderTarget =
        parsed!.params.side === "buy"
          ? order.take.assetType?.contract
          : order.make.assetType?.contract;

      if (parsed && parsed.params.side === side) {
        parsedOrders.push(parsed);
      }

      if (parsed) {
        parsedOrders.push(parsed);
      }

      values.push({
        hash: order.hash,
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
