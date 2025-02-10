export const config = {
  port: Number(process.env.PORT),
  chainId: Number(process.env.CHAIN_ID),
  chainName: String(process.env.CHAIN_NAME || "unknown"),
  environment: String(process.env.ENVIRONMENT),

  openseaHostname: process.env.OPENSEA_HOSTNAME,
  openseaChainName: process.env.OPENSEA_CHAIN_NAME,
  backfillOpenseaApiKey: process.env.BACKFILL_OPENSEA_API_KEY,
  realtimeOpenseaApiKey: process.env.REALTIME_OPENSEA_API_KEY,
  offersOpenseaApiKey: String(process.env.OFFERS_OPENSEA_API_KEY || ""),
  collectionsOffersOpenseaApiKey: String(
    process.env.COLLECTIONS_OFFERS_OPENSEA_API_KEY || ""
  ),
  x2y2ApiKey: String(process.env.X2Y2_API_KEY),
  looksrareApiKey: String(process.env.LOOKSRARE_API_KEY),

  blurApiKey: String(process.env.BLUR_API_KEY),

  openseaNftApiKey: String(process.env.OPENSEA_NFT_API_KEY),

  blurUrl: String(process.env.BLUR_URL),
  openseaApiUrl: String(process.env.OPENSEA_API_URL),

  // OKX
  okxApiKey: String(process.env.OKX_API_KEY),
  okxSecretKey: String(process.env.OKX_SECRET_KEY),
  okxPassphrase: String(process.env.OKX_PASSPHRASE),
  okxChainName: process.env.OKX_CHAIN_NAME,
  doOkxWork: Boolean(Number(process.env.DO_OKX_WORK || 1)),

  // Element
  elementApiKey: String(process.env.ELEMENT_API_KEY),
  elementChainName: process.env.ELEMENT_CHAIN_NAME,
  doElementWork: Boolean(Number(process.env.DO_ELEMENT_WORK || 1)),

  doBackgroundWork: Boolean(Number(process.env.DO_BACKGROUND_WORK)),
  doBackfillWork: Boolean(Number(process.env.DO_BACKFILL_WORK)),
  doRealtimeWork: Boolean(Number(process.env.DO_REALTIME_WORK)),
  doLiveWork: Boolean(Number(process.env.DO_LIVE_WORK)),
  doOpenseaWork: Boolean(Number(process.env.DO_OPENSEA_WORK)),

  databaseUrl: String(process.env.DATABASE_URL),
  redisUrl: String(process.env.REDIS_URL),

  disabledDatadogPluginsTracing: process.env.DISABLED_DATADOG_PLUGINS_TRACING
    ? String(process.env.DISABLED_DATADOG_PLUGINS_TRACING).split(",")
    : "ioredis,amqplib,pg,fetch,kafkajs,elasticsearch,http,dns,net".split(","),
};
