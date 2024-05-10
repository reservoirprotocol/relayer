import tracer from "dd-trace";

import { config } from "../config";

if (process.env.DATADOG_AGENT_URL) {
  const service = `relayer-${config.chainName}`;

  // TODO: Disable Redis tracing since that generates
  // a lot of traces which for now are not relevant
  tracer.init({
    profiling: true,
    logInjection: true,
    runtimeMetrics: true,
    clientIpEnabled: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
    env: config.environment,
  });

  tracer.use("hapi", {
    headers: ["x-api-key", "referer"],
  });

  tracer.use("ioredis", {
    enabled: false,
  });

  tracer.use("amqplib", {
    enabled: false,
  });

  tracer.use("pg", {
    enabled: false,
  });

  tracer.use("elasticsearch", {
    enabled: true,
  });

  tracer.use("fetch", {
    enabled: false,
  });
}

export default tracer;
