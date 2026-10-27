// Gemeinsame Hilfsfunktionen für die Tests
const fs = require("fs");
const path = require("path");

// Kategorien direkt aus categories.js laden (gleiche Quelle wie die Seite)
const src = fs.readFileSync(path.join(__dirname, "..", "public", "categories.js"), "utf8");
const { CATEGORIES, DEFAULT_OFF } = new Function(
  src + ";return { CATEGORIES: CATEGORIES, DEFAULT_OFF: DEFAULT_OFF };",
)();

// Sammelt Konsolenfehler und fehlgeschlagene Requests einer Seite
function watchErrors(page) {
  const errors = [];
  page.on("console", (m) => {
    // Playwright blockiert den Service Worker in den Tests absichtlich (siehe Config)
    if (/Service Worker registration blocked by Playwright/.test(m.text())) return;
    if (m.type() === "error" || m.type() === "warning")
      errors.push(`${m.type()}: ${m.text()} @ ${m.location().url}`);
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}

// Liegt das Element vollständig im sichtbaren Bereich?
async function fits(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    return {
      ok: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      rect: [r.left, r.top, r.right, r.bottom].map(Math.round),
      viewport: [innerWidth, innerHeight],
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      lines: el.innerText.split("\n").length,
    };
  }, selector);
}

// Countdown mit beschleunigter Uhr durchlaufen und den gezeigten Begriff zurückgeben
async function drawWord(page) {
  await page.clock.install();
  await page.click("#startBtn");
  await page.clock.runFor(3000);
  await page.locator("#show.active").waitFor();
  return (await page.evaluate(() => JSON.parse(localStorage.getItem("oneclue-used")))).at(-1);
}

async function showTipp(page, text) {
  await page.click('[data-go="tipp"]');
  await page.fill("#tippInput", text);
  await page.keyboard.press("Enter");
  await page.locator("#show.active").waitFor();
}

// Alle Dateien unter dir, rekursiv, relativ mit "/" als Trenner; Punkt-Dateien (.DS_Store) ausgenommen
function listFiles(dir, prefix = "") {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith("."))
    .flatMap((e) =>
      e.isDirectory() ? listFiles(path.join(dir, e.name), prefix + e.name + "/") : [prefix + e.name],
    );
}

module.exports = { CATEGORIES, DEFAULT_OFF, watchErrors, fits, drawWord, showTipp, listFiles };
