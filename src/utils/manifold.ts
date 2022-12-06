import * as Sdk from "@reservoir0x/sdk";
import { BigNumber } from "ethers";

import { config } from "../config";
export type ManifoldApiOrder = {
  id: string;
  seller: string;
  details: {
    type_: number;
    initialAmount: BNHex;
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
    id: BNHex;
    lazy: boolean;
  };
  fees: {
    deliverFixed: null;
  };
  bid: {
    amount: BNHex;
    timestamp: string;
    bidder: string;
  };
  address: string;
  version: string;
};

type BNHex = {
  type: string;
  hex: string;
};

enum Spec {
  NONE,
  ERC721,
  ERC1155,
}

export class Manifold {
  public buildFetchListingsURL = (page: number, pageSize: number) => {
    switch (config.chainId) {
      case 1:
        return `https://marketplace.api.manifoldxyz.dev/listing/0x3a3548e060be10c2614d0a4cb0c03cc9093fd799/activity?sortAscending=true&pageNumber=${page}&pageSize=${pageSize}`;
      case 5:
        return `https://goerli.marketplace.api.manifoldxyz.dev/listing/0x554fa73be2f122374e148b35de3ed6c34602dbf6/activity?sortAscending=true&pageNumber=${page}&pageSize=${pageSize}`;
      default:
        throw Error(`Unknown chain id: ${config.chainId}`);
    }
  };
  private bnHexToString = (bnHex: BNHex) => {
    return BigNumber.from(bnHex.hex).toString();
  };

  public async parseManifoldOrder(
    manifoldOrder: ManifoldApiOrder
  ): Promise<Sdk.Manifold.Order | undefined> {
    try {
      const contractOrder = JSON.parse(JSON.stringify(manifoldOrder));

      contractOrder.details.initialAmount = this.bnHexToString(manifoldOrder.details.initialAmount);
      contractOrder.token.id = this.bnHexToString(manifoldOrder.token.id);
      contractOrder.token.spec =
        manifoldOrder.token.spec.toLowerCase() === "erc721"
          ? Spec.ERC721
          : manifoldOrder.token.spec.toLowerCase() === "erc1155"
          ? Spec.ERC1155
          : Spec.NONE;
      if (!contractOrder.fees) {
        contractOrder.fees = {
          deliverFixed: 0,
          deliverBPS: 0,
        };
      }
      if (!contractOrder.fees.deliverFixed) {
        contractOrder.fees.deliverFixed = 0;
      }
      if (!contractOrder.fees.deliverBPS) {
        contractOrder.fees.deliverBPS = 0;
      }
      const order = new Sdk.Manifold.Order(config.chainId, contractOrder);
      return order;
    } catch {}
  }
}
