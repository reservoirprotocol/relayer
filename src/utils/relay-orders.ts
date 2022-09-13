import * as Sdk from "@reservoir0x/sdk";

import { db } from "../common/db";
import { logger } from "../common/logger";
import { addToRelayOrdersQueue } from "../jobs/relay-orders";
import { Seaport } from "./seaport";

export const relayOrdersByContract = async (contract: string) => {
  const data: { max_created_at: number } = await db.one(
    `
      SELECT
        coalesce(date_part('epoch', MAX("o"."created_at")), 0) AS "max_created_at"
      FROM "orders_v23" "o"
      WHERE "o"."target" = $/contract/
    `,
    { contract }
  );

  if (!data || !data.max_created_at) {
    return;
  }

  const limit = 300;
  while (data.max_created_at > 0) {
    logger.info(
      "relay_orders_by_contract",
      `(${contract}) Relaying orders created before ${data.max_created_at}`
    );

    const orders: { created_at: number; data: any }[] = await db.manyOrNone(
      `
        SELECT
          date_part('epoch', "o"."created_at") AS "created_at",
          "o"."data"
        FROM "orders_v23" "o"
        WHERE "o"."target" = $/contract/
          AND "o"."created_at" <= to_timestamp($/maxCreatedAt/)
        ORDER BY "o"."created_at" DESC
        LIMIT ${limit}
      `,
      {
        contract,
        maxCreatedAt: Number(data.max_created_at),
      }
    );

    if (orders.length < limit) {
      data.max_created_at = 0;
    } else {
      data.max_created_at = Number(orders[orders.length - 1].created_at) - 1;
    }

    const validOrders: Sdk.Seaport.Order[] = [];
    for (const { data } of orders) {
      const parsed = await new Seaport().parseSeaportOrder(data);
      if (parsed) {
        validOrders.push(parsed);
      }
    }

    await addToRelayOrdersQueue(
      validOrders.map((order) => ({
        // TODO: Add support for LooksRare and X2Y2 orders as well
        kind: "seaport",
        data: order.params,
      }))
    );
  }

  logger.info("relay_orders_by_contract", `(${contract}) Done relaying orders`);
};

export const relayOrdersByTimestamp = async (fromTimestamp: number, toTimestamp: number) => {
  try {
    let belowTimestamp = toTimestamp;

    const limit = 300;
    while (belowTimestamp > fromTimestamp) {
      logger.info("relay_orders_by_timestamp", `Relaying orders created before ${belowTimestamp}`);

      const orders: { created_at: number; data: any }[] = await db.manyOrNone(
        `
          SELECT
            date_part('epoch', "o"."created_at") AS "created_at",
            "o"."data"
          FROM "orders_v23" "o"
          WHERE "o"."created_at" <= to_timestamp($/belowTimestamp/)
          ORDER BY "o"."created_at" DESC
          LIMIT ${limit}
        `,
        { belowTimestamp }
      );

      if (orders.length < limit) {
        belowTimestamp = fromTimestamp;
      } else {
        belowTimestamp = Number(orders[orders.length - 1].created_at);
      }

      const validOrders: Sdk.Seaport.Order[] = [];
      for (const { data } of orders) {
        const parsed = await new Seaport().parseSeaportOrder(data);
        if (parsed) {
          validOrders.push(parsed);
        }
      }

      await addToRelayOrdersQueue(
        validOrders.map((order) => ({
          // TODO: Add support for LooksRare and X2Y2 orders as well
          kind: "seaport",
          data: order.params,
        }))
      );
    }

    logger.info("relay_orders_by_timestamp", "Done relaying orders");
  } catch (error) {
    logger.error("relay_orders_by_timestamp", `Failed to relay orders: ${error}`);
  }
};
