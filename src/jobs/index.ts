import * as openseaSync from "./opensea-sync";
import * as relayOrders from "./relay-orders";

export const allQueues = [
  openseaSync.backfillQueue,
  openseaSync.realtimeQueue,
  relayOrders.queue,
];
