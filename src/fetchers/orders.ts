import { PrismaClient } from "@prisma/client";
import axios from "axios";
const throttledQueue = require("throttled-queue");

import config from "../config";
import log from "../log";
import { OpenseaOrder } from "../types";
import { buildFetchOrdersURL, parseOpenseaOrder } from "../utils";

const prisma = new PrismaClient();

const getFetchInterval = (): [number, number] => {
  const listedBefore = Math.floor(Date.now() / 1000);
  const listedAfter = listedBefore - config.ordersFetchFrequency * 60;
  return [listedAfter, listedBefore];
};

const fetchOrders = async () =>
  new Promise((resolve, reject) => {
    const queue = throttledQueue(1, config.throttleTime, true);
    const numExecutionContexts = config.numExecutionContexts;
    const offset = 0;
    const limit = 50;

    let numFinishedExecutionContexts = 0;
    let numErrors = 0;

    // In-memory object of all orders fetched in this batch
    let fetchedOrders: OpenseaOrder[] = [];

    const [listed_after, listed_before] = getFetchInterval();
    const execute = (offset: number) =>
      queue(async () => {
        const url = buildFetchOrdersURL({
          listed_after,
          listed_before,
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
                // Persist all orders to the database for analytical purposes
                await prisma.order.createMany({
                  data: fetchedOrders.map((order) => ({
                    data: JSON.stringify(order),
                  })),
                });

                // Filter and send the valid orders to the indexer
                await axios
                  .post(`${config.baseNftIndexerApiUrl}/orders`, {
                    orders: fetchedOrders
                      .map(parseOpenseaOrder)
                      .filter(Boolean),
                  })
                  .then(() => {
                    log.info(
                      `Successfully sent ${fetchedOrders.length} orders to the NFT indexer`
                    );
                  })
                  .catch((error) => {
                    log.error(
                      `Error sending orders to the NFT indexer: ${error}`
                    );
                  });

                // If all execution contexts are done, resolve
                resolve("Successfully fetched");
              }
            }
          })
          .catch((error) => {
            log.error(`Error requesting ${url}: ${error}`);

            numErrors++;
            if (numErrors < config.maxAllowedErrorsPerFetch) {
              // If we below the error threshold, then retry
              return execute(offset);
            } else {
              // Otherwise, reject
              reject("Error threshold reached");
            }
          });
      });

    // Parallelize execution (sort of)
    for (let i = 0; i < numExecutionContexts; i++) {
      execute(offset + i * limit);
    }
  });

export default fetchOrders;
