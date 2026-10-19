# Implementation and acceptance ledger

The user's implementation instruction on 2026-10-19 authorizes the proposal's browser editor and local-worker approach. The original research remains historical evidence. This ledger tracks delivery of the entire proposal, not a reduced product definition.

## Sequence

1. Initialize `taibui324/video-edit`, preserve research and this specification in a reviewed PR.
2. Editing foundation: React editor, local Node API, SQLite immutable revisions, media admission, proxy playback, transcript/source selections, non-destructive cuts, undo/redo, captions, frozen-revision export. Review and PR with unit, backend/media, and browser evidence.
3. Validated editing proposals: selected-region cleanup, gaps, rough cuts, B-roll; explicit preview/apply and stale revision rejection.
4. Actual speech synthesis, word alignment, voice selection and sentence regeneration, with durable jobs and playback/export agreement.
5. Script/storyboard to narrated editable scenes, real visual generation, provider job reconciliation and capability validation.
6. Image iteration, interaction refinement and all extended-parity workflows in the proposal, each with separate real acceptance.

## Foundation contract

- Bind only to loopback; reject cross-origin state-changing requests. Local media stays outside git.
- Import real audio/video, preserve its immutable checksum, normalize a browser-playable proxy with audio, retain duration and provenance.
- Use integer milliseconds. Tokens retain stable identity and source timing; composition clips contain legal source in/out intervals.
- Timed transcripts can be admitted as an explicit user-supplied JSON sidecar. Never manufacture a transcription from a filename or evenly spaced words. Automatic transcription requires a functioning local adapter and separate evidence.
- Selecting transcript words seeks their source region. A contiguous range removal changes clips, active tokens, preview, duration and captions together. Original media and transcript remain intact. Transcript corrections must not synthesize speech.
- Persist immutable revision snapshots with optimistic concurrency. Undo/redo creates new revisions of historical content; no source file deletion. Reopening loads exactly the saved revision.
- Export captures the current revision before rendering. Persist queued/running/succeeded/failed/cancelled jobs; interrupted work must be surfaced on restart. Produce MP4 and WebVTT from identical active source ranges.
- Empty compositions, malformed timing, unsupported media, stale requests, subprocess failures and missing files produce actionable errors.

## Evidence required

Use a controlled source with visible color markers, distinct audio tones, and a known timed transcript. Cut the middle range through the UI, reload, undo/redo, export, inspect encoded duration, visible frames, audio frequencies and caption times. This controlled fixture verifies editing synchronization; it is not speech recognition or provider-quality evidence. Exercise the same contracts directly through the API, including invalid/stale requests and persisted revision/job state. Record browser screenshots and console errors. Attach exact commands/results and review findings to the PR.

## Current status

- Repository initialization: in progress.
- Foundation: pending implementation and evidence.
- Slices 2–6: pending. Provider access, quality and spending selection remain unresolved; no paid calls are authorized by this document.

The full product is incomplete until all applicable acceptance rows in the proposal have real evidence. Passing foundation checks cannot close the overall goal.
