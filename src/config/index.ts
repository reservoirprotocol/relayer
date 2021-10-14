export default {
  baseNftIndexerApiUrl: String(process.env.BASE_NFT_INDEXER_API_URL),
  baseOpenseaApiUrl: String(process.env.BASE_OPENSEA_API_URL),

  // Throttle time between consecutive Opensea API requests in a batch for
  // avoiding getting rate-limited
  throttleTime: Number(process.env.THROTTLE_TIME),

  // Number of logic threads for parallelizing batches of Opensea
  // API requests in order to avoid delays on waiting for responses
  // which might sometimes take longer than the throttle time
  numExecutionContexts: Number(process.env.NUM_EXECUTION_CONTEXTS),

  databaseUrl: String(process.env.DATABASE_URL),

  redisHost: String(process.env.REDISHOST),
  redisPort: Number(process.env.REDISPORT),
  redisPassword: String(process.env.REDISPASSWORD),
};
