import { Order } from "@georgeroman/wyvern-v2-sdk";
import axios from "axios";

import { db } from "./db";
import { logger } from "./logger";
import { parseOpenseaOrder } from "./opensea";

export const relayOrdersToV3 = async (contract: string) => {
  const { count }: { count: number } = await db.one(
    `
      select count(*) from "orders" "o"
      where "o"."target" = $/contract/
    `,
    { contract }
  );

  logger.info(
    "relay_orders_to_v3",
    `Relaying ${count} orders of contract ${contract}`
  );

  const limit = 100;
  for (let offset = 0; offset < count; offset += limit) {
    logger.info(
      "relay_orders_to_v3",
      `Fetching and relaying offset ${offset} limit ${limit}`
    );

    const orders: { data: string }[] = await db.manyOrNone(
      `
        select "o"."data" from "orders" "o"
        where "o"."target" = $/contract/
        order by "o"."created_at" desc
        offset ${offset}
        limit ${limit}
      `,
      { contract }
    );

    const validOrders: Order[] = [];
    for (const { data } of orders) {
      const parsed = parseOpenseaOrder(JSON.parse(data));
      if (parsed) {
        validOrders.push(parsed);
      }
    }

    if (process.env.BASE_INDEXER_V3_API_URL) {
      await axios
        .post(`${process.env.BASE_INDEXER_V3_API_URL}/orders`, {
          orders: validOrders.map((data) => ({
            kind: "wyvern-v2",
            data,
          })),
        })
        .catch((error) => {
          logger.error(
            "relay_orders_to_v3",
            `Failed to post orders to Indexer V3: ${error}`
          );
        });
    }
  }
};
