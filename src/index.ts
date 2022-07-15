import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "./common/tracer";
import "./jobs";

import { start } from "./api";

start();
