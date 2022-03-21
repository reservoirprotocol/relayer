import cron from "node-cron";

import { acquireLock, redis } from "../../common/redis";
import { config } from "../../config";

import * as openseaSyncRealtime from "./realtime-queue";
import * as openseaSyncBackfill from "./backfill-queue";

import "./realtime-queue";
import "./backfill-queue";

if (config.doBackgroundWork) {
  // Fetch new orders every 1 minute
  cron.schedule("*/1 * * * *", async () => {
    const currentMinute = Math.floor(Date.now() / 1000 / 60);
    const previousMinute = currentMinute - 1;
    const numberOfJobs = 12;
    const interval = 5;

    const lockAcquired = await acquireLock("opensea-sync-lock", 55);

    if (lockAcquired) {
      const cacheKey = "opensea-sync-last-minute";
      const lastSyncedMinute = Number(await redis.get(cacheKey));

      if (lastSyncedMinute === 0) {
        // No cache, so we only sync the last minute
        await openseaSyncBackfill.addToBackfillQueue(previousMinute, previousMinute);
      } else if (lastSyncedMinute < previousMinute) {
        // Create a 5s interval job to sync orders
        for (let i = 0; i < numberOfJobs; i++) {
          const second = (currentMinute * 60) + (interval * i);
          const delayMs = interval * (i + 1) * 1000;

          await openseaSyncRealtime.addToRealtimeQueue(previousMinute, second, interval, delayMs);
        }

        // If we need to do any backfill e.g. last sync is older than 1 minuted ago
        if (lastSyncedMinute < previousMinute - 1) {
          await openseaSyncBackfill.addToBackfillQueue(lastSyncedMinute, previousMinute - 1);
        }
      }

      await redis.set(cacheKey, String(previousMinute));
    }
  });
}
