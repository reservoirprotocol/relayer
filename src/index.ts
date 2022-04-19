import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "./common/tracer";
import "./jobs";

import { start } from "./api";
import { backfillQueue } from "./jobs/opensea-sync/backfill-queue";

const main = async () => {
  try {
    backfillQueue.clean(0, 100000, "wait");
    backfillQueue.clean(0, 100000, "delayed");
  } catch {}
};

main();

start();
