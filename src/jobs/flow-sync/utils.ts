import * as Sdk from "@reservoir0x/sdk";

import { config } from "../../config";
import axios, { AxiosResponse } from "axios";
import { logger } from "../../common/logger";
import pLimit from "p-limit";
import { db, pgp } from "../../common/db";
import _ from "lodash";
import { addToRelayOrdersQueue } from "../relay-orders";
import { Flow, FlowBulkOrderResponseType, FlowOrder } from "../../utils/flow";

interface OrderSchema {
  hash: string;
  target: string;
  maker: string;
  created_at: Date;
  data: Sdk.Flow.Types.SignedOrder;
  source: "flow";
}

export const cacheKeys = {
  syncListingsCursor: "flow-sync-listings-cursor",
  syncOffersCursor: "flow-sync-offers-cursor",
};

export const lockNames = {
  syncListingsLock: "flow-sync-listings-lock",
  syncOffersLock: "flow-sync-offers-lock",
};

export const fetchOrders = async (
  side: "buy" | "sell",
  cursor = "",
  startTime?: number,
  endTime?: number
): Promise<{ cursor: string; lastCreatedAt: number }> => {
  logger.info("fetch_orders_flow", `cursor = ${cursor} Fetching orders from Flow`);

  const flow = new Flow();

  const limit = 200;
  let totalOrders = 0;
  let done = false;
  let lastCreatedAt = 0;

  while (!done) {
    const url = flow.buildFetchOrderURL({
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
      const response: AxiosResponse<FlowBulkOrderResponseType> = await axios.get(url, {
        headers: {
          "x-api-key": config.flowApiKey,
        },
        timeout: 20_000,
      });
      const orders = response.data.data;
      cursor = response.data.cursor;
      done = !response.data.hasMore;
      totalOrders += orders.length;

      const parse = flow.parseFlowOrder.bind(flow);

      const parsedOrders: Sdk.Flow.Order[] = [];
      const values: OrderSchema[] = [];

      const handleOrder = async (order: FlowOrder) => {
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
          source: "flow",
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
              "fetch_orders_flow",
              `Flow empty result. side=${side}, cursor, reached to=${lastOrder.id}`
            );
            lastCreatedAt = lastOrder.createdAt;
          }

          done = true;
        }
      }

      if (parsedOrders.length) {
        await addToRelayOrdersQueue(
          parsedOrders.map((order) => ({
            kind: "flow",
            data: order.params,
          })),
          true
        );
      }

      logger.info(
        "fetch_orders_flow",
        `Flow - Batch done. side=${side}, cursor=${cursor} Got ${orders.length} orders`
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 429) {
          logger.warn(
            "fetch_orders_flow",
            `Flow - Rate Limited. side=${side}, cursor=${cursor}, error=${err}`
          );
          const retryAfter = err.response?.headers["retry-after"] || "5";
          await new Promise((resolve) => setTimeout(resolve, parseInt(retryAfter, 10) * 1000));
          continue;
        } else {
          logger.error(
            "fetch_orders_flow",
            `Flow - Error. side=${side}, cursor=${cursor}, error=${err}`
          );
        }
      } else {
        logger.error(
          "fetch_orders_flow",
          `Flow - Error. side=${side}, cursor=${cursor}, error=${err}`
        );
      }

      throw err;
    }
  }

  logger.info("fetch_orders_flow", `Flow - Done. side=${side}, total=${totalOrders}`);

  return { cursor, lastCreatedAt };
};
