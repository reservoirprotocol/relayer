import { Tedis, TedisPool } from "tedis";

import config from "../config";

const pool = new TedisPool({
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
});

const withTedis = async <T>(callback: (instance: Tedis) => Promise<T>) => {
  const instance = await pool.getTedis();
  const result = await callback(instance);
  pool.putTedis(instance);
  return result;
};

class Redis {
  public static async deleteKey(key: string) {
    return withTedis((instance) => instance.del(key));
  }

  public static async getKey(key: string) {
    return withTedis((instance) => instance.get(key));
  }

  public static async setKey(key: string, value: string) {
    return withTedis((instance) => instance.set(key, value));
  }

  public static async deleteHashKey(hash: string, key: string) {
    return withTedis((instance) => instance.hdel(hash, key));
  }

  public static async getHashKey(hash: string, key: string) {
    return withTedis((instance) => instance.hmget(hash, key));
  }

  public static async getAllHashKeys(hash: string) {
    return withTedis((instance) => instance.hgetall(hash));
  }

  public static async setHashKey(hash: string, key: string, value: string) {
    return withTedis((instance) => instance.hmset(hash, { [key]: value }));
  }
}

export default Redis;
