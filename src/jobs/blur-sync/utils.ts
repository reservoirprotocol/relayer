import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import _, { now } from "lodash";
import pLimit from "p-limit";

import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { config } from "../../config";
import { addToRelayOrdersQueue } from "../relay-orders";
import { Blur, FetchedOrder, blurUrl } from "../../utils/blur";

interface OrderSchema {
  hash: string;
  target: string;
  maker: string;
  created_at: Date;
  data: object;
  source: "blur";
}

export const cacheKeys = {
  syncListingsCursor: "blur-sync-listings-cursor",
};

export const lockNames = {
  syncListingsLock: "blur-sync-listings-lock",
};

export const fetchOrders = async (
  cursor = "",
  maxIterations?: number,
  direction?: "asc" | "desc",
  contract?: string
): Promise<{ cursor: string; lastCreatedAt: number }> => {
  const COMPONENT = "fetch_blur_orders";

  logger.info(COMPONENT, `Fetching orders from Blur - cursor=${cursor}`);

  let done = false;
  let totalOrders = 0;
  let lastCreatedAt = 0;

  const blur = new Blur();
  let numIterations = 0;
  while (!done && (maxIterations ? numIterations < maxIterations : true)) {
    const pageSize = 50;
    const url = blur.buildFetchOrdersURL({
      pageSize,
      cursor: cursor || "1",
      direction,
      contractAddress: contract,
    });

    try {
      const orders = await axios
        .get(url, {
          headers: {
            "X-RapidAPI-Key": config.blurApiKey,
            "X-RapidAPI-Host": new URL(blurUrl).host,
          },
          timeout: 20_000,
        })
        .then((response) => response.data.items as FetchedOrder[]);

      const parsedOrders: {
        order: Sdk.Blur.Order;
        originatedAt: string;
      }[] = [];
      const values: OrderSchema[] = [];

      const handleOrder = async (order: FetchedOrder) => {
        totalOrders += 1;

        const parsed = blur.parseFetchedOrder(order);
        if (parsed) {
          parsedOrders.push({
            order: parsed,
            originatedAt: order.data?.createdAt || new Date().toISOString(),
          });
        }

        if (order.marketplace === "BLUR" && order.order) {
          let orderHash: string | undefined = order.order.orderHash;
          if (!orderHash) {
            try {
              orderHash = parsed?.hash();
            } catch {
              logger.info(COMPONENT, `Blur order missing hash: ${JSON.stringify(order.order)}`);
            }
          }

          if (orderHash) {
            values.push({
              hash: orderHash,
              target: order.order.collection,
              maker: order.order.trader,
              created_at: new Date(order.data.createdAt),
              data: order.order,
              source: "blur",
            });
          }
        }
      };

      const plimit = pLimit(20);
      await Promise.all(orders.map((order) => plimit(() => handleOrder(order))));

      if (values.length) {
        const columns = new pgp.helpers.ColumnSet(
          ["hash", "target", "maker", "created_at", "data", "source"],
          { table: "orders_v23" }
        );

        await db.none(pgp.helpers.insert(values, columns) + " ON CONFLICT DO NOTHING");
      }

      if (parsedOrders.length) {
        await addToRelayOrdersQueue(
          parsedOrders.map(({ order, originatedAt }) => ({
            kind: "blur",
            data: order.params,
            originatedAt,
          })),
          true
        );
      }

      if (orders.length) {
        // API returns orders in descending order
        const lastOrder = _.last(orders)!;
        lastCreatedAt = Math.floor(new Date(lastOrder.data.createdAt).getTime() / 1000);
        cursor = lastOrder.id.toString();
      }

      if (orders.length < pageSize) {
        // We're done
        done = true;
      }

      logger.info(COMPONENT, `Blur sync batch done - cursor=${cursor} numOrders=${orders.length}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 429) {
          logger.warn(COMPONENT, `Blur sync rate limited - cursor=${cursor} error=${error}`);

          const retryAfter = error.response?.headers["retry-after"] || "5";
          await new Promise((resolve) => setTimeout(resolve, parseInt(retryAfter, 10) * 1000));

          continue;
        } else {
          logger.error(COMPONENT, `Blur sync error - cursor=${cursor} error=${error}`);
        }
      } else {
        logger.error(COMPONENT, `Blur sync error - cursor=${cursor} error=${error}`);
      }

      throw error;
    }

    numIterations++;
  }

  logger.info(COMPONENT, `Blur sync done - total=${totalOrders}`);

  return { cursor, lastCreatedAt };
};
