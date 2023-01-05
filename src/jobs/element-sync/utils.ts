import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { fromUnixTime } from "date-fns";
import _ from "lodash";
import pLimit from "p-limit";
import { keccak256, defaultAbiCoder } from "ethers/lib/utils";

import { addToRelayOrdersQueue } from "../relay-orders";
import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { config } from "../../config";
import { Element, ElementOrder, SaleKind } from "../../utils/element";

export const fetchOrders = async (side: "sell" | "buy", listedAfter = 0, listedBefore = 0) => {
  logger.info("fetch_orders_element", `listedAfter = ${listedAfter} Fetching orders from Element`);

  const element = new Element();
  let limit = 50;
  let newCursor = 0;
  let numOrders = 0;

  let done = false;
  while (!done) {
    const url = element.buildFetchOrdersURL({
      chain: "eth",
      side: side === "sell" ? "1" : "0",
      listed_after: listedAfter > 0 ? listedAfter : undefined,
      listed_before: listedBefore > 0 ? listedBefore : undefined,
      limit,
    });

    try {
      const response = await axios.get(url, {
        headers: {
          "x-api-key": config.elementApiKey,
          "user-agent":
            "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
        },
        timeout: 10000,
      });

      const orders: ElementOrder[] = response.data.data.orders;
      const parsedOrders: Sdk.Element.Order[] = [];

      const values: any[] = [];

      const handleOrder = async (order: ElementOrder) => {
        const orderTarget = order.contractAddress;
        const parsedOrder = await element.parseOrder(order);

        if (parsedOrder) {
          if (
            order.saleKind === SaleKind.FixedPrice ||
            order.saleKind === SaleKind.BatchSignedOrder ||
            order.saleKind === SaleKind.ContractOffer
          ) {
            parsedOrders.push(parsedOrder);
          }

          logger.info("debug", JSON.stringify(parsedOrder.params));

          const id = keccak256(
            defaultAbiCoder.encode(
              ["bytes32", "uint256"],
              [parsedOrder.hash(), parsedOrder.params.nonce]
            )
          );
          values.push({
            hash: id,
            target: orderTarget.toLowerCase(),
            maker: order.maker,
            created_at: fromUnixTime(order.createTime),
            data: order as any,
            source: "element",
          });
        }
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
            kind: "element",
            data: order.params,
          })),
          true
        );
      }

      numOrders += orders.length;

      if (!_.isEmpty(orders)) {
        const lastOrder = _.last(orders);

        if (lastOrder) {
          newCursor = lastOrder.createTime;
        }
      }

      done = true;
    } catch (error) {
      throw error;
    }
  }

  logger.info(
    "fetch_orders_element",
    `FINAL - Element - (${listedBefore}) Got ${numOrders} orders`
  );

  return newCursor;
};
