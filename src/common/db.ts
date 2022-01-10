import PgPromise from "pg-promise";

import { config } from "../config";

export const pgp = PgPromise();
export const db = pgp({
  connectionString: config.databaseUrl,
  keepAlive: true,
  // Timeout after 10 minutes
  query_timeout: 60 * 10 * 1000,
});
