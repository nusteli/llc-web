// ===============================================================
// Libbie's Library Challenge — question feed + answer logger
// ===============================================================
//
// doGet  → sends every quiz and its questions to the web game (JSON)
// doPost → logs each answer into a tab named after the quiz (unchanged
//          from the original QUIZLOGGER_v1 behaviour)
//
// After pasting this in: Deploy > Manage deployments > (pencil) >
// Version: New version > Deploy. Editing the existing deployment keeps
// the same /exec URL, so nothing else needs to change.
// ---------------------------------------------------------------

// Spreadsheet that answers are logged into (same as before).
const SPREADSHEET_ID = "1LeNbZJ32S2RJdC2X93UKJLOi0M8eMBon2ubNNIZEoiA";

// Spreadsheet that holds the Google Form question responses.
// If the questions live in a different file from the log, paste that
// file's ID here (the long code in its URL between /d/ and /edit).
const QUESTIONS_SPREADSHEET_ID = SPREADSHEET_ID;

// Tab the Google Form writes questions into.
const QUESTIONS_SHEET_NAME = "Form Responses 1";

// Optional tab for quiz settings (title, QR code, hide old quizzes).
const QUIZ_SETTINGS_SHEET_NAME = "Quizzes";

// Column headers that mark a "tick this question for this quiz" column.
// e.g. a column headed  Quiz: OpenHouse2026  filled with checkboxes.
const QUIZ_COLUMN_PREFIX = "quiz:";

const DEPLOY_TAG = "LIBBIE_v2";
const CACHE_SECONDS = 30;


// ===============================================================
// GET — question feed
// ===============================================================

function doGet(e) {
  const params = (e && e.parameter) || {};

  if (params.ping) {
    return ContentService.createTextOutput("Web App is active | " + DEPLOY_TAG);
  }

  let json;
  const cache = CacheService.getScriptCache();
  const cached = params.nocache ? null : cache.get("feed");

  if (cached) {
    json = cached;
  } else {
    try {
      json = JSON.stringify(buildFeed());
    } catch (err) {
      json = JSON.stringify({ ok: false, error: err.message, tag: DEPLOY_TAG });
    }
    // Cache entries are capped at 100 KB; skip caching if larger.
    if (json.length < 95000) cache.put("feed", json, CACHE_SECONDS);
  }

  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function buildFeed() {
  const ss = SpreadsheetApp.openById(QUESTIONS_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(QUESTIONS_SHEET_NAME);
  if (!sheet) throw new Error('No tab called "' + QUESTIONS_SHEET_NAME + '" in the questions spreadsheet.');

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { ok: true, tag: DEPLOY_TAG, updated: new Date().toISOString(), questions: {}, quizzes: [], warnings: [] };

  const header = values[0].map(h => String(h).trim());
  const col = name => header.findIndex(h => norm(h) === norm(name));

  const C = {
    eventKey: col("EventKey"),
    type: col("Type"),
    question: col("Question"),
    a: col("Choice A"), b: col("Choice B"), c: col("Choice C"),
    correct: col("CorrectAnswer"),
    funFact: col("FunFact"),
    q1: col("QImage1"), q2: col("QImage2"), q3: col("QImage3"),
    ia: col("AImageUrl"), ib: col("BImageUrl"), ic: col("CImageUrl"), id: col("DImageUrl")
  };
  if (C.question < 0) throw new Error('Could not find a "Question" column in ' + QUESTIONS_SHEET_NAME + ".");

  // Tick-box quiz columns, e.g. "Quiz: OpenHouse2026"
  const quizColumns = [];
  header.forEach((h, i) => {
    if (h.toLowerCase().startsWith(QUIZ_COLUMN_PREFIX)) {
      const name = h.substring(QUIZ_COLUMN_PREFIX.length).trim();
      if (name) quizColumns.push({ name: name, index: i });
    }
  });

  const questions = {};
  const members = {};      // quiz key -> [question ids]
  const order = [];        // quiz keys in first-seen order
  const warnings = [];
  const addTo = (quiz, id) => {
    const key = quiz.trim();
    if (!key) return;
    const found = Object.keys(members).find(k => k.toLowerCase() === key.toLowerCase());
    const k = found || key;
    if (!members[k]) { members[k] = []; order.push(k); }
    if (members[k].indexOf(id) < 0) members[k].push(id);
  };
  const cell = (row, i) => (i >= 0 && row[i] != null ? String(row[i]).trim() : "");

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const rowNo = r + 1;
    const text = cell(row, C.question);
    if (!text) continue;

    const imageChoices = [C.ia, C.ib, C.ic, C.id].map(i => cell(row, i));
    const textChoices = [C.a, C.b, C.c].map(i => cell(row, i));
    const typeCell = cell(row, C.type).toLowerCase();
    const isImage = imageChoices.some(Boolean) && (typeCell === "" || typeCell.indexOf("image") >= 0 || !textChoices.some(Boolean));

    const letters = ["A", "B", "C", "D"];
    const choices = [];
    (isImage ? imageChoices : textChoices).forEach((v, i) => {
      if (v) choices.push({ letter: letters[i], text: isImage ? "" : v, image: isImage ? driveToDirect(v) : "" });
    });

    if (choices.length < 2) {
      warnings.push("Row " + rowNo + ": needs at least 2 answers — skipped.");
      continue;
    }

    const correctRaw = cell(row, C.correct);
    let correct = -1;
    // "B", "b", "B.", "(B)", "Choice B", "Option B" all mean letter B
    const letterMatch = correctRaw.match(/^(?:choice|option|answer)?\s*\(?([A-Da-d])\)?[.):]?$/i);
    if (letterMatch) {
      correct = choices.findIndex(c => c.letter === letterMatch[1].toUpperCase());
    }
    if (correct < 0 && correctRaw) {
      correct = choices.findIndex(c => norm(c.text) === norm(correctRaw) || (c.image && c.image === driveToDirect(correctRaw)));
    }
    if (correct < 0) {
      warnings.push('Row ' + rowNo + ': correct answer "' + correctRaw + '" doesn\'t match any choice — skipped.');
      continue;
    }

    const id = "r" + rowNo;
    questions[id] = {
      id: id,
      row: rowNo,
      kind: isImage ? "image" : "text",
      question: text,
      images: [C.q1, C.q2, C.q3].map(i => cell(row, i)).filter(Boolean).map(driveToDirect),
      choices: choices,
      correct: correct,
      funFact: cell(row, C.funFact)
    };

    // Membership 1: EventKey cell (several allowed, separated by commas)
    cell(row, C.eventKey).split(/[,;\n]/).forEach(k => addTo(k, id));

    // Membership 2: ticked quiz columns
    quizColumns.forEach(q => {
      const v = row[q.index];
      if (v === true || String(v).trim().toLowerCase() === "true" || String(v).trim().toLowerCase() === "x") addTo(q.name, id);
    });
  }

  // Optional settings tab: Quiz | Title | QR Image URL | QR Caption | Hide
  const settings = readQuizSettings(ss);

  // Make sure quizzes that only exist in the settings tab or as an empty
  // tick column still show up (with zero questions) so staff can see them.
  quizColumns.forEach(q => { if (!Object.keys(members).some(k => k.toLowerCase() === q.name.toLowerCase())) { members[q.name] = []; order.push(q.name); } });

  const quizzes = order.map(key => {
    const s = settings[key.toLowerCase()] || {};
    const ids = dedupe(members[key], questions, key, warnings);
    return {
      key: key,
      title: s.title || "",
      qr: s.qr ? driveToDirect(s.qr) : "",
      qrCaption: s.qrCaption || "",
      hidden: !!s.hide,
      questionIds: ids
    };
  }).sort((a, b) => a.key.localeCompare(b.key, undefined, { sensitivity: "base" }));

  return {
    ok: true,
    tag: DEPLOY_TAG,
    updated: new Date().toISOString(),
    questions: questions,
    quizzes: quizzes,
    warnings: warnings
  };
}

// Drop questions that appear twice in the same quiz (same question,
// same answers) — leftovers from the old copy-and-paste approach.
function dedupe(ids, questions, quizKey, warnings) {
  const seen = {};
  const out = [];
  let dropped = 0;
  ids.forEach(id => {
    const q = questions[id];
    const sig = norm(q.question) + "|" + q.choices.map(c => norm(c.text || c.image)).join("|");
    if (seen[sig]) { dropped++; return; }
    seen[sig] = true;
    out.push(id);
  });
  if (dropped) warnings.push(quizKey + ": " + dropped + " duplicate question(s) ignored.");
  return out;
}

function readQuizSettings(ss) {
  const out = {};
  const sh = ss.getSheetByName(QUIZ_SETTINGS_SHEET_NAME);
  if (!sh) return out;
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return out;
  const h = v[0].map(x => norm(x));
  const i = name => h.indexOf(norm(name));
  const iQuiz = i("Quiz"), iTitle = i("Title"), iQr = i("QR Image URL"), iCap = i("QR Caption"), iHide = i("Hide");
  for (let r = 1; r < v.length; r++) {
    const key = iQuiz >= 0 ? String(v[r][iQuiz]).trim() : "";
    if (!key) continue;
    out[key.toLowerCase()] = {
      title: iTitle >= 0 ? String(v[r][iTitle]).trim() : "",
      qr: iQr >= 0 ? String(v[r][iQr]).trim() : "",
      qrCaption: iCap >= 0 ? String(v[r][iCap]).trim() : "",
      hide: iHide >= 0 && (v[r][iHide] === true || String(v[r][iHide]).toLowerCase() === "true")
    };
  }
  return out;
}

// Google Drive share links don't load as images on a web page.
// Turn them into a direct image link.
function driveToDirect(url) {
  const u = String(url || "").trim();
  const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
  if (m) return "https://lh3.googleusercontent.com/d/" + m[1];
  return u;
}

function norm(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();
}


// ===============================================================
// POST — answer logger (same behaviour as QUIZLOGGER_v1)
// ===============================================================

function doPost(e) {
  let ss = null;
  try {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (!e || !e.parameter) {
      throw new Error("No POST data received. doPost only works via HTTP POST to /exec.");
    }

    const data = e.parameter;
    const rawEventKey = (data.eventKey || "UNKNOWN").trim();
    const eventKey = sanitizeSheetName(rawEventKey);

    const dbg = ss.getSheetByName("DEBUG") || ss.insertSheet("DEBUG");
    dbg.appendRow([new Date(), "HIT", DEPLOY_TAG, "eventKey=" + (data.eventKey || "NULL"), "question=" + (data.question || "NULL")]);

    let sheet = ss.getSheetByName(eventKey);
    if (!sheet) {
      sheet = ss.insertSheet(eventKey);
      sheet.appendRow(["Timestamp", "EventKey", "Question", "Answer", "IsCorrect", "FunFact", "TimeTaken"]);
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date(),
      eventKey,
      data.question || "",
      data.answer || "",
      data.isCorrect || "",
      data.funFact || "",
      data.timeTaken || ""
    ]);

    return ContentService.createTextOutput("OK | " + DEPLOY_TAG + " | tab: " + eventKey);

  } catch (err) {
    try {
      if (ss) {
        const dbg = ss.getSheetByName("DEBUG") || ss.insertSheet("DEBUG");
        dbg.appendRow([new Date(), "ERROR", DEPLOY_TAG, err.message]);
      }
    } catch (_) {}
    return ContentService.createTextOutput("ERROR | " + DEPLOY_TAG + " | " + err.message);
  }
}

// Google Sheet tab names: max 100 chars, cannot contain []:*?/\
function sanitizeSheetName(name) {
  let s = (name || "").replace(/[\[\]\:\*\?\/\\]/g, " ").trim();
  if (!s) s = "UNKNOWN";
  if (s.length > 100) s = s.substring(0, 100);
  return s;
}


// ===============================================================
// Sheet menu (only appears if this script is attached to the
// questions spreadsheet via Extensions > Apps Script)
// ===============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Libbie")
    .addItem("New quiz (add a tick column)", "menuAddQuizColumn")
    .addItem("Check questions for problems", "menuCheck")
    .addToUi();
}

function menuAddQuizColumn() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("New quiz", "Quiz name (no spaces needed, e.g. OpenHouse2027):", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const name = res.getResponseText().trim();
  if (!name) return;

  const sh = SpreadsheetApp.openById(QUESTIONS_SPREADSHEET_ID).getSheetByName(QUESTIONS_SHEET_NAME);
  const lastCol = sh.getLastColumn();
  const exists = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .some(h => norm(h) === norm("Quiz: " + name));
  if (exists) { ui.alert('A "Quiz: ' + name + '" column already exists.'); return; }

  const c = lastCol + 1;
  sh.getRange(1, c).setValue("Quiz: " + name).setFontWeight("bold");
  sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).insertCheckboxes();
  CacheService.getScriptCache().remove("feed");
  ui.alert('Added "Quiz: ' + name + '". Tick the questions you want in this quiz.');
}

function menuCheck() {
  const feed = buildFeed();
  CacheService.getScriptCache().remove("feed");
  const lines = feed.quizzes.map(q => q.key + ": " + q.questionIds.length + " questions" + (q.hidden ? " (hidden)" : ""));
  const msg = lines.join("\n") + (feed.warnings.length ? "\n\nProblems:\n" + feed.warnings.join("\n") : "\n\nNo problems found.");
  SpreadsheetApp.getUi().alert(msg);
}
