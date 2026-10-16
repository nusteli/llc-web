# Libbie's Library Challenge (web version)

A plain HTML/CSS/JavaScript version of the advent-calendar trivia game. It has no Unity build and nothing to export. Questions come straight from the Google Sheet.

## What changed

- **Doors fit the quiz.** 9 questions give 9 doors. Quizzes with more than 30 questions are split into even rounds (e.g. 40 → two rounds of 20), and Refresh moves to the next round. After the last round, Refresh reshuffles and starts again.
- **No more event keys on GitHub.** The quiz list comes from the sheet itself. `event-keys.json`, `event-config.json` and `event-qr.json` are no longer used.
- **Questions are stored once and reused.** A question can belong to several quizzes (see below), so there's no copy-and-paste. Duplicates left over from the old approach are ignored automatically.
- **Answer logging is unchanged.** Answers go to the same spreadsheet, one tab per quiz, with the same columns.
- **Loads in a second or two.** The old build was about 33 MB; this is about 2.6 MB, mostly the music.
- **Works offline at events.** The last downloaded questions are kept on the device. If the Wi-Fi drops, the game still runs.

## One-time setup (live version stays untouched)

Nothing here changes `nusteli/libbieslc`, the live Apps Script deployment, or the live question sheet.

### 1. Make a test copy of the spreadsheet

1. Open the spreadsheet with the form responses and choose **File → Make a copy**.
   - The copy isn't linked to the Google Form, which is fine for testing.
   - The live game keeps reading the original.
2. Try the new features on the copy only: commas in EventKey, `Quiz:` tick columns, and the `Quizzes` tab. Changing EventKey cells in the original would affect the live game.

### 2. Make a new Apps Script deployment

1. Create a new script at script.google.com (New project), or open the copy's **Extensions → Apps Script**.
2. Paste in `apps-script/Code.gs` and fill in the three settings at the top. An ID is the long code in a spreadsheet's URL between `/d/` and `/edit`.
   - `SPREADSHEET_ID`: the results spreadsheet, where answers are logged. Use a test copy so test answers stay out of the live results.
   - `QUESTIONS_SPREADSHEET_ID`: the question spreadsheet (your test copy).
   - `BUILDER_PIN`: the PIN for the Quiz Builder. The builder stays switched off until you change it from `CHANGE-ME`. It lives only in the script, never on GitHub.
3. The script finds the questions tab by itself (any tab with `Question` and `CorrectAnswer` columns). If it can't, the `/exec` page lists the tabs it sees, which usually means the ID points at the wrong file.
4. Choose **Deploy → New deployment → Web app**, with Execute as *Me* and Who has access *Anyone*. Approve the permissions.
5. Copy the new `/exec` URL. Open it in a browser; you should see the questions as text (JSON).

The live game's script and URL are not touched by any of this.

### 3. Create the new GitHub repo

1. On GitHub, create a new repo, e.g. `nusteli/libbie-web`. Make it **Public** with no template.
2. Upload these files to it:
   - `index.html`
   - `style.css`
   - `app.js`
   - `builder.js`
   - `config.js`
   - `demo.json`
   - the `assets/` folder
   - optionally `README.md` and `apps-script/`
3. In `config.js` (the only file you need to edit), change two settings:
   - Set `API_URL` to the new `/exec` URL.
   - Set `STAFF_PIN` to your gear-button PIN (currently `1234`).
4. Go to **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**. After a minute or two the site is at `https://nusteli.github.io/libbie-web/`.

### 4. Try it

- `…/libbie-web/?demo` runs on built-in sample questions. No script is needed for this.
- `…/libbie-web/` runs on the test copy of the sheet.

### Switching over later

When you're happy, point the new version at the real sheet:

1. In the new script, change both IDs to the original spreadsheet.
2. Choose **Deploy → Manage deployments → ✏️ → New version**. The URL stays the same.
3. Share the `libbie-web` link with colleagues.

The old Unity site can stay up as long as you like.

**Before the switch:** questions listed under several quizzes (commas) or in `Quiz:` columns only show correctly in the new version.

## For colleagues: making a quiz

**Adding questions:** use the Google Form exactly as before.
- **Text questions:** fill Choice A–C.
- **Picture-answer questions:** fill AImageUrl–DImageUrl.
- **CorrectAnswer:** can be the letter (`B`) or the answer text.
- **Pictures:** Google Drive share links work, as well as GitHub image links.

**Building a quiz (no spreadsheet access needed):**
1. Tap the gear, enter the staff PIN, open **Staff tools → Quiz Builder**, and enter the builder PIN.
2. Choose **+ New quiz** and type a name, or pick an existing quiz from the list.
3. Tick the questions you want. Search finds questions by their words, answers or the quizzes they're already in.
4. Click **Save quiz**. It appears in the quiz list straight away.

The builder can also give a quiz a title, hide it from the list, or delete a quiz it made.

**Other ways a question gets into a quiz** (for people with sheet access): both still work alongside the builder.
- The **EventKey** cell names the quiz; separate several with commas, e.g. `OpenHouse2026, NUS120`.
- A column headed **`Quiz: YourQuizName`** with checkboxes.
- Questions added this way show in the builder as locked, labelled "Added in the sheet", and are changed in the sheet.

**Two columns the script manages:** a `QID` column in the question tab gives every question a permanent ID, and the `Quizzes` tab stores builder quizzes. Don't edit or delete either by hand; the `Questions` column in particular holds those IDs.

**QR codes:** the `Quizzes` tab also has **QR Image URL** and **QR Caption** columns. Fill them in for a quiz to show a QR code after each answer.

**Running it at an event:**
1. Tap the gear and enter the PIN.
2. Pick the quiz and background.
3. Open **Staff tools** to copy a link like `…/libbieslc/?quiz=OpenHouse2026&bg=pink`.
4. Open that link on the event screen; it skips setup.

**Problems with questions?** Staff tools lists them, e.g. "Row 17: correct answer doesn't match any choice". So does **Libbie → Check questions** in the sheet.

## Settings in `config.js`

| Setting | What it does |
|---|---|
| `API_URL` | The Apps Script `/exec` URL |
| `STAFF_PIN` | PIN for the gear button |
| `MAX_DOORS_PER_ROUND` | Most doors on screen at once (30) |
| `MAX_DOOR_HEIGHT_SHARE` | Biggest a door can get, as a share of screen height |
| `DEFAULT_BACKGROUND` | blue, green, orange, pink, purple, yellow or grey |
| `LOG_ANSWERS` | Turn sheet logging on or off |
