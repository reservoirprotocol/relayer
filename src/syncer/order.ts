import { Order } from "@georgeroman/wyvern-v2-sdk";
import axios from "axios";
const throttledQueue = require("throttled-queue");

import { db, pgp } from "../common/db";
import logger from "../common/logger";
import {
  OpenseaOrder,
  buildFetchOrdersURL,
  parseOpenseaOrder,
} from "../common/opensea";
import config from "../config";

const queue = throttledQueue(1, config.throttleTime, true);

const fetchOrders = async (listedAfter: number, listedBefore: number) =>
  new Promise((resolve, reject) => {
    logger.info(`(${listedAfter}, ${listedBefore}) Syncing orders`);

    const maxAllowedErrors = 10;
    const numExecutionContexts = config.numExecutionContexts;
    const offset = 0;
    const limit = 50;

    let numFinishedExecutionContexts = 0;
    let numErrors = 0;

    // In-memory object of all orders fetched in this batch
    let fetchedOrders: OpenseaOrder[] = [];

    const execute = (offset: number) =>
      queue(async () => {
        const url = buildFetchOrdersURL({
          listed_after: listedAfter,
          listed_before: listedBefore,
          offset,
          limit,
        });

        axios
          .get(url)
          .then(async (response) => {
            const orders = response.data.orders;
            fetchedOrders = [...fetchedOrders, ...orders];

            if (orders.length === limit) {
              // If we got a full page of results, it means there's more to be fetched
              execute(offset + numExecutionContexts * limit);
            } else {
              // Otherwise, this execution context is done
              numFinishedExecutionContexts++;
              if (numFinishedExecutionContexts === numExecutionContexts) {
                const validOrders: Order[] = [];
                const insertQueries: any[] = [];
                for (const order of fetchedOrders) {
                  const parsed = parseOpenseaOrder(order);
                  if (parsed) {
                    validOrders.push(parsed);
                  }

                  insertQueries.push({
                    query: `
                      INSERT INTO "orders"(
                        "hash",
                        "target",
                        "maker",
                        "created_at",
                        "validated",
                        "data"
                      )
                      VALUES ($1, $2, $2, $4, $5, $6)
                      ON CONFLICT DO NOTHING
                    `,
                    values: [
                      order.prefixed_hash,
                      order.target,
                      order.maker,
                      Math.floor(new Date(order.created_date).getTime() / 1000),
                      Boolean(parsed),
                      order as any,
                    ],
                  });
                }

                if (insertQueries.length) {
                  await db.none(pgp.helpers.concat(insertQueries));
                }

                // Filter and send the valid orders to the indexer
                await axios
                  .post(`${config.baseNftIndexerApiUrl}/orders`, {
                    orders: validOrders,
                  })
                  .then(() => {
                    logger.info(
                      `(${listedAfter}, ${listedBefore}) Successfully posted ${fetchedOrders.length} orders`
                    );
                  })
                  .catch((error) => {
                    logger.error(
                      `(${listedAfter}, ${listedBefore}) Failed to post orders: ${error}`
                    );
                  });

                resolve("Successfully fetched");
              }
            }
          })
          .catch((error) => {
            logger.error(
              `(${listedAfter}, ${listedBefore}) Failed to sync: ${error}`
            );

            numErrors++;
            if (numErrors < maxAllowedErrors) {
              // Retry
              return execute(offset);
            } else {
              reject("Error threshold reached");
            }
          });
      });

    // Parallelize execution (sort of)
    for (let i = 0; i < numExecutionContexts; i++) {
      execute(offset + i * limit);
    }
  });

export const sync = async (from: number, to: number) => {
  const MAX_SECONDS = 60;

  for (let before = to; before >= from; before -= MAX_SECONDS) {
    const after = Math.max(before - MAX_SECONDS + 1, from);
    await fetchOrders(after - 1, before + 1);
  }
};
