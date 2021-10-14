import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import WatcherInit from "./watcher";

Promise.all([WatcherInit()]);
