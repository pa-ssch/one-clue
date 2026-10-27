// Sicherheit und Datenschutz: Was die Datenschutzerklärung verspricht, wird hier gegen das
// tatsächliche Verhalten geprüft. Dazu Robustheit gegen kaputten Speicher und Regeln im Quelltext.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { watchErrors, drawWord, showTipp, listFiles } = require("./helpers");

const PUBLIC = path.join(__dirname, "..", "public");

// Kompletter Spieldurchlauf über alle Ansichten, inklusive Neuladen und Impressum
async function playThrough(page) {
  await page.goto("/index.html");
  await page.click('[data-go="rules"]');
  await page.click('#rules [data-go="home"]');
  await page.click('[data-go="guess"]');
  const first = page.locator("#categories input").first();
  await first.uncheck();
  await first.check();
  await drawWord(page);
  await page.click("#show .corner");
  await page.waitForLoadState("load");
  await showTipp(page, "Kürbis");
  await page.goto("/impressum.html");
  await page.click("a.btn");
  await expect(page.locator("#home.active")).toBeVisible();
}

test.describe("Was die Datenschutzerklärung verspricht", () => {
  test("kein Request verlässt die eigene Origin", async ({ page, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const foreign = [];
    page.on("request", (r) => {
      if (new URL(r.url()).origin !== origin) foreign.push(r.url());
    });
    await playThrough(page);
    expect(foreign).toEqual([]);
  });

  test("keine Cookies", async ({ page, context }) => {
    await playThrough(page);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => document.cookie)).toBe("");
  });

  test("im Browser liegen genau die zwei genannten Local-Storage-Einträge", async ({ page }) => {
    await playThrough(page);
    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage).sort(),
      session: sessionStorage.length,
    }));
    expect(storage.local).toEqual(["oneclue-categories", "oneclue-used"]);
    expect(storage.session).toBe(0);
  });
});

test.describe("Kaputter Speicher stürzt nicht ab", () => {
  const BAD = ["null", "5", "{}", '"text"', "[1,2]", "[null]", "{kaputt", "", "[]", JSON.stringify(Array(5000).fill("x"))];

  for (const key of ["oneclue-used", "oneclue-categories"]) {
    test(`${key}: Raten und Tipp geben funktionieren trotzdem`, async ({ page }) => {
      for (const bad of BAD) {
        const label = `${key}=${bad.slice(0, 30)}`;
        const errors = watchErrors(page);
        await page.goto("/index.html");
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, bad]);
        await page.reload();
        await page.click('[data-go="guess"]');
        const word = await drawWord(page);
        expect(typeof word, label).toBe("string");
        await expect(page.locator("#word"), label).not.toBeEmpty();
        const used = await page.evaluate(() => JSON.parse(localStorage.getItem("oneclue-used")));
        expect(Array.isArray(used) && used.every((w) => typeof w === "string"), `${label}: gespeichert ${JSON.stringify(used).slice(0, 80)}`).toBe(true);
        await page.reload();
        await showTipp(page, "Test");
        await expect(page.locator("#word"), label).toHaveText("Test");
        expect(errors, label).toEqual([]);
        await page.evaluate(() => localStorage.clear());
      }
    });
  }
});

test.describe("Regeln im Quelltext", () => {
  const textFiles = listFiles(PUBLIC).filter((f) => /\.(js|html|css|webmanifest|svg)$/.test(f));
  const read = (f) => fs.readFileSync(path.join(PUBLIC, f), "utf8");

  test("keine gefährlichen DOM-Sinks und keine dynamische Code-Ausführung", () => {
    const forbidden = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|javascript:|srcdoc/;
    for (const f of textFiles.filter((f) => /\.(js|html)$/.test(f))) {
      const line = read(f).split("\n").findIndex((l) => forbidden.test(l));
      expect(line, `${f}:${line + 1}`).toBe(-1);
    }
  });

  test("CSP auf jeder Seite, keine Inline-Skripte, -Event-Handler oder -Styles", () => {
    for (const f of textFiles.filter((f) => f.endsWith(".html"))) {
      const html = read(f);
      expect(html, `${f}: CSP`).toMatch(/http-equiv="Content-Security-Policy"[\s\S]*?default-src 'self'/);
      expect(html.match(/<script\b(?![^>]*\bsrc=)/g), `${f}: Inline-Skript`).toBeNull();
      expect(html.match(/\son[a-z]+\s*=/gi), `${f}: Inline-Event-Handler`).toBeNull();
      expect(html.match(/\sstyle\s*=/gi), `${f}: Inline-Style`).toBeNull();
    }
  });

  test("externe Adressen nur in der Datenschutzerklärung", () => {
    const allowed = [
      ["impressum.html", "https://docs.github.com/"],
      ["icons/icon.svg", "http://www.w3.org/2000/svg"], // XML-Namensraum, löst keinen Request aus
    ];
    for (const f of textFiles) {
      for (const url of read(f).match(/https?:\/\/[^\s"'<>)]+/g) || []) {
        const ok = allowed.some(([file, prefix]) => f === file && url.startsWith(prefix));
        expect(ok, `${f}: ${url}`).toBe(true);
      }
    }
  });
});
