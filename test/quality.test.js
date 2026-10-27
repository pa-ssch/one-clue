// Barrierefreiheit, Best Practices, Impressum, Offline-Betrieb
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { showTipp } = require("./helpers");

const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

async function axeViolations(page) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(() =>
    axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] },
    }),
  );
  return result.violations.map((v) => `${v.impact}: ${v.id} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
}

test.describe("Barrierefreiheit (axe-core)", () => {
  // Die CSP erlaubt keine Inline-Skripte, deshalb axe über eine Route einschleusen
  test.beforeEach(async ({ page }) => {
    await page.route("**/index.html", async (route) => {
      const res = await route.fetch();
      const html = (await res.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/s, "");
      await route.fulfill({ response: res, body: html, headers: { ...res.headers(), "content-type": "text/html; charset=utf-8" } });
    });
    await page.goto("/index.html");
  });

  for (const [name, open] of [
    ["Startseite", async () => {}],
    ["Anleitung", (p) => p.click('[data-go="rules"]')],
    ["Raten", (p) => p.click('[data-go="guess"]')],
    ["Tipp geben", (p) => p.click('[data-go="tipp"]')],
    ["Begriffsanzeige", (p) => showTipp(p, "Kürbis")],
  ]) {
    test(`${name}: keine Verstöße`, async ({ page }) => {
      await open(page);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});

test.describe("Best Practices im Markup", () => {
  test("Viewport erlaubt Zoom, Description und Landmark vorhanden, CSP gesetzt", async ({ page }) => {
    await page.goto("/index.html");
    const viewport = await page.getAttribute('meta[name="viewport"]', "content");
    expect(viewport).not.toMatch(/user-scalable=no|maximum-scale/);
    expect((await page.getAttribute('meta[name="description"]', "content")).length).toBeGreaterThan(50);
    await expect(page.locator("main")).toHaveCount(1);
    expect(await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', "content")).toContain("default-src 'self'");
  });

  test("Web-App-Manifest und Icons sind erreichbar", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const m = await manifest.json();
    expect(m.name).toBe("One Clue");
    expect(m.display).toBe("standalone");
    for (const file of [...m.icons.map((i) => i.src), "icons/apple-touch-icon.png", "sw.js"]) {
      expect((await request.get("/" + file)).ok(), file).toBe(true);
    }
  });

  test("Shake-Animation respektiert reduzierte Bewegung", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/index.html");
    await page.click('[data-go="guess"]');
    const anim = await page.$eval(".cat", (el) => {
      el.classList.add("shake");
      return getComputedStyle(el).animationName;
    });
    expect(anim).toBe("none");
  });
});

test.describe("Impressum und Datenschutz", () => {
  test("ist von der Startseite verlinkt und enthält die Pflichtangaben", async ({ page }) => {
    await page.goto("/index.html");
    await page.click('a[href="impressum.html"]');
    await expect(page).toHaveTitle(/Impressum/);
    const text = await page.locator("main").innerText();
    await expect(page.locator('a[href="mailto:1clue@9xb.de"]')).toBeVisible();
    for (const s of ["9xb", "Silas Schnurr", "Theodor-Heuss-Straße 14", "77815 Bühl", "nicht kommerzielles Angebot", "Haftungsausschluss", "Datenschutzerklärung", "GitHub Pages", "Local Storage"]) {
      expect(text, s).toContain(s);
    }
    await page.click("a.btn");
    await expect(page.locator("#home.active")).toBeVisible();
  });

  test("enthält keine offenen Platzhalter mehr", async ({ page }) => {
    await page.goto("/impressum.html");
    await expect(page.locator(".todo"), "Platzhalter im Impressum ausfüllen (z. B. E-Mail-Adresse)").toHaveCount(0);
  });

  test("Impressum: keine axe-Verstöße", async ({ page }) => {
    await page.route("**/impressum.html", async (route) => {
      const res = await route.fetch();
      const html = (await res.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/s, "");
      await route.fulfill({ response: res, body: html });
    });
    await page.goto("/impressum.html");
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe("Offline-Betrieb", () => {
  test.use({ serviceWorkers: "allow" });

  test("Seite läuft nach dem ersten Besuch ohne Netz weiter", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Service-Worker-Steuerung in Playwright nur in Chromium zuverlässig");
    await page.goto("/index.html");
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Warten, bis der Precache gefüllt ist
    await expect
      .poll(() => page.evaluate(() => caches.keys().then((k) => k.length)), { timeout: 10000 })
      .toBeGreaterThan(0);
    await expect
      .poll(() => page.evaluate(async () => (await caches.open((await caches.keys())[0])).keys().then((k) => k.length)), { timeout: 10000 })
      .toBeGreaterThanOrEqual(10);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("#home.active")).toBeVisible();
    await expect(page.locator("#wordcount")).toContainText("Begriffe");
    await showTipp(page, "Offline");
    await expect(page.locator("#word")).toHaveText("Offline");
    await page.goto("/impressum.html");
    await expect(page).toHaveTitle(/Impressum/);
  });
});

test.describe("Interne Verweise", () => {
  test("jeder Link, jede Ressource, jedes Icon und die Service-Worker-Liste sind erreichbar", async ({ page, request }) => {
    const refs = new Set();

    // href/src aus beiden HTML-Seiten
    for (const html of ["index.html", "impressum.html"]) {
      await page.goto("/" + html);
      const found = await page.$$eval("[href], [src]", (els) =>
        els.map((e) => e.getAttribute("href") || e.getAttribute("src")),
      );
      for (const r of found) refs.add(r);
    }

    // Icons aus dem Manifest
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    for (const i of manifest.icons) refs.add(i.src);
    refs.add(manifest.start_url);

    // Precache-Liste des Service Workers
    const sw = await (await request.get("/sw.js")).text();
    const files = sw.match(/var FILES = \[([\s\S]*?)\];/)[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
    for (const f of files) refs.add(f);

    const internal = [...refs].filter((r) => !/^(https?:|mailto:|data:|#)/.test(r));
    expect(internal.length).toBeGreaterThan(10);
    const broken = [];
    for (const r of internal) {
      const res = await request.get("/" + r.replace(/^\.?\//, ""));
      if (!res.ok()) broken.push(`${r} → ${res.status()}`);
    }
    expect(broken, "nicht erreichbare Verweise").toEqual([]);
  });
});
