import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import cron from "node-cron";

import config from "./config";
import fetchOrders from "./fetchers/orders";

// Cron job for fetching orders
cron.schedule(`*/${config.ordersFetchFrequency} * * * *`, async () => {
  console.log("Orders fetching cron started");

  fetchOrders().catch((error) => {
    console.error(`Error fetching orders: ${error}`);
  });
});
