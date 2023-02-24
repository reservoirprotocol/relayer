import "./looksrare-sync";
import "./relay-orders";
import "./seaport-sync";
import "./sync-token";
import "./x2y2-sync";
import "./element-sync";
import "./coinbase-sync";
import "./rarible-sync";
import "./manifold-sync";
import "./infinity-sync";
import "./flow-sync";

import * as looksRareSyncRealtime from "./looksrare-sync/realtime-queue";
import * as relayOrders from "./relay-orders";
import * as seaportSyncListingsRealtime from "./seaport-sync/realtime-queue";
import * as seaportSyncOffersRealtime from "./seaport-sync/realtime-queue-offers";
import * as seaportSyncCollectionOffersRealtime from "./seaport-sync/realtime-queue-collection-offers";

import * as seaportSyncBackfill from "./seaport-sync/backfill-queue";
import * as syncToken from "./sync-token";
import * as x2y2SyncListingsRealtime from "./x2y2-sync/queues/realtime-queue";
import * as x2y2SyncOffersRealtime from "./x2y2-sync/queues/realtime-queue-offers";
import * as x2y2SyncListingsBackfill from "./x2y2-sync/queues/backfill-queue";
import * as x2y2SyncOffersBackfill from "./x2y2-sync/queues/backfill-queue-offers";
import * as raribleSyncRealtime from "./rarible-sync/queues/realtime-queue";
import * as raribleSyncBackfill from "./rarible-sync/queues/backfill-queue";

import * as elementSyncListingsRealtime from "./element-sync/queues/realtime-queue";
import * as elementSyncOffersRealtime from "./element-sync/queues/realtime-queue-offers";
import * as elementSyncListingsBackfill from "./element-sync/queues/backfill-queue";
import * as elementSyncOffersBackfill from "./element-sync/queues/backfill-queue-offers";

import * as coinbaseSyncListingsRealtime from "./coinbase-sync/realtime-queue";
import * as coinbaseSyncListingsBackfill from "./coinbase-sync/backfill-queue";
import * as coinbaseSyncOffersRealtime from "./coinbase-sync/realtime-queue-offers";

import * as manifoldSyncListingsRealtime from "./manifold-sync/realtime-queue";

import * as infinitySyncListingsBackfill from "./infinity-sync/queues/backfill-queue";
import * as infinitySyncListingsRealtime from "./infinity-sync/queues/realtime-queue-listings";
import * as infinitySyncOffersRealtime from "./infinity-sync/queues/realtime-queue-offers";

import * as flowSyncListingsBackfill from "./flow-sync/queues/backfill-queue";
import * as flowSyncListingsRealtime from "./flow-sync/queues/realtime-queue-listings";
import * as flowSyncOffersRealtime from "./flow-sync/queues/realtime-queue-offers";

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
  elementSyncListingsRealtime.realtimeQueue,
  elementSyncOffersRealtime.realtimeQueue,
  elementSyncListingsBackfill.backfillQueue,
  elementSyncOffersBackfill.backfillQueue,
  coinbaseSyncListingsRealtime.realtimeQueue,
  coinbaseSyncListingsBackfill.backfillQueue,
  coinbaseSyncOffersRealtime.realtimeQueue,
  raribleSyncRealtime.realtimeQueue,
  raribleSyncBackfill.backfillQueue,
  manifoldSyncListingsRealtime.realtimeQueue,
  infinitySyncListingsBackfill.backfillQueue,
  infinitySyncListingsRealtime.realtimeQueue,
  infinitySyncOffersRealtime.realtimeQueue,
  flowSyncListingsBackfill.backfillQueue,
  flowSyncListingsRealtime.realtimeQueue,
  flowSyncOffersRealtime.realtimeQueue,
];
