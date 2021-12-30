export default {
  port: Number(process.env.PORT),
  chainId: Number(process.env.CHAIN_ID),

  openseaApiKey: String(process.env.OPENSEA_API_KEY),

  skipWatching: Boolean(process.env.SKIP_WATCHING),

  databaseUrl: String(process.env.DATABASE_URL),

  redisHost: String(process.env.REDISHOST),
  redisPort: Number(process.env.REDISPORT),
  redisPassword: String(process.env.REDISPASSWORD),
};
