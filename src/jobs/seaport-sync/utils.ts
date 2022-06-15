import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import pLimit from "p-limit";

import { db, pgp } from "../../common/db";
import { addToRelayOrdersQueue } from "../relay-orders";
import { logger } from "../../common/logger";
import { Seaport, SeaportOrder } from "../../utils/seaport";
import _ from "lodash";

export const fetchOrders = async (lastOrderHash: string | null) => {
  logger.info("fetch_orders", `Seaport Fetch orders lastOrderHash=${lastOrderHash}`);

  const seaport = new Seaport();
  let cursor = null;
  let limit = 50;
  let done = false;
  let firstOrderHash = null;

  while (!done) {
    const url = seaport.buildFetchOrdersURL({
      orderBy: "created_date",
      orderDirection: "desc",
      limit,
      cursor,
    });

    try {
      const response = await axios.get(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
        },
        timeout: 10000,
      });

      const orders: SeaportOrder[] = response.data.orders;
      const parsedOrders: Sdk.Seaport.Order[] = [];
      cursor = response.data.next;
      const values: any[] = [];

      const handleOrder = async (order: SeaportOrder) => {
        const parsed = await seaport.parseSeaportOrder(order);

        if (parsed) {
          parsedOrders.push(parsed);
        }

        values.push({
          hash: order.order_hash,
          target: parsed?.getInfo()?.contract || order.protocol_data.parameters.offer[0].token,
          maker: order.maker.address,
          created_at: new Date(order.created_date),
          data: order as any,
          source: "opensea",
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
            kind: "seaport",
            data: order.params,
          })),
          true
        );
      }

      if (_.isNull(firstOrderHash) && !_.isEmpty(orders)) {
        const firstOrder = _.first(orders);

        if (firstOrder) {
          firstOrderHash = firstOrder.order_hash;
        }
      }

      // If lastOrderHash is null iterate once
      if (_.isNull(lastOrderHash)) {
        return firstOrderHash;
      }

      // If we reach the last order we synced stop
      if (!_.isEmpty(orders)) {
        _.map(orders, (order) => {
          if (order.order_hash == lastOrderHash) {
            done = true;
          }
        });
      }

      logger.info("fetch_orders", `Seaport - DONE - cursor=${cursor} Got ${orders.length} orders`);
    } catch (error) {
      throw error;
    }
  }

  return firstOrderHash;
};

export const fetchAllOrders = async (cursor: string | null = null) => {
  logger.info("fetch_all_orders", `Seaport Fetch all orders cursor=${cursor}`);

  const seaport = new Seaport();
  let limit = 50;

  const url = seaport.buildFetchOrdersURL({
    orderBy: "created_date",
    orderDirection: "desc",
    limit,
    cursor,
  });

  try {
    const response = await axios.get(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
      },
      timeout: 10000,
    });

    const orders: SeaportOrder[] = response.data.orders;
    const parsedOrders: Sdk.Seaport.Order[] = [];

    const values: any[] = [];

    const handleOrder = async (order: SeaportOrder) => {
      const parsed = await seaport.parseSeaportOrder(order);

      if (parsed) {
        parsedOrders.push(parsed);
      }

      values.push({
        hash: order.order_hash,
        target: parsed?.getInfo()?.contract || order.protocol_data.parameters.offer[0].token,
        maker: order.maker.address,
        created_at: new Date(order.created_date),
        data: order as any,
        source: "opensea",
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
          kind: "seaport",
          data: order.params,
        })),
        true
      );
    }

    logger.info(
      "fetch_all_orders",
      `Seaport - newCursor=${response.data.next} Got ${orders.length} orders`
    );
    return response.data.next;
  } catch (error) {
    throw error;
  }
};
