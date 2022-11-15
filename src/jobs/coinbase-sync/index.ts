import cron from "node-cron";
import _ from "lodash";

import { config } from "../../config";
import { acquireLock } from "../../common/redis";
import * as coinbaseSyncRealtime from "./realtime-queue";
import * as coinbaseOffersSyncRealtime from "./realtime-queue-offers";

if (config.doRealtimeWork) {
  cron.schedule("*/10 * * * * *", async () => {
    if (_.indexOf([1], config.chainId) !== -1) {
      const lockAcquired = await acquireLock("coinbase-sync-lock", 120);

      if (lockAcquired) {
        await coinbaseSyncRealtime.addToRealtimeQueue();
      }
    }

    if (_.indexOf([1], config.chainId) !== -1) {
      const lockAcquired = await acquireLock("coinbase-offers-sync-lock", 120);

      if (lockAcquired) {
        await coinbaseOffersSyncRealtime.addToRealtimeQueue();
      }
    }
  });
}
