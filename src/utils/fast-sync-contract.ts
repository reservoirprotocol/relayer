import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { db, pgp } from "../common/db";
import { logger } from "../common/logger";
import { config } from "../config";
import { addToRelayOrdersQueue } from "../jobs/relay-orders";
import {
  buildFetchAssetsURL,
  buildFetchListingsURL,
  parseOpenSeaOrder,
} from "./opensea";

export const fastSyncContract = async (contract: string, count: number) => {
  logger.info(
    "fast_sync_contract",
    `Fast syncing contract ${contract} from OpenSea`
  );

  // Keep track of tokens that have recent listings
  const tokenIdsWithListings = new Set<string>();

  // Fetch recent listings
  {
    let offset = 0;
    let limit = 20;

    let done = false;
    while (!done) {
      const url = buildFetchListingsURL({
        contract,
        offset,
        limit,
      });

      await axios
        .get(
          url,
          config.chainId === 1
            ? {
                headers: {
                  "x-api-key": config.backfillOpenseaApiKey,
                  // https://twitter.com/lefterisjp/status/1483222328595165187?s=21
                  "user-agent":
                    "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
                },
                timeout: 5000,
              }
            : // Skip including the API key on Rinkeby or else the request will fail
              { timeout: 5000 }
        )
        .then(async (response: any) => {
          for (const event of response.data.asset_events) {
            if (!event.asset_bundle) {
              tokenIdsWithListings.add(event.asset.token_id);
            }
          }

          if (response.data.asset_events.length < limit) {
            done = true;
          } else {
            offset += limit;
          }

          if (offset >= count) {
            done = true;
          }

          // Wait for one second to avoid rate-limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        });
    }
  }

  // Fetch sell orders of tokens that had recent listings
  {
    const validOrders: Sdk.WyvernV23.Order[] = [];
    const insertQueries: any[] = [];

    const tokenIds = [...tokenIdsWithListings.values()];
    let i = 0;
    while (i < tokenIds.length) {
      const batchSize = 20;
      const batch = tokenIds.slice(i, i + batchSize);

      const url = buildFetchAssetsURL({
        contract,
        tokenIds: batch,
      });

      await axios
        .get(
          url,
          config.chainId === 1
            ? {
                headers: {
                  "x-api-key": config.backfillOpenseaApiKey,
                  // https://twitter.com/lefterisjp/status/1483222328595165187?s=21
                  "user-agent":
                    "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0",
                },
                timeout: 5000,
              }
            : // Skip including the API key on Rinkeby or else the request will fail
              { timeout: 5000 }
        )
        .then(async (response: any) => {
          for (const asset of response.data.assets) {
            for (const order of asset.sell_orders) {
              const parsed = await parseOpenSeaOrder(order);
              if (parsed) {
                validOrders.push(parsed);
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
                  order.target,
                  order.maker.address,
                  Math.floor(new Date(order.created_date).getTime() / 1000),
                  order as any,
                ],
              });
            }
          }

          // Wait for one second to avoid rate-limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        })
        .catch(() => {
          // Ignore errors
        });

      i += batchSize;
    }

    if (insertQueries.length) {
      await db.none(pgp.helpers.concat(insertQueries));
    }

    await addToRelayOrdersQueue(
      validOrders.map((order) => ({
        kind: "wyvern-v2.3",
        data: order.params,
      })),
      true
    );

    logger.info(
      "fast_sync_contract",
      `Got ${validOrders.length} orders for contract ${contract}`
    );
  }
};
