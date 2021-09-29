import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import cron from "node-cron";

import config from "./config";
import fetchOrders from "./fetchers/orders";
import log from "./log";

// Cron job for fetching orders
cron.schedule(`*/${config.ordersFetchFrequency} * * * *`, async () => {
  log.info("Orders fetching cron started");

  fetchOrders()
    .then(() => log.info("Orders fetching cron done"))
    .catch((error) => {
      log.error(`Error fetching orders: ${error}`);
    });
});
