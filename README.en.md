# Hawaii 🍏

> Less is more. 3 minutes a day to turn Band-8 IELTS chunks into muscle memory.

**Hawaii** is a local-first IELTS collocation dictation trainer. It turns your Notion study notes into a three-stage drilling game — **pick-the-chunk building blocks → blind-type spelling → in-place cloze** — reinforced by spaced repetition (Ebbinghaus curve) and Duolingo-style streak streaks, so high-scoring expressions actually stick.

## Why Hawaii

- **The pain point**: reading Band-8 sample essays is easy; recalling their exact collocations under exam pressure is hard. Notes pile up in Notion but never make it into long-term memory.
- **The fix**: stop passively reading. Actively reconstruct the exact wording of every high-value chunk, in place, at the exact moment your memory is about to fade — 3 focused minutes a day.

## Features

- **Notion as the content source** — recursively pulls your Notion pages, auto-chunks them into lessons, extracts bilingual prompts, bolded collocations and vocabulary lists; one-click manual sync supported.
- **In-place cloze dictation** — the article never refreshes; collocations turn into input boxes right where they stand, pushed forward in groups of 7 across two segments, with full keyboard-only focus flow.
- **Ebbinghaus memory engine** — a Lv.0–4 mastery ladder (1/3/7/60-day intervals); misspelled words automatically demote; Mastered chunks enter the library.
- **Gamified streaks** — streak flames, a monthly calendar ripple, milestone treasure chests, and a daily state-culture stamp.
- **Fast review / vocabulary vault** — due chunks flash through single-card speed reviews; the Mastered gold-card dictionary comes with native pronunciation (UK/US).
- **Zero external service dependencies** — all data lives in local localStorage; sound effects are synthesized in real time with Web Audio.

## Tech Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · Drizzle ORM · PostgreSQL · Notion API · Web Audio / Web Speech

## Getting Started

```bash
npm install
npm run build
npm start          # http://localhost:3000
```

### Environment Variables (`.env`)

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
NOTION_TOKEN=ntn_xxx        # Notion Internal Integration Secret
NOTION_PAGE_ID=xxxxxxxx     # Study-notes page ID (must be shared with the integration)
```

> Page structure convention: page titles are year groups (e.g. "2026年"), month toggles (九月/十月…) are subgroups, each lesson starts with a 💡 Callout question, bolded English answers are the dictation chunks, and the list at the end of each lesson is the vocabulary table.

## License

MIT
