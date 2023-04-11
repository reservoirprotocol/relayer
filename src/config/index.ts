export const config = {
  port: Number(process.env.PORT),
  chainId: Number(process.env.CHAIN_ID),

  backfillOpenseaApiKey: String(process.env.BACKFILL_OPENSEA_API_KEY),
  realtimeOpenseaApiKey: String(process.env.REALTIME_OPENSEA_API_KEY),
  offersOpenseaApiKey: String(process.env.OFFERS_OPENSEA_API_KEY || ""),
  collectionsOffersOpenseaApiKey: String(process.env.COLLECTIONS_OFFERS_OPENSEA_API_KEY || ""),
  x2y2ApiKey: String(process.env.X2Y2_API_KEY),
  elementApiKey: String(process.env.ELEMENT_API_KEY),
  coinbaseApiKey: String(process.env.COINBASE_API_KEY),
  flowApiKey: String(process.env.FLOW_API_KEY),
  blurApiKey: String(process.env.BLUR_API_KEY),
  blurUrl: String(process.env.BLUR_URL),

  doBackgroundWork: Boolean(Number(process.env.DO_BACKGROUND_WORK)),
  doBackfillWork: Boolean(Number(process.env.DO_BACKFILL_WORK)),
  doRealtimeWork: Boolean(Number(process.env.DO_REALTIME_WORK)),
  doLiveWork: Boolean(Number(process.env.DO_LIVE_WORK)),

  databaseUrl: String(process.env.DATABASE_URL),
  redisUrl: String(process.env.REDIS_URL),
};
