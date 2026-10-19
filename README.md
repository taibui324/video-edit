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

Automatic speech recognition, AI editing, voice synthesis, visual generation, and extended parity are pending. Imported transcripts are explicit user input, never a claim of recognition. Media and database files live in `.data/` (override with `MOONJELLY_DATA`) and are excluded from git. Preserve that directory to retain projects. Only use this server locally; it has no shared-service authentication.

```sh
pnpm build
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

The backend test renders controlled color/audio markers and checks pixels, audio frequencies, captions, revision conflicts, persistence and interrupted export recovery. The browser test exercises import, transcript selection/cut, reload, undo/redo, playback, export and mobile layout. Screenshots, session video and downloaded MP4 are saved under `.artifacts/browser`; CI uploads them as a workflow artifact. These controlled fixtures verify the media pipeline, not speech or provider quality.

For a built local app, run `pnpm build` then `pnpm start` and open `http://127.0.0.1:4310`. See [implementation ledger](docs/implementation.md) for the full remaining scope and [investigation](docs/research/2026-10-19-descript.md) for historical REA evidence.
