import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { config } from "../../config";
import {
  OpenSeaOrder,
  buildFetchOrdersURL,
  parseOpenSeaOrder,
} from "../../utils/opensea";
import { addToRelayOrdersQueue } from "../relay-orders";

const getOrderTarget = (order: Sdk.WyvernV2.Order): string | undefined => {
  try {
    if (order.params.kind?.endsWith("single-token-v2")) {
      if (order.params.kind?.startsWith("erc721")) {
        const { contract } = new Sdk.WyvernV2.Builders.Erc721.SingleToken.V2(
          config.chainId
        ).getDetails(order)!;

        return contract;
      } else if (order.params.kind?.startsWith("erc1155")) {
        const { contract } = new Sdk.WyvernV2.Builders.Erc1155.SingleToken.V2(
          config.chainId
        ).getDetails(order)!;

        return contract;
      }
    } else {
      return order.params.target;
    }
  } catch {
    return undefined;
  }
};

export const fetchOrders = async (
  listedAfter: number,
  listedBefore: number,
  backfill = false
) => {
  logger.info(
    "fetch_orders",
    `(${listedAfter}, ${listedBefore}) Fetching orders from OpenSea`
  );

  let offset = 0;
  let limit = 50;

  let numOrders = 0;

  let done = false;
  while (!done) {
    const url = buildFetchOrdersURL({
      listedAfter,
      listedBefore,
      offset,
      limit,
    });

    await axios
      .get(
        url,
        config.chainId === 1
          ? {
              headers: {
                "x-api-key": backfill
                  ? config.backfillOpenseaApiKey
                  : config.realtimeOpenseaApiKey,
                // https://twitter.com/lefterisjp/status/1483222328595165187?s=21
                "user-agent":
                  "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
              },
              timeout: 10000,
            }
          : // Skip including the API key on Rinkeby or else the request will fail
            { timeout: 10000 }
      )
      .then(async (response: any) => {
        const orders: OpenSeaOrder[] = response.data.orders;

        const validOrders: Sdk.WyvernV2.Order[] = [];
        const insertQueries: any[] = [];
        for (const order of orders) {
          let orderTarget = order.target;

          const parsed = parseOpenSeaOrder(order);
          if (parsed) {
            validOrders.push(parsed);
            orderTarget = getOrderTarget(parsed) || orderTarget;
          } else {
            logger.info(
              "fetch_orders",
              `Skipping order ${JSON.stringify(order)}`
            );
          }

          // Skip saving any irrelevant information
          delete (order as any).asset;

          // TODO: Use multi-row inserts for better performance
          insertQueries.push({
            query: `
              insert into "orders"(
                "hash",
                "target",
                "maker",
                "created_at",
                "data"
              )
              values ($1, $2, $3, $4, $5)
              on conflict do nothing
            `,
            values: [
              order.prefixed_hash,
              orderTarget,
              order.maker.address,
              Math.floor(new Date(order.created_date).getTime() / 1000),
              order as any,
            ],
          });
        }

        if (insertQueries.length) {
          await db.none(pgp.helpers.concat(insertQueries));
        }

        await addToRelayOrdersQueue(validOrders, true);

        numOrders += orders.length;

        if (orders.length < limit) {
          done = true;
        } else {
          offset += limit;
        }

        // Wait for one second to avoid rate-limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });
  }

  logger.info(
    "fetch_orders",
    `(${listedAfter}, ${listedBefore}) Got ${numOrders} orders`
  );
};
