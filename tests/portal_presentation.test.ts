import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { datetimeLocal, minorMoney, money } from "../src/production/utils/presentation";

it("formats settlement hundredths without rescaling tender rates", () => {
  expect(minorMoney(125000, "USD")).toBe(money(1250, "USD"));
  expect(minorMoney("125000", "USD")).toBe(money(1250, "USD"));
  expect(minorMoney(0, "USD")).toBe(money(0, "USD"));
  expect(minorMoney(-125000, "USD")).toBe(money(-1250, "USD"));
  expect(money(125000, "USD")).toBe(
    new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(125000),
  );
});

const helperCode = ts.transpileModule(
  readFileSync(new URL("../src/production/utils/presentation.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText;

describe.each(["UTC", "America/Santo_Domingo", "America/New_York", "Asia/Kathmandu"])("tracking clock in %s", (tz) => {
  it.each(["2026-01-01T01:45:00.000Z", "2026-07-01T23:45:00.000Z"])("round-trips %s at minute precision", (instant) => {
    // Use a separate process: changing TZ inside a test-worker thread is unreliable.
    const script = `${helperCode}\nconst date = new Date(${JSON.stringify(instant)}); console.log(JSON.stringify({wall: datetimeLocal(date), utc: new Date(datetimeLocal(date)).toISOString(), offset: date.getTimezoneOffset()}));`;
    const actual = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: tz }, encoding: "utf8",
    }));
    expect(actual.utc).toBe(instant);
    if (actual.offset !== 0) expect(actual.wall).not.toBe(instant.slice(0, 16));
  });
});

it("rejects invalid dates", () => {
  expect(() => datetimeLocal(new Date("invalid"))).toThrow(RangeError);
});

it("wires both tracking defaults and settlement display to the tested helpers", () => {
  const source = readFileSync(new URL("../src/production/views/CarrierPortalView.vue", import.meta.url), "utf8");
  expect(source.match(/datetimeLocal\(\)/g)).toHaveLength(2);
  expect(source).toContain("minorMoney(item.total_minor, item.currency)");
  expect(source).toContain("money(item.rate, item.currency)");
  expect(source).not.toContain("new Date().toISOString().slice(0, 16)");
});

it("hides old portal actions while switching and remounts the selected organization", () => {
  const source = readFileSync(new URL("../src/production/components/AppShell.vue", import.meta.url), "utf8");
  expect(source).toContain('v-if="switchingOrganization"');
  expect(source).toContain('<RouterView v-else :key="auth.selectedOrganizationId');
  expect(source).toContain('select.value = auth.selectedOrganizationId ?? ""');
  expect(source).toContain('role="alert"');
});
