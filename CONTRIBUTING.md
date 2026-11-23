# Contributing to xyChat

Thanks for your interest in improving xyChat. Bug reports, export samples
(anonymized), translations of export phrases and pull requests are all
welcome.

## Before you start

- **Bugs and ideas:** open an issue using one of the templates. For anything
  larger than a small fix, please open an issue first so we can agree on the
  approach.
- **Security problems:** don't open a public issue; see [SECURITY.md](SECURITY.md).
- **Privacy:** never share real chats in issues, pull requests or test
  fixtures. Make up an example, or anonymize a real export first:

  ```sh
  pnpm anonymize <export.zip or chat.txt> <out-dir>
  ```

## Setup

Requires Node 24 or later (see `.nvmrc`) and pnpm 12 or later.

```sh
pnpm install
pnpm dev          # development server
pnpm test         # unit and component tests
pnpm test:e2e     # end-to-end tests (Playwright)
pnpm verify       # everything CI runs; must pass before you push
```

## How the code is organized

The design specification is [docs/SPEC.md](docs/SPEC.md), and the decisions
behind it are in [docs/adr](docs/adr). In short:

- `src/core`: pure TypeScript (parser, dates, merge). No browser APIs.
- `src/storage`: SQLite (WebAssembly) and the media store.
- `src/workers`: the database and import workers.
- `src/client`: typed clients the UI uses to talk to the workers.
- `src/platform`: thin wrappers around browser features (capabilities,
  persistent storage, audio).
- `src/app`: the React UI.

The allowed imports between these layers are enforced by
`pnpm deps:check`.

## Ground rules

- **No network requests for user data**, no analytics and no third-party
  scripts. The Content Security Policy enforces this.
- **Strict TypeScript.** No `any`, no `@ts-ignore`, and no lint warnings.
- **Tests with every change.** Bug fixes include a test that fails without
  the fix. Parser changes include a fixture in `tests/fixtures/whatsapp`.
- **No weakened checks.** Don't skip tests or lower coverage, size or
  performance thresholds to make CI pass.
- **Every UI string goes in `src/app/i18n`**, and layout uses logical CSS
  properties so right-to-left languages work.
- **New dependencies need a reason.** Explain in the pull request why the
  package is needed and check its license.

## Pull requests

- Keep each pull request focused on one change.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages and the pull request title (`fix: …`, `feat: …`, `docs: …`).
- Fill in the pull request template, including what you tested.
- `pnpm verify` must pass. CI runs the same checks.

## Adding a language for export phrases

System messages and media placeholders are recognized in English today. Each
language is one table in `src/core/parser/locale/`, plus fixtures. If you can
share anonymized exports from a phone set to another language, that's a great
place to start.
