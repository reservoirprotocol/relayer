import tracer from "dd-trace";

import { config } from "../config";

if (process.env.DATADOG_AGENT_URL) {
  const service = `relayer-${config.chainName}`;

  // TODO: Disable Redis tracing since that generates
  // a lot of traces which for now are not relevant
  tracer.init({
    profiling: false,
    logInjection: true,
    runtimeMetrics: false,
    clientIpEnabled: true,
    service,
    url: process.env.DATADOG_AGENT_URL,
    env: config.environment,
  });

  for (const disabledDatadogPluginTracing of config.disabledDatadogPluginsTracing) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    tracer.use(disabledDatadogPluginTracing, {
      enabled: false,
    });
  }
}

export default tracer;
