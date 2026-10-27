// Hinweis "App zum Home-Bildschirm hinzufügen": Android mit echtem Install-Event,
// iOS nur mit Anleitung, nie in der installierten App, nie mehr nach "Nein, danke".
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { watchErrors } = require("./helpers");

const KEY = "oneclue-install-dismissed";
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

// Chrome/Android simulieren: das Event feuern, das der Browser bei installierbaren
// Apps schickt. prompt() zählt die Aufrufe, statt wirklich einen Dialog zu öffnen.
async function fireInstallEvent(page) {
  return page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    window.__prompted = 0;
    e.prompt = () => {
      window.__prompted++;
      return Promise.resolve();
    };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
}

// Installierte App simulieren: display-mode: standalone (Chrome) bzw. navigator.standalone (Safari)
async function pretendStandalone(page) {
  await page.addInitScript(() => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      q === "(display-mode: standalone)" ? { matches: true, media: q, addEventListener() {} } : orig(q);
    Object.defineProperty(navigator, "standalone", { get: () => true });
  });
}

test.describe("Android / Chrome: echtes Install-Event", () => {
  test("ohne Event kein Hinweis, mit Event Hinweis samt Button, Chromes eigener Hinweis unterdrückt", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "iOS-Variante wird unten geprüft");
    const errors = watchErrors(page);
    await page.goto("/index.html");
    await expect(page.locator("#install")).toBeHidden();
    expect(await fireInstallEvent(page)).toBe(true); // preventDefault aufgerufen
    await expect(page.locator("#install")).toBeVisible();
    await expect(page.locator("#installPrompt")).toBeVisible();
    await expect(page.locator("#installIos")).toBeHidden();
    await expect(page.locator("#installBtn")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Button öffnet den Install-Dialog genau einmal und blendet den Hinweis aus", async ({ page }) => {
    await page.goto("/index.html");
    await fireInstallEvent(page);
    await page.click("#installBtn");
    await expect(page.locator("#install")).toBeHidden();
    expect(await page.evaluate(() => window.__prompted)).toBe(1);
    // Nochmal klicken darf nichts mehr auslösen, das Event ist verbraucht
    await page.evaluate(() => document.getElementById("installBtn").click());
    expect(await page.evaluate(() => window.__prompted)).toBe(1);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  });

  test("nach der Installation (appinstalled) verschwindet der Hinweis", async ({ page }) => {
    await page.goto("/index.html");
    await fireInstallEvent(page);
    await expect(page.locator("#install")).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(page.locator("#install")).toBeHidden();
  });

  test("in der installierten App kommt trotz Event kein Hinweis", async ({ page }) => {
    await pretendStandalone(page);
    await page.goto("/index.html");
    await fireInstallEvent(page);
    await expect(page.locator("#install")).toBeHidden();
  });

  test("Hinweis mit Button: keine axe-Verstöße", async ({ page }) => {
    await page.route("**/index.html", async (route) => {
      const res = await route.fetch();
      const html = (await res.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/s, "");
      await route.fulfill({ response: res, body: html, headers: { ...res.headers(), "content-type": "text/html; charset=utf-8" } });
    });
    await page.goto("/index.html");
    await fireInstallEvent(page);
    await expect(page.locator("#install")).toBeVisible();
    await page.addScriptTag({ content: axeSource });
    const result = await page.evaluate(() =>
      axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] } }),
    );
    expect(result.violations.map((v) => `${v.impact}: ${v.id}`)).toEqual([]);
  });
});

test.describe("iOS / Safari: nur Anleitung", () => {
  test("auf dem iPhone erscheint die Anleitung ohne Install-Button", async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== "webkit" || !isMobile, "nur Handy-Safari");
    const errors = watchErrors(page);
    await page.goto("/index.html");
    await expect(page.locator("#install")).toBeVisible();
    await expect(page.locator("#installIos")).toBeVisible();
    await expect(page.locator("#installIos")).toContainText("Zum Home-Bildschirm");
    await expect(page.locator("#installPrompt")).toBeHidden();
    await expect(page.locator("#installBtn")).toBeHidden();
    await expect(page.locator("#installDismiss")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("in der installierten App (navigator.standalone) kommt keine Anleitung", async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== "webkit" || !isMobile, "nur Handy-Safari");
    await pretendStandalone(page);
    await page.goto("/index.html");
    await expect(page.locator("#install")).toBeHidden();
  });

  test("Anleitung nur auf iOS: am Desktop nicht", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop-Projekt");
    await page.goto("/index.html");
    await expect(page.locator("#install")).toBeHidden();
  });
});

test.describe("Nein, danke", () => {
  test("blendet aus, merkt sich das und zeigt auch nach Neuladen und neuem Event nichts mehr", async ({ page }) => {
    await page.goto("/index.html");
    await fireInstallEvent(page);
    await expect(page.locator("#install")).toBeVisible();
    await page.click("#installDismiss");
    await expect(page.locator("#install")).toBeHidden();
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("1");
    await page.reload();
    await expect(page.locator("#install")).toBeHidden(); // auch die iOS-Anleitung bleibt weg
    await fireInstallEvent(page);
    await expect(page.locator("#install")).toBeHidden();
  });

  test("kaputter Merker verhindert den Hinweis nicht und stürzt nicht ab", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/index.html");
    await page.evaluate((k) => localStorage.setItem(k, "{kaputt"), KEY);
    await page.reload();
    await fireInstallEvent(page);
    await expect(page.locator("#install")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("Platz auf der Startseite", () => {
  test("mit Hinweis liegen alle Buttons der Startseite im sichtbaren Bereich", async ({ page }) => {
    await page.goto("/index.html");
    await fireInstallEvent(page);
    await expect(page.locator("#install")).toBeVisible();
    const ok = await page.evaluate(() =>
      [...document.querySelectorAll("#home .btn, #home a")].every((b) => {
        const r = b.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      }),
    );
    expect(ok).toBe(true);
  });

  test("Hinweis gehört zur Startseite und verschwindet mit ihr", async ({ page }) => {
    await page.goto("/index.html");
    await fireInstallEvent(page);
    await page.click('[data-go="tipp"]');
    await expect(page.locator("#install")).toBeHidden();
    await page.click('#tipp [data-go="home"]');
    await expect(page.locator("#install")).toBeVisible();
  });

  test("im flachen Querformat wird der Hinweis ausgeblendet", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/index.html");
    await fireInstallEvent(page);
    await expect(page.locator("#install")).toBeHidden();
    await page.setViewportSize({ width: 390, height: 664 });
    await expect(page.locator("#install")).toBeVisible();
  });
});
