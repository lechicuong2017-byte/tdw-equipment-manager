import { defineConfig, devices, type PlaywrightTestProject } from "@playwright/test";
import path from "node:path";

const baseURL = String(
  process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
).replace(/\/$/, "");
const browserChannel = process.env.E2E_BROWSER_CHANNEL || "chrome";
const roles = ["admin", "manager", "user", "viewer"] as const;

const authenticatedProjects: PlaywrightTestProject[] = roles.flatMap((role) => {
  const storageState = process.env[`E2E_${role.toUpperCase()}_STORAGE_STATE`];
  if (!storageState) return [];

  return [{
    name: role,
    testMatch: /authenticated\.spec\.ts/,
    use: {
      ...devices["Desktop Chrome"],
      channel: browserChannel,
      storageState: path.resolve(storageState),
    },
  }];
});

export default defineConfig({
  testDir: "./e2e",
  outputDir: ".playwright/test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["line"], ["html", { outputFolder: ".playwright/report", open: "never" }]],
  use: {
    baseURL,
    channel: browserChannel,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: baseURL.startsWith("http://127.0.0.1")
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: "anonymous",
      testMatch: /anonymous\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        channel: browserChannel,
        storageState: { cookies: [], origins: [] },
      },
    },
    ...authenticatedProjects,
  ],
});
