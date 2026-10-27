# One Clue

Partyspiel für das Handy: Eine Person rät, alle anderen geben je ein einziges
Wort als Tipp. Läuft direkt im Browser, ohne App, ohne Anmeldung, auch offline.

**Spielen:** [1clue.9xb.de](https://1clue.9xb.de)

## So geht's

1. Eine Person **rät**, alle anderen **geben Tipps**.
2. Der Rater tippt auf **Raten**, wählt die Kategorien, tippt auf **Start** und
   hält das Handy vor die Stirn. Nach 3 Sekunden erscheint der Begriff groß auf
   dem Bildschirm, sodass alle außer dem Rater ihn sehen.
3. Jeder Tippgeber tippt auf **Tipp geben**, schreibt heimlich ein Wort und
   drückt Enter. Der Tipp wird groß angezeigt.
4. Alle Tippgeber zeigen sich ihre Handys. Gleiche oder zu ähnliche Tipps werden
   weggelegt.
5. Der Rater sieht die übrigen Tipps und hat einen Versuch.

Der runde Pfeil oben rechts führt zurück bzw. lädt die Seite für die nächste
Runde neu.

## Aufbau

Statische Seite ohne Build-Schritt und ohne Bibliotheken. Alles, was
veröffentlicht wird, liegt in `public/`:

```
public/
├── index.html            die Seite (Aufbau der Ansichten)
├── style.css             Gestaltung
├── app.js                Spiellogik
├── categories.js         die Kategorien und Begriffe
├── impressum.html        Impressum, Haftungsausschluss, Datenschutzerklärung
├── sw.js                 Offline-Betrieb (Service Worker)
├── manifest.webmanifest  Web-App-Manifest für den Home-Screen
├── icons/                Favicon und Home-Screen-Icons
└── CNAME                 die Domain für GitHub Pages
```

Alles außerhalb von `public/` (`test/`, `.github/`, `package.json`,
`playwright.config.js`) ist Test- und Deploy-Werkzeug. Die App selbst braucht
davon nichts.

## Kategorie ergänzen

Alle Begriffe stehen in `public/categories.js` im Objekt `CATEGORIES`:

```js
var CATEGORIES = {
  "Standard":    ["Apfel", "Auto", ...],
  "NSFW":        [...],
  "Weihnachten": [...],
  "Halloween":   [...],
  // Neue Kategorie einfach anhängen:
  "Tiere":       ["Elefant", "Giraffe", "Pinguin"]
};
```

Mehr ist nicht nötig. Die Checkbox auf der Raten-Seite wird automatisch aus den
Schlüsseln erzeugt, die Reihenfolge im Objekt ist die Anzeige-Reihenfolge.

Hinweise:

- Mindestens eine Kategorie muss ausgewählt sein. Standardmäßig sind alle aktiv
  außer denen in der Liste `DEFAULT_OFF` am Anfang von `public/categories.js`
  (aktuell nur „NSFW“).
- Die Auswahl wird im `localStorage` des Handys gespeichert. Eine entfernte oder
  umbenannte Kategorie wird dabei automatisch ignoriert.
- Bereits gezeigte Begriffe merkt sich jedes Handy ebenfalls im `localStorage`.
  Erst wenn alle Begriffe der gewählten Kategorien durch sind, fängt es von vorn an.
- Nach jeder Änderung an einer Datei in `public/` die `VERSION` in
  `public/sw.js` hochzählen, damit Handys mit zwischengespeicherter Version die
  neue Fassung beim nächsten Aufruf übernehmen.

## Entwickeln und testen

Node wird nur für die Tests gebraucht, die App selbst läuft ohne.

```sh
npm install                              # einmalig: Test-Werkzeuge
npx playwright install chromium webkit   # einmalig: Test-Browser (Chrome- und Safari-Engine)

npm run dev           # lokaler Server auf http://127.0.0.1:8765, öffnet den Browser
npm test              # alle Browser-Tests (Handy-Chrome, Handy-Safari, Desktop)
npm run test:ui       # Tests interaktiv im Playwright-Fenster
npm run test:report   # letzten HTML-Report öffnen
```

Die Tests in `test/` prüfen Laden, Kategorien, Countdown, Begriffsauswahl ohne
Wiederholung, Tipp-Eingabe, Schriftanpassung bei langen Begriffen, Querformat,
Barrierefreiheit (axe-core), Offline-Betrieb, interne Verweise, Impressum,
Datenqualität und Fehlerfälle.

## Veröffentlichung

Der Workflow in `.github/workflows/ci.yml` läuft bei jedem Push und Pull
Request. Bei einem Push auf `main` wird nach bestandenen Tests der Ordner
`public/` automatisch auf GitHub Pages veröffentlicht. Schlägt ein Test fehl,
wird nicht deployt.

## Lizenz

[MIT](LICENSE)
