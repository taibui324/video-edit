# Editing foundation checkpoint — 2026-10-19

Scope: an independently implemented local editor using the proposal's browser/local-worker architecture. This checkpoint does not complete Slice 1 or the entire requested product. Automatic transcription, AI editing, narration synthesis, generated visuals and extended parity remain pending.

## Reproducible checks

Run `pnpm build`, `pnpm test`, and `pnpm test:e2e` with Node 26.8.1, pnpm 12.5.1 and FFmpeg/ffprobe installed. Install the pinned Playwright Chromium with `pnpm exec playwright install chromium`. CI runs these commands on Ubuntu and uploads browser evidence. Local verification used macOS arm64, FFmpeg 8.1.2, Playwright 1.64.1 and Chromium 156.0.8078.4.

| Evidence | Contract verified |
| --- | --- |
| Domain tests | Non-destructive cuts; source/composition mapping; active transcript/caption agreement; malformed/out-of-range timing and empty composition rejection |
| SQLite history test | Undo/redo; branch after undo invalidates redo; historical revision remains immutable; stale commands fail without mutation |
| Backend/media integration | Real media import/proxy; hidden data directory byte-range playback; cross-origin rejection; five simultaneous same-revision submissions reuse one export job; frozen render remains unchanged after later edits |
| Encoded media assertions | Three source color/tone segments become two seconds after removing the middle segment; sampled frames are red then blue; measured audio frequencies are 440 Hz then 1320 Hz; video/audio streams and WebVTT timing agree |
| Job integration | Queued and running export cancellation; real subprocess termination; interrupted running jobs become failed on restart, with an actionable reason; persisted projects reopen correctly |
| Browser editing test | Import, explicit timed JSON, shift-range selection/cut, reload, undo/redo, seeking to a decoded blue frame, playback through red→blue join, a visible 100 ms caption, MP4/caption download |
| Browser lifecycle test | A delayed response from an old preview cannot replace another project's media at the same revision |
| Rendered inspection | Desktop 1440×1000 and mobile 390×844 screenshots; no horizontal page overflow; no page/console errors in the editing workflow |

Local screenshots, browser recording, downloaded MP4, and on-failure traces are under `.artifacts/browser/`. The browser tests retain recordings of the actual scripted session; the source fixture is deliberately synthetic, not recorded human speech. These artifacts are ignored by git and are available from the CI workflow artifact after a successful hosted run.

## Findings corrected during verification

- Express initially returned 404 for media beneath hidden `.data` directories. Exact DB-backed media routes now permit those internal paths; the integration test uses hidden storage and checks HTTP 206 streaming.
- Concurrent exports initially raced across asynchronous directory creation. Job reservation now happens synchronously before worker filesystem operations, with five-request concurrency coverage.
- Exports initially lacked cancellation. Persistent cancellation now skips queued work, aborts/awaits active FFmpeg and removes partial output.
- Initial preview sought through cuts in the source. Preview now plays the same frozen composition file used for export. Editing displays preparation progress; rendering trades immediate preview latency for media consistency.
- Preview polling now ignores disposed responses and matches both project identity and revision. Caption sampling uses animation frames so brief word cues are observable.

## Skill and source evidence

Ponytail guided reuse of native SQLite, argument-based FFmpeg processes, and existing project operations. opensrc fetched Vite 8.3.4 and Busboy 1.6.0; source inspection established Vite's proxy order/origin boundary and Busboy's inclusive file-size truncation behavior. The implementation uses a bounded streaming raw-file upload, so Busboy was not added as a dependency. Vite source: `~/.opensrc/repos/github.com/vitejs/vite/8.3.4/packages/vite/src/node/server/middlewares/proxy.ts`; [upstream source](https://github.com/vitejs/vite/blob/v8.3.4/packages/vite/src/node/server/middlewares/proxy.ts).

The reverse-engineer-anything skill reused the historical Descript contract with its explicit limitations. A current REA runtime capture of the built local Home page produced `ev_eae57a45455101040c31e381f2c00cb9eed7cefa44fd9e47de6fba5484535e64`: declared wait action, DOM/URL and page-error capture, complete within that scope; owned browser terminated afterward. Bundle: `.artifacts/rea-local-runtime.json`. It does not establish editor or provider parity. The historical Descript evidence ID was not retained in this fresh MCP ledger; its provenance remains the original investigation report. A fresh native Descript UI observation timed out, so no additional reference-app behavior is claimed.

Browser plugin was not available; the in-app browser surface was unavailable. The frontend testing skill's Playwright route supplied browser evidence. Independent code review identified the corrected export race, cancellation and preview lifecycle issues; final re-review found no remaining blockers. The final local build, four domain/backend/media/history tests and two browser workflows passed. Hosted CI status must be checked on the feature PR.

## Remaining scope and limits

Transcripts are explicit timed user input. No words are inferred from filenames and no speech-recognition success is claimed. Captions are a preview overlay plus WebVTT download, not burned into MP4. Preview generation adds render latency and retains local revision renders. No paid provider calls, proprietary code/assets, external media uploads, authentication-store reads, or private API replay were used. This is a single-creator loopback application; shared-service authentication, production deployment, provider quality, long-form performance and parity acceptance remain unverified.
