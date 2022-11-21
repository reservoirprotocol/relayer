import * as Sdk from "@reservoir0x/sdk";

import { config } from "../config";
export type ManifoldOrder = {
  id: string;
  seller: string;
  createdAt: number;
  details: {
    type_: number;
    initialAmount: {
      type: string;
      hex: string;
    };
    totalAvailable: string;
    totalPerSale: string;
    extensionInterval: number;
    erc20: string;
    identityVerifier: string;
    startTime: number;
    endTime: number;
  };
  token: {
    spec: string;
    address_: string;
    id: {
      type: string;
      hex: string;
    };
    lazy: boolean;
    metadata: {
      name: string;
      image: string;
      image_url: string;
      attributes: {
        value: string;
        trait_type: string;
      }[];
      created_by: string;
      description: string;
      image_details: {
        bytes: number;
        width: number;
        format: string;
        height: number;
        sha256: string;
      };
    };
  };
  fees: {
    deliverFixed: null;
  };
  bid: {
    amount: {
      type: string;
      hex: string;
    };
    timestamp: string;
    bidder: string;
  };
  address: string;
  version: string;
};
export class Manifold {
  public buildFetchListingsURL = () => {
    // type=2 is fixed price listings
    // order=1 is sort by created at
    switch (config.chainId) {
      case 1:
        return "https://marketplace.api.manifoldxyz.dev/listing/0x3a3548e060be10c2614d0a4cb0c03cc9093fd799/active?type=2&order=1";
      case 5:
        return "https://goerli.marketplace.api.manifoldxyz.dev/listing/0x554fa73be2f122374e148b35de3ed6c34602dbf6/active?type=2&order=1";
      default:
        throw Error(`Unknown chain id: ${config.chainId}`);
    }
  };

  public async parseManifoldOrder(
    manifoldOrder: ManifoldOrder
  ): Promise<Sdk.Manifold.Order | undefined> {
    try {
      const order = new Sdk.Manifold.Order(config.chainId, manifoldOrder as any);
      return order;
    } catch {}
  }
}
