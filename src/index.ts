import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "./common/tracer";

import ApiInit from "./api";
import WatcherInit from "./watcher";

Promise.all([ApiInit(), WatcherInit()]);
