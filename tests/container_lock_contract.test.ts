import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("installs the container from the committed lock before copying source", () => {
  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  const copyLock = dockerfile.indexOf("COPY package.json package-lock.json ./");
  const install = dockerfile.indexOf("RUN npm ci --ignore-scripts --no-audit --no-fund");
  const source = dockerfile.indexOf("COPY . .");
  expect(copyLock).toBeGreaterThanOrEqual(0);
  expect(install).toBeGreaterThan(copyLock);
  expect(source).toBeGreaterThan(install);
  expect(dockerfile).not.toContain("npm install");
  const ignore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");
  expect(ignore.split("\n")).toContain("**/node_modules");
});
