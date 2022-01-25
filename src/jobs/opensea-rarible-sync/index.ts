import { splitSignature } from "@ethersproject/bytes";
import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import cron from "node-cron";

import { db, pgp } from "../../common/db";
import { logger } from "../../common/logger";
import { acquireLock, redis } from "../../common/redis";
import { config } from "../../config";

type OpenSeaRaribleOrder = {
  hash: string;
  make: {
    assetType: {
      contract: string;
    };
  };
  take: {
    value: string;
  };
  maker: string;
  salt: string;
  start: number;
  end: number;
  signature: string;
  lastUpdateAt: string;
  data: {
    exchange: string;
    makerRelayerFee: string;
    takerRelayerFee: string;
    makerProtocolFee: string;
    takerProtocolFee: string;
    feeRecipient: string;
    feeMethod: "PROTOCOL_FEE" | "SPLIT_FEE";
    side: "BUY" | "SELL";
    saleKind: "FIXED_PRICE" | "DUTCH_AUCTION";
    howToCall: "CALL" | "DELEGATE_CALL";
    callData: string;
    replacementPattern: string;
    staticTarget: string;
    staticExtraData: string;
    extra: string;
  };
};

const parseOpenSeaRaribleOrder = (order: OpenSeaRaribleOrder) => {
  try {
    const { v, r, s } = splitSignature(order.signature);

    return {
      createdAt: order.lastUpdateAt,
      order: new Sdk.WyvernV2.Order(config.chainId, {
        exchange: order.data.exchange,
        maker: order.maker,
        taker: AddressZero,
        makerRelayerFee: Number(order.data.makerRelayerFee),
        takerRelayerFee: Number(order.data.takerRelayerFee),
        feeRecipient: order.data.feeRecipient,
        side: order.data.side === "BUY" ? 0 : 1,
        saleKind: order.data.saleKind === "FIXED_PRICE" ? 0 : 1,
        target: order.make.assetType.contract,
        howToCall: order.data.howToCall === "CALL" ? 0 : 1,
        calldata: order.data.callData,
        replacementPattern: order.data.replacementPattern,
        staticTarget: order.data.staticTarget,
        staticExtradata: order.data.staticExtraData,
        paymentToken: Sdk.Common.Addresses.Eth[config.chainId],
        basePrice: order.take.value,
        extra: order.data.extra,
        listingTime: order.start,
        expirationTime: order.end,
        salt: order.salt,
        v,
        r,
        s,
      }),
    };
  } catch {
    return undefined;
  }
};

const saveOrders = async (
  data: {
    createdAt: string;
    order: Sdk.WyvernV2.Order;
  }[]
) => {
  for (const { order } of data) {
    order.checkValidity();
    await order.checkSignature();
  }

  const columns = new pgp.helpers.ColumnSet(
    ["hash", "target", "maker", "created_at", "data"],
    {
      table: "orders",
    }
  );
  const values = pgp.helpers.values(
    data.map(({ createdAt, order }) => ({
      hash: order.prefixHash(),
      target: order.params.target,
      maker: order.params.maker,
      created_at: Math.floor(new Date(createdAt).getTime() / 1000),
      data: order.params as any,
    })),
    columns
  );
  const rowsInserted: any[] = await db.manyOrNone(
    `
      insert into "orders"(
        "hash",
        "target",
        "maker",
        "created_at",
        "data"
      )
      values ${values}
      on conflict do nothing
      returning "hash"
    `
  );

  logger.info(
    "opensea_rarible_sync",
    `Got ${rowsInserted.length} new orders from Rarible`
  );
};

if (!config.skipWatching && config.chainId === 1) {
  // Fetch new orders every 1 minute
  cron.schedule("*/1 * * * *", async () => {
    const lockAcquired = await acquireLock("opensea_rarible_sync_lock", 55);
    if (lockAcquired) {
      const cacheKey = "opensea_rarible_sync_continuation";

      const limit = 50;
      let url = `https://ethereum-api.rarible.org/v0.1/order/orders/sellByStatus?platform=OPEN_SEA&status=ACTIVE&limit=${limit}`;

      let continuation = await redis.get(cacheKey);
      if (!continuation) {
        url += "&sort=LAST_UPDATE_DESC";

        await axios.get(url, { timeout: 10000 }).then(async (response: any) => {
          const orders: OpenSeaRaribleOrder[] = response.data.orders;
          if (orders.length) {
            const validOrders = orders
              .map(parseOpenSeaRaribleOrder)
              .filter(Boolean)
              .map((x) => x!);

            await saveOrders(validOrders);

            await redis.set(
              cacheKey,
              new Date(orders[0].lastUpdateAt).getTime() + "_" + orders[0].hash
            );
          }
        });
      } else {
        url += "&sort=LAST_UPDATE_ASC";

        let done = false;
        while (!done) {
          await axios
            .get(`${url}&continuation=${continuation}`, { timeout: 10000 })
            .then(async (response: any) => {
              const orders: OpenSeaRaribleOrder[] = response.data.orders;
              if (orders.length) {
                const validOrders = orders
                  .map(parseOpenSeaRaribleOrder)
                  .filter(Boolean)
                  .map((x) => x!);

                await saveOrders(validOrders);

                if (!response.data.continuation || orders.length < limit) {
                  done = true;
                  continuation =
                    new Date(orders[orders.length - 1].lastUpdateAt).getTime() +
                    "_" +
                    orders[orders.length - 1].hash;
                } else {
                  continuation = response.data.continuation;
                }

                await redis.set(cacheKey, continuation!);
              } else {
                done = true;
              }
            });
        }
      }
    }
  });
}
