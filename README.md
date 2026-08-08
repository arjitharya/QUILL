# Q.U.I.L.L

Your quiet page that listens back. Quill doesn't try to fix you or hand out advice - it listens,
remembers, and stays. Think of Quill as a locked diary that talks back.

## Features

### Getting in
- **Passcode-locked entry.** The app opens to a numeric keypad, like a diary with a clasp on it.
  The first time you open it, you choose your own 6-digit passcode - nothing is sent anywhere until
  you unlock, and the passcode itself is hashed (SHA-256), never stored in plaintext.
- **Lockout with a visible countdown.** Five wrong attempts locks the keypad for 30 seconds, shown
  both as text and as a shrinking progress ring around the countdown - no way to brute-force the
  passcode by guessing repeatedly.
- **Forgot your passcode?** A press-and-hold "Start over" button (not a single tap) resets
  everything, since there's no account or server to verify identity any other way. The 1.3-second
  hold is deliberate friction against accidentally wiping months of entries.
- Day/Night appearance can be switched right from the lock screen, before you've even unlocked.

### Two ways in, from one home screen
- **Journal** - fully private and local. Nothing you write here is ever sent anywhere; it's the
  "just for you" side of the app, like a notes app under a lock.
- **Talk to Quill** - AI-backed, with three tones in one screen (a segmented toggle at the top):
  - **Reflect** - the default. Type or hold-to-talk; Quill remembers recent mood check-ins and
    responds with that context in mind.
  - **Light** - easy banter and small talk, kept in its own conversation thread.
  - **Wind down** - a calmer, end-of-day tone, sharing Light's thread.
  Switching tones swaps both the conversation shown and where it's saved, but the same compose bar
  (hold-to-talk mic that turns into a send button once you start typing) works across all three.
  A one-time dismissible hint explains the hold-to-talk gesture the first time you open it each
  session.
- The home screen's two cards are visually distinguished by trust model - Journal carries a moss
  "on device" badge, Talk to Quill a wine "AI-backed" badge - so the privacy story from onboarding
  is reinforced every time you look at the menu, not just read once during setup.

### Getting around
- **A persistent bottom tab bar** - Journal / Talk / Entries / Calendar / Settings - lets you jump
  laterally between sections without detouring back through the home screen each time. It's visible
  everywhere except the lock and onboarding screens.
- **A week strip on the home screen** - seven days, oldest to newest, each showing that day's mood
  face (or a calm blank face if none was set) - always visible, tapping it anywhere opens the full
  Calendar.

### Entries, moods, and the calendar
- **Entries** - a searchable list of your Talk to Quill (Reflect-mode) history, grouped by day.
  Search is intentionally scoped to that history only - Journal entries stay private and are never
  indexed or shown here, which the screen says outright rather than leaving you to wonder why a
  Journal entry didn't turn up. Each day can be starred as a favorite (with a favorites-only filter)
  and tagged with a mood via a small face-icon picker - Rough, Low, Okay, Good, or Great.
- **Calendar** - its own screen (reachable from the week strip, the bottom tab bar, or by tapping an
  entry), showing a month grid with a color legend. Days with a mood logged are colored by that
  mood; days with an entry but no mood get a neutral highlight; empty future days are dimmed;
  hovering or tapping a day previews that day's entry text.
- A quiet weekly mood trend line (e.g. "This week trended Low → Good") appears above the entries
  list when there's enough mood data to say something about it.

### A quiet safety net, twice over
- If something you write sounds like real crisis or thoughts of self-harm, Quill still responds
  like itself - warm, not clinical - but a small, calm note also appears with a crisis line. A
  second, model-based check runs alongside the fast keyword check to catch phrasing the keyword list
  would miss, without ever blocking or delaying Quill's actual reply. The note only resurfaces after
  a 10-minute quiet stretch, so it doesn't repeat itself in one heavy conversation.
- If Quill's reply is slow or a request fails, a "Try again" option appears instead of a stuck
  loading state - Groq calls time out after 20 seconds rather than hanging indefinitely.

### Settings
- **Appearance** - Day or Night theme.
- **Text size** - Small, Default, or Large.
- **Security** - change your passcode.
- **Your data** - download a human-readable `.txt` of your entries, or back up everything (Talk
  history, Journal, moods, favorites) to a single JSON file and restore it later - useful for moving
  to a new device, since there's no cloud sync. Restoring fully replaces what's on the device and
  requires confirmation first.
- **Quill's voice** - pick a system voice (prefers "Nicky" when available), adjust its speaking
  rate, and preview it.

### Voice mode
Hold-to-talk, not click-to-toggle - the mic only listens while you're pressing it, with a 60-second
safety cutoff in case a touch gesture doesn't release cleanly (e.g. scrolling on mobile Safari).
Spoken replies use the selected system voice. Needs a browser with Web Speech API support (Chrome,
Edge, or Safari); it degrades gracefully with a message on browsers that don't support it (e.g.
Firefox).

## Data & privacy model
Everything Quill stores - the passcode hash, Talk/Light conversation history, Journal entries,
moods, and favorites - lives only in your browser's `localStorage`. There's no account and no
server. Journal content is never sent anywhere, full stop; Talk to Quill and Light/Wind down
messages are sent to Groq's API to get Quill's replies. The only way to move data between devices is
the manual backup/restore file in Settings.

## Tech stack
One static page - no build step, no server, no framework - built to feel like an app rather than a
website: full-bleed on a phone, a fixed tablet-sized card centered on anything roomier
(laptop/desktop), and no page-level scrolling anywhere (only each chat log itself scrolls). Screens
are plain `div`s toggled by JS, not separate pages.

- `index.html` - all markup for every screen (lock, onboarding, home/menu, Journal, Talk to Quill,
  Entries, Calendar, Settings), the bottom tab bar, and the support-resources/confirmation overlays.
- `styles.css` - all styling: the leather-and-paper diary look, the passcode keypad and lockout
  progress ring, chat bubbles, the mood-color system, the calendar grid, and the signature/waveform
  animation (CSS `transform`/`opacity` only, so it stays on the compositor thread and never touches
  layout).
- `app.js` - everything else: passcode hashing and lock-state machine, screen navigation and the tab
  bar, Quill's personas (Reflect/Light/Wind down) and the Groq API calls, crisis-phrase detection,
  mood/favorites/calendar logic, conversation storage, backup/restore, and the hold-to-talk voice
  logic. Has a placeholder, `__GROQ_API_KEY_PLACEHOLDER__`, substituted with the real key at deploy
  time (`.github/workflows/deploy.yml`, on push to `main`).

## Local development
There's no key baked in locally, since the real key only gets substituted in during deploy. To test
locally with a real key, temporarily replace `__GROQ_API_KEY_PLACEHOLDER__` in `app.js` with your
key, use the page, then revert the edit before committing (never commit a real key). Without a key,
the app still runs fully - lock/unlock, Journal, Entries, Calendar, and Settings all work offline;
only Quill's actual replies need the key.

Serve it as a static site, e.g.:
```
python3 -m http.server 8000
```
then open `http://localhost:8000`.
