import * as Sdk from "@reservoir0x/sdk";
import { ORDER_TYPES } from "@reservoir0x/sdk/dist/rarible/constants";
import { constants } from "ethers";

import { config } from "../config";

type FetchOrdersParams = {
  blockchain: "ETHEREUM";
  continuation?: string;
  size?: number;
  sort?: "DB_UPDATE_DESC" | "DB_UPDATE_ASC";
};

// {
//     "type": "RARIBLE_V2",
//     "maker": "0xe0761710ab13b5c0fbcac83d54c9792a888dc204",
//     "make": {
//         "assetType": {
//             "assetClass": "ERC721_LAZY",
//             "contract": "0xc9154424b823b10579895ccbe442d41b9abd96ed",
//             "tokenId": "101526725225837153293026812194113777060525912400386319374566421166087487887345",
//             "uri": "/ipfs/bafkreicw7aapjemcoinjrufmmxllwa35ibx6w6lbvag3ouennekhad3xiu",
//             "creators": [
//                 {
//                     "account": "0xe0761710ab13b5c0fbcac83d54c9792a888dc204",
//                     "value": 10000
//                 }
//             ],
//             "royalties": [
//                 {
//                     "account": "0xe0761710ab13b5c0fbcac83d54c9792a888dc204",
//                     "value": 1000
//                 }
//             ],
//             "signatures": [
//                 "0x92933644c584e0a57981e16bd4ceb71173f80ae68ecfa7e7960eff552e777f313659fb69eb8a37e1925d2c604e92a03fcc039ccde6c0cfae0adbd4914fe37d0f1c"
//             ]
//         },
//         "value": "1",
//         "valueDecimal": 1
//     },
//     "take": {
//         "assetType": {
//             "assetClass": "ETH"
//         },
//         "value": "1550000000000000000",
//         "valueDecimal": 1.550000000000000000
//     },
//     "fill": "0",
//     "fillValue": 0,
//     "makeStock": "1",
//     "makeStockValue": 1,
//     "cancelled": false,
//     "optionalRoyalties": false,
//     "salt": "0xf71b1f70a2284bc266a8ac6bc6483692b6d498787f3942148ab89a3e34f65409",
//     "signature": "0x688378bce66d2c65957d61349dd827a9fadb183c52e42baaec96e642fef85e8c0a9a83b49830bcaefbee84710b54268ecc46055199cdc8e96d8bc423bbb8d37f1b",
//     "createdAt": "2022-10-20T14:13:13.166Z",
//     "lastUpdateAt": "2022-10-20T14:13:13.166Z",
//     "dbUpdatedAt": "2022-10-20T14:13:13.285Z",
//     "hash": "0xc2b39d2f829bdff12f1bcec3fd7e1bfa1649c7c071c06422533d58c60685a883",
//     "makeBalance": "0",
//     "makePrice": 1.550000000000000000,
//     "makePriceUsd": 2015.080825907436460000000000000000,
//     "priceHistory": [
//         {
//             "date": "2022-10-20T14:13:13.166Z",
//             "makeValue": 1,
//             "takeValue": 1.550000000000000000
//         }
//     ],
//     "status": "ACTIVE",
//     "data": {
//         "dataType": "RARIBLE_V2_DATA_V2",
//         "payouts": [],
//         "originFees": [
//             {
//                 "account": "0x1cf0df2a5a20cd61d68d4489eebbf85b8d39e18a",
//                 "value": 100
//             }
//         ],
//         "isMakeFill": true
//     }
// },

export type RaribleOrder = {
  type: string;
  maker: string;
  make: {
    assetClass?: string;
    assetType?: {
      contract?: string;
      tokenId?: string;
    };
    value?: string;
  };
  take: {
    assetClass?: string;
    assetType?: {
      contract?: string;
      tokenId?: string;
    };
    value?: string;
  };
  fill: string;
  fillValue: number;
  makeStock: string;
  makeStockValue: number;
  cancelled: boolean;
  optionalRoyalties: boolean;
  salt: string;
  start?: number;
  end?: number;
  signature: string;
  createdAt: string;
  lastUpdateAt: string;
  dbUpdatedAt: string;
  hash: string;
  makeBalance: string;
  makePrice: number;
  makePriceUsd: number;
  priceHistory: any;
  status: string;
  data: any;
};

export class Rarible {
  public buildFetchOrdersURL(params: FetchOrdersParams) {
    // For now there's no support for testnets
    const baseApiUrl = `https://api.rarible.org/v0.1/orders/sync/`;

    const queryParams = new URLSearchParams();

    if (params.size) {
      queryParams.append("size", String(params.size));
    }

    if (params.continuation) {
      queryParams.append("continuation", String(params.continuation));
    }

    if (params.sort) {
      queryParams.append("sort", String(params.sort));
    }

    return decodeURI(`${baseApiUrl}?${queryParams.toString()}`);
  }

  public async parseRaribleOrder(
    raribleOrder: RaribleOrder
  ): Promise<Sdk.Rarible.Order | undefined> {
    try {
      const order = new Sdk.Rarible.Order(config.chainId, {
        type: raribleOrder.type as ORDER_TYPES,
        maker: raribleOrder.maker,
        make: raribleOrder.make as any,
        taker: constants.AddressZero,
        take: raribleOrder.take as any,
        salt: raribleOrder.salt,
        start: raribleOrder.start || 0,
        end: raribleOrder.end || 0,
        data: raribleOrder.data,
        signature: raribleOrder.signature,
      });

      const info = order.getInfo();
      order.params.side = info!.side;
      return order;
    } catch (err) {
      // Skip any errors
      //DEBUG PURPOSES ONLY:
      console.log(err);
    }
  }
}
