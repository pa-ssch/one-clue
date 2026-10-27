(function () {
  "use strict";

  // Die Kategorien und Begriffe stehen in categories.js (globale Variable CATEGORIES).
  if (typeof CATEGORIES !== "object" || CATEGORIES === null) {
    document.body.textContent =
      "categories.js konnte nicht geladen werden.";
    return;
  }

  var USED_KEY = "oneclue-used";
  var CAT_KEY = "oneclue-categories";

  // ---------- Hilfsfunktionen ----------
  function $(id) {
    return document.getElementById(id);
  }

  function show(id) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++)
      screens[i].classList.remove("active");
    $(id).classList.add("active");
  }

  // Bereits gezeigte Begriffe auf diesem Handy merken, damit sich
  // möglichst nichts wiederholt. Wenn alle durch sind, wird zurückgesetzt.
  function loadUsed() {
    try {
      var saved = JSON.parse(localStorage.getItem(USED_KEY) || "[]");
      // Nur ein Array aus Strings ist brauchbar. Alles andere (z. B. von Hand
      // veränderter Speicher) wird verworfen, statt den Start abstürzen zu lassen.
      if (Array.isArray(saved))
        return saved.filter(function (w) {
          return typeof w === "string";
        });
    } catch (e) {}
    return [];
  }
  function saveUsed(list) {
    try {
      localStorage.setItem(USED_KEY, JSON.stringify(list));
    } catch (e) {}
  }
  // ---------- Kategorien ----------
  function allCategories() {
    return Object.keys(CATEGORIES);
  }

  function loadSelected() {
    var all = allCategories();
    try {
      var saved = JSON.parse(localStorage.getItem(CAT_KEY));
      if (Array.isArray(saved)) {
        var valid = saved.filter(function (c) {
          return all.indexOf(c) !== -1;
        });
        if (valid.length > 0) return valid;
      }
    } catch (e) {}
    // Standard: alle außer den in DEFAULT_OFF genannten (z. B. NSFW)
    var off =
      typeof DEFAULT_OFF !== "undefined" && Array.isArray(DEFAULT_OFF) ? DEFAULT_OFF : [];
    var def = all.filter(function (c) {
      return off.indexOf(c) === -1;
    });
    return def.length > 0 ? def : all.slice();
  }
  function saveSelected(list) {
    try {
      localStorage.setItem(CAT_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function buildCategoryList() {
    var box = $("categories");
    var selected = loadSelected();
    box.textContent = "";
    allCategories().forEach(function (name) {
      var label = document.createElement("label");
      label.className = "cat";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = name;
      cb.checked = selected.indexOf(name) !== -1;
      cb.addEventListener("change", onCategoryChange);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + name));
      box.appendChild(label);
    });
  }

  function selectedFromUI() {
    var boxes = document.querySelectorAll("#categories input");
    var list = [];
    for (var i = 0; i < boxes.length; i++)
      if (boxes[i].checked) list.push(boxes[i].value);
    return list;
  }

  function onCategoryChange(e) {
    var list = selectedFromUI();
    if (list.length === 0) {
      // Mindestens eine Kategorie muss ausgewählt bleiben
      e.target.checked = true;
      e.target.parentNode.classList.remove("shake");
      void e.target.parentNode.offsetWidth; // Animation neu starten
      e.target.parentNode.classList.add("shake");
      return;
    }
    saveSelected(list);
  }

  function activeWords() {
    var selected = loadSelected();
    var words = [];
    selected.forEach(function (c) {
      CATEGORIES[c].forEach(function (w) {
        if (words.indexOf(w) === -1) words.push(w);
      });
    });
    return words;
  }

  function pickWord() {
    var WORDS = activeWords();
    var used = loadUsed();
    var pool = WORDS.filter(function (w) {
      return used.indexOf(w) === -1;
    });
    if (pool.length === 0) {
      // Alle Begriffe der gewählten Kategorien wurden gezeigt: nur diese zurücksetzen
      used = used.filter(function (w) {
        return WORDS.indexOf(w) === -1;
      });
      pool = WORDS.slice();
    }
    var word = pool[Math.floor(Math.random() * pool.length)];
    used.push(word);
    saveUsed(used);
    return word;
  }

  // Schriftgröße so wählen, dass der Begriff in einer Zeile auf den
  // Bildschirm passt. Nur wenn das unlesbar klein würde, wird der Text
  // in möglichst wenige, gleichmäßig lange Zeilen aufgeteilt.
  var currentWord = "";

  // Breite eines Textes im Verhältnis zur Schriftgröße messen
  function measureRatio(el, text) {
    el.textContent = text;
    el.style.fontSize = "1000px";
    return el.scrollWidth / 1000;
  }

  // Text in k Zeilen aufteilen: an Leerzeichen, wenn vorhanden, sonst mitten im Wort
  function splitLines(text, k) {
    if (k <= 1) return [text];
    var lines = [],
      i;
    if (text.indexOf(" ") !== -1) {
      var words = text.split(" ");
      var target = text.length / k;
      var cur = "";
      for (i = 0; i < words.length; i++) {
        var next = cur ? cur + " " + words[i] : words[i];
        if (cur && next.length > target && lines.length < k - 1) {
          lines.push(cur);
          cur = words[i];
        } else {
          cur = next;
        }
      }
      if (cur) lines.push(cur);
    } else {
      var chunk = Math.ceil(text.length / k);
      for (i = 0; i < text.length; i += chunk) {
        var part = text.slice(i, i + chunk);
        if (i + chunk < text.length) part += "-";
        lines.push(part);
      }
    }
    return lines;
  }

  function renderLines(el, lines) {
    el.textContent = "";
    for (var i = 0; i < lines.length; i++) {
      if (i > 0) el.appendChild(document.createElement("br"));
      el.appendChild(document.createTextNode(lines[i]));
    }
  }

  function fitWord() {
    var el = $("word");
    if (!currentWord) return;
    var box = $("show");
    var maxW = box.clientWidth - 40;
    var maxH = box.clientHeight - 40;
    var minSize = Math.max(
      28,
      Math.min(window.innerWidth, window.innerHeight) * 0.12,
    );

    var best = null;
    for (var k = 1; k <= 8; k++) {
      var lines = splitLines(currentWord, k);
      if (lines.length < k) break; // mehr Zeilen als Wörter/Zeichen bringen nichts
      var ratio = 0;
      for (var i = 0; i < lines.length; i++)
        ratio = Math.max(ratio, measureRatio(el, lines[i]));
      var size = Math.min(
        Math.floor(maxW / ratio),
        Math.floor(maxH / (1.3 * lines.length)),
      );
      if (!best || size > best.size) best = { size: size, lines: lines };
      if (size >= minSize) {
        best = { size: size, lines: lines };
        break;
      }
    }

    renderLines(el, best.lines);
    el.style.fontSize = Math.max(best.size, 16) + "px";
  }

  function showWord(text) {
    currentWord = text;
    $("word").textContent = text;
    show("show");
    fitWord();
    requestAnimationFrame(fitWord); // nach dem Rendern nochmal exakt messen
    keepAwake();
  }

  // Bildschirm anlassen, solange der Begriff gezeigt wird (falls unterstützt)
  var wakeLock = null;
  function keepAwake() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock
      .request("screen")
      .then(function (l) {
        wakeLock = l;
      })
      .catch(function () {});
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && currentWord)
      keepAwake();
  });

  // ---------- Countdown für den Rater ----------
  function startCountdown() {
    var n = 3;
    var num = $("countNum");
    num.textContent = n;
    show("countdown");
    keepAwake();
    var t = setInterval(function () {
      n--;
      if (n > 0) {
        num.textContent = n;
      } else {
        clearInterval(t);
        showWord(pickWord());
      }
    }, 1000);
  }

  // ---------- Events ----------
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-go]");
    if (!btn) return;
    var target = btn.getAttribute("data-go");
    if (target === "reload") {
      location.reload();
      return;
    }
    show(target);
    if (target === "tipp")
      setTimeout(function () {
        $("tippInput").focus();
      }, 50);
  });

  $("startBtn").addEventListener("click", startCountdown);

  $("tippForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("tippInput");
    var text = input.value.trim();
    if (!text) return;
    input.blur();
    showWord(text);
  });

  window.addEventListener("resize", fitWord);
  window.addEventListener("orientationchange", function () {
    setTimeout(fitWord, 150);
  });

  // Offline-Fähigkeit: Service Worker registrieren (nur über https/localhost möglich)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  // ---------- Hinweis "App zum Home-Bildschirm hinzufügen" ----------
  // Android/Chrome melden per beforeinstallprompt, dass die App installierbar
  // ist; dann gibt es einen Button, der den echten Install-Dialog öffnet.
  // iOS kennt das nicht, dort wird nur erklärt, wie es per Teilen-Menü geht.
  // Nie in der installierten App (Standalone) und nie mehr nach "Nein, danke".
  var INSTALL_KEY = "oneclue-install-dismissed";
  var installEvent = null;

  function isStandalone() {
    return (
      navigator.standalone === true ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(display-mode: standalone)").matches)
    );
  }
  function isIOS() {
    return (
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      // iPadOS gibt sich als Mac aus, hat aber einen Touchscreen
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }
  function installDismissed() {
    try {
      return localStorage.getItem(INSTALL_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function showInstall(withButton) {
    if (isStandalone() || installDismissed()) return;
    $("installPrompt").hidden = !withButton;
    $("installIos").hidden = withButton;
    $("installBtn").hidden = !withButton;
    $("install").classList.add("open");
  }
  function hideInstall() {
    $("install").classList.remove("open");
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); // Chromes eigenen Mini-Hinweis unterdrücken, wir zeigen unseren
    installEvent = e;
    showInstall(true);
  });
  window.addEventListener("appinstalled", function () {
    installEvent = null;
    hideInstall();
  });
  $("installBtn").addEventListener("click", function () {
    var ev = installEvent;
    if (!ev) return;
    installEvent = null;
    hideInstall(); // prompt() geht pro Event nur einmal, danach meldet sich Chrome neu
    try {
      ev.prompt().catch(function () {});
    } catch (e) {}
  });
  $("installDismiss").addEventListener("click", function () {
    try {
      localStorage.setItem(INSTALL_KEY, "1");
    } catch (e) {}
    hideInstall();
  });
  // Ohne Install-Event (iOS) sofort die Anleitung zeigen
  if (isIOS() && !("onbeforeinstallprompt" in window)) showInstall(false);

  buildCategoryList();
  // Eindeutige Begriffe zählen (ein Wort kann in mehreren Kategorien stehen)
  var unique = [];
  allCategories().forEach(function (c) {
    CATEGORIES[c].forEach(function (w) {
      if (unique.indexOf(w) === -1) unique.push(w);
    });
  });
  $("wordcount").textContent =
    unique.length + " Begriffe in " + allCategories().length + " Kategorien";
})();
