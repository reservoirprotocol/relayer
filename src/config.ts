export default {
  // Base NFT Indexer API URL
  baseNftIndexerApiUrl: String(process.env.BASE_NFT_INDEXER_API_URL),

  // Base Opensea API URL
  baseOpenseaApiUrl: String(process.env.BASE_OPENSEA_API_URL),

  // How often (in minutes) to fetch new orders from Opensea
  ordersFetchFrequency: Number(process.env.ORDERS_FETCH_FREQUENCY),

  // Maximum allowed number of errors (most likely rate-limited requests)
  // per batch of Opensea API requests
  maxAllowedErrorsPerFetch: Number(process.env.MAX_ALLOWED_ERRORS_PER_FETCH),

  // Throttle time between consecutive Opensea API requests in a batch for
  // avoiding getting rate-limited
  throttleTime: Number(process.env.THROTTLE_TIME),

  // Number of logic threads for parallelizing batches of Opensea
  // API requests in order to avoid delays on waiting for responses
  // which might sometimes take longer than the throttle time
  numExecutionContexts: Number(process.env.NUM_EXECUTION_CONTEXTS),
};
