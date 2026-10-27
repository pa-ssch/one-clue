#!/usr/bin/env node
// Prüft die Regel aus der README: Hat sich gegenüber <basis> etwas in public/ geändert,
// muss VERSION in public/sw.js hochgezählt sein, sonst behalten Handys offline die alte Fassung.
//
//   node scripts/check-sw-version.js [basis]     Standard: origin/main, sonst HEAD
//
// Verglichen wird die Basis mit dem Arbeitsverzeichnis, also auch mit noch nicht
// eingecheckten Änderungen. In der CI ist das Arbeitsverzeichnis der geprüfte Commit.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const reachable = (ref) => { try { git("rev-parse", "--verify", "--quiet", ref + "^{commit}"); return true; } catch { return false; } };
const versionOf = (src) => (src.match(/var VERSION = "([^"]+)"/) || [])[1];

let base = process.argv[2];
if (!base) base = reachable("origin/main") ? "origin/main" : "HEAD";
if (!reachable(base)) {
  console.log(`Basis "${base}" ist nicht erreichbar (z. B. erster Push oder Force-Push), Prüfung übersprungen.`);
  process.exit(0);
}

const changed = git("diff", "--name-only", base, "--", "public").split("\n").filter(Boolean);
if (changed.length === 0) {
  console.log(`Keine Änderung in public/ gegenüber ${base}, nichts zu prüfen.`);
  process.exit(0);
}

let before = null;
try { before = versionOf(git("show", `${base}:public/sw.js`)); } catch { /* sw.js gab es an der Basis noch nicht */ }
const after = versionOf(fs.readFileSync(path.join(root, "public", "sw.js"), "utf8"));
if (!after) {
  console.error("VERSION in public/sw.js nicht gefunden.");
  process.exit(1);
}
if (before === after) {
  console.error(`Geändert gegenüber ${base}: ${changed.join(", ")}`);
  console.error(`VERSION in public/sw.js ist aber unverändert ("${after}"). Bitte hochzählen, sonst behalten Handys offline die alte Fassung.`);
  process.exit(1);
}
console.log(`OK: VERSION ${before} -> ${after}, ${changed.length} Datei(en) in public/ geändert gegenüber ${base}.`);
