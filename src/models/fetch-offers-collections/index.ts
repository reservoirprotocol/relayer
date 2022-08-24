import _ from "lodash";
import { redis } from "../../common/redis";

export type FetchOffersCollection = {
  collection: string;
  contract: string;
  tokenId: string;
};

/**
 * Class that manage redis list of tokens, pending metadata refresh
 */
export class FetchOffersCollections {
  public key = "fetch-offers-collections";

  public constructor(method: string) {
    this.key += `:${method}`;
  }

  public async count(): Promise<number> {
    return await redis.scard(this.key);
  }

  public async add(tokens: FetchOffersCollection[], replace = false) {
    if (replace) {
      return await redis
        .multi()
        .del(this.key)
        .sadd(
          this.key,
          _.map(tokens, (token) => JSON.stringify(token))
        )
        .exec();
    }

    return await redis.sadd(
      this.key,
      _.map(tokens, (token) => JSON.stringify(token))
    );
  }

  public async getAll(): Promise<FetchOffersCollection[]> {
    const tokens = await redis.smembers(this.key);
    if (tokens) {
      return _.map(tokens, (token) => JSON.parse(token) as FetchOffersCollection);
    }

    return [];
  }
}
