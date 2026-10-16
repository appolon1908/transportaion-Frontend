import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../src/production/api/client";

const auth = vi.hoisted(() => ({
  accessToken: vi.fn<() => Promise<string>>(),
  refresh: vi.fn<() => Promise<string>>(), selectedOrganizationId: "test-organization",
}));
vi.mock("../src/production/auth/store", () => ({ useAuthStore: () => auth }));
vi.mock("../src/production/config", () => ({ runtimeConfig: {
  apiBaseUrl: "https://api.example.test/api/v1", requestTimeoutMs: 30_000,
  organizationSelectionHeader: "X-Organization-ID",
} }));
const deferred = () => {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => { resolve = done; });
  return { promise, resolve };
};
const ok = () => new Response('{"accepted":true}', { headers: { "content-type": "application/json" } });
beforeEach(() => {
  auth.accessToken.mockReset().mockResolvedValue("synthetic-token");
  auth.refresh.mockReset().mockResolvedValue("synthetic-refreshed-token");
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("window", { setTimeout, clearTimeout, location: { origin: "https://app.example.test" } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["GET", "POST", "PUT", "PATCH", "DELETE"] as const)("never dispatches an already canceled %s", async (method) => {
  const controller = new AbortController();
  const reason = new DOMException("Canceled by caller", "AbortError");
  controller.abort(reason);
  await expect(apiRequest("/test", { method, signal: controller.signal })).rejects.toBe(reason);
  expect(auth.accessToken).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("does not send a mutation canceled during token acquisition", async () => {
  const controller = new AbortController();
  const pending = deferred();
  auth.accessToken.mockReturnValueOnce(pending.promise);
  const request = apiRequest("/test", { method: "POST", body: { test: true }, signal: controller.signal });
  controller.abort("canceled-during-refresh");
  const rejected = expect(request).rejects.toBe("canceled-during-refresh");
  pending.resolve("synthetic-token");
  await rejected;
  expect(fetch).not.toHaveBeenCalled();
});
it("does not resend a 401 mutation canceled during its refresh", async () => {
  const controller = new AbortController();
  const pending = deferred();
  auth.refresh.mockReturnValueOnce(pending.promise);
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
  const request = apiRequest("/test", { method: "POST", signal: controller.signal });
  await vi.waitFor(() => expect(auth.refresh).toHaveBeenCalledOnce());
  controller.abort("canceled-before-retry");
  const rejected = expect(request).rejects.toBe("canceled-before-retry");
  pending.resolve("synthetic-refreshed-token");
  await rejected;
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("forwards cancellation after dispatch and removes its listener", async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  vi.mocked(fetch).mockImplementation((_input, options) => new Promise((_resolve, reject) => {
    const signal = options?.signal;
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  const request = apiRequest("/test", { method: "POST", signal: controller.signal });
  const rejected = expect(request).rejects.toBe("canceled-in-flight");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  controller.abort("canceled-in-flight");
  await rejected;
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});
it("keeps the idempotency key and optimistic version on a non-canceled retry", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(ok());
  const result = await apiRequest<{ accepted: boolean }>("/test", {
    method: "POST", body: { test: true }, idempotencyKey: "test-replay-key", ifMatch: 7,
  });
  expect(result.data.accepted).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [, options] of vi.mocked(fetch).mock.calls) {
    const headers = new Headers(options?.headers);
    expect(headers.get("Idempotency-Key")).toBe("test-replay-key");
    expect(headers.get("If-Match")).toBe("7");
    expect(headers.get("X-Organization-ID")).toBe("test-organization");
    expect(options?.credentials).toBe("omit");
  }
});
