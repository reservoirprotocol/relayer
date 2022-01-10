export const config = {
  port: Number(process.env.PORT),
  chainId: Number(process.env.CHAIN_ID),

  backfillOpenseaApiKey: String(process.env.BACKFILL_OPENSEA_API_KEY),
  realtimeOpenseaApiKey: String(process.env.REALTIME_OPENSEA_API_KEY),

  skipWatching: Boolean(process.env.SKIP_WATCHING),

  databaseUrl: String(process.env.DATABASE_URL),
  redisUrl: String(process.env.REDIS_URL),
};
