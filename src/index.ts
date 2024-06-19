import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import * as Sdk from "@reservoir0x/sdk";

// Initialize the SDK - this step must be done before reaching any imports that reference the SDK
Sdk.Global.Config.addresses = Sdk.Addresses;

import "./common/tracer";
import "./jobs";

import { start } from "./api";

start();
