import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "../src/production/auth/store";
import type { OidcTokens } from "../src/production/types";

vi.mock("../src/production/config", () => ({
  runtimeConfig: {
    apiBaseUrl: "https://api.example.test/api/v1",
    authContextPath: "/auth/context",
    organizationSelectionHeader: "X-Organization-ID",
  },
}));
vi.mock("../src/production/auth/oidc", () => ({
  beginAuthorization: vi.fn(), buildLogoutUrl: vi.fn(),
  completeAuthorization: vi.fn(), refreshTokens: vi.fn(),
}));

const key = "freight:selected-organization";
const payload = (ids = ["a", "b", "c"]) => ({
  user: { id: "user", email: "user@example.test" },
  memberships: ids.map((id) => ({
    organization_id: id, organization_name: `Organization ${id}`,
    status: "ACTIVE", roles: ["CARRIER"], permissions: [`${id}.read`],
  })),
});
const response = (value: unknown = payload(), status = 200) =>
  new Response(JSON.stringify(value), { status });
const deferred = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  const values = new Map<string, string>([[key, "a"]]);
  vi.stubGlobal("window", { location: { origin: "https://app.example.test" } });
  vi.stubGlobal("sessionStorage", {
    getItem: vi.fn((name: string) => values.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => { values.set(name, value); }),
    removeItem: vi.fn((name: string) => { values.delete(name); }),
  });
  vi.stubGlobal("fetch", vi.fn());
  setActivePinia(createPinia());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function initialized() {
  const auth = useAuthStore();
  auth.tokens = { accessToken: "test-token", expiresAt: Date.now() + 600_000 } as OidcTokens;
  vi.mocked(fetch).mockResolvedValueOnce(response());
  await auth.fetchContext();
  vi.mocked(fetch).mockClear();
  return auth;
}

function expectSelected(auth: ReturnType<typeof useAuthStore>, id: string) {
  expect(auth.selectedOrganizationId).toBe(id);
  expect(auth.context?.selectedOrganizationId).toBe(id);
  expect(auth.permissions).toEqual([`${id}.read`]);
  expect(sessionStorage.getItem(key)).toBe(id);
}

describe("organization selection transaction", () => {
  it("keeps old selection while loading and commits the validated candidate", async () => {
    const auth = await initialized();
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const change = auth.selectOrganization("b");
    expectSelected(auth, "a");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const options = vi.mocked(fetch).mock.calls[0][1];
    expect(new Headers(options?.headers).get("X-Organization-ID")).toBe("b");
    pending.resolve(response());
    await change;
    expectSelected(auth, "b");
  });

  it.each([403, 500, 503])("does not relabel old data on HTTP %i", async (status) => {
    const auth = await initialized();
    const original = auth.context;
    vi.mocked(fetch).mockResolvedValueOnce(response({}, status));
    await expect(auth.selectOrganization("b")).rejects.toThrow(`HTTP ${status}`);
    expectSelected(auth, "a");
    expect(auth.context).toBe(original);
  });

  it("preserves selection on a network error", async () => {
    const auth = await initialized();
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Network unavailable"));
    await expect(auth.selectOrganization("b")).rejects.toThrow("Network unavailable");
    expectSelected(auth, "a");
  });

  it.each([null, [], "invalid"])('rejects invalid context %j', async (value) => {
    const auth = await initialized();
    vi.mocked(fetch).mockResolvedValueOnce(response(value));
    await expect(auth.selectOrganization("b")).rejects.toThrow("context is invalid");
    expectSelected(auth, "a");
  });

  it("rejects a membership removed by the server", async () => {
    const auth = await initialized();
    vi.mocked(fetch).mockResolvedValueOnce(response(payload(["a"])));
    await expect(auth.selectOrganization("b")).rejects.toThrow("no longer a current membership");
    expectSelected(auth, "a");
  });

  it("leaves state unchanged when session storage rejects the write", async () => {
    const auth = await initialized();
    vi.mocked(fetch).mockResolvedValueOnce(response());
    vi.mocked(sessionStorage.setItem).mockImplementationOnce(() => { throw new Error("Storage unavailable"); });
    await expect(auth.selectOrganization("b")).rejects.toThrow("Storage unavailable");
    expectSelected(auth, "a");
  });

  it("does not let an older response overwrite the most recent selection", async () => {
    const auth = await initialized();
    const first = deferred();
    const second = deferred();
    vi.mocked(fetch).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const older = auth.selectOrganization("b");
    const rejected = expect(older).rejects.toThrow("superseded");
    const newer = auth.selectOrganization("c");
    second.resolve(response());
    await newer;
    first.resolve(response());
    await rejected;
    expectSelected(auth, "c");
  });

  it("invalidates a context refresh overtaken by an organization switch", async () => {
    const auth = await initialized();
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response());
    const older = auth.fetchContext();
    const rejected = expect(older).rejects.toThrow("superseded");
    await auth.selectOrganization("b");
    pending.resolve(response());
    await rejected;
    expectSelected(auth, "b");
  });

  it("does not restore context from a response arriving after logout", async () => {
    const auth = await initialized();
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const change = auth.selectOrganization("b");
    const rejected = expect(change).rejects.toThrow("superseded");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    auth.clearSession();
    pending.resolve(response());
    await rejected;
    expect(auth.context).toBeNull();
    expect(auth.selectedOrganizationId).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("auto-selects a sole membership only after its own context request", async () => {
    sessionStorage.removeItem(key);
    const auth = useAuthStore();
    auth.tokens = { accessToken: "test-token", expiresAt: Date.now() + 600_000 } as OidcTokens;
    vi.mocked(fetch).mockResolvedValueOnce(response(payload(["a"]))).mockResolvedValueOnce(response(payload(["a"])));
    await auth.fetchContext();
    expect(fetch).toHaveBeenCalledTimes(2);
    expectSelected(auth, "a");
  });
});
