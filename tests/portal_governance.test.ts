import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

it("uses the existing administration read permission for both navigation and routing", () => {
  const shell = read("src/production/components/AppShell.vue");
  const router = read("src/production/router.ts");
  const navigationPermission = shell.match(/to: "\/portal\/admin"[\s\S]*?permission: "([^"]+)"/)?.[1];
  const routePermission = router.match(/path: "\/portal\/admin"[\s\S]*?requiredPermissions: \["([^"]+)"\]/)?.[1];
  expect(routePermission).toBe("admin.identity.read");
  expect(navigationPermission).toBe(routePermission);
});

it.each(["development", "main", "staging", "production"])("runs portal contracts for exact pushes to %s", (branch) => {
  const workflow = read(".github/workflows/portal-shell-ci.yml");
  const push = workflow.split("\n  push:\n")[1]?.split("\npermissions:")[0];
  expect(push).toBeDefined();
  expect(push).toContain(`- "${branch}"`);
  expect(push).not.toContain("paths:");
  expect(workflow).toContain("contents: read");
  expect(workflow).toContain("run: npm run e2e");
  expect(workflow).toContain("run: npm run test:portal");
  expect(workflow).toContain("vite build --config vite.production.config.ts");
});
