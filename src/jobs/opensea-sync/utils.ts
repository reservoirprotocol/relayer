import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import pLimit from "p-limit";

import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { config } from "../../config";
import {
  OpenSeaOrder,
  buildFetchOrdersURL,
  parseOpenSeaOrder,
} from "../../utils/opensea";
import { addToRelayOrdersQueue } from "../relay-orders";

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

    console.log(url);

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
        const parsedOrders: Sdk.WyvernV23.Order[] = [];

        const insertQueries: any[] = [];

        const handleOrder = async (order: OpenSeaOrder) => {
          let orderTarget = order.target;

          const parsed = await parseOpenSeaOrder(order);
          if (parsed) {
            parsedOrders.push(parsed);

            const info = parsed.getInfo();
            if (info) {
              orderTarget = info.contract;
            }

            if ((parsed.params as any).nonce) {
              (order as any).nonce = (parsed.params as any).nonce;
            }
          } else {
            logger.info(
              "fetch_orders",
              `Skipping order ${JSON.stringify(order)}`
            );
          }

          delete (order as any).asset;

          insertQueries.push({
            query: `
              INSERT INTO "orders_v23"(
                "hash",
                "target",
                "maker",
                "created_at",
                "data"
              )
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT DO NOTHING
            `,
            values: [
              order.prefixed_hash,
              orderTarget,
              order.maker.address,
              new Date(order.created_date),
              order as any,
            ],
          });
        };

        const plimit = pLimit(20);
        await Promise.all(
          orders.map((order) => plimit(() => handleOrder(order)))
        );

        if (insertQueries.length) {
          await db.none(pgp.helpers.concat(insertQueries));
        }

        if (parsedOrders.length) {
          await addToRelayOrdersQueue(
            parsedOrders.map((order) => ({
              kind: "wyvern-v2.3",
              data: order.params,
            })),
            true
          );
        }

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