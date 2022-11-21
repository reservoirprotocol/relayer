import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import pLimit from "p-limit";
import _ from "lodash";

import { db, pgp } from "../../common/db";
import { addToRelayOrdersQueue } from "../relay-orders";
import { logger } from "../../common/logger";
import { Manifold, ManifoldOrder } from "../../utils/manifold";

export const fetchOrders = async (timestamp: number) => {
  const manifold = new Manifold();

  let newOrdersCount = 0;
  let newTimestamp = timestamp;

  try {
    const url = manifold.buildFetchListingsURL();
    const response = await axios.get(url, { timeout: 10000 });

    const newOrders: ManifoldOrder[] = response.data.filter(
      (order: ManifoldOrder) => order.createdAt > timestamp
    );

    const parsedOrders: Sdk.Manifold.Order[] = [];

    const values: any[] = [];

    const handleOrder = async (order: ManifoldOrder) => {
      const orderTarget = order.token.address_;
      const parsed = await manifold.parseManifoldOrder(order);

      if (parsed) {
        parsedOrders.push(parsed);

        // Update timestamp if newer
        const orderTimestamp = order.createdAt;
        if (orderTimestamp > timestamp) {
          newTimestamp = orderTimestamp;
        }
      }

      values.push({
        hash: order.id,
        target: orderTarget.toLowerCase(),
        maker: order.seller.toLowerCase(),
        created_at: new Date(order.details.startTime),
        data: order,
        source: "manifold",
      });
    };

    const plimit = pLimit(20);
    await Promise.all(newOrders.map((order) => plimit(() => handleOrder(order))));

    if (values.length) {
      const columns = new pgp.helpers.ColumnSet(
        ["hash", "target", "maker", "created_at", "data", "source"],
        { table: "orders_v23" }
      );

      const result = await db.manyOrNone(
        pgp.helpers.insert(values, columns) + " ON CONFLICT DO NOTHING RETURNING 1"
      );

      newOrdersCount = _.size(result); // Number of newly inserted rows
    }

    if (parsedOrders.length) {
      await addToRelayOrdersQueue(
        parsedOrders.map((order) => ({
          kind: "manifold",
          data: order.params,
        })),
        true
      );
    }
  } catch (error) {
    throw error;
  }

  logger.info("fetch_orders_manifold", `FINAL - manifold - Got ${newOrdersCount} new orders`);

  return newTimestamp;
};
