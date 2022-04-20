import "./opensea-sync";
import "./looksrare-sync";
import "./relay-orders";
import "./sync-token";

import * as openSeaSync from "./opensea-sync";
import * as looksRareSyncRealtime from "./looksrare-sync/realtime-queue";
import * as relayOrders from "./relay-orders";
import * as syncToken from "./sync-token";

export const allQueues = [
  openSeaSync.backfillQueue,
  openSeaSync.realtimeQueue,
  openSeaSync.liveQueue,
  looksRareSyncRealtime.realtimeQueue,
  relayOrders.queue,
  syncToken.queue,
];
