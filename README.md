# Stride

A gamified learning app for your phone. It teaches AI for product management, core technical concepts, and building AI agents, in short sessions made for walking.

It's a **PWA** (progressive web app): a website you add to your iPhone home screen so it opens like an app and works offline.

## What's in it (Layers 1–3)

- **Skill map** with 4 tracks. 9 units are ready now; the rest show as "coming soon".
- **Levels** in each unit: L1 *Spot it* → L2 *Explain it* → (L3 *Use it*, coming later) → **boss battle**.
- **Lessons, flashcards and quizzes**, all read aloud if you like.
- **Placement quiz** to skip what you already know.
- **XP, player levels and a daily streak** (daily goal: 50 XP).
- **Review tab**: spaced repetition, weak spots grouped by topic, and **Walk Mode** (hands-free audio flashcards).
- **Decode this**: paste something confusing and get a plain-English breakdown, a mini quiz, and new flashcards. Needs your own Anthropic API key, stored only on your phone.

## How the files are organized

```
index.html              The page skeleton
css/styles.css          All the styling (colors, sizes, dark mode)
js/app.js               Screens and navigation
js/session.js           The "game engine" for lessons, cards and quizzes
js/store.js             Your progress, saved on your device
js/content.js           Loads the lesson files
js/speech.js            Read-aloud
js/decode.js            "Decode this" (calls Claude)
js/ui.js                Small shared helpers
content/curriculum.json The skill map: tracks and units
content/units/*.json    The lessons, cards and questions for each unit
sw.js                   Service worker: offline + instant open
manifest.webmanifest    Home-screen name and icon
```

## Adding or editing content

Open a file in `content/units/`. Each level has `lesson` pages, `cards` and `quiz` questions. For a quiz question, `answer` is the position of the right option, **counting from 0** (so 0 = the first option).

Add new cards and questions **at the end** of a list. Progress is tracked by position, so inserting in the middle would mix up your history.

## Running it on your Mac

```
python3 -m http.server 8080
```

Then open http://localhost:8080.
