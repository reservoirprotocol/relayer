import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import { backOff } from "exponential-backoff";

import { db } from "../common/db";
import { logger } from "../common/logger";
import { parseOpenSeaOrder } from "./opensea";

export const relayOrdersToV3 = async (contract: string) => {
  const data: { max_created_at: number } = await db.one(
    `
      select
        coalesce(max("o"."created_at"), 0) as "max_created_at"
      from "orders" "o"
      where "o"."target" = $/contract/
    `,
    { contract }
  );

  const limit = 300;
  while (data.max_created_at > 0) {
    logger.info(
      "relay_orders_to_v3",
      `(${contract}) Relaying orders created before ${data.max_created_at}`
    );

    const orders: { created_at: number; data: any }[] = await db.manyOrNone(
      `
        select
          "o"."created_at",
          "o"."data"
        from "orders" "o"
        where "o"."target" = $/contract/
          and "o"."created_at" <= $/maxCreatedAt/
        order by "o"."created_at" desc
        limit ${limit}
      `,
      {
        contract,
        maxCreatedAt: data.max_created_at,
      }
    );

    if (orders.length < limit) {
      data.max_created_at = 0;
    } else {
      data.max_created_at = orders[orders.length - 1].created_at - 1;
    }

    const validOrders: Sdk.WyvernV2.Order[] = [];
    for (const { data } of orders) {
      const parsed = parseOpenSeaOrder(data);
      if (parsed) {
        validOrders.push(parsed);
      }
    }

    if (process.env.BASE_INDEXER_V3_API_URL) {
      await backOff(
        async () => {
          await axios.post(`${process.env.BASE_INDEXER_V3_API_URL}/orders`, {
            orders: validOrders.map(({ params }) => ({
              kind: "wyvern-v2",
              data: params,
            })),
          });
        },
        { numOfAttempts: 3 }
      ).catch((error) => {
        logger.error(
          "relay_orders_to_v3",
          `Failed to post orders to Indexer V3: ${error}`
        );
      });
    }
  }

  logger.info("relay_orders_to_v3", `(${contract}) Done relaying orders`);
};
