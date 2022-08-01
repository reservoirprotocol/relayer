import "./opensea-sync";
import "./looksrare-sync";
import "./relay-orders";
import "./sync-token";
import "./x2y2-sync";
import "./seaport-sync";

import * as looksRareSyncRealtime from "./looksrare-sync/realtime-queue";
import * as x2y2SyncRealtime from "./x2y2-sync/realtime-queue";
import * as x2y2SyncBackfill from "./x2y2-sync/backfill-queue";
import * as relayOrders from "./relay-orders";
import * as syncToken from "./sync-token";
import * as seaportSyncRealtime from "./seaport-sync/realtime-queue";
import * as seaportSyncBackfill from "./seaport-sync/backfill-queue";

export const allQueues = [
  looksRareSyncRealtime.realtimeQueue,
  relayOrders.queue,
  syncToken.queue,
  x2y2SyncRealtime.realtimeQueue,
  x2y2SyncBackfill.backfillQueue,
  seaportSyncRealtime.realtimeQueue,
  seaportSyncBackfill.backfillQueue,
];
