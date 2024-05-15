import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { Element } from "../../utils/element";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import ordersResult from "./__fixtures__/orders.json";

jest.setTimeout(1000 * 1000);

export const bn = (value: BigNumberish) => BigNumber.from(value);

describe("Element", () => {
  let element: Element;

  beforeEach(async () => {
    element = new Element();
  });

  test("genUrl", async () => {
    const url = element.buildFetchOrdersURL({
      chain: "eth",
    });
  });

  test("parseOrder", async () => {
    const orders = ordersResult.data.orders.slice(0, 20);
    for (let index = 0; index < orders.length; index++) {
      const order = orders[index];
      const parsedOrder = await element.parseOrder(order);
      if (parsedOrder) {
        // hash check
        expect(parsedOrder.hash()).toEqual(order.orderHash.split("_")[0]);
        parsedOrder.checkSignature();
      }
    }
  });

  test("parseNewOrder", async () => {
    const parsed = await element.parseOrder({
      chain: "eth",
      chainId: "0x1",
      orderHash:
        "0x3faecdffbbe4de382e8087fddec9a3227615baa1618fd51293f7503e4a651766_1",
      orderId: "1442690384920285728",
      expirationTime: 1718118712,
      listingTime: 1715526658,
      createTime: 1715526723,
      maker: "0xdb2ab5671bf17ca408fe75e90571fbe675d01c00",
      taker: "0x0000000000000000000000000000000000000000",
      side: 1,
      saleKind: 3,
      paymentToken: "0x0000000000000000000000000000000000000000",
      quantity: "1",
      priceBase: 0.0025,
      priceUSD: 7.319725,
      price: 0.0025,
      standard: "element-ex-v3",
      contractAddress: "0x0a252663dbcc0b073063d6420a40319e438cfa59",
      tokenId: "62708",
      schema: "ERC721",
      extra: null,
      exchangeData:
        '{"basicCollections":[{"nftAddress":"0x0a252663dbcc0b073063d6420a40319e438cfa59","platformFee":50,"royaltyFeeRecipient":"0x0000000000000000000000000000000000000000","royaltyFee":0,"items":[{"erc20TokenAmount":"2500000000000000","nftId":"62708"}]}],"collections":null,"startNonce":1,"nonce":1,"hashNonce":"0","platformFeeRecipient":"0x00ca62445b06a9adc1879a44485b4efdcb7b75f3","v":0,"r":"","s":"","listingTime":1715526658,"expirationTime":1718118712,"maker":"0xdb2ab5671bf17ca408fe75e90571fbe675d01c00","hash":"0x3faecdffbbe4de382e8087fddec9a3227615baa1618fd51293f7503e4a651766","paymentToken":"0x0000000000000000000000000000000000000000","signatureType":0,"oracleSignature":1,"extraData":""}',
    } as any);

    // console.log(
    //   "parsed",
    //   JSON.stringify({
    //     orders: [
    //       {
    //         kind: "element",
    //         data: parsed?.params,
    //       },
    //     ],
    //   })
    // );
  });
});
