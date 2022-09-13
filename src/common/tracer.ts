import tracer from "dd-trace";

import { config } from "../config";

if (process.env.DATADOG_AGENT_URL) {
  let network = "unknown";
  if (config.chainId === 1) {
    network = "mainnet";
  } else if (config.chainId === 5) {
    network = "goerli";
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
