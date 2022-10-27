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
      chain: "eth"
    });
    // console.log("url", url)
  });

  test("parseOrder", async () => {
    const orders = ordersResult.data.orders.slice(0, 10)
    for (let index = 0; index < orders.length; index++) {
      const order = orders[index];
      const parsedOrder = await element.parseOrder(order)
      if (parsedOrder) {
        // hash check
        expect(parsedOrder.hash()).toEqual(order.hash)
        parsedOrder.checkSignature();
      }
    }
  });
});
