import { createLogger, format, transports } from "winston";

import { config } from "../config";

const log = (level: "debug" | "error" | "info" | "warn") => {
  let network = "unknown";
  if (config.chainId === 1) {
    network = "mainnet";
  } else if (config.chainId === 5) {
    network = "goerli";
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

  return (component: string, message: string) => logger.log(level, message, { component });
};

export const logger = {
  debug: log("debug"),
  error: log("error"),
  info: log("info"),
  warn: log("warn"),
};
