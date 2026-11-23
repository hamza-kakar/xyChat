# ADR 0016 — Update prompt and launch images

## Context

§12.12 asks for a toast when a new service worker waits ("Update
available" with Reload), never an automatic reload, and no prompt while
an import or restore runs. §14 asks for iOS launch images for common
iPhone sizes, generated at build time from one source without external
services. The spec leaves open what counts as "running", whether the
toast can be put off, and which screens get launch images.

## Decision

- **Registration is injected.** `main.tsx` passes vite-plugin-pwa's
  `registerSW` to `registerServiceWorker` in the shell feature, which
  keeps a small `useSyncExternalStore` store (`useUpdateWaiting`). The
  store's module does not import the build-only virtual module, so it is
  unit-tested with a fake. Reload calls the plugin's `updateSW(true)`
  (skip waiting, reload once the new worker controls the page); it is
  only reachable from the button.
- **What "running" means.** A long-task counter tracks the worker calls
  themselves (`trackLongTask` around import `begin`, `createBackup` and
  `restoreBackup`) until they settle, so leaving the screen mid-job keeps
  the prompt away. Screens also hold it for job steps without a running
  call: the import's detect and confirm steps (§9.1 lists them as import
  phases) and reading and choosing in a restore. Backup is included even
  though §12.12 names only import and restore: reloading mid-backup loses
  the work the same way.
- **"Later" dismisses for the session.** The toast has Later as well as
  Reload; the waiting worker activates on the next launch anyway, once
  every window has closed.
- **The toast sits under the lock.** It renders inside the lock gate, so
  the lock screen and privacy cover (top layer) hide it.
- **Launch images.** `scripts/generate-icons.ts` draws the app badge
  centered on each theme's surface color for every iPhone screen that
  runs iOS 17 or later (11 sizes × light/dark, listed in
  `scripts/splash-screens.ts`); the build injects the
  `apple-touch-startup-image` tags with exact device media queries. The
  PNGs are generated, not committed, and are precached (about 140 KB).
  iPad launch images are left out: while loading, an iPad shows the
  manifest's background color instead, and portrait/landscape pairs for
  every iPad would more than double the set for a secondary layout.

## Alternatives considered

- `useRegisterSW` from `virtual:pwa-register/react`: ties the state to
  one component's lifetime and still needs the virtual module in tests.
- Treating only the progress step as "running": a reload on the confirm
  screen discards the detected file and the user's choices.
- Generating launch images with an external tool: §14 forbids external
  services, and the existing pure-Node PNG encoder (ADR 0006) already
  draws the badge.

## Consequences

- Flow 15 is tested end to end against a local server that serves a
  byte-different `sw.js` as the next release.
- A new iPhone screen size needs one line in `splash-screens.ts`.
