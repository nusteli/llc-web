/* =========================================================
   Libbie's Library Challenge — Quiz Builder
   Staff tick questions to make or edit a quiz. Saves go to the
   Apps Script, which checks the builder PIN before writing to the
   "Quizzes" tab of the question spreadsheet.
   Uses helpers from app.js ($, el, state, store, CONFIG, params …).
   ========================================================= */

const builder = {
  pin: "",
  unlocked: false,
  quizKey: null,        // null = making a new quiz
  selected: new Set(),  // ticked in the builder
  locked: new Set(),    // in the quiz via the sheet (EventKey / Quiz: column)
  filter: "all",
  saved: "",            // snapshot to spot unsaved changes
  busy: false
};

const NAME_RULE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,59}$/;
const isDemo = () => params.has("demo");

/* ---------- talking to the Apps Script ---------- */

async function builderPost(req) {
  if (isDemo()) return demoPost(req);
  if (!apiReady()) throw new Error("The Apps Script URL isn't set in config.js yet.");
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: "POST",
      body: JSON.stringify(Object.assign({ pin: builder.pin }, req))   // sent as plain text: no CORS preflight
    });
  } catch (_) {
    throw new Error("Couldn't reach the Apps Script. Check the internet connection.");
  }
  let data;
  try { data = await res.json(); }
  catch (_) { throw new Error("The Apps Script sent back something unexpected. Is the newest Code.gs deployed as a new version?"); }
  if (!data.ok) throw new Error(data.error || "Saving failed.");
  return data;
}

// ?demo mode: pretend to save, in memory only.
function demoPost(req) {
  const feed = state.feed;
  if (req.action === "checkPin") return { ok: true };
  if (req.action === "deleteQuiz") {
    feed.quizzes = feed.quizzes.filter(q => q.key.toLowerCase() !== req.key.toLowerCase());
    return { ok: true, feed };
  }
  if (req.action === "saveQuiz") {
    let q = findQuiz(req.key);
    if (req.isNew && q) throw new Error('A quiz called "' + q.key + '" already exists.');
    if (!q) { q = { key: req.key, qr: "", qrCaption: "", lockedIds: [] }; feed.quizzes.push(q); }
    const locked = q.lockedIds || [];
    q.title = req.title;
    q.hidden = req.hidden;
    q.inBuilder = true;
    q.questionIds = locked.concat(req.questionIds.filter(id => locked.indexOf(id) < 0));
    feed.quizzes.sort((a, b) => a.key.localeCompare(b.key, undefined, { sensitivity: "base" }));
    return { ok: true, key: q.key, feed };
  }
  throw new Error("Unknown request.");
}

/* ---------- open / close ---------- */

function openBuilder(filter) {
  if (typeof filter === "string") setBuilderFilter(filter);
  if (!state.feed) {
    $("#setup-source").textContent = "Load the questions first (Reload questions), then open the Quiz Builder.";
    return;
  }
  closeModal("#modal-setup");
  openModal("#modal-builder");
  $("#builder-lock").hidden = builder.unlocked;
  $("#builder-main").hidden = !builder.unlocked;
  if (builder.unlocked) {
    fillBuilderQuizSelect();
    loadBuilderQuiz(builder.quizKey);
  } else {
    $("#builder-pin").value = "";
    $("#builder-pin-message").textContent = isDemo() ? "Demo mode: any PIN works and nothing is saved." : "";
    setTimeout(() => $("#builder-pin").focus(), 50);
  }
}

function closeBuilder() {
  if (builder.unlocked && isDirty() && !confirm("You have unsaved changes to this quiz. Close without saving?")) return;
  closeModal("#modal-builder");
  openSetup();
}

async function unlockBuilder() {
  const pin = $("#builder-pin").value.trim();
  if (!pin) { $("#builder-pin-message").textContent = "Enter the builder PIN."; return; }
  builder.pin = pin;
  $("#builder-unlock").disabled = true;
  $("#builder-pin-message").textContent = "Checking…";
  try {
    await builderPost({ action: "checkPin" });
    builder.unlocked = true;
    $("#builder-lock").hidden = true;
    $("#builder-main").hidden = false;
    fillBuilderQuizSelect();
    loadBuilderQuiz(null);
    $("#builder-name").focus();
  } catch (err) {
    builder.pin = "";
    $("#builder-pin-message").textContent = err.message;
    $("#builder-pin").select();
  } finally {
    $("#builder-unlock").disabled = false;
  }
}

/* ---------- choosing a quiz ---------- */

function fillBuilderQuizSelect() {
  const sel = $("#builder-quiz");
  sel.innerHTML = "";
  sel.append(el("option", { value: "", text: "+ New quiz" }));
  state.feed.quizzes.forEach(q => {
    const n = q.questionIds.length;
    sel.append(el("option", {
      value: q.key,
      text: q.key + (q.title ? " — " + q.title : "") + " (" + n + ")" + (q.hidden ? " · hidden" : "")
    }));
  });
  sel.value = builder.quizKey || "";
}

function loadBuilderQuiz(key) {
  const quiz = key ? findQuiz(key) : null;
  builder.quizKey = quiz ? quiz.key : null;
  builder.locked = new Set(quiz ? (quiz.lockedIds || []) : []);
  builder.selected = new Set(quiz ? quiz.questionIds.filter(id => !builder.locked.has(id)) : []);

  $("#builder-quiz").value = builder.quizKey || "";
  $("#builder-name-field").hidden = !!quiz;
  $("#builder-name").value = "";
  $("#builder-title").value = quiz ? (quiz.title || "") : "";
  $("#builder-hidden").checked = quiz ? !!quiz.hidden : false;
  $("#builder-delete").hidden = !(quiz && quiz.inBuilder && builder.locked.size === 0);
  $("#builder-status").textContent = "";
  builder.saved = snapshot();
  renderBuilderList();
}

function snapshot() {
  return JSON.stringify([
    builder.quizKey ? "" : $("#builder-name").value.trim(),
    $("#builder-title").value.trim(),
    $("#builder-hidden").checked,
    [...builder.selected].sort()
  ]);
}
function isDirty() { return snapshot() !== builder.saved; }

/* ---------- question list ---------- */

// quiz names each question already belongs to, for the list and search
function quizzesByQuestion() {
  const map = {};
  state.feed.quizzes.forEach(q => q.questionIds.forEach(id => { (map[id] = map[id] || []).push(q.key); }));
  return map;
}

function renderBuilderList() {
  const list = $("#builder-list");
  const terms = $("#builder-search").value.toLowerCase().split(/\s+/).filter(Boolean);
  const inQuiz = id => builder.locked.has(id) || builder.selected.has(id);
  const memberOf = quizzesByQuestion();
  // newest first: form timestamp when there is one, else the later row
  const questions = Object.values(state.feed.questions).sort((a, b) =>
    (b.added || "").localeCompare(a.added || "") || (b.row || 0) - (a.row || 0));

  list.innerHTML = "";
  let shown = 0;
  questions.forEach(q => {
    const quizzes = memberOf[q.id] || [];
    if (builder.filter === "in" && !inQuiz(q.id)) return;
    if (builder.filter === "out" && inQuiz(q.id)) return;
    if (builder.filter === "none" && quizzes.length) return;
    if (terms.length) {
      const hay = [q.question, q.funFact, ...q.choices.map(c => c.text), ...quizzes].join(" ").toLowerCase();
      if (!terms.every(t => hay.includes(t))) return;
    }
    shown++;
    list.append(builderRow(q, quizzes));
  });

  if (!shown) {
    list.append(el("li", { class: "builder__empty", text:
      questions.length === 0 ? "There are no questions yet. Add some with the Google Form." :
      builder.filter === "in" ? "No questions in this quiz yet. Switch to All and tick some." :
      builder.filter === "none" ? "Every question is in at least one quiz." :
      "No questions match." }));
  }
  updateBuilderCount();
  const waiting = unassignedIds().length;
  $("#seg-none").innerHTML = "";
  $("#seg-none").append("Not in any quiz");
  if (waiting) $("#seg-none").append(el("span", { class: "seg__count", text: String(waiting) }));
}

function setBuilderFilter(filter) {
  builder.filter = filter;
  document.querySelectorAll("#modal-builder .seg__btn").forEach(b => {
    b.classList.toggle("is-on", b.dataset.filter === filter);
    b.setAttribute("aria-checked", String(b.dataset.filter === filter));
  });
}

function shortDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function builderRow(q, quizzes) {
  const locked = builder.locked.has(q.id);
  const box = el("input", { type: "checkbox", class: "builder__check", "aria-label": q.question });
  box.checked = locked || builder.selected.has(q.id);
  box.disabled = locked;
  box.addEventListener("change", () => {
    if (box.checked) builder.selected.add(q.id); else builder.selected.delete(q.id);
    row.classList.toggle("is-in", box.checked);
    updateBuilderCount();
  });

  const meta = el("span", { class: "builder__meta" });
  if (q.added && shortDate(q.added)) meta.append(el("span", { text: "Added " + shortDate(q.added) }));
  if (q.row) meta.append(el("span", { text: "Row " + q.row }));
  meta.append(el("span", { text: q.kind === "image" ? "Picture answers" : q.choices.map(c => c.text).join(" · ") }));
  const others = quizzes.filter(k => k !== builder.quizKey);
  if (others.length) meta.append(el("span", { text: "Also in: " + others.join(", ") }));

  const body = el("span", { class: "builder__text" }, [el("span", { class: "builder__q", text: q.question }), meta]);
  if (locked) body.append(el("span", { class: "builder__badge", text: "Added in the sheet (EventKey or a Quiz: column) — change it there" }));
  else if (!quizzes.length) body.append(el("span", { class: "builder__badge builder__badge--new", text: "Not in any quiz yet" }));

  const row = el("li", { class: "builder__row" + (box.checked ? " is-in" : "") + (locked ? " is-locked" : "") }, [
    el("label", { class: "builder__label" }, [box, body])
  ]);
  return row;
}

function updateBuilderCount() {
  const total = builder.locked.size + [...builder.selected].filter(id => !builder.locked.has(id)).length;
  let text = total + " question" + (total === 1 ? "" : "s") + " in this quiz";
  if (builder.locked.size) text += " (" + builder.locked.size + " from the sheet)";
  if (total > CONFIG.MAX_DOORS_PER_ROUND) {
    const rounds = Math.ceil(total / CONFIG.MAX_DOORS_PER_ROUND);
    text += " · " + rounds + " rounds of up to " + Math.ceil(total / rounds) + " doors";
  } else if (total) {
    text += " · " + total + " doors";
  }
  $("#builder-count").textContent = text;
}

/* ---------- save / delete ---------- */

async function saveBuilderQuiz() {
  if (builder.busy) return;
  const isNew = !builder.quizKey;
  const key = isNew ? $("#builder-name").value.trim() : builder.quizKey;
  const status = $("#builder-status");

  if (isNew) {
    if (!key) { status.textContent = "Give the new quiz a name first."; $("#builder-name").focus(); return; }
    if (!NAME_RULE.test(key)) { status.textContent = "Names can use letters, numbers, spaces, - and _ (start with a letter or number)."; $("#builder-name").focus(); return; }
    if (findQuiz(key)) { status.textContent = 'There is already a quiz called "' + findQuiz(key).key + '". Pick it from the Quiz list to edit it.'; return; }
  }
  const total = builder.locked.size + builder.selected.size;
  if (!total && !confirm("This quiz has no questions. Save it anyway?")) return;

  builder.busy = true;
  $("#builder-save").disabled = true;
  status.textContent = "Saving…";
  try {
    const res = await builderPost({
      action: "saveQuiz",
      key,
      isNew,
      title: $("#builder-title").value.trim(),
      hidden: $("#builder-hidden").checked,
      questionIds: [...builder.selected]
    });
    state.feed = res.feed;
    if (!isDemo()) store.set("feedCache", res.feed);
    fillBuilderQuizSelect();
    loadBuilderQuiz(res.key || key);
    const n = findQuiz(res.key || key)?.questionIds.length ?? total;
    status.textContent = "Saved. " + (res.key || key) + " now has " + n + " question" + (n === 1 ? "" : "s") + "." + (isDemo() ? " (Demo: not really saved.)" : "");
  } catch (err) {
    status.textContent = err.message;
    if (/PIN/.test(err.message)) { builder.unlocked = false; }
  } finally {
    builder.busy = false;
    $("#builder-save").disabled = false;
  }
}

async function deleteBuilderQuiz() {
  const key = builder.quizKey;
  if (!key || builder.busy) return;
  if (!confirm('Delete the quiz "' + key + '"? The questions stay in the sheet; only this quiz is removed.')) return;
  builder.busy = true;
  $("#builder-status").textContent = "Deleting…";
  try {
    const res = await builderPost({ action: "deleteQuiz", key });
    state.feed = res.feed;
    if (!isDemo()) store.set("feedCache", res.feed);
    if (state.quizKey && state.quizKey.toLowerCase() === key.toLowerCase() && !findQuiz(key)) state.quizKey = null;
    fillBuilderQuizSelect();
    loadBuilderQuiz(null);
    $("#builder-status").textContent = '"' + key + '" deleted.';
  } catch (err) {
    $("#builder-status").textContent = err.message;
  } finally {
    builder.busy = false;
  }
}

/* ---------- wire up ---------- */

$("#btn-builder").addEventListener("click", () => openBuilder());
$("#builder-close").addEventListener("click", closeBuilder);
$("#builder-cancel").addEventListener("click", closeBuilder);
$("#builder-unlock").addEventListener("click", unlockBuilder);
$("#builder-pin").addEventListener("keydown", e => { if (e.key === "Enter") unlockBuilder(); });
$("#builder-save").addEventListener("click", saveBuilderQuiz);
$("#builder-delete").addEventListener("click", deleteBuilderQuiz);
$("#builder-search").addEventListener("input", renderBuilderList);
$("#builder-quiz").addEventListener("change", e => {
  const next = e.target.value || null;
  if (isDirty() && !confirm("You have unsaved changes to this quiz. Switch without saving?")) {
    e.target.value = builder.quizKey || "";
    return;
  }
  $("#builder-search").value = "";
  loadBuilderQuiz(next);
});
document.querySelectorAll("#modal-builder .seg__btn").forEach(btn => btn.addEventListener("click", () => {
  setBuilderFilter(btn.dataset.filter);
  renderBuilderList();
}));
$("#btn-unassigned").addEventListener("click", () => openBuilder("none"));
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("#modal-builder").hidden) closeBuilder();
});
