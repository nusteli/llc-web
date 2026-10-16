/* =========================================================
   Libbie's Library Challenge — web version
   ========================================================= */

// Settings live in config.js, so updating the game files never
// overwrites your Apps Script URL or PIN. These are the defaults.
const CONFIG = Object.assign({
  API_URL: "PASTE_NEW_DEPLOYMENT_URL_HERE",
  STAFF_PIN: "1234",
  MAX_DOORS_PER_ROUND: 30,
  MAX_DOOR_HEIGHT_SHARE: 0.4,
  DEFAULT_BACKGROUND: "blue",
  LOG_ANSWERS: true
}, window.LIBBIE_CONFIG || {});

/* ---------- small helpers ---------- */
const $ = sel => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem("libbie." + key); return v === null ? fallback : JSON.parse(v); }
    catch (_) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("libbie." + key, JSON.stringify(value)); } catch (_) {}
  }
};
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  children.forEach(c => node.append(c));
  return node;
}

/* ---------- state ---------- */
const state = {
  feed: null,
  feedSource: "",
  quizKey: null,
  quizFromUrl: false,
  rounds: [],
  roundIndex: 0,
  results: [],          // per door: null | { correct: bool }
  openDoor: -1,
  openedAt: 0,
  answered: false,
  soundOn: store.get("sound", true)
};

/* =========================================================
   Loading questions
   ========================================================= */

const apiReady = () => /^https:\/\/script\.google\.com\/.+\/exec$/.test(CONFIG.API_URL);

async function loadFeed({ force = false } = {}) {
  if (!params.has("demo") && !apiReady()) {
    state.feedSource = "Not set up yet: paste the Apps Script /exec URL into API_URL in app.js (or add ?demo to try sample questions).";
    return false;
  }
  const url = params.has("demo") ? "demo.json" : CONFIG.API_URL + (force ? "?nocache=1" : "");
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const feed = await res.json();
    if (!feed.ok) throw new Error(feed.error || "The question sheet returned an error.");
    state.feed = feed;
    state.feedSource = "Live from the question sheet (" + new Date().toLocaleString() + ")";
    if (!params.has("demo")) store.set("feedCache", feed);
    return true;
  } catch (err) {
    console.warn("[Libbie] Could not load questions:", err);
    const cached = params.has("demo") ? null : store.get("feedCache", null);
    if (cached) {
      state.feed = cached;
      state.feedSource = "Offline copy saved " + new Date(cached.updated).toLocaleString() + " (couldn't reach the sheet: " + err.message + ")";
      return true;
    }
    state.feedSource = "Couldn't load questions: " + err.message;
    return false;
  }
}

function quizList({ includeHidden = false } = {}) {
  if (!state.feed) return [];
  return state.feed.quizzes.filter(q => includeHidden || !q.hidden);
}
function findQuiz(key) {
  if (!state.feed || !key) return null;
  return state.feed.quizzes.find(q => q.key.toLowerCase() === String(key).toLowerCase()) || null;
}
function quizLabel(q) { return q.title || q.key; }

// Questions that aren't in any quiz yet (e.g. new from the Google Form).
function unassignedIds() {
  if (!state.feed) return [];
  const used = new Set();
  state.feed.quizzes.forEach(q => q.questionIds.forEach(id => used.add(id)));
  return Object.keys(state.feed.questions).filter(id => !used.has(id));
}

/* =========================================================
   Screens
   ========================================================= */

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("is-active", s.id === "screen-" + name));
}

function setBackground(bg) {
  document.body.dataset.bg = bg;
}

async function boot() {
  const urlBg = (params.get("bg") || "").toLowerCase();
  setBackground(urlBg || store.get("bg", CONFIG.DEFAULT_BACKGROUND));
  updateSoundButton();

  $("#btn-start").disabled = true;
  $("#start-status").textContent = "Loading questions…";

  const ok = await loadFeed();
  $("#btn-start").disabled = false;

  const urlQuiz = params.get("quiz") || params.get("event") || params.get("eventKey");
  if (urlQuiz && findQuiz(urlQuiz)) {
    state.quizKey = findQuiz(urlQuiz).key;
    state.quizFromUrl = true;
  } else {
    const saved = store.get("quiz", null);
    if (findQuiz(saved)) state.quizKey = findQuiz(saved).key;
  }

  if (!ok && !params.has("demo") && !apiReady()) {
    $("#start-status").textContent = "Almost there: add the Apps Script URL to app.js, or add ?demo to the address to try it.";
  } else if (!ok) {
    $("#start-status").textContent = "Couldn't load the questions. Check the internet connection, then tap the gear to retry.";
  } else if (urlQuiz && !state.quizFromUrl) {
    $("#start-status").textContent = 'No quiz called "' + urlQuiz + '" — tap Start to pick one.';
  } else {
    $("#start-status").textContent = "";
  }
}

function onStart() {
  click();
  startMusic();
  if (state.quizFromUrl && findQuiz(state.quizKey)?.questionIds.length) {
    beginQuiz(state.quizKey);
  } else {
    openSetup();
  }
}

/* =========================================================
   Board & rounds
   ========================================================= */

function beginQuiz(key) {
  const quiz = findQuiz(key);
  if (!quiz || !quiz.questionIds.length) return;
  state.quizKey = quiz.key;

  const ids = shuffle(quiz.questionIds);
  const roundCount = Math.max(1, Math.ceil(ids.length / CONFIG.MAX_DOORS_PER_ROUND));
  const perRound = Math.ceil(ids.length / roundCount);
  state.rounds = [];
  for (let i = 0; i < ids.length; i += perRound) state.rounds.push(ids.slice(i, i + perRound));
  state.roundIndex = 0;

  showScreen("board");
  renderRound();
}

function currentRound() { return state.rounds[state.roundIndex] || []; }

function renderRound() {
  const ids = currentRound();
  state.results = ids.map(() => null);
  $("#round-done").hidden = true;

  const board = $("#board");
  board.innerHTML = "";
  const doors = el("div", { class: "doors", id: "doors" });
  ids.forEach((id, i) => {
    const door = el("button", {
      class: "door",
      "aria-label": "Door " + (i + 1),
      onclick: () => openQuestion(i)
    }, [
      el("span", { class: "door__face" }, [
        el("span", { class: "door__num", text: String(i + 1) }),
        el("span", { class: "door__knob" })
      ]),
      el("img", { class: "door__libbie", alt: "", src: "" })
    ]);
    doors.append(door);
  });
  board.append(doors);
  layoutBoard();
  updateProgress();
  preloadImages(ids);
}

// Pick the column count that gives the biggest doors for this screen.
function layoutBoard() {
  const board = $("#board");
  const doors = $("#doors");
  if (!board || !doors) return;
  const n = doors.children.length;
  if (!n) return;

  const W = board.clientWidth - 8;
  const H = board.clientHeight - 8;
  let best = { size: 0, cols: 1, gap: 12 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    let size = 0, gap = 12;
    for (let k = 0; k < 2; k++) {     // gap scales with door size
      size = Math.min((W - (cols - 1) * gap) / cols, (H - (rows - 1) * gap) / rows);
      gap = Math.max(6, Math.min(18, size * 0.12));
    }
    if (size > best.size) best = { size, cols, gap };
  }
  const size = Math.floor(Math.min(best.size, H * CONFIG.MAX_DOOR_HEIGHT_SHARE));
  doors.style.setProperty("--door-size", size + "px");
  doors.style.setProperty("--gap", Math.round(best.gap) + "px");
  doors.style.width = (best.cols * size + (best.cols - 1) * Math.round(best.gap) + 1) + "px";
}

function updateProgress() {
  const done = state.results.filter(Boolean).length;
  const total = state.results.length;
  const quiz = findQuiz(state.quizKey);
  let text = done + " / " + total + " opened";
  if (state.rounds.length > 1) text = "Round " + (state.roundIndex + 1) + " of " + state.rounds.length + " · " + text;
  $("#bar-progress").textContent = (quiz && quiz.title ? quiz.title + " · " : "") + text;
}

function preloadImages(ids) {
  ids.forEach(id => {
    const q = state.feed.questions[id];
    if (!q) return;
    [...q.images, ...q.choices.map(c => c.image)].filter(Boolean).forEach(src => { const i = new Image(); i.src = src; });
  });
}

function roundFinished() {
  const last = state.roundIndex >= state.rounds.length - 1;
  const correct = state.results.filter(r => r && r.correct).length;
  $("#round-done-text").textContent =
    "All doors opened! You got " + correct + " of " + state.results.length + " right." +
    (last ? "" : " Tap refresh for more questions.");
  $("#btn-refresh").setAttribute("aria-label", last ? "Play again" : "Next round");
  $("#round-done").hidden = false;
  $("#btn-refresh").focus();
}

function onRefresh() {
  click();
  if (state.roundIndex < state.rounds.length - 1) {
    state.roundIndex++;
    renderRound();
  } else {
    beginQuiz(state.quizKey);   // reshuffle everything and start again
  }
}

/* =========================================================
   Question panel
   ========================================================= */

function openQuestion(index) {
  if (state.results[index]) return;
  const id = currentRound()[index];
  const q = state.feed.questions[id];
  if (!q) return;
  click();

  const door = $("#doors").children[index];
  door.classList.add("is-opening");

  state.openDoor = index;
  state.answered = false;
  state.openedAt = performance.now();

  $("#q-heading").textContent = "Door " + (index + 1);
  $("#q-text").textContent = q.question;

  const imgs = $("#q-images");
  imgs.innerHTML = "";
  imgs.classList.remove("is-collapsed");
  imgs.style.setProperty("--n", q.images.length || 1);
  q.images.forEach(src => imgs.append(el("img", { src, alt: "Question picture" })));

  const box = $("#q-choices");
  box.innerHTML = "";
  box.className = "q-choices" + (q.kind === "image" ? " q-choices--image" : "");
  q.choices.forEach((c, ci) => {
    const btn = el("button", {
      class: "choice" + (q.kind === "image" ? " choice--image" : ""),
      onclick: () => answer(ci)
    }, [el("span", { class: "choice__letter", text: c.letter })]);
    if (q.kind === "image") {
      const img = el("img", { class: "choice__img", src: c.image, alt: "Answer " + c.letter });
      img.addEventListener("error", () => img.replaceWith(el("span", { class: "img-missing", text: "Picture " + c.letter + " didn't load" })));
      btn.append(img);
      btn.setAttribute("aria-label", "Answer " + c.letter);
    } else {
      btn.append(el("span", { text: c.text }));
    }
    box.append(btn);
  });

  $("#q-result").hidden = true;
  $(".panel--question .panel__close").hidden = false;

  setTimeout(() => {
    door.classList.remove("is-opening");
    openModal("#modal-question");
    $("#q-choices .choice")?.focus();
  }, 260);
}

function answer(choiceIndex) {
  if (state.answered) return;
  state.answered = true;

  const id = currentRound()[state.openDoor];
  const q = state.feed.questions[id];
  const correct = choiceIndex === q.correct;
  const seconds = Math.round((performance.now() - state.openedAt) / 100) / 10;

  const buttons = [...$("#q-choices").children];
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === q.correct) b.classList.add("is-correct");
    else if (i === choiceIndex) b.classList.add("is-wrong");
    else b.classList.add("is-dim");
  });

  const result = $("#q-result");
  result.className = "q-result " + (correct ? "is-correct" : "is-wrong");
  $("#q-result-libbie").src = correct ? "assets/libbie-correct.webp" : "assets/libbie-wrong.webp";
  const right = q.choices[q.correct];
  $("#q-result-heading").textContent = correct
    ? "Correct!"
    : "Not quite! The answer is " + right.letter + (q.kind === "text" ? ": " + right.text : ".");
  $("#q-result-fact").textContent = q.funFact || "";
  $("#q-result-fact").hidden = !q.funFact;

  const quiz = findQuiz(state.quizKey);
  const qr = $("#q-result-qr");
  qr.hidden = !(quiz && quiz.qr);
  if (quiz && quiz.qr) {
    $("#q-result-qr-img").src = quiz.qr;
    $("#q-result-qr-caption").textContent = quiz.qrCaption || "";
  }

  $("#q-images").classList.add("is-collapsed");   // make room for the result
  result.hidden = false;
  $(".panel--question .panel__close").hidden = true;
  $("#btn-continue").focus();
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });

  state.results[state.openDoor] = { correct };
  logAnswer(q, choiceIndex, correct, seconds);
}

function closeQuestion() {
  const index = state.openDoor;
  closeModal("#modal-question");
  state.openDoor = -1;

  const res = state.results[index];
  if (!res) return;     // closed without answering: door stays shut

  const door = $("#doors").children[index];
  door.disabled = true;
  door.classList.add("is-answered", res.correct ? "is-correct" : "is-wrong");
  door.querySelector(".door__libbie").src = res.correct ? "assets/libbie-correct.webp" : "assets/libbie-wrong.webp";
  door.setAttribute("aria-label", "Door " + (index + 1) + ", answered " + (res.correct ? "correctly" : "incorrectly"));
  updateProgress();

  if (state.results.every(Boolean)) setTimeout(roundFinished, 500);
}

/* ---------- logging ---------- */
function logAnswer(q, choiceIndex, correct, seconds) {
  const chosen = q.choices[choiceIndex];
  const row = {
    eventKey: state.quizKey,
    question: q.question,
    answer: q.kind === "image" ? "Picture " + chosen.letter : chosen.text,
    isCorrect: correct ? "TRUE" : "FALSE",
    funFact: q.funFact || "",
    timeTaken: String(seconds)
  };

  const local = store.get("results", []);
  local.push({ time: new Date().toISOString(), ...row });
  store.set("results", local.slice(-5000));

  if (!CONFIG.LOG_ANSWERS || params.has("demo") || !apiReady()) return;
  fetch(CONFIG.API_URL, {
    method: "POST",
    mode: "no-cors",
    keepalive: true,
    body: new URLSearchParams(row)
  }).catch(err => console.warn("[Libbie] Log failed:", err));
}

function downloadResults() {
  const rows = store.get("results", []).filter(r => !state.quizKey || r.eventKey === state.quizKey);
  const head = ["time", "eventKey", "question", "answer", "isCorrect", "funFact", "timeTaken"];
  const esc = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const csv = [head.join(",")].concat(rows.map(r => head.map(h => esc(r[h])).join(","))).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "libbie-results-" + (state.quizKey || "all") + ".csv" });
  document.body.append(a);
  a.click();
  a.remove();
}

/* =========================================================
   Modals
   ========================================================= */

let lastFocus = null;
function openModal(sel) {
  lastFocus = document.activeElement;
  $(sel).hidden = false;
}
function closeModal(sel) {
  $(sel).hidden = true;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

document.addEventListener("click", e => {
  const closer = e.target.closest("[data-close]");
  if (!closer) return;
  const modal = closer.closest(".modal");
  if (!modal) return;
  if (modal.id === "modal-question") {
    if (!state.answered) closeQuestion();     // backdrop/× only before answering
  } else {
    closeModal("#" + modal.id);
  }
});

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("#modal-question").hidden) closeQuestion();
  else if (!$("#modal-pin").hidden) closeModal("#modal-pin");
  else if (!$("#modal-setup").hidden && state.rounds.length) closeModal("#modal-setup");
});

/* ---------- PIN ---------- */
function openPin() {
  click();
  $("#pin-input").value = "";
  $("#pin-message").textContent = "";
  openModal("#modal-pin");
  setTimeout(() => $("#pin-input").focus(), 50);
}
function tryUnlock() {
  if ($("#pin-input").value === CONFIG.STAFF_PIN) {
    closeModal("#modal-pin");
    openSetup();
  } else {
    $("#pin-message").textContent = "Incorrect PIN";
    $("#pin-input").select();
  }
}

/* ---------- setup ---------- */
let bgBeforeSetup = null;
function openSetup() {
  bgBeforeSetup = document.body.dataset.bg;
  fillQuizSelect();
  $("#setup-bg").value = document.body.dataset.bg;
  $("#setup-source").textContent = state.feedSource;
  const warn = $("#setup-warnings");
  warn.innerHTML = "";
  (state.feed?.warnings || []).forEach(w => warn.append(el("li", { text: w })));
  $("#staff-tools").open = !state.feed;
  const waiting = unassignedIds().length;
  $("#setup-unassigned").hidden = !waiting;
  $("#setup-unassigned-text").textContent = waiting === 1
    ? "1 question isn't in any quiz yet."
    : waiting + " questions aren't in any quiz yet.";
  updateSetupSummary();
  openModal("#modal-setup");
}

function fillQuizSelect() {
  const sel = $("#setup-quiz");
  const showHidden = $("#setup-show-hidden").checked;
  sel.innerHTML = "";
  const list = quizList({ includeHidden: showHidden });
  if (!list.length) {
    sel.append(el("option", { value: "", text: state.feed ? "No quizzes yet" : "Questions not loaded" }));
  }
  list.forEach(q => {
    const label = quizLabel(q) + (q.title ? " (" + q.key + ")" : "") + " — " + q.questionIds.length + " question" + (q.questionIds.length === 1 ? "" : "s") + (q.hidden ? " · hidden" : "");
    sel.append(el("option", { value: q.key, text: label }));
  });
  if (state.quizKey && list.some(q => q.key === state.quizKey)) sel.value = state.quizKey;
}

function updateSetupSummary() {
  const quiz = findQuiz($("#setup-quiz").value);
  const n = quiz ? quiz.questionIds.length : 0;
  let text = "";
  if (quiz && n) {
    const rounds = Math.ceil(n / CONFIG.MAX_DOORS_PER_ROUND);
    const per = Math.ceil(n / rounds);
    text = rounds > 1
      ? n + " questions → " + rounds + " rounds of up to " + per + " doors"
      : n + " doors on the board";
  } else if (quiz) {
    text = "This quiz has no questions yet.";
  }
  $("#setup-summary").textContent = text;
  $("#btn-apply").disabled = !(quiz && n);

  const link = new URL(location.href.split("?")[0]);
  if (quiz) link.searchParams.set("quiz", quiz.key);
  link.searchParams.set("bg", $("#setup-bg").value);
  $("#setup-link").value = link.toString();
}

function applySetup() {
  const key = $("#setup-quiz").value;
  const bg = $("#setup-bg").value;
  if (!findQuiz(key)) return;
  click();
  setBackground(bg);
  store.set("bg", bg);
  store.set("quiz", key);
  closeModal("#modal-setup");
  beginQuiz(key);
}

/* =========================================================
   Sound & full screen
   ========================================================= */

function click() {
  if (!state.soundOn) return;
  const s = $("#sfx-click");
  try { s.currentTime = 0; s.play().catch(() => {}); } catch (_) {}
}
function startMusic() {
  const m = $("#music");
  m.volume = 0.35;
  if (state.soundOn) m.play().catch(() => {});
}
function updateSoundButton() {
  const b = $("#btn-sound");
  b.querySelector("img").src = state.soundOn ? "assets/icon-sound-on.webp" : "assets/icon-sound-off.webp";
  b.setAttribute("aria-pressed", String(state.soundOn));
  b.setAttribute("aria-label", state.soundOn ? "Music on" : "Music off");
}
function toggleSound() {
  state.soundOn = !state.soundOn;
  store.set("sound", state.soundOn);
  updateSoundButton();
  const m = $("#music");
  if (state.soundOn) startMusic(); else m.pause();
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

/* =========================================================
   Wire up
   ========================================================= */

$("#btn-start").addEventListener("click", onStart);
$("#btn-refresh").addEventListener("click", onRefresh);
$("#btn-continue").addEventListener("click", closeQuestion);
$("#btn-settings").addEventListener("click", openPin);
$("#btn-unlock").addEventListener("click", tryUnlock);
$("#pin-input").addEventListener("keydown", e => { if (e.key === "Enter") tryUnlock(); });
$("#btn-apply").addEventListener("click", applySetup);
$("#btn-cancel").addEventListener("click", () => {
  if (bgBeforeSetup) setBackground(bgBeforeSetup);
  closeModal("#modal-setup");
  if (!state.rounds.length) showScreen("start");
});
$("#setup-quiz").addEventListener("change", updateSetupSummary);
$("#setup-bg").addEventListener("change", () => { setBackground($("#setup-bg").value); updateSetupSummary(); });
$("#setup-show-hidden").addEventListener("change", () => { fillQuizSelect(); updateSetupSummary(); });
$("#btn-copy-link").addEventListener("click", () => {
  const input = $("#setup-link");
  input.select();
  navigator.clipboard?.writeText(input.value).catch(() => document.execCommand("copy"));
  $("#btn-copy-link").textContent = "Copied";
  setTimeout(() => ($("#btn-copy-link").textContent = "Copy"), 1500);
});
$("#btn-reload").addEventListener("click", async () => {
  $("#btn-reload").textContent = "Loading…";
  await loadFeed({ force: true });
  $("#btn-reload").textContent = "Reload questions";
  openSetup();
});
$("#btn-download").addEventListener("click", downloadResults);
$("#btn-sound").addEventListener("click", toggleSound);
$("#btn-fullscreen").addEventListener("click", toggleFullscreen);

new ResizeObserver(() => layoutBoard()).observe($("#board"));

boot();
