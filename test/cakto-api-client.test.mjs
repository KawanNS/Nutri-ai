import assert from "node:assert/strict";
import test from "node:test";

import {
  CaktoApiError,
  createCaktoApiClient,
} from "../dist/services/cakto-api.service.js";

const accessToken = "synthetic-access-token";
const order = {
  id: "3d5ab3d1-94af-4e96-8470-1b8659b87001",
  status: "paid",
  type: "subscription",
  product: { id: "product-synthetic" },
  subscription: "subscription-synthetic",
  sck: "S".repeat(43),
};
const subscription = {
  amount: "19.90",
  parent_order: "order-synthetic",
  paymentMethod: "credit_card",
  customer: "customer-synthetic",
  product: "product-synthetic",
  offer: "offer-synthetic",
  orders: ["order-synthetic"],
  createdAt: "2026-09-10T12:00:00Z",
  updatedAt: "2026-09-10T12:00:01Z",
  id: "subscription-synthetic",
  status: "active",
};
const offer = {
  id: "offer-synthetic",
  name: "Synthetic offer",
  price: 19.9,
  default: true,
  product: "product-synthetic",
};

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("Cakto API client uses only documented GET resource URLs and Bearer authentication", async () => {
  const requests = [];
  const responses = [order, subscription, offer];
  const client = createCaktoApiClient({
    baseUrl: "https://api.cakto.com.br",
    accessToken,
    fetchImplementation: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(responses[requests.length - 1]);
    },
  });

  await client.getOrder(order.id);
  await client.getSubscription("subscription/synthetic");
  await client.getOffer("offer/synthetic");

  assert.deepEqual(requests.map(({ url }) => url), [
    `https://api.cakto.com.br/public_api/orders/${order.id}/`,
    "https://api.cakto.com.br/public_api/subscriptions/subscription%2Fsynthetic/",
    "https://api.cakto.com.br/public_api/offers/offer%2Fsynthetic/",
  ]);
  for (const request of requests) {
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.headers.Authorization, `Bearer ${accessToken}`);
    assert.equal(request.init.redirect, "error");
    assert.equal(request.init.body, undefined);
  }
});

test("Cakto API client fails closed before fetch when the access token is absent", async () => {
  let calls = 0;
  const client = createCaktoApiClient({
    baseUrl: "https://api.cakto.com.br",
    accessToken: null,
    fetchImplementation: async () => {
      calls += 1;
      return jsonResponse(order);
    },
  });

  await assert.rejects(() => client.getOrder(order.id), {
    code: "INVALID_CAKTO_API_CONFIGURATION",
  });
  assert.equal(calls, 0);
});

test("Cakto API client rejects a non-UUID Order ID before fetch", async () => {
  let calls = 0;
  const client = createCaktoApiClient({
    baseUrl: "https://api.cakto.com.br",
    accessToken,
    fetchImplementation: async () => {
      calls += 1;
      return jsonResponse(order);
    },
  });

  await assert.rejects(() => client.getOrder("not-an-order-uuid"), {
    code: "INVALID_CAKTO_API_CONFIGURATION",
  });
  assert.equal(calls, 0);
});

test("Cakto API client rejects unsafe or structurally invalid base URLs", () => {
  for (const baseUrl of [
    "http://api.cakto.com.br",
    "https://user:password@api.cakto.com.br",
    "https://api.cakto.com.br/unexpected-path",
    "not-a-url",
  ]) {
    assert.throws(
      () => createCaktoApiClient({ baseUrl, accessToken }),
      (error) => error.code === "INVALID_CAKTO_API_CONFIGURATION",
    );
  }
});

test("Cakto API client aborts on timeout", async () => {
  const client = createCaktoApiClient({
    baseUrl: "https://api.cakto.com.br",
    accessToken,
    timeoutMs: 5,
    fetchImplementation: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  });

  await assert.rejects(() => client.getOrder(order.id), {
    code: "CAKTO_API_TIMEOUT",
    message: "Cakto API request timed out",
  });
});

test("Cakto API timeout remains active while the response body is being read", async () => {
  const client = createCaktoApiClient({
    baseUrl: "https://api.cakto.com.br",
    accessToken,
    timeoutMs: 5,
    fetchImplementation: async (_url, init) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
          );
        }),
    }),
  });

  await assert.rejects(() => client.getOrder(order.id), {
    code: "CAKTO_API_TIMEOUT",
  });
});

test("Cakto API client normalizes network failures without exposing details", async () => {
  const sensitiveDetail = `failed with ${accessToken}`;
  let calls = 0;
  const client = createCaktoApiClient({
    baseUrl: "https://api.cakto.com.br",
    accessToken,
    fetchImplementation: async () => {
      calls += 1;
      throw new Error(sensitiveDetail);
    },
  });

  await assert.rejects(
    () => client.getOrder(order.id),
    (error) => {
      assert.equal(error.code, "CAKTO_API_UNAVAILABLE");
      assert.equal(JSON.stringify(error).includes(accessToken), false);
      assert.equal(error.message.includes(accessToken), false);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("Cakto API client rejects documented HTTP failures once without reading sensitive bodies", async () => {
  for (const status of [400, 401, 403, 404, 409, 429, 500]) {
    let bodyRead = false;
    let calls = 0;
    const sensitiveBody = "synthetic-sensitive-provider-body";
    const response = {
      ok: false,
      status,
      headers: new Headers(),
      arrayBuffer: async () => {
        bodyRead = true;
        return new TextEncoder().encode(sensitiveBody).buffer;
      },
    };
    const client = createCaktoApiClient({
      baseUrl: "https://api.cakto.com.br",
      accessToken,
      fetchImplementation: async () => {
        calls += 1;
        return response;
      },
    });

    await assert.rejects(
      () => client.getOrder(order.id),
      (error) => {
        assert.equal(error.code, "CAKTO_API_HTTP_ERROR");
        assert.equal(error.providerStatus, status);
        assert.equal(error.message.includes(accessToken), false);
        assert.equal(error.message.includes(sensitiveBody), false);
        assert.equal(JSON.stringify(error).includes(accessToken), false);
        assert.equal(JSON.stringify(error).includes(sensitiveBody), false);
        return true;
      },
    );
    assert.equal(calls, 1);
    assert.equal(bodyRead, false);
  }
});

test("Cakto API client rejects invalid JSON with a sanitized error", async () => {
  const client = createCaktoApiClient({
    baseUrl: "https://api.cakto.com.br",
    accessToken,
    fetchImplementation: async () => new Response("not-json", { status: 200 }),
  });
  await assert.rejects(() => client.getOrder(order.id), {
    code: "CAKTO_API_INVALID_JSON",
    message: "Cakto API returned invalid JSON",
  });
});

test("Cakto API client rejects schema-invalid JSON", async () => {
  const client = createCaktoApiClient({
    baseUrl: "https://api.cakto.com.br",
    accessToken,
    fetchImplementation: async () => jsonResponse({ id: "order-synthetic", status: "invented" }),
  });
  await assert.rejects(() => client.getOrder(order.id), {
    code: "CAKTO_API_INVALID_RESPONSE",
  });
});

test("Cakto API client returns validated data and strips unrelated provider PII", async () => {
  const client = createCaktoApiClient({
    baseUrl: "https://api.cakto.com.br",
    accessToken,
    fetchImplementation: async () => jsonResponse({
      ...order,
      customer: { email: "synthetic-user@example.invalid" },
    }),
  });
  const result = await client.getOrder(order.id);
  assert.equal(result.id, order.id);
  assert.equal("customer" in result, false);
});

test("Cakto API client enforces response size from headers and actual bytes", async () => {
  for (const response of [
    new Response("{}", { status: 200, headers: { "content-length": "100" } }),
    new Response("123456789", { status: 200 }),
  ]) {
    const client = createCaktoApiClient({
      baseUrl: "https://api.cakto.com.br",
      accessToken,
      maxResponseBytes: 8,
      fetchImplementation: async () => response,
    });
    await assert.rejects(() => client.getOrder(order.id), {
      code: "CAKTO_API_RESPONSE_TOO_LARGE",
    });
  }
});

test("Cakto API errors contain only sanitized stable fields", () => {
  const error = new CaktoApiError("CAKTO_API_HTTP_ERROR", 503);
  assert.deepEqual(
    { name: error.name, message: error.message, code: error.code, providerStatus: error.providerStatus },
    {
      name: "Error",
      message: "Cakto API returned an unsuccessful response",
      code: "CAKTO_API_HTTP_ERROR",
      providerStatus: 503,
    },
  );
});
