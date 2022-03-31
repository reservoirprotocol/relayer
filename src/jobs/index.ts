import "./opensea-sync";
import "./looksrare-sync";
import "./relay-orders";
import "./sync-token";

import * as openSeaSyncRealtime from "./opensea-sync/realtime-queue";
import * as openSeaSyncBackfill from "./opensea-sync/backfill-queue";
import * as looksRareSyncRealtime from "./looksrare-sync/realtime-queue";
import * as relayOrders from "./relay-orders";
import * as syncToken from "./sync-token";

export const allQueues = [
  openSeaSyncBackfill.backfillQueue,
  openSeaSyncRealtime.realtimeQueue,
  looksRareSyncRealtime.realtimeQueue,
  relayOrders.queue,
  syncToken.queue,
];
