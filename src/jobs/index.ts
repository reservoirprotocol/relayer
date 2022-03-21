import "./opensea-rarible-sync";
import "./opensea-sync";
import "./relay-orders";
import "./sync-token";

import * as openSeaRaribleSync from "./opensea-rarible-sync";
import * as openSeaSyncRealtime from "./opensea-sync/realtime-queue";
import * as openSeaSyncBackfill from "./opensea-sync/backfill-queue";
import * as relayOrders from "./relay-orders";
import * as syncToken from "./sync-token";

export const allQueues = [
  openSeaRaribleSync.queue,
  openSeaSyncBackfill.backfillQueue,
  openSeaSyncRealtime.realtimeQueue,
  relayOrders.queue,
  syncToken.queue,
];
