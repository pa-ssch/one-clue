// Playwright-Konfiguration für die Browser-Tests.
// Die App selbst braucht kein Node – das hier ist nur Test-Werkzeug.
const { defineConfig, devices } = require("@playwright/test");

const PORT = 8765;

module.exports = defineConfig({
  testDir: "./test",
  testIgnore: /live\.test\.js$/, // Live-Prüfung läuft separat: npm run test:live
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    // Service Worker nur im Offline-Test aktiv, sonst würde er Requests aus dem Cache beantworten
    serviceWorkers: "block",
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
  // Startet den statischen Server für die Tests automatisch
  webServer: {
    command: `npx http-server public -p ${PORT} -c-1 -s`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
