import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import pLimit from "p-limit";
import _ from "lodash";

import { db, pgp } from "../../common/db";
import { config } from "../../config";
import { addToRelayOrdersQueue } from "../relay-orders";
import { logger } from "../../common/logger";
import { LooksRareV2, LooksRareOrderV2 } from "../../utils/looksrare-v2";
import { fromUnixTime } from "date-fns";

export const fetchOrders = async (
  lastSyncedHash: string = "",
  cursor: string = "",
  startTime: number = 0,
  endTime: number = 0,
  backfill = false
) => {
  logger.info(
    "fetch_orders_looksrare_v2",
    `lastSyncedHash = ${lastSyncedHash}, cursor = ${cursor} Fetching orders from LooksRareV2`
  );

  const looksRare = new LooksRareV2();
  let limit = 150;
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

      const orders: LooksRareOrderV2[] = response.data.data;
      const parsedOrders: Sdk.LooksRareV2.Order[] = [];

      const values: any[] = [];

      const handleOrder = async (order: LooksRareOrderV2) => {
        const orderTarget = order.collection;
        const parsed = await looksRare.parseLooksRareOrder(order);

        if (parsed) {
          parsedOrders.push(parsed);
        }

        values.push({
          hash: order.hash,
          target: orderTarget.toLowerCase(),
          maker: order.signer,
          created_at: fromUnixTime(order.startTime),
          data: order as any,
          source: "looksrare-v2",
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
            "fetch_orders_looksrare_v2",
            `LooksRare empty result cursor=${cursor}, most recent order=${orders[0].hash}`
          );

          return [orders[0].hash, ""];
        }

        if (backfill && result.length) {
          logger.warn(
            "fetch_orders_looksrare_v2",
            `LooksRare (${startTime}, ${endTime}) Backfilled ${result.length} new orders`
          );
        }
      }

      if (parsedOrders.length) {
        await addToRelayOrdersQueue(
          parsedOrders.map((order) => ({
            kind: "looks-rare-v2",
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
          cursor = lastOrder.id;
        }
      } else {
        done = true;
      }

      // If this is real time sync, and we reached the max orders to fetch -> trigger the backfill process
      if (cursor != "" && numOrders >= maxOrdersToFetch) {
        logger.info(
          "fetch_orders_looksrare_v2",
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
          "fetch_orders_looksrare_v2",
          `(${startTime}, ${endTime}) ${url} Got ${numOrders} orders error=${error}`
        );

        return [mostRecentCreatedHash, ""];
      }

      throw error;
    }
  }

  logger.info(
    "fetch_orders_looksrare_v2",
    `FINAL - LooksRare - (${startTime}, ${endTime}) Got ${numOrders} orders`
  );

  return [mostRecentCreatedHash, ""];
};
