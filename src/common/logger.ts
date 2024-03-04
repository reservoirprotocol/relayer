import { createLogger, format, transports } from "winston";

import { config } from "../config";

import { networkInterfaces } from "os";

/* eslint-disable @typescript-eslint/no-explicit-any */
const nets: any = networkInterfaces();
/* eslint-disable @typescript-eslint/no-explicit-any */
const results: any = {};

for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
    if (net.family === "IPv4" && !net.internal) {
      if (!results[name]) {
        results[name] = [];
      }
      results[name].push(net.address);
    }
  }
}

const log = (level: "debug" | "error" | "info" | "warn") => {
  let network = "unknown";
  switch (config.chainId) {
    case 1:
      network = "mainnet";
      break;

    case 5:
      network = "goerli";
      break;

    case 10:
      network = "optimism";
      break;

    case 56:
      network = "bsc";
      break;

    case 137:
      network = "polygon";
      break;

    case 42161:
      network = "arbitrum";
      break;

    case 42170:
      network = "arbitrum-nova";
      break;

    case 43114:
      network = "avalanche";
      break;

    case 80001:
      network = "mumbai";
      break;

    case 8453:
      network = "base";
      break;

    case 84531:
      network = "base-goerli";
      break;

    case 7777777:
      network = "zora";
      break;

    case 999:
      network = "zora-testnet";
      break;

    case 11155111:
      network = "sepolia";
      break;

    case 59144:
      network = "linea";
      break;

    case 1101:
      network = "polygon-zkevm";
      break;

    case 324:
      network = "zksync";
      break;

    case 81457:
      network = "blast";
      break;

    case 534352:
      network = "scroll";
      break;

    case 204:
      network = "opbnb";
      break;
  }

  const service = `relayer-${network}`;

  const logger = createLogger({
    exitOnError: false,
    format: format.combine(
      format.timestamp({
        format: "YYYY-MM-DD HH:mm:ss",
      }),
      format.json()
    ),
    transports: [
      process.env.DATADOG_API_KEY
        ? new transports.Http({
            host: "http-intake.logs.datadoghq.com",
            path: `/api/v2/logs?dd-api-key=${process.env.DATADOG_API_KEY}&ddsource=nodejs&service=${service}`,
            ssl: true,
          })
        : // Fallback to logging to standard output
          new transports.Console(),
    ],
  });

  return (component: string, message: string) =>
    logger.log(level, message, {
      component,
      version: process.env.npm_package_version,
      networkInterfaces: results,
      railwaySnapshotId: process.env.RAILWAY_SNAPSHOT_ID,
    });
};

export const logger = {
  debug: log("debug"),
  error: log("error"),
  info: log("info"),
  warn: log("warn"),
};
