# Changelog

## [1.0.1](https://github.com/hamza-kakar/xyChat/compare/v1.0.0...v1.0.1) (2026-11-23)


### Bug Fixes

* **chat-view:** keep jumping after scrolling away from the opening message ([cc443be](https://github.com/hamza-kakar/xyChat/commit/cc443be22fb592867a18a9e3f803ee2521c7a0a1))
* **search:** keep the newest matches when an in-chat search is capped ([0dd5af3](https://github.com/hamza-kakar/xyChat/commit/0dd5af3351939eb181fb7dd637ef1a62d7aaca06))


### Performance Improvements

* **search:** pick the newest in-chat matches without sorting in SQL ([dc82eb8](https://github.com/hamza-kakar/xyChat/commit/dc82eb8a120dc076b431316ce530f5326085010e))

## 1.0.0 (2026-11-23)


### Features

* **app:** app lock with privacy cover, theme preference and persisted logs ([9e86e39](https://github.com/hamza-kakar/wachatback/commit/9e86e39e38375d67366979fdd0a791288dd64e6d))
* **app:** backup and restore in settings ([44e23bb](https://github.com/hamza-kakar/wachatback/commit/44e23bb8ccfff936982a489d8eb516ff75b0b54d))
* **app:** CapabilityGate chains db.worker ready() (FTS5 probe, ADR 0008) ([ffb6f2a](https://github.com/hamza-kakar/wachatback/commit/ffb6f2a20b3a2f828142024b6fc89b64ff64ac7a))
* **app:** chat info and settings screens ([0f618aa](https://github.com/hamza-kakar/wachatback/commit/0f618aaa8d4e88f2019f8e2d92c6876f7ef1fd67))
* **app:** chat list and chat view ([17c53db](https://github.com/hamza-kakar/wachatback/commit/17c53db96f39c72448147e3c6b9e7bad0773946f))
* **app:** global search and bookmarks screens ([4ee94bf](https://github.com/hamza-kakar/wachatback/commit/4ee94bf17eedb8942ba3ef1c8713749ab8e25e3f))
* **app:** import UI — gate, pick, confirm, progress, report (§12.8, §12.10) ([9f4e1b7](https://github.com/hamza-kakar/wachatback/commit/9f4e1b7f14f42b5cbfc7f4432bbdbc29049ea17b))
* **app:** in-chat search, jump to date, jump to latest and bookmark actions ([2898fbd](https://github.com/hamza-kakar/wachatback/commit/2898fbd90a394e571c4af1735ab02e3565b2bb09))
* **app:** load the next gallery page while paging through the viewer ([cb56c03](https://github.com/hamza-kakar/wachatback/commit/cb56c0373516f5d6a453d601f2bf424f46c362c1))
* **app:** log backup and restore outcomes by code ([1898379](https://github.com/hamza-kakar/wachatback/commit/1898379627d56ea3d8e1ed3b42252e6cd5cb336a))
* **app:** media building blocks: audio player, zoom math, gallery rows and video thumbnails ([5c948e1](https://github.com/hamza-kakar/wachatback/commit/5c948e148f1f80b5a32611957e4d53ddb0185b72))
* **app:** media gallery, full-screen viewers and in-bubble playback ([9273cfa](https://github.com/hamza-kakar/wachatback/commit/9273cfa451ec722f08fe439dffd59b05d5b4026d))
* **app:** prompt to reload when an update is waiting ([c4118d0](https://github.com/hamza-kakar/wachatback/commit/c4118d0db4d188dceb05544e22c0e0c2e6afc333))
* **client:** db-client Comlink wrapper + FTS5 capability id (ADR 0008) ([110201c](https://github.com/hamza-kakar/wachatback/commit/110201cb41ca42d2c2f6771c35c6a3a363d15f79))
* **core:** calendar day helpers and search-match highlighting ([65a37d4](https://github.com/hamza-kakar/wachatback/commit/65a37d4fb918349c67024d82a70e7939858f9003))
* **core:** calendar labels and the locale's first weekday ([bfe41ee](https://github.com/hamza-kakar/wachatback/commit/bfe41eeb86cfc8cff8b4dae30a97c5f28970b0c5))
* **core:** fingerprint, merge planning, chat meta, text-format (§8.9-§8.10, §12.5) ([103e22b](https://github.com/hamza-kakar/wachatback/commit/103e22bd1d3ba3336c73a3de256df6c579a5ad93))
* **core:** relative day labels, emoji-only detection and vCard names ([1d1f5b7](https://github.com/hamza-kakar/wachatback/commit/1d1f5b7aed30dbaec31b34398c998d9bf66d5e9e))
* **core:** result type, branded ids, domain model, local date-time (§6-§7) ([e27dbf3](https://github.com/hamza-kakar/wachatback/commit/e27dbf3a0c9053c921eb24f5baee3837a45d152e))
* **m0:** scaffold waChatBack app shell, tooling, CI and deploy ([e425e96](https://github.com/hamza-kakar/wachatback/commit/e425e96ae36be2629e4d79f2e73cd5535de09287))
* **parser:** header grammars, detection, classification, assembly (§8) ([94180aa](https://github.com/hamza-kakar/wachatback/commit/94180aa386d11271ffd5f0a9088e589b06a85f21))
* **pwa:** generate iOS launch images for each iPhone screen ([6385069](https://github.com/hamza-kakar/wachatback/commit/6385069779a7ec83fb40277fb55fce9572140b7f))
* **storage:** backup snapshots, backup reading and restore commits ([6bf11ad](https://github.com/hamza-kakar/wachatback/commit/6bf11ad10c62da95848b8abfcea2a1d397063268))
* **storage:** chat-list preview fields, last chat position and contact names ([9cfbea7](https://github.com/hamza-kakar/wachatback/commit/9cfbea74ac644b06d54970640fa6d4736e4f7a74))
* **storage:** gallery and link pages, voice note durations and video thumbnails ([553c49a](https://github.com/hamza-kakar/wachatback/commit/553c49a6817e7edad74865f19dda465eeb106492))
* **storage:** in-chat match list, days with messages and bookmark upsert ([d986656](https://github.com/hamza-kakar/wachatback/commit/d9866560f679f40e9f94361b83cb8bfc086912e9))
* **storage:** keep import reports, app-lock state and warn/error logs ([7cf828a](https://github.com/hamza-kakar/wachatback/commit/7cf828a311b2fa78c85171686b6e1cff8d4d3c9b))
* **storage:** OPFS media-store (§10.4) ([cadd286](https://github.com/hamza-kakar/wachatback/commit/cadd286d786b0655b829a1b980055e7ff79bb3ae))
* **storage:** schema, migrations, typed sqlite wrapper, rows validation, repository reads ([b0c788e](https://github.com/hamza-kakar/wachatback/commit/b0c788e47eae67774e0f715ff2e81bf1849e59c7))
* **storage:** transactional import commit with step decomposition (§9.2 step 10) ([184af9e](https://github.com/hamza-kakar/wachatback/commit/184af9e018924221a3d3eefc2dca881a8f1daa67))
* **storage:** typed sqlite wrapper, rows validation, repository reads (cont.) ([6173227](https://github.com/hamza-kakar/wachatback/commit/6173227c800e034af2496b271e7a40fa7eab980d))
* **workers,client:** import detection phase + confirmation handshake (§9.2 step 4, §12.8.4) ([3f238c4](https://github.com/hamza-kakar/wachatback/commit/3f238c4582a45c1de39705a3e2c686a4444c0199))
* **workers,client:** pipeline orchestration — commit port, cancel, rollback marks (§9.2 steps 5–11, §9.3, §3.2) ([6c1f1f0](https://github.com/hamza-kakar/wachatback/commit/6c1f1f0d0cb2d403825bcd5974119f72ee7ddcb8))
* **workers:** archive reader (§9.2 steps 1–3) with §15.2 safety checks ([71e72cd](https://github.com/hamza-kakar/wachatback/commit/71e72cde2f0ea4fcad2b9f6f6f96932e0ff5b236))
* **workers:** db.worker with Comlink API, import-commit transaction ([2dfc4f1](https://github.com/hamza-kakar/wachatback/commit/2dfc4f16689f22de719d97e578dcfb33d8358ec9))
* **workers:** decode opus voice notes to cached WAV where the engine can't play them ([d8607e8](https://github.com/hamza-kakar/wachatback/commit/d8607e844e0ad98ccc02e4da9098ea41f2629c5e))
* **workers:** enforce archive safety limits; entry-bytes Result; tests ([e79acf2](https://github.com/hamza-kakar/wachatback/commit/e79acf239cf3fe78ef81a88d693e2a06334d6515))
* **workers:** import media phase — OPFS writes, thumbnails, rollback (§9.2 steps 8–9, §9.3) ([ce98444](https://github.com/hamza-kakar/wachatback/commit/ce98444118ab074d94d443200c22d17b3246baf1))
* **workers:** import run phases — parse + §8.10 fingerprints (§9.2 steps 6–7) ([a931412](https://github.com/hamza-kakar/wachatback/commit/a931412d9a70e170547b025855b13ea0cbe6f2b4))
* **workers:** make and restore backup archives in the db worker ([6c53ae2](https://github.com/hamza-kakar/wachatback/commit/6c53ae2da08fc2f63dca04ce57b9a5e7718c1648))


### Bug Fixes

* **app:** fit the chat-list toolbar on a phone and use singular counts ([2bfdb1a](https://github.com/hamza-kakar/wachatback/commit/2bfdb1a88d69f38345703608bb739db018fd0c4f))
* **app:** hold the update prompt until import, backup and restore calls settle ([abe8f1e](https://github.com/hamza-kakar/wachatback/commit/abe8f1e99fdbe86532e7ced5b5a0357654c2648e))
* **app:** keep focus on the heading when a link opens in-chat search ([b9b3e01](https://github.com/hamza-kakar/wachatback/commit/b9b3e01d9668742525ccf3e8e3af7d1d085542f0))
* **app:** keep iOS selection and callouts off long-press targets ([48fbce3](https://github.com/hamza-kakar/wachatback/commit/48fbce390da9a569324b0986a8e1cc1b4789a777))
* **app:** keep safe-area insets from overriding screen spacing ([311ab48](https://github.com/hamza-kakar/wachatback/commit/311ab48b381abfcead94fd94c45f1872f2efd7c0))
* **app:** keep the lock screen above open sheets and viewers ([c28e843](https://github.com/hamza-kakar/wachatback/commit/c28e843e89b1607c1ee2459a129a7431a4658d8e))
* **app:** name file buttons by their visible text and wrap headers at large text sizes ([df0ec55](https://github.com/hamza-kakar/wachatback/commit/df0ec55e98d415d88f7833affcc10504c38d908b))
* **app:** open the bubble media viewer from the chat view, outside the message rows ([d28e5ab](https://github.com/hamza-kakar/wachatback/commit/d28e5abc28b5147070b6507ef66821f3422c536e))
* **app:** refresh bookmark lists after an import ([65ee1d4](https://github.com/hamza-kakar/wachatback/commit/65ee1d4e51fa6c3f801adc819380f66666208125))
* **app:** show the backup picker's focus ring and the restore's first phase ([8c0e1d1](https://github.com/hamza-kakar/wachatback/commit/8c0e1d1f4f4b4a619bb556d21391558a18feaf10))
* **app:** wait for the list to land before a requested jump ([45c1c7b](https://github.com/hamza-kakar/wachatback/commit/45c1c7b0c038ed3ec6070a3082fd1164c21f12cd))
* **capabilities:** retry transient OPFS init failures; e2e resilience ([ecd2bc8](https://github.com/hamza-kakar/wachatback/commit/ecd2bc89d4a34082b4468d174fb051bfa8cecd9c))
* **ci:** diagnose capability failures, harden offline test, tooling fixes ([10676e1](https://github.com/hamza-kakar/wachatback/commit/10676e1bbb2e327198b2e9da3ccf4e9e75de07af))
* **ci:** per-project browser coverage (v8 is Chromium-only in vitest 5) ([45ed92d](https://github.com/hamza-kakar/wachatback/commit/45ed92d12e134e77a8b19bcf3b4ffa86cad7f953))
* **ci:** remove stray browser run from unit job (browser coverage stays in the browser job) ([4eb8816](https://github.com/hamza-kakar/wachatback/commit/4eb881684f0354efc9eaf4ac736d8f97a3884c6f))
* **ci:** split browser configs per engine for typed coverage ([391b13e](https://github.com/hamza-kakar/wachatback/commit/391b13ef73d5bf873abddaafab4483e2cc1b9671))
* **ci:** unit job runs unit coverage only; browser coverage in browser job ([c5add77](https://github.com/hamza-kakar/wachatback/commit/c5add77cca56a63128c692f34298fec0d7f5ce39))
* **e2e:** skip OPFS-dependent tests on engines without OPFS (ADR 0007) ([7cbad79](https://github.com/hamza-kakar/wachatback/commit/7cbad7907f1893ecf88002d45e7ef3364902d8af))
* **e2e:** wait for SW control before offline reload; axe after boot; shm remount ([01de91d](https://github.com/hamza-kakar/wachatback/commit/01de91d30046da92159ee291165ecb523a47fd1f))
* **import:** apply the 200 MB text cap to the chat text, not the whole zip ([3a6f0f4](https://github.com/hamza-kakar/wachatback/commit/3a6f0f45ffe1c160f6d7ab7df022621eb40672eb))
* **import:** finish round-two fixes in the import UI and repository ([cac5961](https://github.com/hamza-kakar/wachatback/commit/cac596131fbe24a2966f3076fc9ae2ad5d8cd6ad))
* **import:** flush written paths every 100 files, not on every write ([0b97e07](https://github.com/hamza-kakar/wachatback/commit/0b97e075017be5e7e014616baf3878c3b4f0be66))
* **import:** move flow side effects into the import hook ([a528ef7](https://github.com/hamza-kakar/wachatback/commit/a528ef7baa5d6647bedc6fdfa92b8624d40a3588))
* **import:** open .txt exports as an archive with no media ([e0ed969](https://github.com/hamza-kakar/wachatback/commit/e0ed969423eebf4b353b387bc638f45940a15f5b))
* **import:** record media paths before writing and roll back on any failure ([6d647ed](https://github.com/hamza-kakar/wachatback/commit/6d647ed80dd3e613ad4a015015a08a66beed4e67))
* **import:** show Cancelling… until the worker answers a cancel ([a4307e6](https://github.com/hamza-kakar/wachatback/commit/a4307e63301d8fdd58162d0e24508f2298a40abd))
* **import:** show the cancelled screen only after the worker confirms ([1548f26](https://github.com/hamza-kakar/wachatback/commit/1548f2630e142016e85b4b0c5d032b6991649b1d))
* **m0:** address round-1 review (6 blockers, 3 majors, 11 minors, 5 nits) ([5b16bf6](https://github.com/hamza-kakar/wachatback/commit/5b16bf6a402c93ce94ab28592bd65b316bc563ca))
* **m0:** untrack coverage output, gitignore it, pin probe timeout ([7518ca2](https://github.com/hamza-kakar/wachatback/commit/7518ca247cc056b72ee5013920d180c189f37466))
* **parser:** anchor attachedIos regex (§8.7 anchored + linear-time) ([8ee12ea](https://github.com/hamza-kakar/wachatback/commit/8ee12eaa9e19a124fcd7815f7828bbb004100123))
* post-merge audit — blockers, majors, minors ([#5](https://github.com/hamza-kakar/wachatback/issues/5)) ([ec32d03](https://github.com/hamza-kakar/wachatback/commit/ec32d03e148b93b989994cf957b3137a830348be))
* **scripts:** split fixture variant data into two modules under lint limits ([01b9009](https://github.com/hamza-kakar/wachatback/commit/01b900907bdbd5a864641b409b21e413dd37b528))
* **storage:** count only the removed chat's media files ([28bcbc5](https://github.com/hamza-kakar/wachatback/commit/28bcbc5bd914e21b0b50170d9e7c58d438e0e7ca))
* **test:** narrow probe timings ([c4f715a](https://github.com/hamza-kakar/wachatback/commit/c4f715a084c5590e0c9e2d2046c7062626c90b94))
* **tests:** scope contract tests to tests/browser-chromium/ (webkit config picks them up via project include otherwise) ([778a3ce](https://github.com/hamza-kakar/wachatback/commit/778a3ce010091bab18017180155a90ef91a66423))
* **workers,app,e2e:** review round 1 — written-path bookkeeping, skip-stored media, streaming, scope completion ([f289fb8](https://github.com/hamza-kakar/wachatback/commit/f289fb8420289b5ac5e8ce89cf024396c00314c0))
* **workers:** check PIN attempts one at a time ([6d2a512](https://github.com/hamza-kakar/wachatback/commit/6d2a512b8003392c7ff0fb12bc81d32907df5377))


### Performance Improvements

* **parser:** single-decision classification gates, explicit firstLine ([eab1dc7](https://github.com/hamza-kakar/wachatback/commit/eab1dc7c70e5b5ad1af644b053e79225c5b466f8))
* **storage:** read a message window's attachments in one statement ([1f662c1](https://github.com/hamza-kakar/wachatback/commit/1f662c15700dc5432e064b0570e8f2e4e29fc40e))
* **test,nit:** displaced commit case; bulk-load FTS path; header sweep ([50ce87a](https://github.com/hamza-kakar/wachatback/commit/50ce87ae64bd3b79e57208ec86f8c120180845c8))
