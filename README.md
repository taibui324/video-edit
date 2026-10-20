# Moonjelly: AI video editing and generation

Status: editing foundation in development. The full AI editor and narrated-generation product remains incomplete.

The requested product combines Descript-style AI video editing with video generation and AI narration. Image generation supports scene creation. The initial workspace was empty on branch `research-rea-descript-ai`.

- [Descript investigation](docs/research/2026-10-19-descript.md): installed-app evidence, observed workflows, official documentation, and remaining unknowns.
- [Proposed product design](docs/design/video-editor-proposal.md): architecture, interaction model, delivery slices, and acceptance criteria for review.

Use Node 26.8.1+, pnpm 12.5.1, FFmpeg and ffprobe on PATH.

```sh
pnpm install --frozen-lockfile
pnpm dev   # local API on 127.0.0.1:4310
pnpm web   # second terminal: editor on 127.0.0.1:5173
```

Import an audio/video file (up to 512 MB and two hours), then attach a timed transcript JSON array containing `text`, `start`, and `end` in integer milliseconds. Click words to seek, shift-click to select a range, and cut linked media. Undo/redo and every edit persist in SQLite. Export renders the frozen revision into a real MP4 and a synchronized WebVTT sidecar. Captions appear over the browser preview; captions are currently a separate downloadable file rather than burned into MP4 pixels.

Automatic speech recognition, voice synthesis, visual generation, and extended parity are pending. Imported transcripts are explicit user input, never a claim of recognition. Media and database files live in `.data/` (override with `MOONJELLY_DATA`) and are excluded from git. Preserve that directory to retain projects. Only use this server locally; it has no shared-service authentication.

For AI editing, install Codex CLI 0.163.0 or newer, run `codex login` in your terminal, choose ChatGPT login, then start the studio. Ask Codex to remove filler words, shorten pauses or make transcript cuts. Select words to limit the request, review the proposed operations, watch the proposed video preview, then explicitly apply. Undo restores the previous composition. This uses the CLI's normal ChatGPT subscription login and allowance; it does not read or copy login credentials or accept an API key. Each request verifies ChatGPT login and pins that authentication method. Subscription limits and account credit settings still apply. See [official non-interactive Codex documentation](https://learn.chatgpt.com/docs/non-interactive-mode).

Only transcript text in scope and your instruction are sent to Codex. Originals and video are processed locally. The planner runs in a clean temporary directory with inherited user configuration ignored, shell/apps/plugins/browser features disabled and a read-only sandbox; results are validated data, never commands to execute. Only word-range removals and pause shortening are supported in this checkpoint. B-roll insertion, script/storyboard generation and other AI operations remain pending.

```sh
pnpm build
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

The backend test renders controlled color/audio markers and checks pixels, audio frequencies, captions, revision conflicts, persistence and interrupted export recovery. The browser test exercises import, transcript selection/cut, reload, undo/redo, playback, export and mobile layout. Screenshots, session video and downloaded MP4 are saved under `.artifacts/browser`; CI uploads them as a workflow artifact. These controlled fixtures verify the media pipeline, not speech or provider quality.

The Codex provider test is opt-in and consumes subscription usage; CI skips it. Run `MOONJELLY_CODEX_LIVE=1 pnpm exec playwright test tests/ui/codex.spec.ts --output .artifacts/codex-live` for a real selected-region proposal, non-mutating preview, apply/reload/export/undo workflow. CI separately verifies the provider contract with a clearly synthetic planner, including authentication switches, cancellation and stale revisions. See [Codex evidence](docs/evidence/codex-editing.md).

To keep an existing local studio running while verifying another instance, set `MOONJELLY_API_PORT` and `MOONJELLY_WEB_PORT` consistently on both API and web/test commands. Defaults remain 4310 and 5173. Validation used isolated ports 4320/5174 and separate `.artifacts/ui-data` storage.

For a built local app, run `pnpm build` then `pnpm start` and open `http://127.0.0.1:4310`. See [implementation ledger](docs/implementation.md) for the full remaining scope and [investigation](docs/research/2026-10-19-descript.md) for historical REA evidence.
