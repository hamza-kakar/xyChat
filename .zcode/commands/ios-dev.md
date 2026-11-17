---
description: Help test and debug waChatBack for iOS Safari (PWA target) — run device emulation, check deploy, and produce a real-iPhone test plan.
argument-hint: [what to check, e.g. offline, import, lock]
---

Help with iOS-focused verification of the waChatBack PWA in this workspace.

Context you must load first:

- The manual on-device checklist is in `docs/TESTING.md`; project constraints (iOS Safari specifics, OPFS, standalone mode) are in `AGENTS.md` §2 and ADR 0003/0007.
- The production URL is the GitHub Pages deploy of the `main` branch (get it with `gh api repos/hamza-kakar/wachatback/pages --jq .html_url` if needed).

The user's request: $ARGUMENTS

Work through it using these capabilities, in this order of fidelity:

1. **Local automated**: run `pnpm build` then `CI=true pnpm exec playwright test --project=pixel-7-chromium` (device-emulated e2e). Playwright's Linux WebKit cannot open OPFS (ADR 0007), so do not use the iphone-13-webkit project as a pass/fail signal.
2. **Analysis**: for iOS-specific concerns (standalone detection, safe areas, install gate, OPFS quota, `.opus` playback), read the relevant feature code under `src/` and reason about iOS 17+ Safari behavior; cite file paths.
3. **Real-device plan**: produce/update a concrete step list from `docs/TESTING.md` for the user to execute on their iPhone against the Pages deploy, including expected results.

Rules: never weaken quality gates; never invent Safari behavior — if unsure, say what needs a real-device check; keep diagnostics free of chat content.
