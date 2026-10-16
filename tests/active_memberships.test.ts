import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "../src/production/auth/store";
import type { OidcTokens } from "../src/production/types";

vi.mock("../src/production/config", () => ({ runtimeConfig: {
  apiBaseUrl: "https://api.example.test/api/v1", authContextPath: "/auth/me",
  organizationSelectionHeader: "X-Organization-ID",
} }));
vi.mock("../src/production/auth/oidc", () => ({
  beginAuthorization: vi.fn(), buildLogoutUrl: vi.fn(),
  completeAuthorization: vi.fn(), refreshTokens: vi.fn(),
}));
const key = "freight:selected-organization";
const membership = (id: string, status: unknown) => ({
  organization_id: id, organization_name: id, status, roles: ["CARRIER"],
});
const body = (memberships: unknown[]) => new Response(JSON.stringify({
  user: { id: "test-user" }, memberships,
}));
function authStore() {
  const auth = useAuthStore();
  auth.tokens = { accessToken: "synthetic-test-token", expiresAt: Date.now() + 600_000 } as OidcTokens;
  return auth;
}
beforeEach(() => {
  const values = new Map<string, string>();
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

it.each(["SUSPENDED", "REVOKED", "INVITED", "DISABLED", "UNKNOWN", "", null, undefined])(
  "does not auto-select or offer an inactive membership (%s)", async (status) => {
    const auth = authStore();
    vi.mocked(fetch).mockResolvedValueOnce(body([membership("inactive", status)]));
    await auth.fetchContext();
    expect(auth.memberships).toEqual([]);
    expect(auth.selectedOrganizationId).toBeNull();
    expect(auth.isAuthenticated).toBe(true);
    await expect(auth.selectOrganization("inactive")).rejects.toThrow("not a current membership");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(key)).toBeNull();
  },
);
it.each(["ACTIVE", "active"])("auto-selects the sole explicitly active membership (%s)", async (status) => {
  const auth = authStore();
  const members = [membership("active-org", status), membership("blocked", "SUSPENDED")];
  vi.mocked(fetch).mockImplementation(async () => body(members));
  await auth.fetchContext();
  expect(auth.memberships.map((item) => item.organizationId)).toEqual(["active-org"]);
  expect(auth.selectedOrganizationId).toBe("active-org");
  expect(sessionStorage.getItem(key)).toBe("active-org");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("clears a persisted selection revoked by the server", async () => {
  sessionStorage.setItem(key, "revoked-org");
  const auth = authStore();
  vi.mocked(fetch).mockResolvedValueOnce(body([membership("revoked-org", "REVOKED")]));
  await auth.fetchContext();
  expect(auth.memberships).toEqual([]);
  expect(auth.selectedOrganizationId).toBeNull();
  expect(auth.context?.selectedOrganizationId).toBeNull();
  expect(sessionStorage.getItem(key)).toBeNull();
});
