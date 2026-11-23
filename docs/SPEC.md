# AGENTS.md — Build Specification: ChatKeep (WhatsApp Export Viewer PWA)

> **Audience:** AI coding agents (GLM, Claude, Codex, etc.) and human contributors.
> **Status:** Authoritative. This document is the single source of truth for architecture, scope and coding standards.
> **Working name:** `ChatKeep` (the owner may rename it; keep the name in one constant, `APP_NAME`, in `src/app/config.ts`).

---

## 0. Operating rules for the coding agent (read first)

1. **Read this entire document before writing any code.** Re-read the relevant section before starting each milestone.
2. **Work milestone by milestone** (§22). Each milestone is **one branch and one Pull Request**. Never start milestone N+1 until milestone N's PR is green in CI.
3. **Never push directly to `main`** (the only exception is the initial empty-repo commit in M0). All work goes through PRs. The owner's reviewer (another AI) reviews every PR against §23.
4. **No placeholders.** No `TODO`, `FIXME`, stub functions, mock data in production code, `throw new Error('not implemented')`, or commented-out code. If something is out of scope for the current milestone, leave it out completely.
5. **Never weaken quality gates** to make CI pass. That means no disabling lint rules, no `@ts-ignore`, no `any`, no skipped tests (`.skip`, `.only`), no lowered coverage thresholds and no raised performance budgets. If a gate seems wrong, write an ADR (§21.4) explaining why and stop for review.
6. **Ambiguity protocol:** if this spec is silent or ambiguous, pick the most conservative option (simplest, safest, most private), record it in `docs/adr/NNNN-title.md`, and mention it in the PR description under "Decisions".
7. **Dependency discipline:** use only the dependencies in §4.2. Adding any other dependency requires an ADR justifying it (bundle-size impact, license, maintenance status, alternatives considered).
8. **License hygiene:** do **not** copy code from AGPL/GPL projects (e.g. `rodrigogs/whats-reader`). Studying their behavior is fine. MIT/Apache code may be consulted, but write original code. Never vendor third-party code without an ADR.
9. **Privacy of test data:** never commit real chat exports. Fixtures are synthetic (generated) or anonymized with `scripts/anonymize-export.ts` (§19.3).
10. **Run `pnpm verify` before every push.** It must pass locally.
11. **Keep `docs/STATUS.md` updated** in every PR: milestone, what was done, what's next, known issues, deviations from spec.
12. **PR size:** aim for under ~1,500 changed lines, excluding lockfile, fixtures and generated files. Split large milestones into sequential PRs (`M3a`, `M3b`, and so on) if needed.

---

## 1. Product

A **read-only, offline, private** chat archive viewer that runs as a **Progressive Web App on iOS Safari** (installed to the Home Screen). It imports chats exported with WhatsApp's **Export Chat** feature (`.zip` with media, or `.txt` without) and shows them in a familiar messaging interface. Users can browse, search and explore them.

### 1.1 Core capabilities (all are in scope)

- Import a WhatsApp export `.zip` (with media) or `.txt` (without media), from iOS or Android exports.
- Auto-detect the export format: platform, date order, 12/24h clock, seconds or none. The user confirms ambiguous choices with a live preview.
- Choose which participant is "me" (messages on the right). Changeable later.
- Re-import a newer export of the same chat: **merge without duplicates**.
- Chat list with last-message preview, sorted by most recent message.
- Chat view: bubbles, day separators, sender names and colors in groups, system messages, edited flags, deleted placeholders, WhatsApp text formatting, links, media bubbles.
- Smooth scrolling of chats with **100,000+ messages**.
- Jump to date. Jump to first/last message. Jump to a search result in context.
- Global search across all chats and in-chat search with next/previous navigation. Filters: sender, date range, message kind.
- Media gallery per chat (photos, videos, audio/voice, documents, links) with full-screen viewers.
- Voice-note playback, including `.opus` on iOS (with a decoder fallback).
- Bookmarks with optional notes.
- Chat info: participants, per-participant counts, date range, media counts, storage used.
- App lock: PIN, auto-lock, content hidden in the app switcher.
- Storage management: usage per chat, persistent-storage request and status, delete chat with its media.
- Backup and restore of the app's own data.
- Fully offline after first load. **Zero network requests for user data, ever.**

### 1.2 Non-goals (do NOT build)

- Sending, editing or composing messages. Any connection to WhatsApp servers or accounts.
- Reading WhatsApp's internal databases or iPhone backups (only the official text export).
- Cloud sync, accounts, analytics, telemetry, crash reporting services, ads.
- Server-side code of any kind. The app is static files only.
- Reactions, quoted-reply context and read receipts. **WhatsApp exports do not contain them.** Do not fake them.
- Using WhatsApp's name in the app name or icon, or WhatsApp's logo, artwork or exact brand assets. The README may say "viewer for exported WhatsApp chats" (nominative use). The UI should be _familiar_, not a copy.

---

## 2. Platform targets and hard constraints

| Item           | Requirement                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Primary target | iOS/iPadOS **17+**, Safari, installed to Home Screen (standalone display mode)                            |
| Secondary      | Latest Safari (macOS), Chrome, Edge, Firefox (desktop and Android). Must work, but iOS polish comes first |
| Hosting        | GitHub Pages (static, HTTPS, **no custom HTTP headers available**)                                        |
| Base path      | Served from `/<repo-name>/`. All paths must respect Vite `base`                                           |
| Isolation      | **No cross-origin isolation** (GitHub Pages can't set COOP/COEP). Do **not** rely on `SharedArrayBuffer`  |
| Storage        | OPFS (Origin Private File System) for the database and media                                              |
| Network        | After the first load, the app must work in airplane mode indefinitely                                     |

**Important iOS facts that shape the design (do not fight them):**

- iOS Safari does **not** support the Web Share Target API, so the app cannot appear in the share sheet. Import happens via a file picker (`<input type="file">`), from the Files app.
- A Home Screen web app has **separate storage** from Safari tabs. The app must detect whether it is running in a browser tab and tell the user to install it before importing (§12.10).
- Storage can still be cleared by the user or the OS. Request persistent storage and provide backup (§10.6, §12.9).

---

## 3. High-level architecture

### 3.1 Layers (strict, enforced by dependency-cruiser)

```
┌──────────────────────────────────────────────────────────────┐
│  app/        React UI (routes, features, components, hooks)   │  main thread
├──────────────────────────────────────────────────────────────┤
│  client/     Typed RPC clients for workers (Comlink proxies)  │  main thread
├──────────────────────────────────────────────────────────────┤
│  workers/    db.worker.ts, import.worker.ts (entry points)    │  workers
├──────────────────────────────────────────────────────────────┤
│  storage/    SQLite (WASM, OPFS SAH-pool), migrations,        │  workers only
│              repository impl, OPFS media store                │
├──────────────────────────────────────────────────────────────┤
│  core/       Pure TS: domain types, parser, fingerprinting,   │  anywhere
│              merge, text formatting tokenizer, date logic,    │
│              Result type. NO DOM, NO browser APIs, NO React.  │
└──────────────────────────────────────────────────────────────┘
          platform/  capability detection, persist(), audio decode,
                     install detection (thin wrappers over browser APIs)
```

**Allowed imports (anything else fails CI):**

- `core` → nothing (except `core` itself).
- `storage` → `core`.
- `workers` → `storage`, `core`, `platform` (worker-safe parts only).
- `client` → `core` (types), `workers` (**type-only** imports of the RPC interface).
- `platform` → `core`.
- `app` → `client`, `core`, `platform`. **`app` must never import `storage` or `workers` directly.**

### 3.2 Runtime topology

```
Main thread (React)
   │  Comlink
   ├──────────────► db.worker      owns the ONLY SQLite connection (opfs-sahpool VFS)
   │                   ▲                serves all queries; executes import commits
   │  Comlink          │ MessagePort (transferred at startup)
   └──────────────► import.worker  unzip (zip.js) → detect → parse → fingerprint
                                    → write media to OPFS → thumbnails
                                    → send batches to db.worker → commit
```

- **db.worker** is the only code that opens SQLite. One connection, serialized access.
- **import.worker** does CPU-heavy and IO-heavy import work, so queries stay responsive. It never touches SQLite directly. It sends commands to db.worker over a dedicated `MessagePort`.
- The main thread reads media files from OPFS (async API) to create object URLs for display. It never writes to OPFS.
- Workers are ES-module workers (`new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`).

### 3.3 Data flow: import

`File (Blob)` → import.worker → `zip.js` reads the central directory lazily (no full load into memory) → locate chat `.txt` → decode UTF-8 → `detectFormat` → **pause for user confirmation** (main thread shows preview) → `parseChat` → fingerprint and merge plan → stream each media entry to OPFS → thumbnails → db.worker transaction (insert messages, attachments, FTS) → mark import complete → report.

### 3.4 Data flow: read

React component → TanStack Query hook → `client` RPC → db.worker → SQL → typed rows → hook → render. Media: row has `opfsPath` → main thread `getFile()` → `URL.createObjectURL` (LRU-managed, revoked on eviction or unmount).

---

## 4. Technology stack (decided; do not substitute)

### 4.1 Core choices

| Concern         | Choice                                                  | Notes                                                             |
| --------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Language        | TypeScript (latest stable), strict                      | See §18.1                                                         |
| Package manager | **pnpm**                                                | `packageManager` field pinned in `package.json`                   |
| Node            | Current Node LTS                                        | Pin in `.nvmrc` and `engines`                                     |
| Build           | **Vite**                                                | `base: '/<repo>/'` from env `VITE_BASE` with default              |
| UI              | **React** (latest stable)                               | Function components only                                          |
| Routing         | **React Router**, `HashRouter`                          | Hash routing: robust on GitHub Pages and offline                  |
| Async data      | **TanStack Query**                                      | Wraps worker RPC; not used as a global state store                |
| Virtualization  | **@tanstack/react-virtual**                             | Dynamic row heights                                               |
| Styling         | **Tailwind CSS v4** (`@tailwindcss/vite`)               | Design tokens as CSS variables; logical properties                |
| Worker RPC      | **Comlink**                                             | Typed via a shared interface                                      |
| Database        | **@sqlite.org/sqlite-wasm** with **`opfs-sahpool` VFS** | Works without COOP/COEP. FTS5 required (verify at boot)           |
| Zip             | **@zip.js/zip.js**                                      | Random-access `BlobReader`; `configure({ useWebWorkers: false })` |
| Validation      | **Valibot**                                             | At every trust boundary (§18.5)                                   |
| Links           | **linkify-it**                                          | Tokenize only; render as React elements                           |
| Opus fallback   | **ogg-opus-decoder**                                    | Lazy-loaded; only when `canPlayType` fails                        |
| PWA             | **vite-plugin-pwa** (Workbox `generateSW`)              | `registerType: 'prompt'`                                          |
| Utils           | **clsx**                                                | Only for class composition                                        |

### 4.2 Dependency allowlist

**Runtime:** `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `@tanstack/react-virtual`, `comlink`, `@sqlite.org/sqlite-wasm`, `@zip.js/zip.js`, `valibot`, `linkify-it`, `ogg-opus-decoder`, `clsx`.

**Dev:** `typescript`, `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`, `tailwindcss`, `@tailwindcss/vite`, `vitest`, `@vitest/coverage-v8`, `@vitest/browser`, `playwright`, `@playwright/test`, `@axe-core/playwright`, `fast-check`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `happy-dom`, `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-jsx-a11y`, `@eslint-community/eslint-plugin-eslint-comments`, `eslint-plugin-import-x`, `prettier`, `prettier-plugin-tailwindcss`, `dependency-cruiser`, `size-limit`, `@size-limit/file`, `@lhci/cli`, `lefthook`, `tsx`, `@types/*` as needed.

Use the latest stable versions at project start. **Pin exact versions** (no `^`/`~`), and record them in `docs/adr/0001-stack-and-versions.md`. Renovate keeps them updated (§20.4).

No date libraries (use `Intl` and own small utilities in `core/dates`). No UI component libraries. No icon fonts (use inline SVG components in `app/components/icons/`, original artwork). No CSS-in-JS. No state management libraries (Redux, Zustand, MobX, Jotai).

---

## 5. Repository layout

````
.
├── AGENTS.md                      # this file (authoritative spec)
├── README.md                      # user-facing: what it is, install on iPhone, privacy
├── CHANGELOG.md                   # generated by release-please
├── docs/
│   ├── STATUS.md                  # progress tracker, updated every PR
│   ├── TESTING.md                 # manual on-device test checklist (iPhone)
│   ├── EXPORT-FORMATS.md          # evidence log of real export formats observed
│   └── adr/                       # Architecture Decision Records 0001-*.md …
├── .github/
│   ├── workflows/ci.yml
│   ├── workflows/deploy.yml
│   ├── workflows/release-please.yml
│   ├── pull_request_template.md
│   └── renovate.json
├── public/                        # icons, apple-touch-icon, splash images
├── scripts/
│   ├── anonymize-export.ts        # turn a real export into a safe fixture
│   └── generate-fixtures.ts       # synthetic export generator (all variants)
├── src/
│   ├── core/
│   │   ├── result.ts
│   │   ├── ids.ts                 # branded ID types + constructors
│   │   ├── model/                 # domain types (§7)
│   │   ├── dates/                 # LocalDateTime, parsing, ts_key, formatting helpers
│   │   ├── parser/
│   │   │   ├── index.ts           # public API: detectFormat, parseChat, parseChatIterator
│   │   │   ├── normalize.ts       # BOM, newlines, bidi/space normalization
│   │   │   ├── header-patterns.ts # candidate header grammars
│   │   │   ├── detect-format.ts
│   │   │   ├── classify.ts        # message kind classification
│   │   │   ├── attachments.ts     # attachment marker extraction + media typing
│   │   │   ├── locale/            # pattern tables per UI language of the exporting phone
│   │   │   │   ├── types.ts
│   │   │   │   └── en.ts
│   │   │   └── version.ts         # PARSER_VERSION (semver)
│   │   ├── fingerprint.ts
│   │   ├── merge.ts               # merge plan for re-import
│   │   ├── chat-meta.ts           # title from filename, group detection
│   │   └── text-format/           # WhatsApp *bold* _italic_ ~strike~ ```mono``` tokenizer
│   ├── storage/
│   │   ├── repository.ts          # ChatRepository interface (§10.5)
│   │   ├── sqlite/
│   │   │   ├── open.ts            # sqlite-wasm init + opfs-sahpool install
│   │   │   ├── migrations/        # 0001_init.sql.ts, 0002_*.ts …
│   │   │   ├── migrate.ts
│   │   │   ├── sqlite-repository.ts
│   │   │   └── rows.ts            # row ↔ domain mapping (validated)
│   │   └── media-store.ts         # OPFS media/thumbnail paths, sync-handle writes
│   ├── workers/
│   │   ├── db.worker.ts
│   │   ├── db-api.ts              # interface exposed via Comlink
│   │   ├── import.worker.ts
│   │   ├── import-api.ts
│   │   └── thumbnails.ts
│   ├── client/
│   │   ├── db-client.ts
│   │   └── import-client.ts
│   ├── platform/
│   │   ├── capabilities.ts
│   │   ├── persistence.ts
│   │   ├── install.ts             # standalone detection
│   │   └── audio.ts               # canPlayType + opus fallback decode
│   └── app/
│       ├── main.tsx
│       ├── config.ts              # APP_NAME, limits, constants
│       ├── i18n/en.ts             # all UI strings
│       ├── routes.tsx
│       ├── styles/                # tailwind entry, tokens.css
│       ├── components/            # generic UI primitives (Button, Sheet, Toast, icons/…)
│       ├── hooks/
│       ├── queries/               # TanStack Query hooks + query-key factory
│       ├── logging/               # local-only logger
│       └── features/
│           ├── chat-list/
│           ├── chat-view/
│           ├── search/
│           ├── media/
│           ├── import/
│           ├── bookmarks/
│           ├── chat-info/
│           ├── settings/
│           ├── lock/
│           └── shell/             # layout, update prompt, install banner, error boundary
├── tests/
│   ├── fixtures/whatsapp/<variant>/{chat.txt|export.zip, expected.json, README.md}
│   ├── e2e/                       # Playwright specs
│   └── browser/                   # Vitest browser-mode specs (storage, workers)
├── bench/                         # parser + query benchmarks
├── index.html                     # includes CSP meta (§15.1)
├── vite.config.ts
├── vitest.config.ts
├── vitest.browser.config.ts
├── playwright.config.ts
├── eslint.config.js
├── .dependency-cruiser.cjs
├── .size-limit.json
├── lighthouserc.json
├── lefthook.yml
├── tsconfig.json  tsconfig.app.json  tsconfig.node.json  tsconfig.worker.json
├── .editorconfig  .prettierrc  .nvmrc  .gitignore
└── package.json
````

**File naming:** `kebab-case.ts`/`.tsx` for all files. React components are `PascalCase` symbols. Tests sit next to their source as `*.test.ts(x)`, except browser-mode and e2e tests in `tests/`. **Named exports only** (no default exports), except where a tool requires a default (config files).

---

## 6. Core utilities

### 6.1 Result type (`core/result.ts`)

```ts
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
```

- **Expected failures** (bad input, unsupported format, quota exceeded, user cancel) are returned as `Result` with typed error codes.
- **Exceptions** are only for bugs and truly unexpected states. They are caught at worker boundaries and React error boundaries and logged (§18.7).

### 6.2 Branded IDs (`core/ids.ts`)

```ts
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };
export type ChatId = Brand<string, 'ChatId'>;
export type ParticipantId = Brand<string, 'ParticipantId'>;
export type MessageId = Brand<string, 'MessageId'>; // fingerprint (hex)
export type AttachmentId = Brand<string, 'AttachmentId'>;
export type ImportId = Brand<string, 'ImportId'>;
export type BookmarkId = Brand<string, 'BookmarkId'>;
```

New IDs: `crypto.randomUUID()` wrapped in typed constructors. Never cast raw strings to branded types outside `ids.ts` and `storage/sqlite/rows.ts`.

---

## 7. Domain model (`core/model/`)

```ts
export type SourcePlatform = 'ios' | 'android' | 'unknown';
export type DateOrder = 'DMY' | 'MDY' | 'YMD';
export type ClockFormat = '12h' | '24h';

/** Wall-clock time exactly as written in the export. NO timezone. Never convert to UTC. */
export interface LocalDateTime {
  readonly year: number; // 4-digit (2-digit years → 2000 + yy)
  readonly month: number; // 1–12
  readonly day: number; // 1–31
  readonly hour: number; // 0–23
  readonly minute: number; // 0–59
  readonly second: number; // 0–59 (0 if export has no seconds)
}

export type MessageKind =
  'text' | 'media' | 'system' | 'deleted' | 'call' | 'location' | 'contact' | 'poll';

export type MediaType =
  'image' | 'video' | 'audio' | 'voice' | 'sticker' | 'gif' | 'document' | 'contact-card' | 'other';

export type AttachmentStatus =
  | 'present' // file found in zip and stored
  | 'missing' // referenced by name but not in zip
  | 'omitted'; // export made "without media" (placeholder text)

export interface ParsedAttachmentRef {
  readonly fileName: string | null; // null when omitted
  readonly mediaType: MediaType;
  readonly status: 'referenced' | 'omitted';
}

export interface ParsedMessage {
  readonly seq: number; // 0-based order in the source file
  readonly sourceLine: number; // 1-based line number of the header line
  readonly timestamp: LocalDateTime;
  readonly author: string | null; // null for system messages
  readonly kind: MessageKind;
  readonly body: string; // normalized; markers removed; caption for media
  readonly isEdited: boolean;
  readonly attachment: ParsedAttachmentRef | null;
  readonly poll: ParsedPoll | null; // only when kind === 'poll'
  readonly location: { readonly lat: number; readonly lng: number; readonly url: string } | null;
}

export interface ParsedPoll {
  readonly question: string;
  readonly options: readonly { readonly text: string; readonly votes: number | null }[];
}
```

Persisted entities (`Chat`, `Participant`, `Message`, `Attachment`, `Bookmark`, `ImportRecord`) mirror the SQL schema in §10.2, with branded IDs and camelCase fields.

---

## 8. Parser specification (`core/parser/`) — the most critical module

### 8.1 Principles

- **Pure, synchronous, deterministic, total.** Same input and options always produce the same output. Never throws on any input string (property-tested). Malformed lines become warnings, never crashes.
- **Data-driven.** Header grammars and localized phrases live in tables (`header-patterns.ts`, `locale/*.ts`). Logic must not hard-code phrases inline.
- **No silent data loss.** Every non-empty input line ends up in exactly one message's body or in a warning. (Property: the line-accounting invariant, §19.2.)
- **Versioned.** `PARSER_VERSION` (semver) is stored with each import. Bump the minor version when the output changes for any fixture.
- **Evidence-based.** The format examples below are _known examples_. Every pattern added must have a fixture. Record real-world observations in `docs/EXPORT-FORMATS.md`.

### 8.2 Public API

```ts
export interface DetectFormatOptions {
  readonly localeHint?: string;
} // e.g. navigator.language
export interface ParseOptions {
  readonly format: DetectedFormat; // from detectFormat (possibly user-adjusted)
  readonly locales?: readonly LocalePatterns[]; // default: all bundled locales
}

export function detectFormat(
  text: string,
  opts?: DetectFormatOptions,
): Result<DetectedFormat, FormatError>;
export function parseChatIterator(
  text: string,
  opts: ParseOptions,
): Generator<ParseEvent, ParseSummary>;
export function parseChat(text: string, opts: ParseOptions): Result<ParseResult, ParseError>;

export interface DetectedFormat {
  readonly platform: SourcePlatform;
  readonly headerPatternId: string; // id from header-patterns table
  readonly dateOrder: DateOrder;
  readonly dateOrderSource: 'unambiguous' | 'locale-hint' | 'default' | 'user';
  readonly clock: ClockFormat;
  readonly hasSeconds: boolean;
  readonly confidence: number; // 0–1, share of candidate header lines matched
  readonly sampleMessages: readonly ParsedMessage[]; // first 20 parsed, for the preview UI
}

export type ParseEvent =
  | { readonly type: 'message'; readonly message: ParsedMessage }
  | { readonly type: 'warning'; readonly warning: ParseWarning }
  | { readonly type: 'progress'; readonly linesProcessed: number; readonly totalLines: number };

export interface ParseWarning {
  readonly line: number;
  readonly code:
    | 'ORPHAN_LINES_BEFORE_FIRST_MESSAGE'
    | 'INVALID_DATE'
    | 'INVALID_TIME'
    | 'UNRECOGNIZED_ATTACHMENT_MARKER'
    | 'DECODING_REPLACEMENT_CHARS'
    | 'OUT_OF_ORDER_TIMESTAMP';
  readonly detail: string; // must NOT include message content (privacy); counts/positions only
}

export interface ParseResult {
  readonly format: DetectedFormat;
  readonly messages: readonly ParsedMessage[];
  readonly participants: readonly string[]; // distinct non-null authors, in first-seen order
  readonly warnings: readonly ParseWarning[];
  readonly stats: {
    readonly lines: number;
    readonly messages: number;
    readonly system: number;
    readonly media: number;
  };
  readonly parserVersion: string;
}
```

`progress` events are emitted at most every 5,000 lines.

### 8.3 Normalization (`normalize.ts`), applied before anything else

1. Strip a leading BOM (`U+FEFF`).
2. Normalize line endings: `\r\n` and `\r` become `\n`.
3. For **header matching only**, use a copy of the line where:
   - leading `U+200E` (LRM), `U+200F` (RLM), `U+202A–U+202E`, `U+2066–U+2069` are removed;
   - `U+202F` (narrow NBSP) and `U+00A0` (NBSP) are replaced with a regular space (iOS puts these before AM/PM).
4. In message **bodies**: remove `U+200E`/`U+200F` that sit **directly before** known markers (`<attached:`, omitted placeholders, system phrases), and remove a single leading LRM. Preserve all other characters exactly (emoji, RTL text, ZWJ sequences).
5. Never trim internal whitespace. Trim only trailing whitespace at the end of the whole message body.

### 8.4 Header grammar (`header-patterns.ts`)

A **header line** starts a new message. Candidate grammars (each has an `id`) include at least:

| id                     | Platform | Shape (after normalization) |
| ---------------------- | -------- | --------------------------- |
| `ios-bracket`          | iOS      | `[DATE, TIME] REST`         |
| `ios-bracket-nocomma`  | iOS      | `[DATE TIME] REST`          |
| `android-dash`         | Android  | `DATE, TIME - REST`         |
| `android-dash-nocomma` | Android  | `DATE TIME - REST`          |

- `DATE` = three numeric groups separated by `/`, `.` or `-` (e.g. `17/11/2026`, `11/17/26`, `17.11.26`, `2026-11-17`). A trailing `.` after the year is allowed (`17.11.26.`).
- `TIME` = `H:MM` or `HH:MM`, optional `:SS`, separator `:` or `.`, optional meridiem with an optional space: `AM`, `PM`, `am`, `pm`, `a.m.`, `p.m.`, `a. m.`, `p. m.`. Meridiem tokens are also provided by locale tables (§8.7).
- `REST` = everything after the header delimiter.

**Format detection algorithm (`detect-format.ts`):**

1. Take the first 1,000 non-empty lines (or all lines if fewer).
2. For each candidate grammar, count lines that match it. Pick the grammar with the highest count. `confidence = matches / candidateHeaderLikeLines`, where "header-like" means the line starts with `[` + digit or with a digit. Ties go to the grammar listed first.
3. If no grammar matches at least 3 lines (or at least 1 line when the file has fewer than 3 lines), return `err({ code: 'UNRECOGNIZED_FORMAT' })`.
4. **Date order:** scan **all** header lines in the file, not just the sample.
   - If a 4-digit number is in the first position → `YMD`.
   - Else if any first component > 12 → `DMY` (`unambiguous`).
   - Else if any second component > 12 → `MDY` (`unambiguous`).
   - If both happen (inconsistent) → `UNRECOGNIZED_FORMAT`.
   - Else (ambiguous) → use `localeHint`: `en-US` and other month-first locales → `MDY`, otherwise `DMY` (`locale-hint`). With no hint → `DMY` (`default`).
   - **The import UI must ask the user to confirm whenever `dateOrderSource !== 'unambiguous'`** (§12.8).
5. **Clock:** `12h` if any header has a meridiem token, else `24h`. **Seconds:** `true` if any header has `:SS`.
6. **Platform:** `ios-*` grammars → `ios`, `android-*` → `android`.

### 8.5 Line assembly

- Lines that match the chosen grammar start a new message.
- **Any other line is a continuation**: append `\n` + the line to the current message body. This includes empty lines inside a multi-line message.
- Lines before the first header produce one `ORPHAN_LINES_BEFORE_FIRST_MESSAGE` warning (with the count) and are otherwise ignored.
- An invalid date/time in a header-shaped line (e.g. month 13) → `INVALID_DATE`/`INVALID_TIME` warning, and the line is treated as a continuation (no data loss).
- 2-digit years → `2000 + yy`.
- 12h conversion: `12 AM → 0`, `12 PM → 12`, `1–11 PM → +12`.
- If a timestamp is earlier than the previous message's → `OUT_OF_ORDER_TIMESTAMP` warning (once per 1,000 lines max). **Order is still file order** (`seq`).

### 8.6 Author / system split and classification (`classify.ts`)

Given `REST` (normalized):

1. **System check first, on the whole `REST`.** If `REST` matches any system pattern in the locale tables (e.g. "X added Y", "X created group "…"", "Messages and calls are end-to-end encrypted…", "X changed the subject from "a: b" to …", "X left", "You were added", "X changed this group's icon", "X changed their phone number…", "Disappearing messages…") → `kind: 'system'`, `author: null`, `body = REST`.
   This must happen **before** splitting on `": "`, because system texts can contain `": "`.
2. Otherwise split at the **first** `": "`. Left = author, right = body.
   - **iOS special case:** iOS writes system events as `[ts] <Group or contact name>: ‎<system text>`. If the right side (after removing a leading LRM) matches a system pattern → `kind: 'system'`, `author: null`, `body = right side`.
3. No `": "` and no system match → `kind: 'system'`, `author: null` (unknown system event; keep the text).
4. With an author, classify the body (first match wins):
   - **Edited:** a trailing `<This message was edited>` (locale table) is stripped → `isEdited: true`. Then continue classifying.
   - **Deleted:** `This message was deleted` / `You deleted this message` (locale table) → `deleted`.
   - **Attachment present:** iOS `<attached: FILENAME>` anywhere in the first line; Android `FILENAME (file attached)` as the first line → `media` with `status: 'referenced'`. The remaining text (other lines) is the caption (`body`).
   - **Attachment omitted:** `<Media omitted>`, `image omitted`, `video omitted`, `audio omitted`, `sticker omitted`, `GIF omitted`, `document omitted`, `Contact card omitted` (locale table) → `media`, `status: 'omitted'`, `mediaType` inferred from the phrase where possible, else `'other'`.
   - **Location:** body starts with `location: ` followed by a maps URL with coordinates (e.g. `https://maps.google.com/?q=LAT,LNG`) → `location` with parsed lat/lng. If coordinates can't be parsed → `text`.
   - **Contact:** a `.vcf` attachment → `contact` (still carries the attachment).
   - **Poll:** body starts with `POLL:` → `poll`. Next line = question. Lines `OPTION: <text> (<n> vote[s])` → options. Unparseable → `text`.
   - **Call:** `Missed voice call`, `Missed video call`, `Voice call`, `Video call` (locale table, iOS) → `call`.
   - Else → `text`.

### 8.7 Locale pattern tables (`locale/`)

```ts
export interface LocalePatterns {
  readonly id: string; // 'en'
  readonly meridiem: { readonly am: readonly string[]; readonly pm: readonly string[] };
  readonly system: readonly RegExp[]; // anchored, unicode flag
  readonly deleted: readonly RegExp[];
  readonly edited: readonly RegExp[]; // trailing marker
  readonly omitted: readonly { readonly re: RegExp; readonly mediaType: MediaType }[];
  readonly attachedIos: RegExp; // <attached: (.+?)>
  readonly attachedAndroid: RegExp; // ^(.+?) \(file attached\)$
  readonly calls: readonly RegExp[];
  readonly pollPrefix: string; // 'POLL:'
  readonly pollOption: RegExp;
  readonly locationPrefix: string; // 'location: '
}
```

- v1 ships **English (`en`)**. The design must make adding a language a matter of adding a table file plus fixtures, with no logic changes.
- All regexes use the `u` flag and are anchored. **No catastrophic backtracking.** Each regex has a fast-check test running 10k random inputs under a time budget.

### 8.8 Attachment media typing (`attachments.ts`)

Map by file name (case-insensitive):

- iOS names like `00000012-PHOTO-2026-11-17-21-19-03.jpg`. Infix: `PHOTO` → image, `VIDEO` → video, `AUDIO` → voice (if `.opus`) else audio, `STICKER` → sticker, `GIF` → gif (often `.mp4`), otherwise by extension.
- Android names like `IMG-20261117-WA0001.jpg`. Prefix: `IMG` → image, `VID` → video, `PTT` → voice, `AUD` → audio, `STK` → sticker, `DOC` → document, otherwise by extension.
- Extensions: `jpg jpeg png heic webp` → image (`webp` with a sticker hint → sticker), `mp4 mov 3gp` → video, `opus ogg` → voice, `m4a mp3 aac wav amr` → audio, `vcf` → contact-card, `pdf doc docx xls xlsx ppt pptx txt zip` and others → document.
- MIME is derived from the extension via a static table (no sniffing libraries).

### 8.9 Chat metadata (`chat-meta.ts`)

- Title from the archive or `.txt` filename: `WhatsApp Chat - (.+)\.(zip|txt)` (iOS) or `WhatsApp Chat with (.+)\.(zip|txt)` (Android). Fall back to the filename without extension. The user can edit it in the confirm step.
- `isGroup = true` if distinct authors > 2, **or** any group-only system event was seen (added/removed/left/created group/changed subject). Else `false`.
- Self ("me") cannot be detected reliably. The **user chooses** in the import flow (§12.8). For 1:1 chats, pre-select the author who is _not_ in the title. If unknown, pre-select nothing.

### 8.10 Fingerprinting and merge (`fingerprint.ts`, `merge.ts`)

- `fingerprint = hex(SHA-256(utf8(join('\u001F', [tsCanonical, author ?? '\u0000', kind, body, attachmentFileName ?? '', String(occurrence)])))).slice(0, 32)`.
  - `tsCanonical` = `YYYY-MM-DDTHH:MM:SS`.
  - `occurrence` = how many earlier messages **in the same file** have the identical `(tsCanonical, author, kind, body, attachmentFileName)` tuple. This preserves legitimately repeated messages, like two "ok"s in the same minute.
  - SHA-256 via `crypto.subtle.digest` (available in workers). `core` receives the hash function **injected** (`(bytes: Uint8Array) => Promise<Uint8Array>`), so `core` stays free of browser APIs and is testable in Node.
- **Merge** (re-importing into an existing chat): input is two ordered lists, `existing` (by `seq`) and `incoming` (by file order). Walk both like a merge:
  1. If both heads have the same fingerprint → emit once (keep the existing row; attach newly present media if the existing one was `omitted`/`missing`), advance both.
  2. Else if `incoming.head` exists anywhere in `existing` (use a hash set) → emit `existing.head`, advance `existing`. If `existing.head` exists anywhere in `incoming` → emit `incoming.head`, advance `incoming`.
  3. Else emit the head with the smaller `ts_key`. On a tie, emit `existing` first.
  4. Output: a final ordered list, renumbered `seq = 0..n-1`, plus counts `{ added, duplicates, mediaUpgraded }`.
- The merge is pure and property-tested: idempotent (importing the same file twice adds 0), order-preserving for each input, no message lost.

---

## 9. Import pipeline (`workers/import.worker.ts`)

### 9.1 Phases (reported to the UI as typed progress events)

`reading-archive` → `detecting` → **`awaiting-confirmation`** → `parsing` → `fingerprinting` → `writing-media` → `thumbnails` → `committing` → `indexing` → `done` | `failed` | `cancelled`.

Each event: `{ phase, current, total, importId }`. The UI shows a determinate progress bar per phase and an overall step indicator.

### 9.2 Steps

1. **Open the archive.** Accept `.zip` or `.txt` (validate by extension **and** magic bytes: zip = `PK\x03\x04`). Validate size and fail fast if `navigator.storage.estimate()` reports less free quota than `1.1 × uncompressed size`.
2. **Locate the chat text.** Pick, in order: an entry named `_chat.txt` → an entry matching `WhatsApp Chat*.txt` → the largest `.txt`. Reject archives with path traversal (`..`, absolute paths) in entry names. Ignore `__MACOSX/` and dotfiles.
3. **Decode** with `new TextDecoder('utf-8', { fatal: false })`. If replacement chars (`U+FFFD`) appear, emit a `DECODING_REPLACEMENT_CHARS` warning with the count.
4. **Detect** the format and return `DetectedFormat` plus metadata (title, participants, isGroup, suggested target chat for merge) to the main thread. **Pause.**
5. **Confirmation** comes back from the UI: final `DetectedFormat` (date order may be user-overridden), title, self participant, target (new chat, or merge into an existing `ChatId`).
6. **Parse** the whole file (iterator; forward progress).
7. **Fingerprint and merge plan** (if merging, fetch existing `(fingerprint, seq, ts_key, attachment status)` from db.worker).
8. **Write media.** For each referenced attachment whose file exists in the zip and isn't already stored: stream the entry → OPFS file via `FileSystemSyncAccessHandle` (worker), path `media/<chatId>/<attachmentId>.<ext>`. Missing files → status `missing`. Track every written path in memory **and** in the `imports` row (`written_paths_json`, flushed every 100 files) for rollback.
9. **Thumbnails** for images: decode with `createImageBitmap(blob)`, draw into an `OffscreenCanvas` scaled to a max 320 px long edge, `convertToBlob({ type: 'image/jpeg', quality: 0.8 })`, path `thumbs/<chatId>/<attachmentId>.jpg`. Record `width`/`height` of the original. On failure, use no thumbnail (gallery shows a type icon) and log the error code. Video thumbnails are generated lazily on the main thread (§13.3).
10. **Commit.** Send to db.worker in **one SQLite transaction**: upsert chat, participants, messages (batched prepared statements, 2,000 rows per batch inside the same transaction), attachments, FTS rows, chat aggregates. Then set the import status to `complete`.
11. **Report:** messages added, duplicates skipped, media stored/missing/omitted, warnings grouped by code, duration. Persist it in `imports.report_json`.

### 9.3 Cancellation and crash safety (mandatory)

- The user can cancel during any phase before `committing`. Cancel → delete all OPFS paths written for this import → mark the import `cancelled`.
- At app start, db.worker finds `imports` with status `in_progress`. For each, it deletes the listed written paths and any rows tagged with that `import_id` (there should be none, since the commit is atomic), then marks the import `rolled_back`. This guarantees no orphaned media after a crash or tab kill.
- An orphan sweeper (Settings → Storage → "Clean up") lists OPFS media files with no attachment row and deletes them after confirmation.

### 9.4 Memory rules

- **Never** read the whole zip into memory. Never hold more than one media entry's bytes at a time in the import worker.
- The text file is read fully. That's acceptable: 100k messages ≈ 10–20 MB.
- Transfer `ArrayBuffer`s between threads (Transferable), never copy them.

---

## 10. Storage (`storage/`)

### 10.1 SQLite setup (`sqlite/open.ts`)

- Initialize `@sqlite.org/sqlite-wasm` in db.worker. Install **`opfs-sahpool`** (`installOpfsSAHPoolVfs`) with a fixed directory name (`chatkeep-db`). Open `chatkeep.sqlite3` with that VFS.
- Pragmas at open: `journal_mode=DELETE` (WAL is not supported by this VFS), `foreign_keys=ON`, `synchronous=NORMAL`, `temp_store=MEMORY`, `cache_size=-16000`.
- At boot, verify FTS5 with the trigram tokenizer: `CREATE VIRTUAL TABLE temp.t USING fts5(x, tokenize='trigram')`. If it fails → capability failure screen (§12.11). Do not silently degrade.
- Only one tab/instance may own the DB. Use the `navigator.locks` API (`request('chatkeep-db', { ifAvailable: true })`). A second tab shows "ChatKeep is open in another window".

### 10.2 Schema (migration `0001_init`)

```sql
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE chats (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  is_group             INTEGER NOT NULL CHECK (is_group IN (0,1)),
  self_participant_id  TEXT NULL,
  source_platform      TEXT NOT NULL CHECK (source_platform IN ('ios','android','unknown')),
  date_order           TEXT NOT NULL CHECK (date_order IN ('DMY','MDY','YMD')),
  message_count        INTEGER NOT NULL DEFAULT 0,
  media_count          INTEGER NOT NULL DEFAULT 0,
  media_bytes          INTEGER NOT NULL DEFAULT 0,
  first_ts_key         INTEGER NULL,
  last_ts_key          INTEGER NULL,
  last_message_preview TEXT NULL,
  created_at           TEXT NOT NULL,   -- ISO-8601 UTC (app clock), for app bookkeeping only
  updated_at           TEXT NOT NULL
) STRICT;

CREATE TABLE participants (
  id             TEXT PRIMARY KEY,
  chat_id        TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  display_name   TEXT NOT NULL,
  color_index    INTEGER NOT NULL,
  message_count  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chat_id, display_name)
) STRICT;

CREATE TABLE messages (
  id             INTEGER PRIMARY KEY,           -- rowid alias; used as FTS external content rowid
  chat_id        TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  fingerprint    TEXT NOT NULL,
  seq            INTEGER NOT NULL,
  ts_local       TEXT NOT NULL,                 -- 'YYYY-MM-DDTHH:MM:SS' wall clock
  ts_key         INTEGER NOT NULL,              -- seconds since 1970 treating ts_local as if UTC (ordering/range only)
  author_id      TEXT NULL REFERENCES participants(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('text','media','system','deleted','call','location','contact','poll')),
  body           TEXT NOT NULL,
  is_edited      INTEGER NOT NULL CHECK (is_edited IN (0,1)),
  extra_json     TEXT NULL,                     -- poll/location payload, validated on read
  import_id      TEXT NOT NULL REFERENCES imports(id),
  UNIQUE (chat_id, fingerprint),
  UNIQUE (chat_id, seq)
) STRICT;
CREATE INDEX idx_messages_chat_ts     ON messages(chat_id, ts_key);
CREATE INDEX idx_messages_chat_author ON messages(chat_id, author_id);
CREATE INDEX idx_messages_chat_kind   ON messages(chat_id, kind);

CREATE TABLE attachments (
  id           TEXT PRIMARY KEY,
  message_id   INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  chat_id      TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  file_name    TEXT NULL,
  media_type   TEXT NOT NULL CHECK (media_type IN ('image','video','audio','voice','sticker','gif','document','contact-card','other')),
  mime         TEXT NULL,
  byte_size    INTEGER NULL,
  opfs_path    TEXT NULL,
  thumb_path   TEXT NULL,
  width        INTEGER NULL,
  height       INTEGER NULL,
  duration_ms  INTEGER NULL,
  status       TEXT NOT NULL CHECK (status IN ('present','missing','omitted'))
) STRICT;
CREATE INDEX idx_attachments_chat_type ON attachments(chat_id, media_type, status);

CREATE TABLE bookmarks (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  note        TEXT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (message_id)
) STRICT;

CREATE TABLE imports (
  id                 TEXT PRIMARY KEY,
  chat_id            TEXT NULL,
  file_name          TEXT NOT NULL,
  file_bytes         INTEGER NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('in_progress','complete','cancelled','failed','rolled_back')),
  parser_version     TEXT NOT NULL,
  started_at         TEXT NOT NULL,
  finished_at        TEXT NULL,
  written_paths_json TEXT NOT NULL DEFAULT '[]',
  report_json        TEXT NULL
) STRICT;

CREATE VIRTUAL TABLE messages_fts USING fts5(
  body,
  content='messages',
  content_rowid='id',
  tokenize='trigram'
);
-- Triggers keep FTS in sync (insert/delete/update of body).
```

- `ts_key` is only for ordering and range filters. **Display always formats from `ts_local`.**
- Merging re-numbers `seq` for the chat inside the same transaction. To avoid transient `UNIQUE(chat_id, seq)` conflicts, first offset by `+1e9`, then renumber.
- `color_index` = stable hash of `display_name` modulo the palette size (§12.2).
- Chat aggregates (`message_count`, `media_*`, `first/last_ts_key`, `last_message_preview`) are recomputed inside the import/delete transaction. They are never computed on read.

### 10.3 Migrations (`sqlite/migrate.ts`)

- `meta.schema_version` (integer). Migrations are an ordered array of `{ version, up(db) }` in TS files. Each migration runs in a transaction. **No down-migrations**: back up before migrating (§10.6).
- On boot: if the DB version > the app's known version → refuse to open and show "Please update the app" (never corrupt data).
- Every migration has a browser-mode test: create a DB at version N-1 with fixture data → migrate → assert data integrity.

### 10.4 Media store (`media-store.ts`)

- Root: `navigator.storage.getDirectory()`. Directories: `media/<chatId>/`, `thumbs/<chatId>/`, `backup-tmp/`.
- Writes happen in workers via `createSyncAccessHandle()` (supported on iOS). Do **not** depend on `createWritable()`.
- Reads (main thread): `getFileHandle(path) → getFile()` → object URL via an `ObjectUrlCache` (LRU, max 200 entries, revoke on eviction and on route change).
- Deleting a chat removes its rows (cascade) **and** `media/<chatId>/` and `thumbs/<chatId>/` recursively. Delete the files after the DB commit. If the file delete fails, the orphan sweeper (§9.3) catches it later.

### 10.5 Repository interface (`storage/repository.ts`)

```ts
export interface ChatRepository {
  listChats(): Promise<readonly ChatSummary[]>;
  getChat(id: ChatId): Promise<Chat | null>;
  getParticipants(chatId: ChatId): Promise<readonly Participant[]>;
  getMessageWindow(q: {
    chatId: ChatId;
    anchorSeq: number;
    before: number;
    after: number;
  }): Promise<MessageWindow>;
  findSeqByDate(chatId: ChatId, date: LocalDateTime): Promise<number | null>; // first seq at/after
  search(q: SearchQuery): Promise<SearchPage>;
  listAttachments(q: {
    chatId: ChatId;
    types: readonly MediaType[];
    cursor: number | null;
    limit: number;
  }): Promise<AttachmentPage>;
  listLinks(q: { chatId: ChatId; cursor: number | null; limit: number }): Promise<LinkPage>;
  getChatStats(chatId: ChatId): Promise<ChatStats>;
  setSelf(chatId: ChatId, participantId: ParticipantId | null): Promise<void>;
  renameChat(chatId: ChatId, title: string): Promise<void>;
  deleteChat(chatId: ChatId): Promise<void>;
  addBookmark(messageRowId: number, note: string | null): Promise<BookmarkId>;
  updateBookmark(id: BookmarkId, note: string | null): Promise<void>;
  removeBookmark(id: BookmarkId): Promise<void>;
  listBookmarks(chatId: ChatId | null): Promise<readonly BookmarkView[]>;
  listImports(chatId: ChatId): Promise<readonly ImportRecord[]>;
  storageUsage(): Promise<StorageUsage>;
}
```

- All SQL lives in `sqlite-repository.ts` (or files split by concern under `sqlite/queries/`). **Only parameterized statements.** String-concatenating values into SQL is forbidden (lint rule plus review).
- Every row read from SQLite is validated by a Valibot schema in `rows.ts` before it becomes a domain object.
- The repository is tested with **contract tests** (`tests/browser/repository.contract.test.ts`) in Vitest browser mode against the real sqlite-wasm in WebKit and Chromium.

### 10.6 Backup and restore

- **Backup** (Settings → Backup): choose "All chats" or a single chat, with or without media. Produces `chatkeep-backup-YYYYMMDD-HHMM.zip`:
  - `manifest.json`: `{ app, appVersion, schemaVersion, createdAt, chats: [...], includesMedia }`
  - `db.sqlite3`: a consistent snapshot (sahpool `exportFile`, or `VACUUM INTO` when exporting a subset into a temp DB in `backup-tmp/`)
  - `media/…` and `thumbs/…` when media is included.
- The zip is written with zip.js streaming into an OPFS temp file, then offered via `navigator.share({ files })` when available, or a download link otherwise. Show the estimated size first, and warn above 1 GB that very large backups may fail on iPhone memory limits (recommend per-chat backups).
- **Restore:** pick a backup zip → validate the manifest with Valibot → check `schemaVersion` ≤ current → preview the chats it contains → for each chat choose "skip" / "replace" / "merge" (merge uses §8.10 fingerprints) → atomic commit with the same rollback rules as §9.3.
- Also available: "Re-import original export". The original exports are the user's primary safety net. The README and Settings must say so.

---

## 11. Search

- **Engine:** FTS5 with the `trigram` tokenizer, which gives substring search in any script (Latin, Urdu/Arabic, CJK, emoji sequences).
- **Queries of 3+ characters:** FTS `MATCH` with the user's query escaped as a phrase (wrap in double quotes, double any internal quotes). Never pass raw user input as FTS syntax.
- **Queries of 1–2 characters:** fall back to `body LIKE ? ESCAPE '\'`. In-chat search only, limited to 500 results, with a UI hint.
- **Filters:** chat, author, kind(s), date range (`ts_key` between). Sort: newest first (global), or by `seq` (in-chat).
- **Results:** `{ messageRowId, chatId, seq, tsLocal, authorName, snippet }`. Snippets are built in TS from `body` (±40 chars around the first match, ellipsized). **Never use FTS `snippet()` HTML markup.** Highlight by splitting the text into React text/`<mark>` nodes.
- **Pagination:** keyset (cursor = last `ts_key, rowid`), page size 50.
- **In-chat search UI:** a result counter ("12 of 87"), up/down to jump, and the jump scrolls the virtualized list to the result's `seq` with a brief highlight.
- **Performance:** ≤ 150 ms for a query on a 100k-message chat on an iPhone 12-class device (§17).

---

## 12. UI / UX specification

### 12.1 General

- Mobile-first, portrait-first, iPhone layout first. The iPad and desktop layout is a two-pane split (chat list | chat view) at ≥ 768 px.
- System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …`). Respect iOS Dynamic Type via `rem`-based sizing and `font: -apple-system-body` on the root for iOS.
- Light and dark themes following `prefers-color-scheme`, plus a manual override (System / Light / Dark) in Settings.
- Respect `env(safe-area-inset-*)` everywhere (notch, home indicator).
- Touch targets ≥ 44×44 pt. No hover-only affordances.
- Respect `prefers-reduced-motion`: no smooth-scroll or animated transitions when it is set.
- **All UI strings** come from `app/i18n/en.ts`, a typed object. No string literals in JSX except punctuation.
- Dates and times are formatted with `Intl.DateTimeFormat(locale, { …, timeZone: 'UTC' })` applied to `Date.UTC(...)` built from `LocalDateTime`. **This avoids any timezone shift.** Wrap it in `core/dates/format.ts`, and test it explicitly under multiple process timezones (`TZ=Asia/Karachi`, `TZ=America/Los_Angeles`, `TZ=UTC`).

### 12.2 Visual design

- Original design: a clean messaging look (bubbles, chat list), not a pixel copy of WhatsApp. Use our own color palette defined as CSS variables in `styles/tokens.css` (surface, bubble-in, bubble-out, text, muted, accent, danger, focus-ring) for both themes. All text/background pairs must meet **WCAG AA contrast** (4.5:1 body, 3:1 large text). Verify with a unit test over the token pairs.
- 12-color participant name palette, AA-compliant against bubble backgrounds in both themes.
- Logical CSS properties only (`margin-inline-start`, `padding-inline`, `inset-inline-end`). **No `left`/`right`** for layout, so RTL works. Tailwind: use the logical utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`).

### 12.3 Routes (HashRouter)

| Route                  | Screen                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ |
| `#/`                   | Chat list                                                                      |
| `#/chat/:chatId`       | Chat view (`?seq=N` jumps to a message; `?q=` opens in-chat search)            |
| `#/chat/:chatId/info`  | Chat info and stats                                                            |
| `#/chat/:chatId/media` | Media gallery (`?tab=photos                                                    | videos | audio | docs | links`) |
| `#/search`             | Global search (`?q=`)                                                          |
| `#/bookmarks`          | Bookmarks                                                                      |
| `#/import`             | Import flow                                                                    |
| `#/settings`           | Settings (sub-sections: appearance, lock, storage, backup, diagnostics, about) |

Every route has its own error boundary and loading state. Unknown routes → redirect to `#/`. Route params are validated with Valibot. Invalid → "Not found" state.

### 12.4 Chat list

- Rows: avatar circle (initials and color from title hash), title, last-message preview (sender prefix in groups, a media-type label for media), date of the last message (today → time; this week → weekday; else short date), group icon.
- Sorted by `last_ts_key` desc. A search field filters titles locally (instant).
- Empty state: an explanation and an "Import a chat" button, plus install instructions if not standalone.
- Toolbar: Import (+), Search, Bookmarks, Settings.
- Long-press/context menu on a row: Rename, Chat info, Delete (confirmation sheet showing the message and media counts and bytes).

### 12.5 Chat view

- Header: back, title, participant count (groups), buttons: search, jump-to-date, info.
- **Virtualized list** (`@tanstack/react-virtual`, dynamic measurement, `overscan` ~10). Data loads in windows of 300 messages around an anchor `seq` via `getMessageWindow`. More windows load as the user scrolls in either direction. The initial anchor is the **last** message, with the scroll position at the bottom.
- Scroll position per chat is remembered in memory for the session (and in `meta` for the last chat), so returning restores it.
- **Day separators** between messages on different calendar days (sticky pill showing the current day while scrolling).
- **Bubbles:**
  - Outgoing (author = self) aligned to the end. Incoming aligned to the start. If self is unset, everything is incoming and a dismissible banner offers "Choose which person is you".
  - Group incoming bubbles show the sender name (colored) on the first bubble of a consecutive run by the same author within 5 minutes. Consecutive bubbles are visually grouped (tighter spacing, tail only on the first).
  - Time in the bubble corner (`h:mm a` or `HH:mm` per device locale). An "edited" label if `isEdited`.
  - `dir="auto"` and `unicode-bidi: plaintext` on text content, so each bubble's direction follows its content (Urdu/Arabic RTL, mixed text).
  - **Text formatting** (WhatsApp syntax): `*bold*`, `_italic_`, `~strike~`, `` `inline code` ``, ` ```monospace``` `, `> quote` lines, `- `/`* ` bullet lists, `1. ` numbered lists. Implement as a tokenizer in `core/text-format` → AST → React renderer. Never HTML strings.
  - **Links** via linkify-it → `<a href target="_blank" rel="noopener noreferrer">`. Only `http:`, `https:`, `mailto:`, `tel:` schemes are allowed. Anything else renders as text. Phone numbers are not auto-linked (avoid false positives) unless explicitly `tel:`.
  - Emoji-only messages of 1–3 emoji render larger (jumbomoji).
- **System messages:** centered muted pill, no bubble.
- **Deleted:** italic muted "This message was deleted" with an icon.
- **Call:** an icon plus text pill.
- **Location:** a card with coordinates and an "Open in Maps" link (`https://maps.apple.com/?ll=lat,lng`). **No map tiles** (no network).
- **Poll:** a card with the question, options and vote counts.
- **Contact:** a card with the name parsed from the `.vcf` `FN:` line (parsed in a worker, with a size limit), plus an action to share/download the `.vcf`.
- **Media bubbles:** see §13. `omitted` → placeholder "Media not included in export". `missing` → "Media file not found in archive".
- **Message actions** (long-press or context menu): Copy text, Bookmark / Edit note, Share text (`navigator.share`), Show info (timestamp, sender, kind, import). From search results: "Show in chat".
- **Jump to date:** a bottom sheet with a custom calendar (no dependency) limited to the chat's date range. Days with messages are marked (query distinct dates). Picking a day → `findSeqByDate` → scroll there.
- **Jump to bottom** floating button when scrolled up, with an unread-style count of messages below the viewport.

### 12.6 Media gallery

- Tabs: Photos (includes stickers/GIF), Videos, Audio (voice + audio), Documents, Links.
- Grid of thumbnails (3 columns phone, 5+ wide screens), virtualized, grouped by month headers.
- Tap → full-screen viewer:
  - **Image:** pinch-zoom, double-tap zoom, pan, swipe left/right between items, swipe down to close. Implemented with pointer events. Respects reduced motion.
  - **Video:** native `<video controls playsinline>`.
  - **Audio:** custom player (§13.2).
  - **Document:** file-type icon, name, size. Actions: Open (object URL in a new tab, which iOS previews natively for PDFs), Share (`navigator.share({ files })`), Save.
  - Every viewer has "Show in chat" (jump to the message).
- **Links tab:** all URLs extracted from text messages (computed by a query over `body` plus TS linkify, paginated). Shows domain and the surrounding message snippet.

### 12.7 Chat info

- Title (editable), group/1:1, date range, totals by kind, media counts and bytes, participants list with message counts and a simple CSS bar chart (no chart library), "This is me" selector, import history (date, file, added/duplicates, parser version, warnings summary), "Re-import / update from newer export", "Delete chat".

### 12.8 Import flow (`#/import`)

1. **Install gate:** if not running standalone, show a blocking explanation: "Install the app to your Home Screen first. Data imported in a Safari tab is stored separately and can be deleted by Safari." Include step-by-step instructions with original illustrations. Advanced users can bypass with "Continue anyway (not recommended)".
2. **Pick file:** `<input type="file" accept=".zip,.txt,application/zip,text/plain">`. Show instructions for exporting from WhatsApp on iPhone and Android ("Export Chat → Attach Media → Save to Files").
3. **Detecting** (spinner).
4. **Confirm screen:**
   - Detected platform, date order, clock. If `dateOrderSource !== 'unambiguous'`, show a **DMY/MDY toggle with a live preview** of the first 20 messages rendered as bubbles with formatted dates. The user must explicitly confirm.
   - Chat title (editable).
   - "Which one is you?" (participants list plus "Skip for now").
   - Target: "New chat", or "Update existing chat: <title>" (pre-selected when the title matches an existing chat).
   - Summary: messages, participants, media files found, archive size, available storage.
5. **Progress:** phase steps plus a progress bar, with a Cancel button. Keep the screen awake if `navigator.wakeLock` is available. Warn "Keep the app open until import finishes".
6. **Report:** success summary, warnings grouped by code with plain-language explanations, and an "Open chat" button.

- Errors are shown in plain language with a "Copy diagnostic details" button. Diagnostics contain only codes, counts and versions, **never message content**.

### 12.9 Settings

- **Appearance:** theme.
- **App lock** (§15.3).
- **Storage:** total used/quota (`navigator.storage.estimate()`), per-chat usage list, persistent storage status (`navigator.storage.persisted()`) with a "Request" button (also requested automatically after the first successful import), "Clean up orphaned files".
- **Backup and restore** (§10.6).
- **Diagnostics:** app version, parser version, schema version, capability report, local log viewer (§18.7) with copy/clear.
- **About:** privacy statement ("Your chats never leave this device. The app makes no network requests for your data."), licenses of bundled dependencies (generated at build time into a static JSON), link to the source repository.

### 12.10 Install detection and banner (`platform/install.ts`)

- Standalone = `matchMedia('(display-mode: standalone)').matches || navigator.standalone === true`.
- Not standalone on iOS → a persistent but dismissible banner on the chat list, plus the import gate (§12.8).

### 12.11 Capability check (boot)

Check before rendering the app: Web Workers (module), WebAssembly, OPFS `getDirectory`, `createSyncAccessHandle` inside a worker, FTS5 trigram, `crypto.subtle`, `navigator.locks`. Any failure → a full-screen "This browser isn't supported" page that lists the failed capabilities and the minimum requirements (iOS 17+). Never a blank screen.

### 12.12 Update flow

vite-plugin-pwa `registerType: 'prompt'`. When a new service worker is waiting → toast: "Update available" [Reload]. **Never auto-reload. Suppress the prompt while an import or restore is running**, and show it after.

---

## 13. Media handling

### 13.1 Images and stickers

- Show thumbnails in bubbles and the grid (lazy, `loading="lazy"`, decoded async) and the full image in the viewer. Reserve space with `aspect-ratio` from the stored `width`/`height` to avoid layout shift in the virtualized list.
- WebP stickers render without bubble chrome, at a max of 160 px.

### 13.2 Audio and voice notes (`platform/audio.ts`)

- Check `audio.canPlayType('audio/ogg; codecs=opus')`. If it returns `''`, decode with **ogg-opus-decoder** in a worker (lazy-loaded chunk) into PCM, encode as WAV (own tiny encoder in `platform/audio.ts`), cache the WAV in OPFS `cache/audio/<attachmentId>.wav`, and play via `<audio>`.
- Custom player: play/pause, seek bar, elapsed/total, playback speed (1×, 1.5×, 2×). Only one item plays at a time (global audio controller). Pause on `visibilitychange` → hidden.
- Duration is computed on first play and stored in `attachments.duration_ms`.

### 13.3 Video

- Native `<video playsinline controls preload="metadata">` from an object URL.
- Lazy video thumbnails: when a video tile is visible and has no thumbnail, the main thread creates an offscreen `<video>`, seeks to `min(1 s, duration/2)`, draws to a canvas, saves a JPEG to OPFS via db.worker → media-store, and updates `thumb_path`. At most 2 run concurrently. Failure → type icon.

### 13.4 Documents and contacts

See §12.5 and §12.6. Never render document contents inline inside the app (no PDF.js). Hand off to the OS.

---

## 14. PWA and offline

- **Manifest** (via vite-plugin-pwa): `name`, `short_name` (`APP_NAME`), `start_url: './'`, `scope: './'`, `display: 'standalone'`, `background_color`/`theme_color` matching the tokens, icons 192/512 plus maskable. Original icon artwork (not the WhatsApp logo).
- **iOS head tags:** `apple-touch-icon` (180×180), `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `theme-color` for light and dark (`media` attribute), and splash images for common iPhone sizes (generated at build time from one source SVG via a script; no external services).
- **Service worker:** Workbox `generateSW`. Precache **all** build assets including `.wasm` and worker chunks (`globPatterns` must include `**/*.{js,css,html,wasm,svg,png,webmanifest}`). `navigateFallback: 'index.html'`. **No runtime caching routes.** User data lives in OPFS, never in Cache Storage.
- **Offline test:** a Playwright e2e test loads the app, waits for the SW to activate, sets the context offline, reloads, and asserts the app boots and an imported chat opens.

---

## 15. Security and privacy

### 15.1 Content Security Policy

GitHub Pages can't set headers, so the CSP goes in a `<meta http-equiv="Content-Security-Policy">` in `index.html` (injected at build time):

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:;
connect-src 'self';
img-src 'self' blob: data:;
media-src 'self' blob:;
style-src 'self';
font-src 'self';
object-src 'none';
base-uri 'none';
form-action 'none';
manifest-src 'self';
```

- No inline scripts. No inline `<style>`. **Never set the `style` attribute via strings.** The React `style` prop (CSSOM) is fine and needed by the virtualizer.
- `frame-ancestors` can't be set via meta (header-only). Accepted limitation, documented in an ADR.
- A Playwright test listens for `securitypolicyviolation` events across all e2e flows and fails on any violation.

### 15.2 Untrusted content handling

- **All chat content is untrusted.** It is only ever rendered as React text nodes or through the formatting AST renderer.
- Forbidden (lint-enforced): `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string `setTimeout`.
- Zip entry names: reject `..`, absolute paths and NUL characters. Sanitize file names for OPFS (we store by `attachmentId.ext`, never by the original name). The original name is display-only.
- Size limits (in `config.ts`): text file ≤ 200 MB, single media entry ≤ 2 GB, total entries ≤ 100k, `.vcf` parse ≤ 1 MB. Exceeding a limit → a typed error, not a crash.
- Zip bomb protection: abort if the uncompressed total exceeds 20 GB or an entry's compression ratio exceeds 1000:1.

### 15.3 App lock

- Optional 4–8 digit PIN. Stored as PBKDF2-SHA-256, 600,000 iterations, 16-byte random salt, in the `meta` table. Compared in constant time over the derived bytes.
- Auto-lock after inactivity (Immediately / 1 / 5 / 15 min). When `visibilitychange` → hidden, **immediately** render a full-screen privacy cover, so the iOS app-switcher snapshot doesn't show chats, then lock according to the setting.
- Failed attempts: delay grows exponentially after 5 failures (30 s, 60 s, 120 s, …), persisted across reloads.
- No PIN recovery. The UI states clearly that a forgotten PIN means deleting the app data or reinstalling (the original exports remain the user's backup).
- **Honest scope, stated in Settings and README:** the PIN is a privacy screen, not encryption. iOS already encrypts device storage at rest. Do not claim encryption.

### 15.4 Privacy guarantees

- No `fetch`/XHR/WebSocket/beacon to any origin other than `self` (CSP-enforced). Same-origin fetches are only for app assets.
- No third-party scripts, fonts or CDNs. Everything is bundled.
- **Logs never contain message content, names or file names.** Only codes, counts, durations and IDs.
- `localStorage` only for the theme preference (needed before the DB loads to avoid a flash). Everything else lives in SQLite `meta`.

### 15.5 Supply chain

- Lockfile committed. `pnpm install --frozen-lockfile` in CI. `pnpm audit --prod --audit-level=high` must pass.
- Renovate for updates (grouped, weekly), each update PR goes through full CI.
- GitHub Actions pinned to commit SHAs.

---

## 16. Accessibility and internationalization

- **WCAG 2.2 AA.** Automated: `@axe-core/playwright` runs on every route in e2e (light and dark). Zero violations allowed.
- Semantic HTML: `<header>`, `<main>`, `<nav>`, real `<button>`/`<a>`, form `<label>`s.
- Chat list: `role="list"`. Message list: `role="log"` container with `aria-live="off"` (it's history, not live), and items carrying `aria-setsize`/`aria-posinset` (virtualized). Each message has an accessible label: "{sender}, {date time}: {text or media description}".
- Focus management: route changes move focus to the page heading. Sheets and dialogs trap focus and restore it on close. Visible focus ring (token `focus-ring`).
- VoiceOver manual checklist in `docs/TESTING.md` (iPhone): navigate the chat list, open a chat, read messages, use search, play a voice note, operate the lock screen.
- Dynamic Type: the layout must not break at the largest accessibility text size (manual check, plus a Playwright test at 200% zoom).
- UI language v1: English only, but **every** string is in `i18n/en.ts` with a typed key, ready for translation. Content rendering supports any script and RTL (§12.5).

---

## 17. Performance budgets (CI-enforced where marked)

| Metric                                           | Budget                                                                    | Enforcement                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| Main-thread initial JS (gzip)                    | ≤ 170 KB                                                                  | size-limit (CI)                                       |
| Initial CSS (gzip)                               | ≤ 25 KB                                                                   | size-limit (CI)                                       |
| sqlite wasm, opus decoder                        | lazy; not in the initial bundle                                           | size-limit check of entry chunk (CI)                  |
| Lighthouse (mobile, preview build)               | Performance ≥ 90, Accessibility 100, Best Practices ≥ 95, PWA installable | LHCI (CI)                                             |
| Parse 100k-message synthetic export              | ≤ 2.0 s on the CI runner (Node)                                           | perf test (CI)                                        |
| Fingerprint + merge 100k                         | ≤ 2.0 s on the CI runner                                                  | perf test (CI)                                        |
| Open a 100k-message chat → first bubbles painted | ≤ 400 ms after DB ready (iPhone 12-class)                                 | manual + Playwright timing on Chromium (CI, ≤ 300 ms) |
| Search on 100k messages                          | ≤ 150 ms (device), ≤ 100 ms (CI Chromium)                                 | browser test (CI)                                     |
| Scrolling                                        | no long tasks > 50 ms during a scripted fast scroll                       | Playwright + PerformanceObserver (CI)                 |
| Import of a 1 GB zip with 5k media               | completes without crash; memory stable                                    | manual on iPhone (`docs/TESTING.md`)                  |

Generate synthetic large fixtures at test time with `scripts/generate-fixtures.ts`. Do not commit large files.

---

## 18. Coding standards

### 18.1 TypeScript configuration (all tsconfigs extend a base)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable", "WebWorker"], // per-project subsets
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true,
  },
}
```

- `core` compiles with `lib: ["ES2023"]` only (no DOM, no WebWorker), which proves it is platform-free.
- Workers compile with `WebWorker`, without `DOM`.

### 18.2 ESLint (flat config): required rule sets

- `typescript-eslint` **`strictTypeChecked`** + **`stylisticTypeChecked`**.
- `react-hooks` (recommended, `exhaustive-deps` as error), `react-refresh`, `jsx-a11y` (strict).
- `@eslint-community/eslint-comments`: `require-description`, `no-unlimited-disable`, `no-unused-disable`.
- `import-x`: `no-cycle`, `no-default-export` (with overrides for config files), `no-extraneous-dependencies`.
- Additional rules (error):
  - `@typescript-eslint/no-explicit-any`, `no-non-null-assertion`, `no-floating-promises`, `no-misused-promises`, `switch-exhaustiveness-check`, `consistent-type-imports`, `strict-boolean-expressions`, `prefer-readonly`, `explicit-module-boundary-types` (for `core` and `storage`).
  - `@typescript-eslint/ban-ts-comment` (allow `ts-expect-error` **with description** only).
  - `no-console` (except `app/logging/` and `workers/*` logger sinks).
  - `no-restricted-syntax` / `no-restricted-properties` for: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `Function` constructor, `localStorage` (except `app/hooks/use-theme-preference.ts`).
  - `react/no-danger` equivalent via `no-restricted-syntax` on the `dangerouslySetInnerHTML` JSX attribute.
  - `complexity: ["error", 15]`, `max-depth: 4`, `max-params: 4` (use an options object), `max-lines: 400` per file, `max-lines-per-function: 80` (JSX components: 150).
  - No magic numbers in `core` (`@typescript-eslint/no-magic-numbers` with sensible ignores: -1, 0, 1, 2, array indexes).
- **Zero warnings policy:** `eslint --max-warnings 0`.

### 18.3 Formatting

Prettier (`printWidth: 100`, `singleQuote: true`, `trailingComma: 'all'`, `semi: true`) with `prettier-plugin-tailwindcss`. EditorConfig: UTF-8, LF, 2 spaces, final newline.

### 18.4 React standards

- Function components and hooks only. No class components except a single `ErrorBoundary`.
- Feature folder structure: `features/<name>/{components/, hooks/, <name>-screen.tsx, index.ts}`. Features import each other only through their `index.ts` public API.
- Components ≤ 150 lines. Extract subcomponents and hooks early.
- Props are `readonly` interfaces named `<Component>Props`. No prop spreading onto DOM elements from untyped sources.
- Data fetching only through `app/queries/*` hooks (TanStack Query) with a central query-key factory. Components never call RPC clients directly.
- Mutations invalidate exact query keys. No global refetches.
- Local UI state with `useState`/`useReducer`. Cross-feature UI state (theme, lock state, audio controller) via small, typed React contexts with `useSyncExternalStore` stores where needed.
- Memoize (`useMemo`/`useCallback`/`memo`) only where a profiler or the virtualized list needs it. Message row components **must** be `memo`ized with stable props.
- Effects: only for synchronization with external systems. Every effect cleans up (listeners, object URLs, workers, timers).
- `Suspense` + error boundary per route. Skeleton loading states, no layout jumps.
- No `useEffect` for derived state.

### 18.5 Validation at trust boundaries (Valibot)

Validate: worker RPC inputs (in the worker), SQLite rows → domain, `extra_json`, backup `manifest.json`, route params/query strings, `meta` values, anything from `localStorage`. Invalid data → a typed error and a log entry, never undefined behavior.

### 18.6 Naming and code style

- Names say what things are: `parseHeaderLine`, `messageWindow`, `isStandalone`. No abbreviations except well-known ones (`id`, `url`, `db`, `ts`).
- Booleans: `is/has/can/should` prefixes. Functions are verbs, types are nouns.
- Constants in `UPPER_SNAKE_CASE` only for true compile-time constants in `config.ts`/`core` constants files.
- Prefer pure functions and immutable data (`readonly` arrays and properties in domain types).
- No module-level mutable state outside clearly named stores.
- Comments explain **why**, not what. Every exported function in `core` and `storage` has TSDoc with `@param`/`@returns`, plus an example for parser functions.

### 18.7 Errors and logging

- Error codes are string-literal unions per module (`ImportErrorCode`, `StorageErrorCode`, …). User-facing messages are mapped from codes in `i18n/en.ts`.
- Worker boundary: every RPC method is wrapped. Unexpected exceptions are serialized to `{ code: 'INTERNAL', id }`, logged with a stack trace in the worker, and surfaced to the UI as a generic error with a diagnostic ID.
- **Logger** (`app/logging`, plus a worker sink forwarding to main): levels `debug|info|warn|error`. An in-memory ring buffer of 1,000 entries, the last 200 `warn|error` persisted to `meta` (debounced). Viewable in Diagnostics. **Never logs content or names** (lint rule: no template literals in logger calls; pass structured `{ code, ...numbers/ids }` objects only).
- No `console.*` in production paths except via the logger sink, which uses `console` only in dev builds.

### 18.8 Concurrency and async

- No floating promises. Every promise is awaited, returned, or explicitly `void`-ed with a comment.
- Cancellation via `AbortSignal` passed through long operations (import, backup, restore).
- Worker RPC calls have timeouts (import phases excepted) and surface `TIMEOUT` errors.

---

## 19. Testing strategy

### 19.1 Layers

| Layer               | Tool                                          | Environment                                          | Scope                                                                                                       |
| ------------------- | --------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Unit                | Vitest                                        | Node                                                 | `core/**` (parser, dates, merge, fingerprint, text-format, chat-meta)                                       |
| Component           | Vitest + Testing Library                      | happy-dom                                            | `app/components`, feature components with mocked query hooks                                                |
| Browser integration | Vitest **browser mode** (Playwright provider) | **WebKit + Chromium**                                | storage (sqlite-wasm + OPFS sahpool), migrations, repository contract, media-store, workers, audio fallback |
| E2E                 | Playwright                                    | WebKit (iPhone 13 device profile) + Chromium (Pixel) | full user flows on the production build (`vite preview`)                                                    |
| Accessibility       | @axe-core/playwright                          | in E2E                                               | every route, both themes                                                                                    |
| Performance         | Vitest perf tests + Playwright traces         | Node / Chromium                                      | budgets in §17                                                                                              |
| Manual device       | `docs/TESTING.md` checklist                   | real iPhone                                          | installed PWA flows, VoiceOver, large imports                                                               |

### 19.2 Parser testing (mandatory depth)

- **Golden fixtures** in `tests/fixtures/whatsapp/<variant>/`, each with the input (`chat.txt` or a small `export.zip`), `expected.json` (full `ParseResult` minus `sampleMessages`), and a `README.md` describing the variant. Variants (minimum):
  `ios-dmy-12h-seconds-group`, `ios-mdy-12h-seconds-1to1`, `ios-dmy-24h-seconds`, `ios-dot-dates-24h`, `ios-narrow-nbsp-meridiem`, `ios-lrm-attachments`, `ios-system-as-group-author`, `ios-without-media-omitted`, `android-dmy-24h-group`, `android-mdy-12h-1to1`, `android-file-attached`, `android-media-omitted`, `android-system-with-colon`, `ymd-dates`, `two-digit-years`, `multiline-and-blank-lines`, `rtl-urdu-arabic-mixed`, `emoji-zwj`, `polls`, `locations`, `contacts-vcf`, `deleted-and-edited`, `calls`, `orphan-lines-before-first`, `out-of-order-timestamps`, `ambiguous-date-order`, `crlf-and-bom`, `phone-number-authors`, `author-with-colon-in-body`.
- Fixtures are generated by `scripts/generate-fixtures.ts` from a typed description, so they are reproducible. `expected.json` is reviewed by a human or reviewer and **never** auto-updated in CI. A `pnpm fixtures:update` script exists but must be run deliberately, and its diff is called out in the PR.
- **Property-based tests (fast-check), at least 1,000 runs each:**
  1. `parseChat` never throws for arbitrary strings.
  2. **Line accounting:** every non-empty input line is represented (in a header, a body, or a counted warning).
  3. Generated valid exports (random messages → render to text in each grammar → parse) round-trip to the original authors, timestamps, kinds and bodies.
  4. Fingerprints are deterministic and differ for different tuples (on generated data).
  5. Merge is idempotent, preserves the relative order of each input, and never loses messages.
  6. The text-format tokenizer never throws, and concatenating the AST leaf text equals the input minus markers.
  7. No regex in the locale tables takes > 50 ms on adversarial 10k-char inputs.
- **Timezone tests:** run `core/dates` tests under `TZ=UTC`, `TZ=Asia/Karachi` and `TZ=America/Los_Angeles` (three Vitest projects or a CI matrix).

### 19.3 Anonymizer (`scripts/anonymize-export.ts`)

CLI: `pnpm anonymize <input.zip|txt> <out-dir>`. Replaces each author name with `Person A/B/…` consistently (including in system messages). Replaces each word of body text with a same-length pseudo-word, preserving punctuation, emoji, URLs' structure (domain → `example.com`), digits shape, line breaks, LRM/NNBSP characters and markers. Replaces media files with tiny valid placeholder files of the same type and name. Output is safe to commit as a fixture. The anonymizer itself has unit tests.

### 19.4 Coverage thresholds (CI-enforced)

- `core/**`: lines ≥ 95%, branches ≥ 90%.
- `storage/**` + `workers/**` (browser mode): lines ≥ 85%.
- `app/**`: lines ≥ 70%.
  Coverage is a floor, not a goal. Tests must assert behavior, not implementation details. Snapshot tests are only allowed for `expected.json` fixtures.

### 19.5 E2E flows (minimum)

1. First run → capability check passes → empty state.
2. Import a `.zip` (iOS group fixture with media) → confirm screen → choose self → progress → report → open chat → bubbles correct (alignment, names, day separators, media thumbnails).
3. Ambiguous date order → toggle DMY/MDY → preview updates → confirm.
4. Re-import the same file → 0 added, all duplicates. Import a newer superset → only new messages added, order correct.
5. Cancel mid-import → no chat created, no OPFS files left (assert via the storage-usage API).
6. Global search → open result → chat scrolls to the message and highlights it.
7. In-chat search next/previous. Jump to date.
8. Media gallery → open image viewer → "Show in chat".
9. Voice note plays (fallback path forced in one test).
10. Bookmark add/edit/remove, and the bookmarks screen.
11. Delete chat → storage freed.
12. App lock: set PIN, background (simulate `visibilitychange`), cover shown, unlock, rate limit after failures.
13. Backup a chat → delete it → restore → identical message count and fingerprints.
14. Offline reload works (§14).
15. Update prompt appears for a new SW and is suppressed during import.
16. No CSP violations in any flow. Axe clean on every route.
17. RTL fixture renders with correct bubble direction (`dir` computed).

---

## 20. Tooling, scripts and CI/CD

### 20.1 package.json scripts

```
dev            vite
build          tsc -b && vite build
preview        vite preview
typecheck      tsc -b --noEmit
lint           eslint . --max-warnings 0
format         prettier --write .
format:check   prettier --check .
deps:check     depcruise src --config .dependency-cruiser.cjs
test           vitest run                       # unit + component (node/happy-dom)
test:browser   vitest run --config vitest.browser.config.ts
test:coverage  vitest run --coverage && vitest run --config vitest.browser.config.ts --coverage
test:e2e       playwright test
bench          vitest bench
size           size-limit
lhci           lhci autorun
fixtures:gen   tsx scripts/generate-fixtures.ts
fixtures:update tsx scripts/generate-fixtures.ts --update-expected
anonymize      tsx scripts/anonymize-export.ts
verify         pnpm typecheck && pnpm lint && pnpm format:check && pnpm deps:check && pnpm test:coverage && pnpm build && pnpm size && pnpm test:e2e
```

### 20.2 Git hooks (lefthook)

- `pre-commit`: Prettier and ESLint on staged files, `tsc` for affected projects.
- `commit-msg`: Conventional Commits validation.
- `pre-push`: `pnpm typecheck && pnpm test`.

### 20.3 CI (`.github/workflows/ci.yml`) on every PR and push to `main`

Jobs run in parallel where possible, all required:

1. `install`: pnpm with cache, `--frozen-lockfile`.
2. `static`: typecheck, lint, format:check, deps:check, `pnpm audit --prod --audit-level=high`.
3. `unit`: Vitest with coverage, in a TZ matrix (`UTC`, `Asia/Karachi`, `America/Los_Angeles`) for `core`.
4. `browser`: Vitest browser mode on WebKit and Chromium with coverage.
5. `build`: production build (artifact uploaded), size-limit.
6. `e2e`: Playwright WebKit and Chromium against `vite preview` of the build artifact. Upload the HTML report and traces on failure.
7. `lighthouse`: LHCI against the preview build with the budgets in §17.
8. `perf`: parser/merge/search performance tests.

Branch protection on `main`: all jobs required, linear history, PR required.

### 20.4 Other workflows

- `deploy.yml`: on push to `main` → build with `VITE_BASE=/<repo>/` → `actions/upload-pages-artifact` → `actions/deploy-pages`.
- `release-please.yml`: maintains `CHANGELOG.md` and semver tags from Conventional Commits. The app version is shown in Settings → About (injected at build time).
- `renovate.json`: weekly, grouped minor/patch, separate PRs for majors, pinned versions, GitHub Actions digests.
- All third-party actions pinned to full commit SHAs.

---

## 21. Git workflow and PR protocol

### 21.1 Branches and commits

- Branch per milestone: `m<N>-<slug>` (e.g. `m1-parser`). Sub-PRs: `m3a-import-archive`, `m3b-import-commit`.
- **Conventional Commits:** `feat(parser): detect dot-separated dates`, `fix(storage): …`, `test(…)`, `docs(…)`, `chore(…)`, `refactor(…)`, `perf(…)`, `ci(…)`. Small, logically separate commits.
- Never commit secrets, real chats, `.env` files or large binaries (> 1 MB, except tiny fixture media).

### 21.2 PR description template (`.github/pull_request_template.md`)

```
## Milestone
M<N> — <name>

## What & why
<summary>

## Spec conformance
- Sections implemented: §…
- Deviations from AGENTS.md (with ADR links): none | …

## Decisions
- <ADR links / short notes>

## Tests
- New/changed tests: …
- Coverage: core __% / storage __% / app __%
- Perf results: parse 100k = __s, search = __ms, bundle = __KB

## Screenshots / recordings (UI changes; light + dark; iPhone viewport)

## Checklist
- [ ] `pnpm verify` passes locally
- [ ] No TODO/FIXME/stubs/commented-out code
- [ ] No new dependencies (or ADR added)
- [ ] No lint disables without description
- [ ] i18n: no hard-coded UI strings
- [ ] Logs contain no message content
- [ ] docs/STATUS.md updated
```

### 21.3 Review handoff

When a milestone PR is open and CI is green, stop and wait for review. Address every review comment with a commit referencing it. Do not merge your own PR unless the owner explicitly allows it.

### 21.4 ADRs

`docs/adr/NNNN-kebab-title.md` with sections: Context, Decision, Alternatives considered, Consequences. Required ADRs in M0: `0001-stack-and-versions`, `0002-hash-routing`, `0003-sqlite-opfs-sahpool`, `0004-csp-via-meta`, `0005-no-encryption-pin-is-privacy-screen`.

---

## 22. Milestones and acceptance criteria

> Each milestone ends with: CI green, `docs/STATUS.md` updated, a PR opened, and a stop for review.

### M0 — Scaffold, tooling, CI, deploy

- Vite + React + TS strict project following the §5 layout (create each folder when its first real module lands; no empty placeholder modules), Tailwind, ESLint/Prettier/dependency-cruiser/lefthook configs, Vitest (node, happy-dom, browser), Playwright, size-limit, LHCI, CI and deploy workflows, release-please, Renovate, PR template, README skeleton, required ADRs.
- The app shell renders a minimal page with `APP_NAME`, the capability check (§12.11) and the CSP meta. Deployed to GitHub Pages and installable on iPhone (manifest plus icons).
- **Accept when:** CI fully green, including a trivial e2e and axe test. Pages URL loads on iPhone and installs to the Home Screen. Offline reload works.

### M1 — Core: parser, dates, fingerprint, merge, text-format

- Everything in §6–§8 in `core/`, `scripts/generate-fixtures.ts`, all fixture variants (§19.2), property tests, TZ matrix, perf test (100k parse ≤ 2 s), `scripts/anonymize-export.ts`, `docs/EXPORT-FORMATS.md`.
- **Accept when:** all fixtures pass, coverage meets thresholds, `core` builds with ES-only lib, no browser globals referenced in `core` (dependency-cruiser and tsconfig prove it).

### M2 — Storage and db.worker

- sqlite-wasm + opfs-sahpool in db.worker, migrations framework + `0001_init`, the repository implementation, row validation, media-store, single-instance lock, a typed Comlink `db-api` and `db-client`, browser-mode contract tests on WebKit and Chromium, search queries (§11) with perf tests on 100k rows.
- **Accept when:** contract tests pass in both engines, migration tests pass, search ≤ 100 ms on CI Chromium for 100k messages.

### M3 — Import pipeline

- import.worker (§9) with all phases, confirmation handshake, cancellation, crash rollback at boot, the orphan sweeper API, image thumbnails, merge/re-import, persistent-storage request after the first import, the import UI (§12.8) including the install gate, DMY/MDY live preview and the report screen.
- **Accept when:** E2E flows 2–5 pass on WebKit and Chromium, and a 100k-message plus 2k-media synthetic zip imports in CI without memory errors.

### M4 — Chat list and chat view

- §12.1–§12.5 (excluding search/jump UI): virtualization, windows, bubbles, grouping, day separators, sticky day pill, formatting renderer, links, all message kinds, media bubbles (image/sticker thumbnails, video tiles with a type icon; audio/voice shown as a non-interactive "Voice note" row with no fake controls, since the real player lands in M6), RTL, themes, self selection banner, message actions (copy, share, info).
- **Accept when:** smooth scroll on a 100k chat (no long tasks > 50 ms in the scripted scroll), axe clean, RTL e2e passes, light/dark screenshots in the PR.

### M5 — Search, jump to date, bookmarks

- Global search screen, in-chat search with navigation, jump-to-date calendar, jump-to-bottom button, bookmarks with notes and the bookmarks screen.
- **Accept when:** E2E flows 6, 7 and 10 pass. Search perf meets budget.

### M6 — Media

- Gallery tabs, image viewer (zoom/pan/swipe), video, audio player with the opus fallback, lazy video thumbnails, documents and contacts handling, links tab, "Show in chat".
- **Accept when:** E2E flows 8 and 9 pass. Manual iPhone check of voice notes is documented in `docs/TESTING.md`.

### M7 — Chat info, settings, lock, storage management

- §12.7, §12.9, §15.3, theme override, storage usage, orphan cleanup UI, diagnostics with the log viewer, about and licenses.
- **Accept when:** E2E flows 11 and 12 pass.

### M8 — Backup and restore

- §10.6 complete with merge/replace/skip.
- **Accept when:** E2E flow 13 passes (fingerprints identical after the round trip).

### M9 — PWA hardening and release

- Update prompt behavior (§12.12), splash screens, full offline e2e, CSP violation e2e, Lighthouse budgets, a full a11y pass, performance tuning to budgets, the complete `docs/TESTING.md` manual checklist executed on a real iPhone (results recorded), README final (install guide, privacy statement, limitations), release `v1.0.0`.
- **Accept when:** every item in §23 passes.

---

## 23. Definition of Done and reviewer checklist

The reviewer checks every PR against this list. Any "no" blocks the merge.

**Spec and scope**

- [ ] Implements the milestone's sections fully, with no unlisted features or missing ones.
- [ ] Deviations are documented in ADRs and justified.
- [ ] No non-goal features (§1.2).

**Code quality**

- [ ] Layer boundaries respected (dependency-cruiser green, and the review agrees).
- [ ] No `any`, no non-null assertions, no `ts-ignore`, no undocumented lint disables.
- [ ] No TODO/FIXME/stubs/dead code/commented-out code.
- [ ] Expected failures use `Result` with typed codes. Unexpected ones hit boundaries.
- [ ] Functions small and named well. Complexity limits met. TSDoc on public `core`/`storage` APIs.
- [ ] Only allowlisted dependencies, exact versions pinned.

**Correctness**

- [ ] Parser fixtures cover every new pattern. Property tests present and meaningful.
- [ ] Timestamps never converted to UTC for display. Formatting uses the UTC-trick helper.
- [ ] Merge/dedupe semantics as in §8.10.
- [ ] Transactions are atomic. Rollback paths tested.

**Security and privacy**

- [ ] No HTML injection paths. All content rendered as text/AST.
- [ ] CSP intact. No network calls beyond same-origin assets.
- [ ] Logs and diagnostics contain no message content, names or file names.
- [ ] Zip safety checks (traversal, bombs, limits) in place.

**UX, accessibility, performance**

- [ ] All strings in i18n. RTL correct. Logical CSS properties only.
- [ ] Axe clean. Focus management correct. Touch targets ≥ 44 pt.
- [ ] Performance budgets met (numbers reported in the PR).
- [ ] Works offline. iOS standalone specifics handled (safe areas, install gate).

**Tests and CI**

- [ ] All CI jobs green on WebKit and Chromium.
- [ ] Coverage thresholds met without trivial tests.
- [ ] E2E flows for the milestone present and passing.

**Docs**

- [ ] `docs/STATUS.md` updated. ADRs added where needed. README updated if user-facing behavior changed.

---

## 24. Appendix A — Known export line examples (verify with fixtures)

> These illustrate shapes the parser must handle. Exact phrasing varies by WhatsApp version and phone language. Treat each as a fixture seed, and record real-world evidence in `docs/EXPORT-FORMATS.md`. `‎` marks an invisible U+200E. `␣` marks U+202F (narrow no-break space).

**iOS**

```
[17/11/2026, 9:19:03␣PM] Ali Khan: Hello there
[17/11/2026, 9:19:30␣PM] Ali Khan: line one
line two of the same message
‎[17/11/2026, 9:20:01␣PM] Sara: ‎<attached: 00000012-PHOTO-2026-11-17-21-20-01.jpg>
[17/11/2026, 9:21:00␣PM] Family Group: ‎Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
[17/11/2026, 9:22:00␣PM] Ali Khan: ‎image omitted
[17/11/2026, 9:23:00␣PM] Sara: ‎This message was deleted.
[17/11/2026, 9:24:00␣PM] Ali Khan: See you soon ‎<This message was edited>
[11/17/26, 21:25:10] Bob: US-style date, 24h, seconds
[17.11.26, 21:26:00] Anna: dotted date
```

**Android**

```
17/11/2026, 21:19 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.
17/11/2026, 21:19 - Ali Khan created group "Family"
17/11/2026, 21:20 - Ali Khan added Sara
17/11/2026, 21:21 - Sara: Hi everyone
17/11/2026, 21:22 - Ali Khan: IMG-20261117-WA0001.jpg (file attached)
Caption on the next line
17/11/2026, 21:23 - Sara: <Media omitted>
17/11/2026, 21:24 - Ali Khan changed the subject from "Fam: old" to "Family"
11/17/26, 9:25 PM - Bob: US-style 12h
17/11/2026, 21:26 - Sara: location: https://maps.google.com/?q=24.8607,67.0011
17/11/2026, 21:27 - Ali Khan: POLL:
Dinner?
OPTION: Biryani (2 votes)
OPTION: Karahi (1 vote)
17/11/2026, 21:28 - +92 300 1234567: phone-number author
```

## 25. Appendix B — Forbidden list (quick reference)

`any` · `as unknown as X` outside `rows.ts`/`ids.ts` · `!` non-null assertions · `@ts-ignore` · `eslint-disable` without description · `dangerouslySetInnerHTML` · `innerHTML`/`outerHTML`/`insertAdjacentHTML` · `eval`/`new Function` · string-built SQL · FTS raw user syntax · `localStorage` for data · `console.*` outside logger · logging message content · default exports · class components (except ErrorBoundary) · global state libraries · date libraries · UI kits · CDNs or third-party network calls · `SharedArrayBuffer` · reading whole zips into memory · auto-reloading on SW update · converting chat timestamps to UTC for display · `left`/`right` CSS for layout · hard-coded UI strings · TODO/FIXME/stubs · skipped tests · lowered thresholds · copying AGPL/GPL code · WhatsApp logos or brand assets · committing real chats.
