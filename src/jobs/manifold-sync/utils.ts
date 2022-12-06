import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import pLimit from "p-limit";
import _ from "lodash";

import { db, pgp } from "../../common/db";
import { addToRelayOrdersQueue } from "../relay-orders";
import { logger } from "../../common/logger";
import { Manifold, ManifoldApiOrder } from "../../utils/manifold";

export const fetchOrders = async (id: number, page: number) => {
  const manifold = new Manifold();

  let newOrdersCount = 0;
  let newOrderId = id;
  let newPage = page;
  let pageSize = 100;
  try {
    const url = manifold.buildFetchListingsURL(page, pageSize);
    const response = await axios.get(url, { timeout: 10000 });

    // type_ === 2 filters fixed price listings
    const newOrders: ManifoldApiOrder[] = response.data.listings.filter(
      (order: ManifoldApiOrder) => order.details.type_ === 2 && Number(order.id) > id
    );
    const pageOrderCount = response.data.count;
    // Manifold api returns 20 orders. If we've received 20 orders, then it's time to start fetching the next page
    if (pageOrderCount === pageSize) {
      newPage += 1;
    }
    const parsedOrders: Sdk.Manifold.Order[] = [];

    const values: any[] = [];

    const handleOrder = async (order: ManifoldApiOrder) => {
      const orderTarget = order.token.address_;
      const parsed = await manifold.parseManifoldOrder(order);

      if (parsed) {
        parsedOrders.push(parsed);

        // Update timestamp if newer
        const orderId = Number(order.id);
        if (orderId > id) {
          newOrderId = orderId;
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

  return [newOrderId, newPage];
};
