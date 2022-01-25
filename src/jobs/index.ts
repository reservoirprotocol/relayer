import "./opensea-rarible-sync";
import "./opensea-sync";
import "./relay-orders";

import * as openseaSync from "./opensea-sync";
import * as relayOrders from "./relay-orders";

export const allQueues = [
  openseaSync.backfillQueue,
  openseaSync.realtimeQueue,
  relayOrders.queue,
];
