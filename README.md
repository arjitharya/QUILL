# Q.U.I.L.L

Your quiet page that listens back. Quill doesn't try to fix you or hand out advice - it listens,
remembers, and stays. Think of Quill as a locked diary that talks back.

## Features

- **Passcode-locked diary.** The app opens to a numeric keypad, like a diary with a clasp on it.
  The first time you open it, you choose your own passcode (6 digits) - nobody else can get in
  without it, and nothing is sent anywhere until you unlock.
- **Three ways in, from one menu.** After unlocking you land on a menu with three modes:
  - **Journal** - type to Quill like you would text a friend.
  - **Talk** - press and hold the mic button, speak, let go, and Quill answers out loud.
  - **Light chat** - easy, playful small talk, kept in its own separate conversation.
  Journal and Talk share one running conversation (two ways into the same thread); Light chat is
  its own, unrelated one.
- **Voice mode.** Hold-to-talk, not click-to-toggle - the mic only listens while you're pressing
  it. Spoken replies use the "Nicky" system voice when it's available on the device (falls back to
  the browser's default voice otherwise). A small signature-line motif turns into a waveform while
  Quill is listening, thinking, or speaking - there's no text on screen in this mode at all.
- **A quiet safety net, twice over.** If something you write sounds like real crisis or thoughts of
  self-harm, Quill still responds like itself - warm, not clinical - but a small, calm note also
  appears with a crisis line. A "Support resources" link is also always available from any screen,
  independent of anything you've typed.

## Tech stack

One static page - no build step, no server, no framework - built to feel like an app rather than a
website: full-bleed on a phone, a fixed tablet-sized card centered on anything roomier
(laptop/desktop), and no page-level scrolling anywhere (only each chat log itself scrolls). Screens
(lock, menu, journal, voice, light chat) are plain `div`s toggled by JS, not separate pages.

- `index.html` - all markup for every screen, plus the support-resources modal.
- `styles.css` - all styling: the leather-and-paper diary look, the passcode keypad, the chat
  bubbles, and the signature/waveform animation (CSS `transform`/`opacity` only, so it stays on the
  compositor thread and never touches layout).
- `app.js` - everything else: passcode hashing (SHA-256, never stored in plaintext) and lock-state
  machine, screen navigation, Quill's persona and the Groq API call (calls Groq's
  OpenAI-compatible chat API directly from the browser, since its chat tier is free), crisis-phrase
  detection, conversation storage, and the hold-to-talk voice logic. Has a placeholder,
  `__GROQ_API_KEY_PLACEHOLDER__`, substituted with the real key at deploy time.

## Local development

There's no key baked in locally, since the real key only gets substituted in during deploy. To
test locally with a real key, temporarily replace `__GROQ_API_KEY_PLACEHOLDER__` in `app.js` with
your key, use the page, then revert the edit before committing (never commit a real key).

Everything you write - the passcode hash and both conversation histories (Journal/Talk share one,
Light chat has its own) - lives only in your browser's `localStorage`. There's no account, no
server, and no way to recover a forgotten passcode other than resetting it from the lock screen's
"Forgot?" key (which also clears both conversations, since there's no backend to verify identity
another way). A quill-mark button on every screen lets you manually re-lock at any time.

Voice mode needs a browser with Web Speech API support (Chrome, Edge, or Safari) both to listen and
to speak; it degrades gracefully with a message on browsers that don't support it (e.g. Firefox).
