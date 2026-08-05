/* =========================================================================
   Q.U.I.L.L — a private journal that talks back.
   Single-page app: one lock screen, one menu, three conversation modes.
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
  "expresses thoughts of self-harm, suicide, or being in danger, respond with direct warmth and clearly " +
  "point them to a crisis line (988 in the US, or local emergency services) and someone they trust in real " +
  "life - briefly, once, without repeating it. You're glad to be here, but you're alongside the people in " +
  "someone's life, not a replacement for them.";

const LIGHT_SYSTEM_PROMPT =
  "You are Quill in a lighter mood - easy banter, gentle humor, small talk, a good way to ease into the day. " +
  "Keep replies short, playful and warm. The moment the conversation turns serious or heavy, drop the humor " +
  "immediately and respond with the same care as a genuine friend, no jokes.";

const CRISIS_PHRASES = [
  "kill myself", "suicide", "end my life", "want to die", "ending it all",
  "hurt myself", "harm myself", "self harm", "self-harm", "no reason to live",
  "better off dead", "can't go on", "cant go on", "not worth living"
];
const CARE_NOTE_TEXT =
  "That sounds like a lot to carry. If you're thinking about harming yourself or feel unsafe right now, please reach out. And if there's someone in your life you trust, they'd probably want to hear from you too.";

function detectCrisis(text) {
  const lower = text.toLowerCase();
  return CRISIS_PHRASES.some(phrase => lower.includes(phrase));
}

async function callGroq(systemPrompt, history) {
  const key = getApiKey();
  if (!key) throw new Error("no-api-key");

  const messages = [{ role: "system", content: systemPrompt }]
    .concat(history.map(m => ({ role: m.role, content: m.content })));

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key
    },
    body: JSON.stringify({ model: MODEL, messages: messages })
  });
  if (!res.ok) throw new Error("groq-error-" + res.status);
  const data = await res.json();
  return data.choices[0].message.content;
}

/* ---------- Screen navigation ---------- */
function openScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  const chrome = id !== "lockScreen";
  document.getElementById("lockNowBtn").hidden = !chrome;

  if (id === "journalScreen" || id === "voiceScreen") {
    renderLog(id === "journalScreen" ? "journalLog" : "voiceLog", mainHistory);
  } else if (id === "lightScreen") {
    renderLog("lightLog", lightHistory);
  }
}

document.querySelectorAll("[data-screen]").forEach(el => {
  el.addEventListener("click", () => openScreen(el.dataset.screen));
});

/* ---------- Passcode lock ---------- */
const PIN_HASH_KEY = "quill_pin_hash";
const PIN_LEN = 6;

const lockScreenEl = document.getElementById("lockScreen");
const lockSubEl = document.getElementById("lockSub");
const pinDotsEl = document.getElementById("pinDots");
const pinErrorEl = document.getElementById("pinError");
const unlockBtn = document.getElementById("unlockBtn");

let currentPin = "";
let pendingFirstPin = null;
// "setup" -> no passcode saved yet, choosing one for the first time
// "confirm" -> re-enter the passcode just chosen, to confirm it matches
// "unlock" -> a passcode already exists, waiting for it to be entered
let lockState = localStorage.getItem(PIN_HASH_KEY) ? "unlock" : "setup";

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
  } else {
    lockSubEl.textContent = "Dear diary, only you may enter.";
    unlockBtn.textContent = "Unlock";
  }
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
    localStorage.setItem(PIN_HASH_KEY, await hashPin(currentPin));
    lockState = "unlock";
    currentPin = "";
    openScreen("menuScreen");
    return;
  }

  // lockState === "unlock"
  const enteredHash = await hashPin(currentPin);
  if (enteredHash === localStorage.getItem(PIN_HASH_KEY)) {
    currentPin = "";
    renderDots();
    openScreen("menuScreen");
  } else {
    pinErrorEl.textContent = "Incorrect passcode.";
    shakeLock();
    currentPin = "";
    renderDots();
  }
}

function forgotPasscode() {
  const sure = confirm(
    "Resetting your passcode also erases everything Quill remembers, since there's no other way " +
    "to recover access on this device. Are you sure you want to start over?"
  );
  if (!sure) return;
  localStorage.removeItem(PIN_HASH_KEY);
  localStorage.removeItem(JOURNAL_KEY);
  localStorage.removeItem(LIGHT_KEY);
  mainHistory = [];
  lightHistory = [];
  resetToFreshSetup();
}

document.getElementById("keypad").addEventListener("click", e => {
  const key = e.target.closest(".key")?.dataset.key;
  if (!key) return;

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

renderLockSub();
renderDots();

/* ---------- Conversation storage ---------- */
const JOURNAL_KEY = "quill_journal"; // shared between Journal and Voice - one conversation, two ways in
const LIGHT_KEY = "quill_light";

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

let mainHistory = loadHistory(JOURNAL_KEY);
let lightHistory = loadHistory(LIGHT_KEY);

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
  div.textContent = formatDayLabel(ts);
  logEl.appendChild(div);
}

function appendMessage(logId, role, text, ts) {
  ts = ts || Date.now();
  const logEl = document.getElementById(logId);
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
  div.className = "msg eva";
  div.innerHTML = '<span class="thinkingDots"><span></span><span></span><span></span></span>';
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  return div;
}

function renderLog(logId, history) {
  const logEl = document.getElementById(logId);
  logEl.innerHTML = "";
  lastDividerDay[logId] = null;
  history.forEach(m => appendMessage(logId, m.role === "user" ? "user" : "eva", m.content, m.ts));
}

/* ---------- Sending a message (shared by Journal, Voice, Light chat) ---------- */
async function sendToQuill(text, logId, history, storageKey, systemPrompt, speakReply) {
  appendMessage(logId, "user", text);
  history.push({ role: "user", content: text, ts: Date.now() });
  saveHistory(storageKey, history);

  if (detectCrisis(text)) appendCareNote(logId);

  const thinkingEl = appendThinking(logId);
  try {
    const reply = await callGroq(systemPrompt, history);
    thinkingEl.remove();
    appendMessage(logId, "eva", reply);
    history.push({ role: "assistant", content: reply, ts: Date.now() });
    saveHistory(storageKey, history);
    if (speakReply) speakText(reply);
  } catch (err) {
    thinkingEl.remove();
    const msg = err.message === "no-api-key"
      ? "Quill's connection isn't set up on this deployment yet."
      : "Couldn't reach Quill just now - please try again in a moment.";
    appendMessage(logId, "system", msg);
  }
}

/* ---------- Journal screen ---------- */
const journalInput = document.getElementById("journalInput");
const journalSend = document.getElementById("journalSend");

async function handleJournalSend() {
  const text = journalInput.value.trim();
  if (!text) return;
  journalInput.value = "";
  journalSend.disabled = true;
  await sendToQuill(text, "journalLog", mainHistory, JOURNAL_KEY, SYSTEM_PROMPT, false);
  journalSend.disabled = false;
}
journalSend.addEventListener("click", handleJournalSend);
journalInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleJournalSend(); }
});

/* ---------- Light chat screen ---------- */
const lightInput = document.getElementById("lightInput");
const lightSend = document.getElementById("lightSend");

async function handleLightSend() {
  const text = lightInput.value.trim();
  if (!text) return;
  lightInput.value = "";
  lightSend.disabled = true;
  await sendToQuill(text, "lightLog", lightHistory, LIGHT_KEY, LIGHT_SYSTEM_PROMPT, false);
  lightSend.disabled = false;
}
lightSend.addEventListener("click", handleLightSend);
lightInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleLightSend(); }
});

/* ---------- Voice screen: hold-to-talk + spoken replies ---------- */
const voiceOrbBtn = document.getElementById("voiceOrb");
const voiceSigEl = document.getElementById("voiceSig");
let activeRecognizer = null;

function setVoiceState(state) {
  voiceSigEl.className = "signature small" + (state ? " " + state : "");
}

function getRecognizerCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function startListening() {
  const Ctor = getRecognizerCtor();
  if (!Ctor) {
    appendMessage("voiceLog", "system", "Voice input isn't supported in this browser.");
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
    await sendToQuill(transcript, "voiceLog", mainHistory, JOURNAL_KEY, SYSTEM_PROMPT, true);
  };
  recognizer.onerror = () => {
    setVoiceState("");
  };
  recognizer.onend = () => {
    activeRecognizer = null;
    voiceOrbBtn.classList.remove("listening");
    if (voiceSigEl.className.indexOf("thinking") === -1 && voiceSigEl.className.indexOf("talking") === -1) {
      setVoiceState("");
    }
  };

  voiceOrbBtn.classList.add("listening");
  setVoiceState("listening");
  recognizer.start();
}

function stopListening() {
  if (activeRecognizer) activeRecognizer.stop();
}

voiceOrbBtn.addEventListener("pointerdown", startListening);
voiceOrbBtn.addEventListener("pointerup", stopListening);
voiceOrbBtn.addEventListener("pointerleave", stopListening);
voiceOrbBtn.addEventListener("pointercancel", stopListening);

function getPreferredVoice() {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  return voices.find(v => v.name.includes("Nicky")) || voices.find(v => v.lang === "en-US") || null;
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getPreferredVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.98;
  utterance.pitch = 1.0;
  utterance.onstart = () => setVoiceState("talking");
  utterance.onend = () => setVoiceState("");
  window.speechSynthesis.speak(utterance);
}
