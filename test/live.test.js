// Live-Prüfung gegen die veröffentlichte Seite (npm run test:live).
// Beantwortet: Ist das, was unter der Domain ausgeliefert wird, genau der Stand aus public/,
// und sind Transport und Zertifikat in Ordnung? Läuft nach jedem Deploy, nächtlich und auf Knopfdruck.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const tls = require("tls");
const { listFiles } = require("./helpers");

const PUBLIC = path.join(__dirname, "..", "public");
// Nach einem Deploy kann der CDN-Cache noch kurz den alten Stand liefern: so lange wird maximal gewartet
const WAIT_MS = Number(process.env.LIVE_WAIT_MS) || 30000;
const MIN_CERT_DAYS = 14;

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

test.describe("Transport", () => {
  test("HTTP leitet dauerhaft auf HTTPS um", async ({ request, baseURL }) => {
    const { host } = new URL(baseURL);
    const res = await request.get(`http://${host}/`, { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()["location"]).toBe(`https://${host}/`);
  });

  test(`Zertifikat ist vertrauenswürdig und noch mindestens ${MIN_CERT_DAYS} Tage gültig`, async ({ baseURL }) => {
    const host = new URL(baseURL).hostname;
    const cert = await new Promise((resolve, reject) => {
      const socket = tls.connect({ host, port: 443, servername: host }, () => {
        const c = socket.getPeerCertificate();
        resolve({ subject: c.subject, validTo: c.valid_to, authorized: socket.authorized, error: socket.authorizationError });
        socket.end();
      });
      socket.on("error", reject);
    });
    expect(cert.authorized, `Zertifikatskette: ${cert.error}`).toBe(true);
    const daysLeft = (new Date(cert.validTo) - Date.now()) / 86400000;
    expect(daysLeft, `Zertifikat läuft ab am ${cert.validTo}`).toBeGreaterThan(MIN_CERT_DAYS);
  });

  test("keine Cookies", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok()).toBe(true);
    expect(res.headers()["set-cookie"]).toBeUndefined();
  });
});

test.describe("Ausgelieferter Stand", () => {
  test("jede Datei aus public/ wird live byte-identisch ausgeliefert", async ({ request }) => {
    const files = listFiles(PUBLIC);
    expect(files.length).toBeGreaterThan(10);
    const local = Object.fromEntries(files.map((f) => [f, sha256(fs.readFileSync(path.join(PUBLIC, f)))]));

    // Liefert die Dateien, die live vom Repo abweichen (leer = alles identisch)
    const differing = async () => {
      const diff = [];
      for (const f of files) {
        const res = await request.get("/" + f, { headers: { "cache-control": "no-cache" } });
        const live = res.status() === 200 ? sha256(await res.body()) : `HTTP ${res.status()}`;
        if (live !== local[f]) diff.push(f);
      }
      return diff;
    };
    await expect
      .poll(differing, { timeout: WAIT_MS, intervals: [5000, 10000], message: "Dateien, die live vom Stand in public/ abweichen" })
      .toEqual([]);
  });
});

test.describe("Spiel live", () => {
  test("lädt ohne Fehler, kein Request verlässt die Origin, Tipp wird angezeigt", async ({ page, context, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const problems = [];
    page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
    page.on("response", (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
    page.on("request", (r) => { if (new URL(r.url()).origin !== origin) problems.push("fremder Request: " + r.url()); });

    await page.goto("/");
    await expect(page.locator("#wordcount")).toContainText("Begriffe");
    await page.click('[data-go="tipp"]');
    await page.fill("#tippInput", "Live");
    await page.keyboard.press("Enter");
    await expect(page.locator("#word")).toHaveText("Live");

    expect(await context.cookies()).toEqual([]);
    expect(problems).toEqual([]);
  });
});
