const { test, expect } = require("@playwright/test");
const { CATEGORIES, DEFAULT_ON, watchErrors, fits, drawWord, showTipp } = require("./helpers");

const ALL = Object.keys(CATEGORIES);
const poolOf = (cats) => new Set(cats.flatMap((c) => CATEGORIES[c])).size;
const UNIQUE = new Set(ALL.flatMap((c) => CATEGORIES[c])).size;

test.describe("Laden und Startseite", () => {
  test("lädt ohne Fehler und 404s", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/index.html");
    await page.waitForTimeout(200);
    expect(errors).toEqual([]);
    await expect(page).toHaveTitle("One Clue");
    await expect(page.locator("#home.active")).toBeVisible();
  });

  test("Begriffszähler zeigt eindeutige Begriffe und Kategorien", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#wordcount")).toHaveText(
      `${UNIQUE} Begriffe in ${ALL.length} Kategorien`,
    );
  });

  test("alle Buttons liegen im sichtbaren Bereich", async ({ page }) => {
    await page.goto("/index.html");
    const ok = await page.evaluate(() =>
      [...document.querySelectorAll("#home .btn")].every((b) => {
        const r = b.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      }),
    );
    expect(ok).toBe(true);
  });

  test("Tastatur: fokussierter Button reagiert auf Enter", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.locator("#wordcount")).toContainText("Begriffe"); // app.js ist initialisiert
    // Safari springt mit Tab standardmäßig nicht auf Buttons (nur mit Option+Tab),
    // deshalb den Fokus direkt setzen und nur die Tastatur-Aktivierung prüfen.
    await page.focus('[data-go="guess"]');
    await page.keyboard.press("Enter");
    await expect(page.locator("#guess.active")).toBeVisible();
  });
});

test.describe("Anleitung", () => {
  test("ist scrollbar, hat keinen Eck-Button und führt per Button zurück", async ({ page }) => {
    await page.goto("/index.html");
    await page.click('[data-go="rules"]');
    await expect(page.locator("#rules.active")).toBeVisible();
    await expect(page.locator("#rules .corner")).toHaveCount(0);
    expect(await page.$eval("#rules", (s) => getComputedStyle(s).overflowY)).toBe("auto");
    await page.click('#rules .btn[data-go="home"]');
    await expect(page.locator("#home.active")).toBeVisible();
  });
});

test.describe("Kategorien", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.click('[data-go="guess"]');
  });

  test("werden aus categories.js erzeugt, Reihenfolge erhalten, nur Standard vorausgewählt", async ({ page }) => {
    const labels = page.locator("#categories label");
    await expect(labels).toHaveCount(ALL.length);
    expect(await labels.allTextContents()).toEqual(ALL.map((n) => " " + n));
    expect(DEFAULT_ON).toEqual(["Standard"]);
    for (const n of ALL) {
      const box = page.locator(`#categories input[value="${n}"]`);
      if (DEFAULT_ON.includes(n)) await expect(box).toBeChecked();
      else await expect(box).not.toBeChecked();
    }
  });

  test("Auswahl wird gespeichert, letzte Kategorie bleibt aktiv", async ({ page }) => {
    const [keep, other] = ALL;
    await page.check(`#categories input[value="${other}"]`);
    expect(await page.evaluate(() => localStorage.getItem("oneclue-categories"))).toBe(
      JSON.stringify([keep, other]),
    );
    await page.uncheck(`#categories input[value="${other}"]`);
    expect(await page.evaluate(() => localStorage.getItem("oneclue-categories"))).toBe(
      JSON.stringify([keep]),
    );
    await page.click(`#categories input[value="${keep}"]`);
    await expect(page.locator(`#categories input[value="${keep}"]`)).toBeChecked();
    await expect(page.locator(`#categories input[value="${keep}"]`).locator("..")).toHaveClass(/shake/);
  });

  test("Auswahl überlebt Neuladen, unbekannte Namen werden ignoriert", async ({ page }) => {
    await page.evaluate((c) => localStorage.setItem("oneclue-categories", JSON.stringify([c, "GibtEsNicht"])), ALL[1]);
    await page.reload();
    await page.click('[data-go="guess"]');
    const checked = await page.$$eval("#categories input", (bs) => bs.filter((b) => b.checked).map((b) => b.value));
    expect(checked).toEqual([ALL[1]]);
  });

  test("nur ungültige oder kaputte Daten im Speicher: Standardauswahl, kein Fehler", async ({ page }) => {
    for (const bad of [JSON.stringify(["GibtEsNicht"]), "{kaputt", "[]"]) {
      const errors = watchErrors(page);
      await page.evaluate((v) => localStorage.setItem("oneclue-categories", v), bad);
      await page.reload();
      await page.click('[data-go="guess"]');
      const checked = await page.$$eval("#categories input", (bs) => bs.filter((b) => b.checked).map((b) => b.value));
      expect(checked, `Speicherinhalt ${bad}`).toEqual(DEFAULT_ON);
      expect(errors).toEqual([]);
    }
  });

  test("Begriffszähler folgt der Auswahl und den gezeigten Begriffen", async ({ page }) => {
    const count = page.locator("#poolcount");
    await expect(count).toHaveText(`${poolOf(DEFAULT_ON)} Begriffe`);
    const extra = ALL.find((c) => !DEFAULT_ON.includes(c));
    await page.check(`#categories input[value="${extra}"]`);
    await expect(count).toHaveText(`${poolOf([...DEFAULT_ON, extra])} Begriffe`);
    // Eine Kategorie allein, davon drei Begriffe schon gezeigt und einer aus einer anderen Kategorie
    const small = ALL[ALL.length - 1];
    const shown = CATEGORIES[small].slice(0, 3);
    const foreign = CATEGORIES[ALL[0]].find((w) => !CATEGORIES[small].includes(w));
    await page.evaluate(
      ([c, used]) => {
        localStorage.setItem("oneclue-categories", JSON.stringify([c]));
        localStorage.setItem("oneclue-used", JSON.stringify(used));
      },
      [small, [...shown, foreign]],
    );
    await page.reload();
    await page.click('[data-go="guess"]');
    const n = CATEGORIES[small].length;
    await expect(count).toHaveText(`${n} Begriffe, davon ${n - 3} noch nicht gezeigt`);
    // Alle gezeigt
    await page.evaluate((used) => localStorage.setItem("oneclue-used", JSON.stringify(used)), CATEGORIES[small]);
    await page.reload();
    await page.click('[data-go="guess"]');
    await expect(count).toHaveText(`${n} Begriffe, alle schon gezeigt`);
  });

  test("Chips und Start-Button sind ausreichend große Touch-Ziele", async ({ page }) => {
    const sizes = await page.$$eval("#categories .cat, #startBtn", (els) =>
      els.map((e) => e.getBoundingClientRect().height),
    );
    for (const h of sizes) expect(h).toBeGreaterThanOrEqual(44); // Apple/Google-Empfehlung
  });
});

test.describe("Raten", () => {
  const CAT = ALL[ALL.length - 1]; // kleinste Kategorie am Ende der Liste

  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.evaluate((c) => localStorage.setItem("oneclue-categories", JSON.stringify([c])), CAT);
    await page.reload();
    await page.click('[data-go="guess"]');
  });

  test("Countdown zählt 3-2-1 und zeigt dann einen Begriff aus der Auswahl", async ({ page }) => {
    await page.clock.install();
    await page.click("#startBtn");
    await expect(page.locator("#countdown.active")).toBeVisible();
    await expect(page.locator("#countNum")).toHaveText("3");
    await page.clock.runFor(1000);
    await expect(page.locator("#countNum")).toHaveText("2");
    await page.clock.runFor(1000);
    await expect(page.locator("#countNum")).toHaveText("1");
    await page.clock.runFor(1000);
    await expect(page.locator("#show.active")).toBeVisible();
    const shown = (await page.locator("#word").innerText()).replace(/-?\n/g, " ").replace(/ +/g, " ");
    expect(CATEGORIES[CAT]).toContain(shown);
    const used = await page.evaluate(() => JSON.parse(localStorage.getItem("oneclue-used")));
    expect(used).toEqual([shown]);
  });

  test("Begriff passt auf den Bildschirm und ist groß genug", async ({ page }) => {
    await drawWord(page);
    const f = await fits(page, "#word");
    expect(f.ok, JSON.stringify(f)).toBe(true);
    expect(f.fontSize).toBeGreaterThanOrEqual(28);
  });

  test("keine Wiederholung, bis alle Begriffe der Auswahl durch sind", async ({ page }) => {
    const n = CATEGORIES[CAT].length;
    const drawn = [];
    for (let i = 0; i < n; i++) {
      drawn.push(await drawWord(page));
      await page.reload();
      await page.click('[data-go="guess"]');
    }
    expect([...drawn].sort()).toEqual([...CATEGORIES[CAT]].sort());
    // Pool leer: Neustart, alte Einträge der Auswahl werden verworfen
    const next = await drawWord(page);
    expect(CATEGORIES[CAT]).toContain(next);
    const used = await page.evaluate(() => JSON.parse(localStorage.getItem("oneclue-used")));
    expect(used).toEqual([next]);
  });

  test("Eck-Button auf der Begriffsanzeige lädt neu und zeigt die Startseite", async ({ page }) => {
    await drawWord(page);
    await page.click("#show .corner");
    await page.waitForLoadState("load");
    await expect(page.locator("#home.active")).toBeVisible();
  });
});

test.describe("Tipp geben", () => {
  test.beforeEach(async ({ page }) => page.goto("/index.html"));

  test("Eingabefeld bekommt den Fokus", async ({ page }) => {
    await page.click('[data-go="tipp"]');
    await expect(page.locator("#tippInput")).toBeFocused();
  });

  test("leere Eingaben werden ignoriert", async ({ page }) => {
    await page.click('[data-go="tipp"]');
    for (const v of ["", "   "]) {
      await page.fill("#tippInput", v);
      await page.keyboard.press("Enter");
      await expect(page.locator("#tipp.active")).toBeVisible();
    }
  });

  test("Tipp wird getrimmt groß angezeigt", async ({ page }) => {
    await showTipp(page, "  Kürbis  ");
    await expect(page.locator("#word")).toHaveText("Kürbis");
    expect((await fits(page, "#word")).ok).toBe(true);
  });

  for (const t of [
    "A",
    "Süßes oder Saures",
    "Feuerzangenbowle",
    "One-Night-Stand",
    "Donaudampfschifffahrtsgesellschaft",
    "Ein ziemlich langer Tipp mit vielen Wör",
  ]) {
    test(`"${t}" passt auf den Bildschirm`, async ({ page }) => {
      await showTipp(page, t);
      const f = await fits(page, "#word");
      expect(f.ok, JSON.stringify(f)).toBe(true);
      expect(f.fontSize).toBeGreaterThanOrEqual(16);
      const shown = (await page.locator("#word").innerText()).replace(/-\n/g, "").replace(/\n/g, " ");
      expect(shown).toBe(t);
    });
  }

  test("Eingabe ist auf 40 Zeichen begrenzt", async ({ page }) => {
    await expect(page.locator("#tippInput")).toHaveAttribute("maxlength", "40");
  });
});

test.describe("Querformat und Drehung", () => {
  // Nur den Viewport drehen, Browser-Engine kommt aus dem jeweiligen Projekt
  test.use({ viewport: { width: 844, height: 390 } });

  test("Startseite und Begriff passen, Drehung passt nach", async ({ page }) => {
    await page.goto("/index.html");
    const ok = await page.evaluate(() =>
      [...document.querySelectorAll("#home .btn")].every((b) => b.getBoundingClientRect().bottom <= innerHeight),
    );
    expect(ok).toBe(true);
    await showTipp(page, "Weihnachtsmarkt");
    expect((await fits(page, "#word")).ok).toBe(true);
    await page.setViewportSize({ width: 390, height: 664 });
    await page.waitForTimeout(300);
    expect((await fits(page, "#word")).ok).toBe(true);
  });
});

test.describe("Robustheit", () => {
  test("fehlende categories.js ergibt eine verständliche Meldung", async ({ page }) => {
    await page.route("**/categories.js", (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto("/index.html");
    await expect(page.locator("body")).toContainText("categories.js konnte nicht geladen werden");
  });

  test("Datenqualität: keine leeren oder doppelten Einträge je Kategorie", async () => {
    for (const [cat, words] of Object.entries(CATEGORIES)) {
      expect(Array.isArray(words), cat).toBe(true);
      expect(words.length, cat).toBeGreaterThan(0);
      for (const w of words) {
        expect(typeof w, `${cat}: ${w}`).toBe("string");
        expect(w.trim(), `${cat}: "${w}"`).toBe(w);
        expect(w.length, `${cat}: leerer Eintrag`).toBeGreaterThan(0);
      }
      expect(new Set(words).size, `${cat}: Duplikate`).toBe(words.length);
    }
  });
});
