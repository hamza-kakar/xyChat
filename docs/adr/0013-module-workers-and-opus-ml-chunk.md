# ADR 0013 — Module-format worker bundles; the Opus ML decoder stays out of the precache

## Context

The voice-note fallback (§13.2) decodes Ogg Opus in a lazily spawned audio
worker with `ogg-opus-decoder`. The package's decoder class keeps an
optional machine-learning build (`@wasm-audio-decoders/opus-ml`, about
4 MB) behind a dynamic `import()` that runs only when a caller asks for
`speechQualityEnhancement: 'lace' | 'nolace'`.

Vite bundles workers as IIFE by default, which inlines every dynamic
import. The audio worker therefore came out at 4.2 MB, over Workbox's
2 MiB precache limit, and the build failed. Raising the limit would
precache 4 MB of code that the app never runs.

## Decision

- Bundle workers as ES modules (`worker.format: 'es'`). Every worker is
  already created with `{ type: 'module' }` (§3.2), so nothing changes at
  runtime; dynamic imports become separate chunks. The audio worker is
  now about 134 kB.
- Exclude the resulting `opus-ml-*.js` chunk from the service-worker
  precache (`globIgnores`). The app never passes
  `speechQualityEnhancement`, so the chunk is unreachable; every chunk the
  app does load, including the audio worker and its decoder, is still
  precached (§14).

## Alternatives considered

- **Raise `maximumFileSizeToCacheInBytes`.** It works, but every install
  would download and store 4 MB of unused code.
- **Alias the ML package to an empty module.** Smaller output, but it ships
  a module that only exists to break a library path, and a future decoder
  update could start depending on it without any build error.
- **A different Opus decoder.** `ogg-opus-decoder` is the allowlisted
  choice (§4.2).

## Consequences

- Offline playback of the fallback is unaffected: the decoder code the app
  uses lives inside the precached audio worker chunk.
- If the app ever enables speech enhancement, the `globIgnores` entry must
  go, and the precache size limit must be revisited.
- The ignored chunk is still deployed to Pages; it is never requested.
