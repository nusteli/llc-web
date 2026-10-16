// =========================================================
// Libbie's Library Challenge — settings
// This is the only file you need to edit.
// =========================================================
window.LIBBIE_CONFIG = {
  // Apps Script web app (/exec URL) from the new deployment of Code.gs.
  API_URL: "https://script.google.com/macros/s/AKfycbyRIVGS83GBNQB5SpgJ7fsiRC-SHUWWmeVLCmJeARRNXDku2i7hPxAvfqga1lxp8NIzmQ/exec",

  // PIN for the gear button (event setup). The Quiz Builder has its own
  // PIN, set inside the Apps Script, so it never appears here.
  STAFF_PIN: "1234",

  // Most doors shown at once. Bigger quizzes are split into even rounds,
  // e.g. 40 questions → two rounds of 20, moved between with Refresh.
  MAX_DOORS_PER_ROUND: 30,

  // Largest a single door gets, as a share of the board's height.
  MAX_DOOR_HEIGHT_SHARE: 0.4,

  // blue, green, orange, pink, purple, yellow or grey
  DEFAULT_BACKGROUND: "blue",

  // Send each answer to the results spreadsheet.
  LOG_ANSWERS: true
};
