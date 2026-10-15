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
2. Paste in `apps-script/Code.gs`, then set the two IDs at the top to the **copy's** ID. That's the long code in its URL between `/d/` and `/edit`.
   - `SPREADSHEET_ID`: where answers are logged. Using the copy keeps test answers out of the live results.
   - `QUESTIONS_SPREADSHEET_ID`: where questions are read from.
3. Check `QUESTIONS_SHEET_NAME` matches the responses tab name, usually `Form Responses 1`.
4. Choose **Deploy → New deployment → Web app**, with Execute as *Me* and Who has access *Anyone*. Approve the permissions.
5. Copy the new `/exec` URL. Open it in a browser; you should see the questions as text (JSON).

The live game's script and URL are not touched by any of this.

### 3. Create the new GitHub repo

1. On GitHub, create a new repo, e.g. `nusteli/libbie-web`. Make it **Public** with no template.
2. Upload these files to it:
   - `index.html`
   - `style.css`
   - `app.js`
   - `demo.json`
   - the `assets/` folder
   - optionally `README.md` and `apps-script/`
3. In `app.js`, change two settings:
   - Set `API_URL` to the new `/exec` URL.
   - Set `STAFF_PIN` to your PIN (currently `1234`).
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

**Putting a question in a quiz:** there are two ways, and you can use either or both.
- In the **EventKey** cell, type the quiz name. To use the question in several quizzes, separate the names with commas: `OpenHouse2026, NUS120`.
- Or add a column to the responses tab headed **`Quiz: YourQuizName`**, insert checkboxes in it (Insert → Checkbox), and tick the questions you want. This is the easiest way to build a quiz from existing questions. If the script is attached to the sheet, the **Libbie → New quiz** menu does this for you.

**Optional settings tab:** add a tab called **`Quizzes`** with these headers:

| Quiz | Title | QR Image URL | QR Caption | Hide |
|---|---|---|---|---|

- **Title:** shown on the board instead of the key.
- **QR Image URL:** shown after each answer.
- **Hide:** a checkbox that removes old quizzes from the dropdown without deleting anything.

**Running it at an event:**
1. Tap the gear and enter the PIN.
2. Pick the quiz and background.
3. Open **Staff tools** to copy a link like `…/libbieslc/?quiz=OpenHouse2026&bg=pink`.
4. Open that link on the event screen; it skips setup.

**Problems with questions?** Staff tools lists them, e.g. "Row 17: correct answer doesn't match any choice". So does **Libbie → Check questions** in the sheet.

## Settings in `app.js`

| Setting | What it does |
|---|---|
| `API_URL` | The Apps Script `/exec` URL |
| `STAFF_PIN` | PIN for the gear button |
| `MAX_DOORS_PER_ROUND` | Most doors on screen at once (30) |
| `MAX_DOOR_HEIGHT_SHARE` | Biggest a door can get, as a share of screen height |
| `DEFAULT_BACKGROUND` | blue, green, orange, pink, purple, yellow or grey |
| `LOG_ANSWERS` | Turn sheet logging on or off |
