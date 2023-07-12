import tracer from "dd-trace";

import { config } from "../config";

if (process.env.DATADOG_AGENT_URL) {
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

    case 7777777:
      network = "zora";
      break;
  }

  const service = `relayer-${network}`;

  // TODO: Disable Redis tracing since that generates
  // a lot of traces which for now are not relevant
  tracer.init({
    service,
    url: process.env.DATADOG_AGENT_URL,
  });
}

export default tracer;
