import "./opensea-sync";
import "./looksrare-sync";
import "./relay-orders";
import "./sync-token";
import "./x2y2";

import * as openSeaSync from "./opensea-sync";
import * as looksRareSyncRealtime from "./looksrare-sync/realtime-queue";
import * as x2y2SyncRealtime from "./x2y2/realtime-queue";
import * as x2y2SyncBackfill from "./x2y2/backfill-queue";
import * as relayOrders from "./relay-orders";
import * as syncToken from "./sync-token";

export const allQueues = [
  openSeaSync.backfillQueue,
  openSeaSync.realtimeQueue,
  openSeaSync.liveQueue,
  looksRareSyncRealtime.realtimeQueue,
  relayOrders.queue,
  syncToken.queue,
  x2y2SyncRealtime.realtimeQueue,
  x2y2SyncBackfill.backfillQueue,
];
