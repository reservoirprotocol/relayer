import "./opensea-rarible-sync";
import "./opensea-sync";
import "./relay-orders";

import * as openSeaRaribleSync from "./opensea-rarible-sync";
import * as openSeaSync from "./opensea-sync";
import * as relayOrders from "./relay-orders";

export const allQueues = [
  openSeaRaribleSync.queue,
  openSeaSync.backfillQueue,
  openSeaSync.realtimeQueue,
  relayOrders.queue,
];
