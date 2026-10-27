// Playwright-Konfiguration für die Live-Prüfung gegen die veröffentlichte Seite.
// Aufruf: npm run test:live   (andere Adresse: LIVE_URL=https://... npm run test:live)
// Läuft bewusst nicht mit `npm test`, weil sie Internet und den veröffentlichten Stand braucht.
const { defineConfig, devices } = require("@playwright/test");

// Wartezeit auf den neuen Stand nach einem Deploy (siehe test/live.test.js); der Test
// darf nicht vorher an seinem eigenen Timeout scheitern.
const WAIT_MS = Number(process.env.LIVE_WAIT_MS) || 30000;

module.exports = defineConfig({
  testDir: "./test",
  testMatch: /live\.test\.js$/,
  fullyParallel: false,
  timeout: WAIT_MS + 60000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.LIVE_URL || "https://1clue.9xb.de",
    trace: "on-first-retry",
  },
  projects: [{ name: "live", use: { ...devices["Desktop Chrome"] } }],
});
