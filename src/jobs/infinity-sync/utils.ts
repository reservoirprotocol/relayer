import * as Sdk from "@reservoir0x/sdk";

import { Infinity, InfinityBulkOrderResponseType, InfinityOrder } from "../../utils/infinity";

import { config } from "../../config";
import axios, { AxiosResponse } from "axios";
import { logger } from "../../common/logger";
import pLimit from "p-limit";
import { db, pgp } from "../../common/db";
import _ from "lodash";
import { addToRelayOrdersQueue } from "../relay-orders";

interface OrderSchema {
  hash: string;
  target: string;
  maker: string;
  created_at: Date;
  data: Sdk.Infinity.Types.SignedOrder;
  source: "infinity";
}

export const cacheKeys = {
  syncListingsCursor: "infinity-sync-listings-cursor",
  syncOffersCursor: "infinity-sync-offers-cursor",
};

export const lockNames = {
  syncListingsLock: "infinity-sync-listings-lock",
  syncOffersLock: "infinity-sync-offers-lock",
};

export const fetchOrders = async (
  side: "buy" | "sell",
  cursor = "",
  startTime?: number,
  endTime?: number
): Promise<{ cursor: string; lastCreatedAt: number }> => {
  logger.info("fetch_orders_infinity", `cursor = ${cursor} Fetching orders from Infinity`);

  const infinity = new Infinity();

  const limit = 200;
  let totalOrders = 0;
  let done = false;
  let lastCreatedAt = 0;

  while (!done) {
    const url = infinity.buildFetchOrderURL({
      side,
      cursor,
      limit,
      orderDirection: "asc",
      createdAfter: startTime,
      createdBefore: endTime,
      chainId: config.chainId,
      orderBy: "createdAt",
    });

    try {
      const response: AxiosResponse<InfinityBulkOrderResponseType> = await axios.get(url, {
        headers: {
          "x-api-key": config.infinityApiKey,
        },
        timeout: 20_000,
      });
      const orders = response.data.data;
      cursor = response.data.cursor;
      done = !response.data.hasMore;
      totalOrders += orders.length;

      const parse = infinity.parseInfinityOrder.bind(infinity);

      const parsedOrders: Sdk.Infinity.Order[] = [];
      const values: OrderSchema[] = [];

      const handleOrder = async (order: InfinityOrder) => {
        const parsed = await parse(order);

        if (parsed) {
          parsedOrders.push(parsed);
        }
        values.push({
          hash: order.id,
          target: order.signedOrder.nfts[0].collection.toLowerCase(),
          maker: order.signedOrder.signer.toLowerCase(),
          created_at: new Date(order.createdAt),
          data: order.signedOrder,
          source: "infinity",
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
        if (_.isEmpty(result)) {
          const lastOrder = _.last(orders);

          if (lastOrder) {
            logger.info(
              "fetch_orders_infinity",
              `Infinity empty result. side=${side}, cursor=${cursor}, reached to=${lastOrder.id} cursor={${cursor}}`
            );
            lastCreatedAt = lastOrder.createdAt;
          }

          done = true;
        }
      }

      if (parsedOrders.length) {
        await addToRelayOrdersQueue(
          parsedOrders.map((order) => ({
            kind: "infinity",
            data: order.params,
          })),
          true
        );
      }

      logger.info(
        "fetch_orders_infinity",
        `Infinity - Batch done. side=${side}, cursor=${cursor} Got ${orders.length} orders`
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 429) {
          logger.warn(
            "fetch_orders_infinity",
            `Infinity - Rate Limited. side=${side}, cursor=${cursor}, error=${err}`
          );
          const retryAfter = err.response?.headers["retry-after"] || "5";
          await new Promise((resolve) => setTimeout(resolve, parseInt(retryAfter, 10) * 1000));
          continue;
        } else {
          logger.error(
            "fetch_orders_infinity",
            `Infinity - Error. side=${side}, cursor=${cursor}, error=${err}`
          );
        }
      } else {
        logger.error(
          "fetch_orders_infinity",
          `Infinity - Error. side=${side}, cursor=${cursor}, error=${err}`
        );
      }

      throw err;
    }
  }

  logger.info("fetch_orders_infinity", `Infinity - Done. side=${side}, total=${totalOrders}`);

  return { cursor, lastCreatedAt };
};
