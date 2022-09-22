import "./looksrare-sync";
import "./relay-orders";
import "./seaport-sync";
import "./sync-token";
import "./x2y2-sync";

import * as looksRareSyncRealtime from "./looksrare-sync/realtime-queue";
import * as relayOrders from "./relay-orders";
import * as seaportSyncListingsRealtime from "./seaport-sync/realtime-queue";
import * as seaportSyncOffersRealtime from "./seaport-sync/realtime-queue-offers";
import * as seaportSyncCollectionOffersRealtime from "./seaport-sync/realtime-queue-offers";

import * as seaportSyncBackfill from "./seaport-sync/backfill-queue";
import * as syncToken from "./sync-token";
import * as x2y2SyncListingsRealtime from "./x2y2-sync/queues/realtime-queue";
import * as x2y2SyncOffersRealtime from "./x2y2-sync/queues/realtime-queue-offers";
import * as x2y2SyncListingsBackfill from "./x2y2-sync/queues/backfill-queue";
import * as x2y2SyncOffersBackfill from "./x2y2-sync/queues/backfill-queue-offers";

export const allQueues = [
  looksRareSyncRealtime.realtimeQueue,
  relayOrders.queue,
  seaportSyncListingsRealtime.realtimeQueue,
  seaportSyncOffersRealtime.realtimeQueue,
  seaportSyncCollectionOffersRealtime.realtimeQueue,
  seaportSyncBackfill.backfillQueue,
  syncToken.queue,
  x2y2SyncListingsRealtime.realtimeQueue,
  x2y2SyncOffersRealtime.realtimeQueue,
  x2y2SyncListingsBackfill.backfillQueue,
  x2y2SyncOffersBackfill.backfillQueue,
];
