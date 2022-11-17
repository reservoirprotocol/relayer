import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import pLimit from "p-limit";
import _ from "lodash";

import { db, pgp } from "../../common/db";
import { config } from "../../config";
import { addToRelayOrdersQueue } from "../relay-orders";
import { logger } from "../../common/logger";
import { Coinbase, CoinbaseOrder } from "../../utils/coinbase";
import { isAfter, addYears } from "date-fns";

export const fetchOrdersByDateCreated = async (createdAfter: string = "") => {
  logger.info(
    "fetch_orders_coinbase",
    `createdAfter = ${createdAfter} Fetching orders from Coinbase`
  );

  const coinbase = new Coinbase();
  let limit = 50;
  let newPageToken = "";
  let isDesc = "false";
  let newOrders = 0;
  let numOrders = 0;
  let lastCreatedAtOrder;

  const url = coinbase.buildFetchOrdersURL({
    limit,
    isDesc,
    createdAfter,
  });

  try {
    const response = await axios.get(
      url,
      config.chainId === 1
        ? {
            headers: {
              "Content-Type": "application/json",
              accept: "application/json",
              "cb-nft-api-token": config.coinbaseApiKey,
              "user-agent":
                "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
            },
            timeout: 10000,
          }
        : // Skip including the API key on Rinkeby or else the request will fail
          { timeout: 10000 }
    );

    const orders: CoinbaseOrder[] = response.data.orders;
    const parsedOrders: Sdk.ZeroExV4.Order[] = [];

    const values: any[] = [];

    const handleOrder = async (order: CoinbaseOrder) => {
      const orderTarget = order.collectionAddress;
      const makerParams = _.split(order.maker, "/");
      const parsed = await coinbase.parseCoinbaseOrder(order);

      if (parsed) {
        parsedOrders.push(parsed);
      }

      values.push({
        hash: parsed?.hash(),
        target: orderTarget.toLowerCase(),
        maker: makerParams[2],
        created_at: new Date(order.startTime),
        data: order as any,
        source: "coinbase",
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
          kind: "zeroex-v4",
          data: order.params,
        })),
        true
      );
    }

    numOrders += orders.length;
    newPageToken = response.data.pageToken;
    lastCreatedAtOrder = _.last(orders)?.createdAt;
  } catch (error) {
    throw error;
  }

  logger.info(
    "fetch_orders_coinbase",
    `FINAL - Coinbase - lastCreatedAtOrder = ${lastCreatedAtOrder}, new = ${newPageToken} total orders ${numOrders}, new orders ${newOrders}`
  );

  return [newPageToken, lastCreatedAtOrder];
};

export const fetchOrdersByPageToken = async (side: "sell" | "buy", pageToken: string = "") => {
  logger.info(
    "fetch_orders_coinbase",
    `side = ${side}, pageToken = ${pageToken} Fetching orders from Coinbase`
  );

  const coinbase = new Coinbase();
  let limit = 50;
  let newPageToken = "";
  let isDesc = "false";
  let newOrders = 0;
  let numOrders = 0;
  let lastCreatedAtOrder;

  const url = coinbase.buildFetchOrdersURL(
    {
      side,
      limit,
      isDesc,
    },
    {
      pageToken,
    }
  );

  try {
    const response = await axios.get(
      url,
      config.chainId === 1
        ? {
            headers: {
              "Content-Type": "application/json",
              accept: "application/json",
              "cb-nft-api-token": config.coinbaseApiKey,
              "user-agent":
                "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
            },
            timeout: 10000,
          }
        : // Skip including the API key on Rinkeby or else the request will fail
          { timeout: 10000 }
    );

    const orders: CoinbaseOrder[] = response.data.orders;
    const parsedOrders: Sdk.ZeroExV4.Order[] = [];

    const values: any[] = [];

    const handleOrder = async (order: CoinbaseOrder) => {
      const maxDate = addYears(new Date(), 5);
      if (isAfter(new Date(order.expiry), maxDate)) {
        logger.warn(
          "fetch_orders_coinbase",
          `side - ${side} Order ID ${order.id} expiry ${order.expiry} is in more than 5 years`
        );
        return;
      }

      const orderTarget = order.collectionAddress;
      const makerParams = _.split(order.maker, "/");
      const parsed = await coinbase.parseCoinbaseOrder(order);

      if (parsed) {
        parsedOrders.push(parsed);
      }

      values.push({
        hash: parsed?.hash(),
        target: orderTarget.toLowerCase(),
        maker: makerParams[2],
        created_at: new Date(order.startTime),
        data: order as any,
        source: "coinbase",
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
          kind: "zeroex-v4",
          data: order.params,
        })),
        true
      );
    }

    numOrders += orders.length;
    newPageToken = response.data.pageToken;
    lastCreatedAtOrder = _.last(orders)?.createdAt;
  } catch (error) {
    throw error;
  }

  logger.info(
    "fetch_orders_coinbase",
    `FINAL - Coinbase - side = ${side}, lastCreatedAtOrder = ${lastCreatedAtOrder}, current = ${pageToken} new = ${newPageToken} total orders ${numOrders}, new orders ${newOrders}`
  );

  return [newPageToken, lastCreatedAtOrder];
};
