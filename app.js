/* =========================================================================
   Q.U.I.L.L — a private journal that talks back.
   Single-page app: onboarding, a lock screen, a menu, a private local-only Journal,
   an AI-backed Talk to Quill (text + voice), and a lighter chat mode.
   ========================================================================= */

/* ---------- Backend: Groq's free chat tier (OpenAI-compatible) ---------- */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const EMBEDDED_API_KEY = "__GROQ_API_KEY_PLACEHOLDER__";
function getApiKey() {
  return EMBEDDED_API_KEY.startsWith("__") ? null : EMBEDDED_API_KEY;
}

const SYSTEM_PROMPT =
  "You are Quill, a warm, easygoing companion inside a private journaling app. Talk like a normal, caring friend - casual, matching the length and energy of what the person sends. Don't treat every " +
  "message like a crisis; most of the time people just want to talk about their day, vent a little, or think out loud. Only shift into a softer, gentler, more supportive tone when the person actually shares " +
  "something heavy (loneliness, grief, hopelessness, self-doubt, and so on) - and even then, stay natural, " +
  "never clinical or therapist-sounding. Never lecture, never give numbered advice lists. If the person " +
  "expresses thoughts of self-harm, suicide, or being in danger, respond with direct warmth and stay present " +
  "with them. The app already shows a crisis resource separately when this happens, so don't repeat a hotline " +
  "number yourself - just gently encourage them to reach out to that resource and to someone they trust in " +
  "real life, once, without turning it into a lecture. You're glad to be here, but you're alongside the people in " +
  "someone's life, not a replacement for them. When someone seems stuck in a spiral or a harsh thought about " +
  "themselves, gently offer another way to look at it - a genuine, caring reframe, not a clinical exercise or " +
  "numbered steps. Ask it like a friend would ('is there another way to see that?' or 'what would you tell a " +
  "friend who said that about themselves?'), not like a worksheet - and only when it actually fits, not every time.";

const LIGHT_SYSTEM_PROMPT =
  "You are Quill in a lighter mood - easy banter, gentle humor, small talk, a good way to ease into the day. " +
  "Keep replies short, playful and warm. The moment the conversation turns serious or heavy, drop the humor " +
  "immediately and respond with the same care as a genuine friend, no jokes.";

const WIND_DOWN_SYSTEM_PROMPT =
  "You are Quill in wind-down mode - it's the end of the day and the person just wants to ease into rest. " +
  "Keep replies short, soft, and unhurried, like a quiet bedtime chat with a friend. No jokes, no hype, no " +
  "advice lists - just calm, warm presence. If something heavy comes up, respond with the same care as always, " +
  "gently, without turning it into a big discussion right before bed.";

const REFLECTION_PROMPTS = [
  "What's one thing that felt heavy today?",
  "What's something you're looking forward to?",
  "What's a small moment today you don't want to forget?",
  "What's been on your mind lately, even if it seems small?",
  "What's something you're proud of this week?",
  "Who or what made today a little easier?",
  "What would you tell a friend who had the day you just had?",
  "What's something you've been avoiding thinking about?"
];

function getRandomPrompt() {
  return REFLECTION_PROMPTS[Math.floor(Math.random() * REFLECTION_PROMPTS.length)];
}

const CRISIS_PHRASES = [
  "kill myself", "suicide", "end my life", "want to die", "ending it all",
  "hurt myself", "harm myself", "self harm", "self-harm", "no reason to live",
  "better off dead", "can't go on", "cant go on", "not worth living"
];
const CARE_NOTE_TEXT =
  "That sounds like a lot to carry. If you're thinking about harming yourself or feel unsafe right now, please reach out to a crisis line - findahelpline.com can point you to one wherever you are. And if there's someone in your life you trust, they'd probably want to hear from you too.";

function detectCrisis(text) {
  const lower = text.toLowerCase();
  return CRISIS_PHRASES.some(phrase => lower.includes(phrase));
}

// Repeating the exact same care note back-to-back in one heavy conversation reads
// as robotic rather than caring - so it only re-shows after a quiet stretch.
const CARE_NOTE_COOLDOWN_MS = 10 * 60 * 1000;
const lastCareNoteAt = {};
function canShowCareNote(logId) {
  return Date.now() - (lastCareNoteAt[logId] || 0) > CARE_NOTE_COOLDOWN_MS;
}
function markCareNoteShown(logId) {
  lastCareNoteAt[logId] = Date.now();
}

const CRISIS_CLASSIFIER_PROMPT =
  "You are a safety classifier, not a conversational assistant. Reply with exactly one word, " +
  "YES or NO, and nothing else. Reply YES if the following message indicates the person may be " +
  "at risk of self-harm, suicide, or is in danger. Reply NO otherwise.";

// A second, dedicated model call - separate from Quill's actual reply - so the check stays a
// reliable single-word classification instead of a fragile marker embedded in conversational prose.
async function checkCrisisWithModel(text) {
  const key = getApiKey();
  if (!key) return false;
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: CRISIS_CLASSIFIER_PROMPT },
          { role: "user", content: text }
        ],
        max_tokens: 3
      })
    });
    if (!res.ok) return false;
    const data = await res.json();
    const answer = (data.choices[0].message.content || "").trim().toUpperCase();
    return answer.indexOf("YES") === 0;
  } catch (e) {
    return false;
  }
}

const GROQ_TIMEOUT_MS = 20000;

async function callGroq(systemPrompt, history) {
  const key = getApiKey();
  if (!key) throw new Error("no-api-key");

  const messages = [{ role: "system", content: systemPrompt }]
    .concat(history.map(m => ({ role: m.role, content: m.content })));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify({ model: MODEL, messages: messages }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("groq-timeout");
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error("groq-error-" + res.status);
  const data = await res.json();
  return data.choices[0].message.content;
}

// A brief toast-style status line that fades and clears itself, instead of
// sitting there statically until the user happens to navigate away.
function showStatus(elId, text, ms) {
  const el = document.getElementById(elId);
  clearTimeout(el._fadeTimeoutId);
  clearTimeout(el._clearTimeoutId);
  el.classList.remove("fading");
  el.textContent = text;
  el._fadeTimeoutId = setTimeout(() => {
    el.classList.add("fading");
    el._clearTimeoutId = setTimeout(() => {
      el.textContent = "";
      el.classList.remove("fading");
    }, 400);
  }, ms || 3000);
}

/* ---------- Keep the app frame sized to the space actually visible above
   the on-screen keyboard, instead of the full layout viewport, so the
   keyboard covers content rather than squashing/shifting it ---------- */
function syncAppHeight() {
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-height", vh + "px");
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncAppHeight);
  window.visualViewport.addEventListener("scroll", syncAppHeight);
}
syncAppHeight();

/* ---------- Orientation: locked to portrait while the passcode screen is
   up, free to rotate everywhere else in the app. Best-effort - the Screen
   Orientation API isn't available in every browser (notably iOS Safari),
   so this quietly does nothing there instead of erroring. ---------- */
function lockPortraitOrientation() {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock("portrait").catch(() => {});
  }
}
function unlockOrientation() {
  if (screen.orientation && screen.orientation.unlock) {
    try { screen.orientation.unlock(); } catch (e) {}
  }
}

/* ---------- Screen navigation ---------- */
function openScreen(id) {
  const previousActive = document.querySelector(".screen.active");
  if (previousActive && previousActive.id === "settingsScreen" && id !== "settingsScreen") {
    document.getElementById("passcodeStatus").textContent = "";
    document.getElementById("dataStatus").textContent = "";
  }
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  if (id === "lockScreen") lockPortraitOrientation();
  else unlockOrientation();
  const chrome = id !== "lockScreen" && id !== "onboardingScreen";
  document.getElementById("lockNowBtn").hidden = !chrome;
  syncTabBar(id, chrome);

  if (id === "menuScreen") {
    renderWeekStrip();
  } else if (id === "talkScreen") {
    resetTalkMode();
    talkPromptBtn.disabled = talkInput.value.trim().length > 0;
  } else if (id === "privateJournalScreen") {
    renderJournalList();
  } else if (id === "entriesScreen") {
    document.getElementById("entrySearch").value = "";
    resetEntriesView();
    renderEntriesScreen("");
  } else if (id === "calendarScreen") {
    calendarMonth = new Date();
    renderCalendarMonth();
  } else if (id === "settingsScreen") {
    renderThemeToggle();
    renderFontSizeToggle();
    populateVoiceSelect();
    document.getElementById("rateSlider").value = loadRate();
    renderRateValue();
  }
}

document.querySelectorAll("[data-screen]").forEach(el => {
  el.addEventListener("click", () => openScreen(el.dataset.screen));
});

/* ---------- Global bottom tab bar ---------- */
const TAB_SCREEN_MAP = {
  privateJournalScreen: "privateJournalScreen",
  journalEditorScreen: "privateJournalScreen",
  talkScreen: "talkScreen",
  entriesScreen: "entriesScreen",
  calendarScreen: "calendarScreen",
  settingsScreen: "settingsScreen"
};
function syncTabBar(id, chrome) {
  const tabBar = document.getElementById("tabBar");
  tabBar.hidden = !chrome;
  const activeTab = TAB_SCREEN_MAP[id];
  document.querySelectorAll("#tabBar .tabBtn").forEach(btn => {
    btn.classList.toggle("activeTab", btn.dataset.screen === activeTab);
  });
}

/* ---------- Storage keys ----------
   Everything Quill persists, in one place. forgotPasscode() wipes an explicit
   subset of these (content + security bookkeeping) - not theme/fontSize/voice/rate,
   which are device preferences, not things "Quill remembers about you". */
const STORAGE_KEYS = {
  pinHash: "quill_pin_hash",
  talk: "quill_journal", // the Talk-to-Quill conversation (text + voice share one thread)
  privateJournal: "quill_private_journal", // fully local, never sent anywhere
  light: "quill_light",
  moods: "quill_moods",
  favorites: "quill_favorites",
  theme: "quill_theme",
  fontSize: "quill_font_size",
  voice: "quill_voice",
  rate: "quill_rate",
  failedAttempts: "quill_failed_attempts",
  lockoutUntil: "quill_lockout_until"
};

/* ---------- Passcode lock ---------- */
const PIN_LEN = 6;

const lockScreenEl = document.getElementById("lockScreen");
const lockSubEl = document.getElementById("lockSub");
const pinDotsEl = document.getElementById("pinDots");
const pinErrorEl = document.getElementById("pinError");
const unlockBtn = document.getElementById("unlockBtn");
const forgotKeyEl = document.getElementById("forgotKey");
const cancelChangeBtn = document.getElementById("cancelChangeBtn");
const keypadEl = document.getElementById("keypad");

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;
let lockoutIntervalId = null;

const lockoutRingEl = document.getElementById("lockoutRing");
const lockoutRingFgEl = document.getElementById("lockoutRingFg");
const lockoutRingTextEl = document.getElementById("lockoutRingText");
const LOCKOUT_RING_CIRC = 2 * Math.PI * 19;
lockoutRingFgEl.style.strokeDasharray = String(LOCKOUT_RING_CIRC);

function recordFailedAttempt() {
  const next = (parseInt(localStorage.getItem(STORAGE_KEYS.failedAttempts), 10) || 0) + 1;
  if (next >= MAX_ATTEMPTS) {
    localStorage.setItem(STORAGE_KEYS.lockoutUntil, String(Date.now() + LOCKOUT_MS));
    localStorage.setItem(STORAGE_KEYS.failedAttempts, "0");
  } else {
    localStorage.setItem(STORAGE_KEYS.failedAttempts, String(next));
  }
}
function clearFailedAttempts() {
  localStorage.removeItem(STORAGE_KEYS.failedAttempts);
  localStorage.removeItem(STORAGE_KEYS.lockoutUntil);
}
function getLockoutRemaining() {
  const until = parseInt(localStorage.getItem(STORAGE_KEYS.lockoutUntil), 10) || 0;
  return Math.max(0, until - Date.now());
}

// Returns true (and shows/keeps showing the countdown) while a lockout is active
// in a state where a passcode is actually being verified; false otherwise.
function updateLockoutUI() {
  const verifying = lockState === "unlock" || lockState === "change-verify";
  const remaining = verifying ? getLockoutRemaining() : 0;
  if (remaining <= 0) {
    if (lockoutIntervalId) {
      clearInterval(lockoutIntervalId);
      lockoutIntervalId = null;
    }
    if (pinErrorEl.textContent.indexOf("Too many attempts") === 0) {
      pinErrorEl.textContent = "";
    }
    unlockBtn.disabled = false;
    keypadEl.classList.remove("locked");
    lockoutRingEl.hidden = true;
    return false;
  }
  const seconds = Math.ceil(remaining / 1000);
  pinErrorEl.textContent = "Too many attempts. Try again in " + seconds + "s.";
  unlockBtn.disabled = true;
  keypadEl.classList.add("locked");
  lockoutRingEl.hidden = false;
  lockoutRingTextEl.textContent = String(seconds);
  const fraction = remaining / LOCKOUT_MS;
  lockoutRingFgEl.style.strokeDashoffset = String(LOCKOUT_RING_CIRC * (1 - fraction));
  if (!lockoutIntervalId) lockoutIntervalId = setInterval(updateLockoutUI, 1000);
  return true;
}

let currentPin = "";
let pendingFirstPin = null;
// "setup" -> no passcode saved yet, choosing one for the first time
// "confirm" -> re-enter the passcode just chosen, to confirm it matches
// "unlock" -> a passcode already exists, waiting for it to be entered
// "change-verify" -> changing passcode: must enter the current one first
// "change-new" -> changing passcode: choosing the new one
// "change-confirm" -> changing passcode: re-entering the new one to confirm
let lockState = localStorage.getItem(STORAGE_KEYS.pinHash) ? "unlock" : "setup";
document.getElementById(lockState === "setup" ? "onboardingScreen" : "lockScreen").classList.add("active");
if (lockState === "unlock") lockPortraitOrientation();

// A brief branded splash, like a native app cold-starting - shown for a beat
// even though the real screen underneath is already ready, then faded out.
const splashScreenEl = document.getElementById("splashScreen");
setTimeout(() => {
  splashScreenEl.classList.add("splashHide");
  setTimeout(() => splashScreenEl.remove(), 400);
}, 700);

document.getElementById("onboardingStartBtn").addEventListener("click", () => {
  openScreen("lockScreen");
});

async function hashPin(pin) {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function renderLockSub() {
  if (lockState === "setup") {
    lockSubEl.textContent = "Choose a passcode (6 digits)";
    unlockBtn.textContent = "Continue";
  } else if (lockState === "confirm") {
    lockSubEl.textContent = "Confirm your passcode";
    unlockBtn.textContent = "Save passcode";
  } else if (lockState === "change-verify") {
    lockSubEl.textContent = "Enter your current passcode";
    unlockBtn.textContent = "Continue";
  } else if (lockState === "change-new") {
    lockSubEl.textContent = "Choose a new passcode (6 digits)";
    unlockBtn.textContent = "Continue";
  } else if (lockState === "change-confirm") {
    lockSubEl.textContent = "Confirm your new passcode";
    unlockBtn.textContent = "Save passcode";
  } else {
    lockSubEl.textContent = "Dear diary, only you may enter.";
    unlockBtn.textContent = "Unlock";
  }
  const isChanging = lockState.indexOf("change-") === 0;
  cancelChangeBtn.hidden = !isChanging;
  forgotKeyEl.hidden = isChanging;
  updateLockoutUI();
}

function renderDots() {
  pinDotsEl.innerHTML = "";
  for (let i = 0; i < PIN_LEN; i++) {
    const dot = document.createElement("div");
    dot.className = i < currentPin.length ? "dot filled" : "dot";
    pinDotsEl.appendChild(dot);
  }
}

function shakeLock() {
  lockScreenEl.classList.remove("shake");
  void lockScreenEl.offsetWidth;
  lockScreenEl.classList.add("shake");
}

function resetToFreshSetup() {
  lockState = "setup";
  pendingFirstPin = null;
  currentPin = "";
  renderLockSub();
  renderDots();
}

async function submitPin() {
  if (updateLockoutUI()) return;

  if (currentPin.length < PIN_LEN) {
    pinErrorEl.textContent = "Passcode must be " + PIN_LEN + " digits.";
    return;
  }

  if (lockState === "setup") {
    pendingFirstPin = currentPin;
    currentPin = "";
    lockState = "confirm";
    pinErrorEl.textContent = "";
    renderLockSub();
    renderDots();
    return;
  }

  if (lockState === "confirm") {
    if (currentPin !== pendingFirstPin) {
      pinErrorEl.textContent = "Those didn't match - let's try again.";
      shakeLock();
      resetToFreshSetup();
      return;
    }
    localStorage.setItem(STORAGE_KEYS.pinHash, await hashPin(currentPin));
    lockState = "unlock";
    currentPin = "";
    openScreen("menuScreen");
    return;
  }

  if (lockState === "change-verify") {
    const enteredHash = await hashPin(currentPin);
    if (enteredHash === localStorage.getItem(STORAGE_KEYS.pinHash)) {
      clearFailedAttempts();
      currentPin = "";
      lockState = "change-new";
      pinErrorEl.textContent = "";
      renderLockSub();
      renderDots();
    } else {
      recordFailedAttempt();
      pinErrorEl.textContent = "Incorrect passcode.";
      shakeLock();
      currentPin = "";
      renderDots();
      updateLockoutUI();
    }
    return;
  }

  if (lockState === "change-new") {
    pendingFirstPin = currentPin;
    currentPin = "";
    lockState = "change-confirm";
    pinErrorEl.textContent = "";
    renderLockSub();
    renderDots();
    return;
  }

  if (lockState === "change-confirm") {
    if (currentPin !== pendingFirstPin) {
      pinErrorEl.textContent = "Those didn't match - let's try again.";
      shakeLock();
      currentPin = "";
      pendingFirstPin = null;
      lockState = "change-new";
      renderLockSub();
      renderDots();
      return;
    }
    localStorage.setItem(STORAGE_KEYS.pinHash, await hashPin(currentPin));
    currentPin = "";
    pendingFirstPin = null;
    lockState = "unlock";
    pinErrorEl.textContent = "";
    showStatus("passcodeStatus", "Passcode updated.");
    openScreen("settingsScreen");
    return;
  }

  // lockState === "unlock"
  const enteredHash = await hashPin(currentPin);
  if (enteredHash === localStorage.getItem(STORAGE_KEYS.pinHash)) {
    clearFailedAttempts();
    currentPin = "";
    renderDots();
    openScreen("menuScreen");
  } else {
    recordFailedAttempt();
    pinErrorEl.textContent = "Incorrect passcode.";
    shakeLock();
    currentPin = "";
    renderDots();
    updateLockoutUI();
  }
}

const CONTENT_STORAGE_KEYS = [
  STORAGE_KEYS.pinHash,
  STORAGE_KEYS.talk,
  STORAGE_KEYS.privateJournal,
  STORAGE_KEYS.light,
  STORAGE_KEYS.moods,
  STORAGE_KEYS.favorites,
  STORAGE_KEYS.failedAttempts,
  STORAGE_KEYS.lockoutUntil
];

function wipeAllContent() {
  CONTENT_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  mainHistory = [];
  lightHistory = [];
  journalNotes = [];
  moods = {};
  favorites = [];
}

function forgotPasscode() {
  document.getElementById("forgotConfirmOverlay").classList.add("open");
}

document.getElementById("forgotCancelBtn").addEventListener("click", () => {
  cancelHoldConfirm();
  document.getElementById("forgotConfirmOverlay").classList.remove("open");
});

document.getElementById("forgotConfirmOverlay").addEventListener("click", e => {
  if (e.target.id === "forgotConfirmOverlay") {
    cancelHoldConfirm();
    e.target.classList.remove("open");
  }
});

document.getElementById("forgotExportBtn").addEventListener("click", exportEntries);

// A single tap here permanently erases the diary, so it takes a deliberate hold
// (not a tap) to guard against a panic-tap wipe.
const HOLD_CONFIRM_MS = 1300;
const forgotConfirmBtn = document.getElementById("forgotConfirmBtn");
let holdConfirmTimeoutId = null;

function cancelHoldConfirm() {
  clearTimeout(holdConfirmTimeoutId);
  forgotConfirmBtn.classList.remove("holding");
}

forgotConfirmBtn.addEventListener("pointerdown", () => {
  forgotConfirmBtn.classList.add("holding");
  holdConfirmTimeoutId = setTimeout(() => {
    forgotConfirmBtn.classList.remove("holding");
    document.getElementById("forgotConfirmOverlay").classList.remove("open");
    wipeAllContent();
    resetToFreshSetup();
  }, HOLD_CONFIRM_MS);
});
forgotConfirmBtn.addEventListener("pointerup", cancelHoldConfirm);
forgotConfirmBtn.addEventListener("pointerleave", cancelHoldConfirm);
forgotConfirmBtn.addEventListener("pointercancel", cancelHoldConfirm);

document.getElementById("keypad").addEventListener("click", e => {
  const key = e.target.closest(".key")?.dataset.key;
  if (!key) return;
  if (updateLockoutUI()) return;

  pinErrorEl.textContent = "";
  if (key === "back") {
    currentPin = currentPin.slice(0, -1);
  } else if (key === "forgot") {
    forgotPasscode();
    return;
  } else if (currentPin.length < PIN_LEN) {
    currentPin += key;
  }
  renderDots();

  // Auto-submit the moment the passcode is fully entered - no need to also tap
  // Unlock/Continue/Save, matching how a native passcode screen behaves. A short
  // delay lets the last dot actually fill in before the screen moves on.
  if (currentPin.length === PIN_LEN) {
    setTimeout(submitPin, 150);
  }
});
unlockBtn.addEventListener("click", submitPin);

document.getElementById("lockNowBtn").addEventListener("click", () => {
  currentPin = "";
  lockState = "unlock";
  pinErrorEl.textContent = "";
  renderLockSub();
  renderDots();
  openScreen("lockScreen");
});

function startChangePasscode() {
  currentPin = "";
  pendingFirstPin = null;
  lockState = "change-verify";
  pinErrorEl.textContent = "";
  renderLockSub();
  renderDots();
  openScreen("lockScreen");
}
document.getElementById("changePasscodeBtn").addEventListener("click", startChangePasscode);

cancelChangeBtn.addEventListener("click", () => {
  currentPin = "";
  pendingFirstPin = null;
  lockState = "unlock";
  pinErrorEl.textContent = "";
  renderLockSub();
  renderDots();
  openScreen("settingsScreen");
});

renderLockSub();
renderDots();

/* ---------- Conversation storage ---------- */
function loadHistory(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function saveHistory(key, history) {
  localStorage.setItem(key, JSON.stringify(history));
}

let mainHistory = loadHistory(STORAGE_KEYS.talk);
let lightHistory = loadHistory(STORAGE_KEYS.light);

const MOOD_LEVELS = [1, 2, 3, 4, 5];
// Screen-reader labels only - the visible design stays icon-only, no text legend.
const MOOD_LABELS = { 1: "Rough", 2: "Low", 3: "Okay", 4: "Good", 5: "Great" };
const MOOD_COLOR_VARS = { 1: "var(--mood-1)", 2: "var(--mood-2)", 3: "var(--mood-3)", 4: "var(--mood-4)", 5: "var(--mood-5)" };

function loadMoods() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.moods);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function saveMoods() {
  localStorage.setItem(STORAGE_KEYS.moods, JSON.stringify(moods));
}
let moods = loadMoods();

function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.favorites);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function saveFavorites() {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
}
let favorites = loadFavorites();

function isFavorite(dayKey) {
  return favorites.indexOf(dayKey) !== -1;
}
function toggleFavorite(dayKey) {
  const idx = favorites.indexOf(dayKey);
  if (idx === -1) favorites.push(dayKey);
  else favorites.splice(idx, 1);
  saveFavorites();
}

/* ---------- Rendering messages into a chat log ---------- */
const lastDividerDay = {};

function dayKeyOf(ts) {
  const d = new Date(ts);
  return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
}
function formatDayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKeyOf(ts) === dayKeyOf(today)) return "Today";
  if (dayKeyOf(ts) === dayKeyOf(yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function maybeAppendDivider(logEl, logId, ts) {
  const key = dayKeyOf(ts);
  if (lastDividerDay[logId] === key) return;
  lastDividerDay[logId] = key;
  const div = document.createElement("div");
  div.className = "dateDivider";
  div.dataset.dayKey = key;
  div.textContent = formatDayLabel(ts);
  logEl.appendChild(div);
}

function appendMessage(logId, role, text, ts) {
  ts = ts || Date.now();
  const logEl = document.getElementById(logId);
  const existingEmpty = logEl.querySelector(".emptyState");
  if (existingEmpty) existingEmpty.remove();
  maybeAppendDivider(logEl, logId, ts);
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  return div;
}

function appendCareNote(logId) {
  const logEl = document.getElementById(logId);
  const div = document.createElement("div");
  div.className = "careNote";
  div.textContent = CARE_NOTE_TEXT;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  return div;
}

function appendThinking(logId) {
  const logEl = document.getElementById(logId);
  const div = document.createElement("div");
  div.className = "msg quill";
  div.innerHTML = '<span class="thinkingDots"><span></span><span></span><span></span></span>';
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  return div;
}

function renderLog(logId, history, emptyText) {
  const logEl = document.getElementById(logId);
  logEl.innerHTML = "";
  lastDividerDay[logId] = null;
  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "emptyState";
    empty.textContent = emptyText || "";
    logEl.appendChild(empty);
    return;
  }
  history.forEach(m => appendMessage(logId, m.role === "user" ? "user" : "quill", m.content, m.ts));
}

/* ---------- Sending a message (shared by Talk to Quill and Light chat) ---------- */
function appendErrorWithRetry(logId, text, onRetry) {
  const logEl = document.getElementById(logId);
  const wrap = document.createElement("div");
  wrap.className = "msg system errorWithRetry";
  const textSpan = document.createElement("span");
  textSpan.textContent = text;
  wrap.appendChild(textSpan);
  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "retryBtn";
  retryBtn.textContent = "Try again";
  retryBtn.addEventListener("click", () => {
    wrap.remove();
    onRetry();
  });
  wrap.appendChild(retryBtn);
  logEl.appendChild(wrap);
  logEl.scrollTop = logEl.scrollHeight;
  return wrap;
}

async function attemptReply(logId, history, storageKey, systemPrompt, speakReply) {
  const thinkingEl = appendThinking(logId);
  try {
    const reply = await callGroq(systemPrompt, history);
    thinkingEl.remove();
    appendMessage(logId, "quill", reply);
    history.push({ role: "assistant", content: reply, ts: Date.now() });
    saveHistory(storageKey, history);
    if (speakReply) speakText(reply);
  } catch (err) {
    thinkingEl.remove();
    const retry = () => attemptReply(logId, history, storageKey, systemPrompt, speakReply);
    if (err.message === "no-api-key") {
      appendMessage(logId, "system", "Quill's connection isn't set up on this deployment yet.");
    } else if (err.message === "groq-timeout") {
      appendErrorWithRetry(logId, "That's taking longer than expected.", retry);
    } else {
      appendErrorWithRetry(logId, "Couldn't reach Quill just now.", retry);
    }
  }
}

async function sendToQuill(text, logId, history, storageKey, systemPrompt, speakReply) {
  appendMessage(logId, "user", text);
  history.push({ role: "user", content: text, ts: Date.now() });
  saveHistory(storageKey, history);

  let careNoteShown = detectCrisis(text) && canShowCareNote(logId);
  if (careNoteShown) {
    appendCareNote(logId);
    markCareNoteShown(logId);
  }
  // Model-based backstop, fire-and-forget: catches indirect phrasing/typos the
  // keyword list misses. Runs in parallel, never blocks or delays Quill's reply.
  checkCrisisWithModel(text).then(isCrisis => {
    if (isCrisis && !careNoteShown && canShowCareNote(logId)) {
      careNoteShown = true;
      appendCareNote(logId);
      markCareNoteShown(logId);
    }
  });

  await attemptReply(logId, history, storageKey, systemPrompt, speakReply);
}

/* ---------- Journal: private, local-only notes (no network calls at all) ----------
   A shelf of separate notes, Notes-app style, rather than one append-only log -
   any note can be reopened and edited later. Titles/previews are always derived
   live from a note's content (first line / rest), never stored, so an edited
   first line can't drift out of sync with a separately-saved title. */
function deriveNoteTitle(content) {
  const firstLine = (content || "").split("\n")[0].trim();
  return firstLine ? truncate(firstLine, 60) : "Untitled note";
}
function deriveNotePreview(content) {
  const rest = (content || "").split("\n").slice(1).join(" ").trim();
  return rest ? truncate(rest, 70) : "";
}

function generateNoteId() {
  return "n_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// Old data was one flat, ever-growing array of {content, ts}. Migrates each
// old entry into its own independently-editable note. Guarded by "already has
// an id", so this is idempotent and safe to run on every load.
function migratePrivateJournal(raw) {
  let changed = false;
  const migrated = raw.map(item => {
    if (item && typeof item.id === "string") return item;
    changed = true;
    const ts = (item && item.ts) || Date.now();
    return { id: generateNoteId(), content: (item && item.content) || "", createdAt: ts, updatedAt: ts };
  });
  return { migrated, changed };
}

function loadPrivateJournal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.privateJournal);
    const parsed = raw ? JSON.parse(raw) : [];
    const { migrated, changed } = migratePrivateJournal(parsed);
    if (changed) localStorage.setItem(STORAGE_KEYS.privateJournal, JSON.stringify(migrated));
    return migrated;
  } catch (e) {
    return [];
  }
}
function saveJournalNotes() {
  localStorage.setItem(STORAGE_KEYS.privateJournal, JSON.stringify(journalNotes));
}
let journalNotes = loadPrivateJournal();

function getJournalNote(id) {
  return journalNotes.find(n => n.id === id) || null;
}
function createJournalNote() {
  const note = { id: generateNoteId(), content: "", createdAt: Date.now(), updatedAt: Date.now() };
  journalNotes.push(note); // in-memory only until the first non-empty autosave
  return note;
}
function deleteJournalNote(id) {
  const idx = journalNotes.findIndex(n => n.id === id);
  if (idx !== -1) journalNotes.splice(idx, 1);
  saveJournalNotes();
}

function renderJournalList() {
  const listEl = document.getElementById("journalList");
  listEl.innerHTML = "";
  if (!journalNotes.length) {
    const empty = document.createElement("p");
    empty.className = "emptyState";
    empty.textContent = "Nothing written yet - tap + to start your first note.";
    listEl.appendChild(empty);
    return;
  }
  journalNotes.slice().sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach(note => listEl.appendChild(buildJournalCard(note)));
}

function buildJournalCard(note) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card journalCard local";

  const dateEl = document.createElement("div");
  dateEl.className = "journalCardDate";
  dateEl.textContent = formatDayLabel(note.updatedAt);
  card.appendChild(dateEl);

  const titleEl = document.createElement("div");
  titleEl.className = "journalCardTitle";
  titleEl.textContent = deriveNoteTitle(note.content);
  card.appendChild(titleEl);

  const preview = deriveNotePreview(note.content);
  if (preview) {
    const previewEl = document.createElement("div");
    previewEl.className = "journalCardPreview";
    previewEl.textContent = preview;
    card.appendChild(previewEl);
  }

  card.addEventListener("click", () => openJournalNote(note.id));
  return card;
}

// Grows a compose textarea to fit its content (WhatsApp-style), up to the
// max-height set in CSS - beyond that it scrolls internally like any textarea.
function autoGrowTextarea(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

const journalEditorInput = document.getElementById("journalEditorInput");
let currentJournalNoteId = null;
let currentJournalNoteIsNew = false; // true until the note's first non-empty autosave

function openJournalNote(id) {
  currentJournalNoteId = id;
  currentJournalNoteIsNew = false;
  const note = getJournalNote(id);
  journalEditorInput.value = note ? note.content : "";
  syncJournalEditorPromptBtn();
  if (note) maybeShowJournalMoodPrompt(note);
  openScreen("journalEditorScreen");
}

function openNewJournalNote() {
  const note = createJournalNote();
  currentJournalNoteId = note.id;
  currentJournalNoteIsNew = true;
  journalEditorInput.value = "";
  syncJournalEditorPromptBtn();
  maybeShowJournalMoodPrompt(note);
  openScreen("journalEditorScreen");
  journalEditorInput.focus();
}

let journalAutosaveTimer = null;
const JOURNAL_AUTOSAVE_DEBOUNCE_MS = 400;

function flushJournalEditorSave() {
  clearTimeout(journalAutosaveTimer);
  if (currentJournalNoteId == null) return;
  const text = journalEditorInput.value;
  const note = getJournalNote(currentJournalNoteId);
  if (!note) return;

  if (!text.trim() && currentJournalNoteIsNew) {
    // A brand-new note left blank is discarded rather than saved empty.
    const idx = journalNotes.findIndex(n => n.id === currentJournalNoteId);
    if (idx !== -1) journalNotes.splice(idx, 1);
    return;
  }

  note.content = text;
  note.updatedAt = Date.now();
  const wasNew = currentJournalNoteIsNew;
  currentJournalNoteIsNew = false;
  saveJournalNotes();
  if (wasNew || text.trim()) maybeShowJournalMoodPrompt(note);
}

journalEditorInput.addEventListener("input", () => {
  syncJournalEditorPromptBtn();
  clearTimeout(journalAutosaveTimer);
  journalAutosaveTimer = setTimeout(flushJournalEditorSave, JOURNAL_AUTOSAVE_DEBOUNCE_MS);
});

document.getElementById("journalEditorBackBtn").addEventListener("click", () => {
  flushJournalEditorSave();
  currentJournalNoteId = null;
  openScreen("privateJournalScreen");
});

document.getElementById("journalNewBtn").addEventListener("click", openNewJournalNote);

/* ---------- Journal: delete a note ---------- */
document.getElementById("journalDeleteBtn").addEventListener("click", () => {
  document.getElementById("journalDeleteConfirmOverlay").classList.add("open");
});
document.getElementById("journalDeleteCancelBtn").addEventListener("click", () => {
  document.getElementById("journalDeleteConfirmOverlay").classList.remove("open");
});
document.getElementById("journalDeleteConfirmOverlay").addEventListener("click", e => {
  if (e.target.id === "journalDeleteConfirmOverlay") e.target.classList.remove("open");
});
document.getElementById("journalDeleteConfirmBtn").addEventListener("click", () => {
  clearTimeout(journalAutosaveTimer);
  document.getElementById("journalDeleteConfirmOverlay").classList.remove("open");
  if (currentJournalNoteId != null) deleteJournalNote(currentJournalNoteId);
  currentJournalNoteId = null;
  openScreen("privateJournalScreen");
});

// Prompts for today's mood right after a save, since that's when a person is
// already thinking about how the day went - skipped if today's mood is
// already set, or once dismissed, so it never nags more than once a day.
// Only fires for notes created today - editing an older note shouldn't ask
// about today's mood.
let journalMoodPromptDismissed = false;
const journalMoodPromptEl = document.getElementById("journalMoodPrompt");
const journalMoodPromptDotsEl = document.getElementById("journalMoodPromptDots");

function maybeShowJournalMoodPrompt(note) {
  const todayKey = dayKeyOf(Date.now());
  if (dayKeyOf(note.createdAt) !== todayKey) { journalMoodPromptEl.hidden = true; return; }
  if (moods[todayKey] || journalMoodPromptDismissed) { journalMoodPromptEl.hidden = true; return; }
  journalMoodPromptDotsEl.innerHTML = "";
  MOOD_LEVELS.forEach(level => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "moodPickerDot";
    dot.setAttribute("aria-label", MOOD_LABELS[level]);
    dot.title = MOOD_LABELS[level];
    dot.appendChild(buildFaceIcon(level));
    dot.addEventListener("click", () => {
      moods[todayKey] = level;
      saveMoods();
      renderWeekStrip();
      journalMoodPromptEl.hidden = true;
    });
    journalMoodPromptDotsEl.appendChild(dot);
  });
  journalMoodPromptEl.hidden = false;
}
document.getElementById("journalMoodPromptSkip").addEventListener("click", () => {
  journalMoodPromptDismissed = true;
  journalMoodPromptEl.hidden = true;
});

const journalPromptBtn = document.getElementById("journalPromptBtn");
function syncJournalEditorPromptBtn() {
  journalPromptBtn.disabled = journalEditorInput.value.trim().length > 0;
}
journalPromptBtn.addEventListener("click", () => {
  if (journalEditorInput.value.trim()) return;
  journalEditorInput.value = getRandomPrompt();
  syncJournalEditorPromptBtn();
  journalEditorInput.focus();
  clearTimeout(journalAutosaveTimer);
  journalAutosaveTimer = setTimeout(flushJournalEditorSave, JOURNAL_AUTOSAVE_DEBOUNCE_MS);
});

/* ---------- Talk to Quill's Reflect/Light/Wind down mode state ----------
   The actual compose bar, send handler, and voice logic live further down
   in the Talk to Quill section, since they're shared across all three modes. */
const TALK_MODE_CONFIG = {
  reflect: { title: "Talk to Quill", placeholder: "Type, or tap the mic to talk...", history: () => mainHistory, storageKey: STORAGE_KEYS.talk, systemPrompt: SYSTEM_PROMPT, emptyText: "Nothing here yet - type, or tap the mic to talk to Quill." },
  light: { title: "A lighter page", placeholder: "Say hi...", history: () => lightHistory, storageKey: STORAGE_KEYS.light, systemPrompt: LIGHT_SYSTEM_PROMPT, emptyText: "Nothing here yet - say hi and see where it goes." },
  winddown: { title: "Wind down", placeholder: "Ease into the end of the day...", history: () => lightHistory, storageKey: STORAGE_KEYS.light, systemPrompt: WIND_DOWN_SYSTEM_PROMPT, emptyText: "Nothing here yet - ease into it whenever you're ready." }
};
let talkMode = "reflect";

/* ---------- Entries screen: timeline, search, mood ---------- */
function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const clean = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return clean.trimEnd() + "…";
}

function groupEntriesByDay(history) {
  const byDay = new Map();
  history.forEach(m => {
    const key = dayKeyOf(m.ts);
    if (!byDay.has(key)) byDay.set(key, { dayKey: key, ts: m.ts, preview: "" });
    if (m.role === "user" && !byDay.get(key).preview) byDay.get(key).preview = m.content;
  });
  return Array.from(byDay.values()).sort((a, b) => a.ts - b.ts);
}

// A short, invisible-to-the-user system-prompt addition so Quill isn't starting
// cold every conversation - just recent mood levels, not full entry content.
function buildMoodContext() {
  const recentDays = groupEntriesByDay(mainHistory).slice(-5);
  const withMood = recentDays.filter(day => moods[day.dayKey]);
  if (!withMood.length) return "";
  const parts = withMood.map(day => formatDayLabel(day.ts) + " " + MOOD_LABELS[moods[day.dayKey]]);
  return "Recent mood check-ins: " + parts.join(", ") + ".";
}

// Plain-language summary of the last 7 days' moods - no scoring, no clinical framing.
function buildWeeklyMoodTrend() {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - WEEK_MS;
  const recentDays = groupEntriesByDay(mainHistory).filter(day => day.ts >= cutoff && moods[day.dayKey]);
  if (!recentDays.length) return "";
  if (recentDays.length === 1) {
    return "This week: " + MOOD_LABELS[moods[recentDays[0].dayKey]] + ".";
  }
  const first = MOOD_LABELS[moods[recentDays[0].dayKey]];
  const last = MOOD_LABELS[moods[recentDays[recentDays.length - 1].dayKey]];
  return first === last
    ? "This week held steady around " + first + "."
    : "This week trended " + first + " → " + last + ".";
}

const MOOD_MOUTHS = {
  1: "M7,18 Q12,12 17,18",
  2: "M7,17 Q12,14.5 17,17",
  3: "M7,16 L17,16",
  4: "M7,15 Q12,17.5 17,15",
  5: "M7,14 Q12,19 17,14"
};

function buildFaceIcon(level) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.classList.add("moodFace");
  if (!level) svg.classList.add("unset");

  const eyeL = document.createElementNS(NS, "circle");
  eyeL.setAttribute("cx", "8.5");
  eyeL.setAttribute("cy", "9");
  eyeL.setAttribute("r", "1.3");
  eyeL.setAttribute("fill", "currentColor");
  svg.appendChild(eyeL);

  const eyeR = document.createElementNS(NS, "circle");
  eyeR.setAttribute("cx", "15.5");
  eyeR.setAttribute("cy", "9");
  eyeR.setAttribute("r", "1.3");
  eyeR.setAttribute("fill", "currentColor");
  svg.appendChild(eyeR);

  if (level) {
    const mouth = document.createElementNS(NS, "path");
    mouth.setAttribute("d", MOOD_MOUTHS[level]);
    mouth.setAttribute("fill", "none");
    mouth.setAttribute("stroke", "currentColor");
    mouth.setAttribute("stroke-width", "1.8");
    mouth.setAttribute("stroke-linecap", "round");
    svg.appendChild(mouth);
  }
  return svg;
}

// The last 7 calendar days, oldest first - independent of whether there's an
// entry that day, so it's a calm always-visible strip rather than something
// that pops in and out as history is written.
function renderWeekStrip() {
  const stripEl = document.getElementById("weekStrip");
  stripEl.innerHTML = "";
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dayKeyOf(d.getTime());
    const isToday = i === 0;
    const cell = document.createElement("div");
    cell.className = "weekStripDay" + (isToday ? " today" : "");
    const label = document.createElement("span");
    label.className = "weekStripLabel";
    label.textContent = d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1);
    cell.appendChild(label);
    const faceWrap = document.createElement("div");
    faceWrap.className = "weekStripFace" + (isToday ? " today" : "");
    faceWrap.appendChild(buildFaceIcon(moods[key]));
    cell.appendChild(faceWrap);
    stripEl.appendChild(cell);
  }
}
document.getElementById("weekStrip").addEventListener("click", () => openScreen("calendarScreen"));

function buildStarIcon() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.classList.add("starIcon");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", "M12 2.5l2.9 6.2 6.6.7-5 4.6 1.4 6.6L12 17.4 6.1 20.6l1.4-6.6-5-4.6 6.6-.7z");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("fill", "none");
  svg.appendChild(path);
  return svg;
}

function closeAllMoodPickers() {
  document.querySelectorAll(".moodPicker.open").forEach(p => p.classList.remove("open"));
}
document.addEventListener("click", e => {
  if (!e.target.closest(".entryCard")) closeAllMoodPickers();
});

function buildEntryCard(day) {
  const card = document.createElement("div");
  card.className = "card entryCard";

  const dateEl = document.createElement("div");
  dateEl.className = "entryDate";
  dateEl.textContent = formatDayLabel(day.ts);
  card.appendChild(dateEl);

  const previewEl = document.createElement("div");
  previewEl.className = "entryPreview";
  previewEl.textContent = day.preview ? truncate(day.preview, 70) : "(no written entry that day)";
  card.appendChild(previewEl);

  const picker = document.createElement("div");
  picker.className = "moodPicker";
  MOOD_LEVELS.forEach(level => {
    const pickBtn = document.createElement("button");
    pickBtn.type = "button";
    pickBtn.className = "moodPickerDot" + (moods[day.dayKey] === level ? " selected" : "");
    pickBtn.setAttribute("aria-label", MOOD_LABELS[level]);
    pickBtn.title = MOOD_LABELS[level];
    pickBtn.appendChild(buildFaceIcon(level));
    pickBtn.addEventListener("click", e => {
      e.stopPropagation();
      moods[day.dayKey] = level;
      saveMoods();
      renderEntriesScreen(entrySearchInput.value);
    });
    picker.appendChild(pickBtn);
  });
  card.appendChild(picker);

  const moodDot = document.createElement("button");
  moodDot.type = "button";
  moodDot.className = "entryMoodDot";
  const moodLabel = moods[day.dayKey] ? "Mood: " + MOOD_LABELS[moods[day.dayKey]] : "Set mood for this entry";
  moodDot.setAttribute("aria-label", moodLabel);
  moodDot.title = moodLabel;
  moodDot.appendChild(buildFaceIcon(moods[day.dayKey]));
  moodDot.addEventListener("click", e => {
    e.stopPropagation();
    const willOpen = !picker.classList.contains("open");
    closeAllMoodPickers();
    if (willOpen) picker.classList.add("open");
  });
  card.appendChild(moodDot);

  const favoriteBtn = document.createElement("button");
  favoriteBtn.type = "button";
  favoriteBtn.className = "entryFavoriteBtn" + (isFavorite(day.dayKey) ? " favorited" : "");
  favoriteBtn.setAttribute("aria-label", isFavorite(day.dayKey) ? "Remove from favorites" : "Add to favorites");
  favoriteBtn.appendChild(buildStarIcon());
  favoriteBtn.addEventListener("click", e => {
    e.stopPropagation();
    toggleFavorite(day.dayKey);
    renderEntriesScreen(entrySearchInput.value);
  });
  card.appendChild(favoriteBtn);

  card.addEventListener("click", () => openEntryDay(day.dayKey));
  return card;
}

function renderEntriesScreen(filterText) {
  const term = (filterText || "").trim().toLowerCase();
  const days = groupEntriesByDay(mainHistory);

  const trendText = buildWeeklyMoodTrend();
  const trendEl = document.getElementById("weeklyTrend");
  trendEl.textContent = trendText;
  trendEl.hidden = !trendText;

  const moodStripEl = document.getElementById("moodStrip");
  moodStripEl.innerHTML = "";
  days.forEach(day => {
    const face = buildFaceIcon(moods[day.dayKey]);
    face.classList.add("small");
    face.setAttribute("title", formatDayLabel(day.ts));
    moodStripEl.appendChild(face);
  });

  document.getElementById("moodTip").hidden = Object.keys(moods).length > 0;

  const visibleDays = days.filter(day => {
    if (showFavoritesOnly && !isFavorite(day.dayKey)) return false;
    if (term && !mainHistory.some(m => dayKeyOf(m.ts) === day.dayKey && m.content.toLowerCase().includes(term))) return false;
    return true;
  });

  const listEl = document.getElementById("entryList");
  listEl.innerHTML = "";
  if (!visibleDays.length) {
    const empty = document.createElement("p");
    empty.className = "emptyState";
    empty.textContent = term
      ? "No entries match that search."
      : showFavoritesOnly
      ? "No favorites yet - tap the star on an entry to save it here."
      : "Nothing journaled yet - write to Quill to start your first entry.";
    listEl.appendChild(empty);
    return;
  }
  visibleDays.slice().reverse().forEach(day => listEl.appendChild(buildEntryCard(day)));
}

/* ---------- Entries screen: search + favorites filter (list only - calendar lives on its own screen) ---------- */
let showFavoritesOnly = false;
let calendarMonth = new Date();

function resetEntriesView() {
  showFavoritesOnly = false;
  document.getElementById("favFilterBtn").classList.remove("active");
  document.getElementById("moodStrip").hidden = false;
  document.getElementById("moodTip").hidden = Object.keys(moods).length > 0;
}

document.getElementById("favFilterBtn").addEventListener("click", () => {
  showFavoritesOnly = !showFavoritesOnly;
  document.getElementById("favFilterBtn").classList.toggle("active", showFavoritesOnly);
  renderEntriesScreen(entrySearchInput.value);
});

function renderCalendarLegend() {
  const el = document.getElementById("calendarLegend");
  el.innerHTML = "";
  MOOD_LEVELS.forEach(level => {
    const item = document.createElement("div");
    item.className = "legendItem";
    const dot = document.createElement("span");
    dot.className = "legendDot";
    dot.style.background = MOOD_COLOR_VARS[level];
    item.appendChild(dot);
    item.appendChild(document.createTextNode(MOOD_LABELS[level]));
    el.appendChild(item);
  });
}

function renderCalendarMonth() {
  renderCalendarLegend();
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  document.getElementById("calMonthLabel").textContent =
    calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const dayMap = new Map(groupEntriesByDay(mainHistory).map(d => [d.dayKey, d]));
  const gridEl = document.getElementById("calendarGrid");
  gridEl.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < startWeekday; i++) {
    const filler = document.createElement("div");
    filler.className = "calendarCell empty";
    gridEl.appendChild(filler);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(year, month, d);
    const key = dayKeyOf(cellDate.getTime());
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendarCell";
    const numEl = document.createElement("span");
    numEl.className = "calendarDayNum";
    numEl.textContent = String(d);
    cell.appendChild(numEl);
    if (dayMap.has(key)) {
      cell.classList.add("hasEntry");
      const mood = moods[key];
      if (mood) {
        cell.style.background = MOOD_COLOR_VARS[mood];
      } else {
        cell.classList.add("noMood");
      }
      cell.title = truncate(dayMap.get(key).preview, 60);
      cell.addEventListener("click", () => openEntryDay(key));
    } else {
      cell.disabled = true;
      if (cellDate > today) cell.classList.add("future");
    }
    gridEl.appendChild(cell);
  }
}

document.getElementById("calPrevBtn").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendarMonth();
});
document.getElementById("calNextBtn").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendarMonth();
});

function openEntryDay(dayKey) {
  openScreen("talkScreen");
  const target = document.querySelector('#talkLog [data-day-key="' + dayKey + '"]');
  if (target) target.scrollIntoView({ block: "start" });
}

const entrySearchInput = document.getElementById("entrySearch");
let searchDebounceId = null;
entrySearchInput.addEventListener("input", e => {
  const value = e.target.value;
  clearTimeout(searchDebounceId);
  searchDebounceId = setTimeout(() => renderEntriesScreen(value), 150);
});

/* ---------- Settings screen: appearance ---------- */
function applyTheme(theme) {
  if (theme === "night") document.documentElement.setAttribute("data-theme", "night");
  else document.documentElement.removeAttribute("data-theme");
}

function setTheme(theme) {
  localStorage.setItem(STORAGE_KEYS.theme, theme);
  applyTheme(theme);
  renderThemeToggle();
  syncLockThemeIcon();
}

function renderThemeToggle() {
  const current = localStorage.getItem(STORAGE_KEYS.theme) || "day";
  document.querySelectorAll("#themeToggle .segOption").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.themeChoice === current);
  });
}

function syncLockThemeIcon() {
  document.getElementById("lockThemeBtn").dataset.theme = localStorage.getItem(STORAGE_KEYS.theme) || "day";
}

document.getElementById("themeToggle").addEventListener("click", e => {
  const btn = e.target.closest(".segOption");
  if (btn) setTheme(btn.dataset.themeChoice);
});

document.getElementById("lockThemeBtn").addEventListener("click", () => {
  const current = localStorage.getItem(STORAGE_KEYS.theme) || "day";
  setTheme(current === "night" ? "day" : "night");
});

syncLockThemeIcon();

function applyFontSize(size) {
  if (size === "small" || size === "large") document.documentElement.setAttribute("data-font-size", size);
  else document.documentElement.removeAttribute("data-font-size");
}

function setFontSize(size) {
  if (size === "default") localStorage.removeItem(STORAGE_KEYS.fontSize);
  else localStorage.setItem(STORAGE_KEYS.fontSize, size);
  applyFontSize(size);
  renderFontSizeToggle();
}

function renderFontSizeToggle() {
  const current = localStorage.getItem(STORAGE_KEYS.fontSize) || "default";
  document.querySelectorAll("#fontSizeToggle .segOption").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.fontChoice === current);
  });
}

document.getElementById("fontSizeToggle").addEventListener("click", e => {
  const btn = e.target.closest(".segOption");
  if (btn) setFontSize(btn.dataset.fontChoice);
});

/* ---------- Settings screen: export / backup ---------- */
function buildExportText() {
  const days = groupEntriesByDay(mainHistory);
  const lines = ["Q.U.I.L.L — exported entries", "Exported " + new Date().toLocaleString(), ""];
  days.forEach(day => {
    const moodSuffix = moods[day.dayKey] ? " (mood: " + moods[day.dayKey] + "/5)" : "";
    lines.push("=== " + formatDayLabel(day.ts) + moodSuffix + " ===");
    mainHistory
      .filter(m => dayKeyOf(m.ts) === day.dayKey)
      .forEach(m => lines.push((m.role === "user" ? "You: " : "Quill: ") + m.content));
    lines.push("");
  });
  return lines.join("\n");
}

function exportEntries() {
  const blob = new Blob([buildExportText()], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quill-entries-" + new Date().toISOString().slice(0, 10) + ".txt";
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("exportBtn").addEventListener("click", exportEntries);

/* ---------- Settings screen: backup & restore ----------
   Distinct from "Download my entries" above, which is a human-readable .txt.
   This is a structured, restorable snapshot of everything QUILL has stored. */
function buildBackupData() {
  return {
    version: 2, // v2: privateJournal is now an array of {id, content, createdAt, updatedAt} notes
    exportedAt: Date.now(),
    talk: mainHistory,
    light: lightHistory,
    privateJournal: journalNotes,
    moods: moods,
    favorites: favorites
  };
}

document.getElementById("backupBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(buildBackupData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quill-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
  showStatus("dataStatus", "Backup downloaded.");
});

let pendingRestoreData = null;

document.getElementById("restoreBtn").addEventListener("click", () => {
  document.getElementById("restoreFileInput").click();
});

document.getElementById("restoreFileInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = ""; // allow re-selecting the same file later
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data.version !== "number") throw new Error("not a QUILL backup");
    pendingRestoreData = data;
    document.getElementById("restoreConfirmOverlay").classList.add("open");
  } catch (err) {
    showStatus("dataStatus", "That file doesn't look like a QUILL backup.");
  }
});

document.getElementById("restoreCancelBtn").addEventListener("click", () => {
  pendingRestoreData = null;
  document.getElementById("restoreConfirmOverlay").classList.remove("open");
});

document.getElementById("restoreConfirmOverlay").addEventListener("click", e => {
  if (e.target.id === "restoreConfirmOverlay") {
    pendingRestoreData = null;
    e.target.classList.remove("open");
  }
});

document.getElementById("restoreConfirmBtn").addEventListener("click", e => {
  if (!pendingRestoreData) return;
  e.target.textContent = "Restoring…";
  e.target.disabled = true;
  document.getElementById("restoreCancelBtn").disabled = true;
  const data = pendingRestoreData;
  localStorage.setItem(STORAGE_KEYS.talk, JSON.stringify(data.talk || []));
  localStorage.setItem(STORAGE_KEYS.light, JSON.stringify(data.light || []));
  // Works for both old (flat {content, ts}) and new (note-object) backups -
  // loadPrivateJournal() migrates old-shape data transparently on reload.
  localStorage.setItem(STORAGE_KEYS.privateJournal, JSON.stringify(data.privateJournal || []));
  localStorage.setItem(STORAGE_KEYS.moods, JSON.stringify(data.moods || {}));
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(data.favorites || []));
  location.reload();
});

/* ---------- Talk to Quill: text + tap-to-talk in one compose bar,
   shared across the Reflect / Light / Wind down modes ---------- */
const talkInput = document.getElementById("talkInput");
const talkMicSendBtn = document.getElementById("talkMicSend");
const talkSigEl = document.getElementById("talkSig");
const talkChatTitleEl = document.getElementById("talkChatTitle");
let activeRecognizer = null;

function buildTalkSystemPrompt() {
  const context = buildMoodContext();
  const base = TALK_MODE_CONFIG[talkMode].systemPrompt;
  return context ? base + "\n\n" + context : base;
}

function applyTalkMode() {
  const config = TALK_MODE_CONFIG[talkMode];
  document.querySelectorAll("#talkModeToggle .segOption").forEach(b => b.classList.toggle("active", b.dataset.mode === talkMode));
  talkChatTitleEl.textContent = config.title;
  talkInput.placeholder = config.placeholder;
  renderLog("talkLog", config.history(), config.emptyText);
}

function resetTalkMode() {
  talkMode = "reflect";
  applyTalkMode();
  syncTalkHint();
}

document.getElementById("talkModeToggle").addEventListener("click", e => {
  const btn = e.target.closest(".segOption");
  if (!btn) return;
  talkMode = btn.dataset.mode;
  applyTalkMode();
});

let talkHintDismissed = false;
function syncTalkHint() {
  document.getElementById("talkHint").hidden = talkHintDismissed;
}
document.getElementById("talkHintDismiss").addEventListener("click", () => {
  talkHintDismissed = true;
  syncTalkHint();
});

const voiceStatusEl = document.getElementById("voiceStatus");
const VOICE_STATUS_TEXT = { listening: "Listening...", thinking: "Thinking...", talking: "Speaking..." };

function setVoiceState(state) {
  talkSigEl.className = "signature small" + (state ? " " + state : "");
  const text = VOICE_STATUS_TEXT[state];
  voiceStatusEl.textContent = text || "";
  voiceStatusEl.className = "voiceStatus" + (state ? " " + state : "");
  voiceStatusEl.hidden = !text;
}

async function handleTalkSend() {
  const text = talkInput.value.trim();
  if (!text) return;
  talkInput.value = "";
  autoGrowTextarea(talkInput);
  talkMicSendBtn.classList.remove("hasText");
  talkMicSendBtn.disabled = true;
  const config = TALK_MODE_CONFIG[talkMode];
  await sendToQuill(text, "talkLog", config.history(), config.storageKey, buildTalkSystemPrompt(), false);
  talkMicSendBtn.disabled = false;
}

const talkPromptBtn = document.getElementById("talkPromptBtn");

talkInput.addEventListener("input", () => {
  const hasText = talkInput.value.trim().length > 0;
  talkMicSendBtn.classList.toggle("hasText", hasText);
  talkPromptBtn.disabled = hasText;
  autoGrowTextarea(talkInput);
});
talkInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTalkSend(); }
});
talkPromptBtn.addEventListener("click", () => {
  if (talkInput.value.trim()) return;
  talkInput.value = getRandomPrompt();
  talkMicSendBtn.classList.add("hasText");
  talkPromptBtn.disabled = true;
  autoGrowTextarea(talkInput);
});

function getRecognizerCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

const MAX_LISTEN_MS = 60000;
let listenSafetyTimeoutId = null;

function startListening() {
  const Ctor = getRecognizerCtor();
  if (!Ctor) {
    appendMessage("talkLog", "system", "Voice input isn't supported in this browser.");
    return;
  }
  if (activeRecognizer) return;

  const recognizer = new Ctor();
  activeRecognizer = recognizer;
  recognizer.lang = "en-US";
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;

  recognizer.onresult = async event => {
    const transcript = event.results[0][0].transcript;
    setVoiceState("thinking");
    const config = TALK_MODE_CONFIG[talkMode];
    await sendToQuill(transcript, "talkLog", config.history(), config.storageKey, buildTalkSystemPrompt(), true);
  };
  recognizer.onerror = () => {
    setVoiceState("");
  };
  recognizer.onend = () => {
    activeRecognizer = null;
    clearTimeout(listenSafetyTimeoutId);
    talkMicSendBtn.classList.remove("listening");
    if (talkSigEl.className.indexOf("thinking") === -1 && talkSigEl.className.indexOf("talking") === -1) {
      setVoiceState("");
    }
  };

  talkMicSendBtn.classList.add("listening");
  setVoiceState("listening");
  recognizer.start();
  // Safety net in case recognition never fires onend, which could otherwise
  // leave the mic "listening" forever.
  listenSafetyTimeoutId = setTimeout(stopListening, MAX_LISTEN_MS);
}

function stopListening() {
  clearTimeout(listenSafetyTimeoutId);
  if (activeRecognizer) activeRecognizer.stop();
}

function toggleListening() {
  if (talkInput.value.trim()) return;
  if (activeRecognizer) stopListening();
  else startListening();
}

talkMicSendBtn.addEventListener("click", () => {
  if (talkInput.value.trim()) { handleTalkSend(); return; }
  toggleListening();
});

talkMicSendBtn.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  if (talkInput.value.trim()) return;
  e.preventDefault();
  if (e.repeat) return;
  toggleListening();
});

const DEFAULT_RATE = 0.98;

function loadVoicePref() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.voice);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function saveVoicePref(voice) {
  if (!voice) localStorage.removeItem(STORAGE_KEYS.voice);
  else localStorage.setItem(STORAGE_KEYS.voice, JSON.stringify({ name: voice.name, lang: voice.lang }));
}
function loadRate() {
  const n = parseFloat(localStorage.getItem(STORAGE_KEYS.rate));
  return Number.isFinite(n) ? n : DEFAULT_RATE;
}
function saveRate(rate) {
  localStorage.setItem(STORAGE_KEYS.rate, String(rate));
}

function getPreferredVoice() {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  const saved = loadVoicePref();
  if (saved) {
    const match = voices.find(v => v.name === saved.name && v.lang === saved.lang);
    if (match) return match;
  }
  // "Nicky" is a warm, kid-friendly system voice on Apple platforms - an opportunistic
  // default for this app's primary (App Store) target, not a general-purpose choice.
  // It's absent everywhere else, so this just falls through to the en-US match below.
  return voices.find(v => v.name.includes("Nicky")) || voices.find(v => v.lang === "en-US") || null;
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getPreferredVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = loadRate();
  utterance.pitch = 1.0;
  utterance.onstart = () => setVoiceState("talking");
  utterance.onend = () => setVoiceState("");
  window.speechSynthesis.speak(utterance);
}

/* ---------- Settings screen: voice + speech rate ---------- */
const voiceSelectEl = document.getElementById("voiceSelect");
const rateSliderEl = document.getElementById("rateSlider");
const rateValueEl = document.getElementById("rateValue");

function populateVoiceSelect() {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  const saved = loadVoicePref();
  voiceSelectEl.innerHTML = "";

  const autoOpt = document.createElement("option");
  autoOpt.value = "";
  autoOpt.textContent = "Automatic";
  voiceSelectEl.appendChild(autoOpt);

  voices.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = v.name + " (" + v.lang + ")";
    voiceSelectEl.appendChild(opt);
  });

  const savedIndex = saved ? voices.findIndex(v => v.name === saved.name && v.lang === saved.lang) : -1;
  voiceSelectEl.value = savedIndex >= 0 ? String(savedIndex) : "";
}

voiceSelectEl.addEventListener("change", () => {
  if (voiceSelectEl.value === "") {
    saveVoicePref(null);
    return;
  }
  const voices = window.speechSynthesis.getVoices();
  saveVoicePref(voices[parseInt(voiceSelectEl.value, 10)]);
});

if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = populateVoiceSelect;
}

function renderRateValue() {
  rateValueEl.textContent = parseFloat(rateSliderEl.value).toFixed(2) + "x";
}
rateSliderEl.addEventListener("input", () => {
  saveRate(parseFloat(rateSliderEl.value));
  renderRateValue();
});

document.getElementById("voicePreviewBtn").addEventListener("click", () => {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance("Hi, this is how I'll sound.");
  const voices = window.speechSynthesis.getVoices();
  const voice = voiceSelectEl.value === "" ? getPreferredVoice() : voices[parseInt(voiceSelectEl.value, 10)];
  if (voice) utterance.voice = voice;
  utterance.rate = parseFloat(rateSliderEl.value);
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
});
