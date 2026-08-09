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
- The passcode screen stays locked to portrait even if you rotate the phone, so the keypad never
  relayouts mid-entry - once you're in, the rest of the app is free to rotate normally.

### Two ways in, from one home screen
- **Journal** - fully private and local, and built like a proper notes app rather than one long
  diary entry: a scrollable shelf of separate notes, each one titled automatically from its own
  first line. Tap any note - today's or from months ago - to reopen and keep editing it; nothing is
  locked once written. Notes save themselves as you type (and again the moment you navigate away),
  so there's no save button, and a note left completely blank is quietly discarded rather than
  cluttering the list. A "How did today feel?" mood check-in appears after writing in a note started
  *today* specifically, not when you're editing something older. A floating trash button in the note
  editor deletes a note for good, with a confirmation step first. Nothing written here is ever sent
  anywhere. (Upgrading from an older version of Quill: your existing journal history is
  automatically split into individual, individually-editable notes the first time the app loads -
  nothing is lost or merged.)
- **Talk to Quill** - AI-backed, with three tones in one screen (a segmented toggle at the top):
  - **Reflect** - the default. Type or tap the mic to talk; Quill remembers recent mood check-ins
    and responds with that context in mind.
  - **Light** - easy banter and small talk, kept in its own conversation thread.
  - **Wind down** - a calmer, end-of-day tone, sharing Light's thread.
  Switching tones swaps both the conversation shown and where it's saved, but the same compose bar
  (tap-to-talk mic that turns into a send button once you start typing) works across all three.
  A one-time dismissible hint explains the tap-to-talk gesture the first time you open it each
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
Tap-to-toggle, not hold-to-talk - tap the mic once to start listening, tap it again to stop, with a
60-second safety cutoff in case the browser's recognizer never fires its own end event. Spoken
replies use the selected system voice. Needs a browser with Web Speech API support (Chrome, Edge, or
Safari); it degrades gracefully with a message on browsers that don't support it (e.g. Firefox).

## Installing it as an app
Quill is a PWA (Progressive Web App), so it can be added to a phone's home screen and opened like a
regular installed app - full-screen, no browser address bar - without going through an app store.

**iPhone/iPad (Safari):**
1. Open the site in Safari (it has to be Safari - other iOS browsers can't install PWAs).
2. Tap the Share icon (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. The name defaults to "Q.U.I.L.L" - tap **Add**.

**Android (Chrome):**
1. Open the site in Chrome.
2. Tap the three-dot menu in the top right.
3. Tap **Add to Home screen** (or **Install app**, if Chrome already offered it as a banner).
4. Confirm the name and tap **Add** / **Install**.

Once installed, the icon and label on the home screen come from `manifest.json` - the `short_name`
field, plus an `apple-mobile-web-app-title` meta tag in `index.html`, since iOS ignores the manifest
name for the home-screen label and needs its own tag.

## Data & privacy model
Everything Quill stores - the passcode hash, Talk/Light conversation history, Journal entries,
moods, and favorites - lives only in your browser's `localStorage`. There's no account and no
server. Journal content is never sent anywhere, full stop; Talk to Quill and Light/Wind down
messages are sent to Groq's API to get Quill's replies. The only way to move data between devices is
the manual backup/restore file in Settings.

## Tech stack
One static page - no build step, no server, no framework - built to feel like an app rather than a
website: full-bleed on a phone, and on anything roomier (tablet/laptop/desktop) a card that scales
up to nearly the full viewport height while staying page-shaped - it grows taller with the screen
rather than wider, so it never looks like a stretched phone view. Scrolling is contained to each
screen's own content (a chat log, the Journal's note list, Entries, Settings), with the page itself
as a fallback scroll container so a short viewport or a rotated phone never permanently hides
anything behind a fixed-height panel. Double-tap-to-zoom is disabled (`touch-action`) and the layout
tracks the real visible viewport height so the on-screen keyboard doesn't shove the page around.
It's installable as a PWA (see below). Screens are plain `div`s toggled by JS, not separate pages.

- `index.html` - all markup for every screen (lock, onboarding, home/menu, Journal list, Journal
  note editor, Talk to Quill, Entries, Calendar, Settings), the bottom tab bar, and the
  support-resources/confirmation overlays.
- `styles.css` - all styling: the leather-and-paper diary look, the passcode keypad and lockout
  progress ring, chat bubbles, the Journal's note cards and floating new-note/delete buttons, the
  mood-color system, the calendar grid, the signature/waveform animation (CSS `transform`/`opacity`
  only, so it stays on the compositor thread and never touches layout), and the responsive
  device-frame sizing.
- `app.js` - everything else: passcode hashing and lock-state machine, screen navigation and the tab
  bar, portrait-orientation locking on the passcode screen only, Quill's personas
  (Reflect/Light/Wind down) and the Groq API calls, crisis-phrase detection, mood/favorites/calendar
  logic, conversation storage, the Journal's note CRUD/autosave/migration logic, backup/restore, the
  tap-to-talk voice logic, and the on-screen-keyboard viewport fix (keeps the frame from jumping when
  a text field is focused on mobile). Has a placeholder, `__GROQ_API_KEY_PLACEHOLDER__`, substituted
  with the real key at deploy time (`.github/workflows/deploy.yml`, on push to `main`).
- `manifest.json` - the PWA manifest (name, icons, theme colors, standalone display mode) that makes
  Quill installable to a home screen.

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
