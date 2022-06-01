import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import pLimit from "p-limit";
import _ from "lodash";

import { db, pgp } from "../../common/db";
import { config } from "../../config";
import { addToRelayOrdersQueue } from "../relay-orders";
import { logger } from "../../common/logger";
import { LooksRare, LooksRareOrder } from "../../utils/looksrare";

export const fetchOrders = async (
  lastSyncedHash: string = "",
  cursor: string = "",
  startTime: number = 0,
  endTime: number = 0,
  backfill = false
) => {
  logger.info(
    "fetch_orders",
    `lastSyncedHash = ${lastSyncedHash}, cursor = ${cursor} Fetching orders from LooksRare`
  );

  const looksRare = new LooksRare();
  let limit = 20;
  let maxOrdersToFetch = 1000;
  let mostRecentCreatedHash: string = "";

  let numOrders = 0;

  let done = false;
  while (!done) {
    const url = looksRare.buildFetchOrdersURL(
      {
        startTime,
        endTime,
      },
      {
        limit,
        cursor,
      }
    );

    try {
      const response = await axios.get(
        url,
        config.chainId === 1
          ? {
              headers: {
                "user-agent":
                  "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
              },
              timeout: 10000,
            }
          : // Skip including the API key on Rinkeby or else the request will fail
            { timeout: 10000 }
      );

      const orders: LooksRareOrder[] = response.data.data;
      const parsedOrders: Sdk.LooksRare.Order[] = [];

      const values: any[] = [];

      const handleOrder = async (order: LooksRareOrder) => {
        const orderTarget = order.collectionAddress;
        const parsed = await looksRare.parseLooksRareOrder(order);

        if (parsed) {
          parsedOrders.push(parsed);
        }

        values.push({
          hash: order.hash,
          target: orderTarget,
          maker: order.signer,
          created_at: new Date(order.startTime),
          data: order as any,
          source: "looksrare",
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

        // If result is empty, all transactions already exists
        if (cursor != "" && _.isEmpty(result)) {
          logger.info(
            "fetch_orders",
            `LooksRare empty result cursor=${cursor}, most recent order=${orders[0].hash}`
          );

          return [orders[0].hash, ""];
        }

        if (backfill && result.length) {
          logger.warn(
            "fetch_orders",
            `LooksRare (${startTime}, ${endTime}) Backfilled ${result.length} new orders`
          );
        }
      }

      if (parsedOrders.length) {
        await addToRelayOrdersQueue(
          parsedOrders.map((order) => ({
            kind: "looks-rare",
            data: order.params,
          })),
          true
        );
      }

      numOrders += orders.length;

      // Check if we reached the last synced order
      const lastSyncedOrder = _.filter(orders, (order) => order.hash === lastSyncedHash);

      if (!_.isEmpty(orders) && _.isEmpty(lastSyncedOrder)) {
        // Last synced order wasn't found
        const lastOrder = _.last(orders);

        if (lastOrder) {
          cursor = lastOrder.hash;
        }
      } else {
        done = true;
      }

      // If this is real time sync, and we reached the max orders to fetch -> trigger the backfill process
      if (cursor != "" && numOrders >= maxOrdersToFetch) {
        logger.info(
          "fetch_orders",
          `LooksRare return cursor=${cursor}, numOrders=${numOrders}, maxOrdersToFetch=${maxOrdersToFetch}`
        );

        return ["", cursor];
      }

      if (mostRecentCreatedHash === "" && orders.length) {
        mostRecentCreatedHash = orders[0].hash;
      }

      // Wait to avoid rate-limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      // If realtime sync return the lastCreatedDate
      if (!backfill) {
        logger.error(
          "fetch_orders",
          `(${startTime}, ${endTime}) Got ${numOrders} orders error=${error}`
        );

        return [mostRecentCreatedHash, ""];
      }

      throw error;
    }
  }

  logger.info(
    "fetch_orders",
    `FINAL - LooksRare - (${startTime}, ${endTime}) Got ${numOrders} orders`
  );

  return [mostRecentCreatedHash, ""];
};
