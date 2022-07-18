import cron from "node-cron";
import { config } from "../../config";
import { acquireLock } from "../../common/redis";
import { logger } from "../../common/logger";
import { realtimeQueue } from "./realtime-queue";
import { backfillQueue } from "./backfill-queue";
import {sub, getUnixTime, startOfHour, format } from 'date-fns'

import * as seaportSyncRealtime from "./realtime-queue";
import * as seaportSyncBackfill from "./backfill-queue";

if (config.doRealtimeWork) {
  cron.schedule("*/5 * * * * *", async () => {
    const lockAcquired = await acquireLock("seaport-sync-lock", 4);
    
    if (lockAcquired) {
      await seaportSyncRealtime.addToRealtimeQueue();
      logger.info(realtimeQueue.name, `Start SeaPort realtime`);
    }
  });

  // Once an hour do a full sync of the entire last hour
  cron.schedule("0 * * * *", async () => {
    const lockAcquired = await acquireLock("seaport-backfill-sync-lock", 59);

    if (lockAcquired) {
      const toTimestamp = new Date();
      const fromTimestamp = startOfHour(sub(toTimestamp, { hours: 1 }));
      await seaportSyncBackfill.createTimeFrameForBackfill(getUnixTime(fromTimestamp), getUnixTime(toTimestamp), 90 * 1000);

      logger.info(backfillQueue.name, `Start SeaPort hourly full sync fromTimestamp=${format(fromTimestamp, "yyyy-MM-dd HH:mm:ss")} toTimestamp=${format(toTimestamp, "yyyy-MM-dd HH:mm:ss")}`);
    }
  });
}
