# Local transcription checkpoint — 2026-10-20

Moonjelly now offers local automatic speech recognition alongside explicit timed-JSON import. It uses faster-whisper 1.2.1 in a locked Python 3.11 environment, CTranslate2 CPU int8 inference, and the default multilingual base snapshot `Systran/faster-whisper-base@ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66`. The setup command downloads that open model; normal recognition sets Hub offline/telemetry-disabled mode, requires local model/tokenizer files, and uses packaged VAD. No OpenAI API or Codex call performs recognition.

## Product and data contract

- A durable job captures the source asset, base revision, language and local model label. Its result records recognized words, estimated source times, detected language/score, actual runtime version and model-weight SHA-256. The score is not presented as calibrated confidence.
- Jobs deduplicate identical concurrent submissions and expose queued/running/succeeded/failed/cancelled states. Interrupted running work becomes a visible failure. CPU jobs run one at a time and have a 30-minute execution timeout.
- Recognition leaves clips and transcript unchanged. Explicit attachment uses the existing SQLite transaction and immutable revision history. Stale results cannot attach; Undo restores the previous content.
- Boundaries convert seconds to integer milliseconds. At most 50 ms of overlap and 100 ms of source-end overrun are clamped for timestamp precision. Unreliable, empty, zero-duration or non-monotonic results fail instead of inventing word spacing. Recordings over 30 minutes and outputs over 10,000 words are rejected.
- Cancellation kills the active local child process and removes temporary decoded audio. A completed result remains separate from project content; cancelled/failed jobs cannot attach.

## Acceptance

Production build and ten deterministic domain/backend/media/CLI tests passed. ASR contract tests use a clearly synthetic recognizer to exercise five parallel submissions, no mutation before attachment, undo, stale attachment, cancellation, empty/invalid output and interrupted-worker recovery. A browser contract test holds an old project's response while another project opens and verifies the old transcript cannot replace it.

The separate opt-in browser run uses actual faster-whisper and a locally generated macOS Samantha stock-speech sentence. It recognizes all 19 expected normalized words, reviews without project mutation, attaches, cuts one recognized word, reloads, seeks/plays synchronized captions, downloads a playable audio/video MP4 and restores the word through Undo. See [sanitized run record](local-speech-run.json). Raw screenshots, browser video, fixture speech and MP4 remain in the ignored artifact path recorded there. This is real model execution on controlled synthetic speech, not evidence of human-recording, Vietnamese, noisy-audio, speaker or long-form accuracy.

Additional local probes ran the actual Python worker under macOS `sandbox-exec` with network access denied and recovered the same 19 words. Another probe observed the actual Python child during a repeated five-minute fixture, aborted it, verified it exited, and confirmed temporary audio was removed (47 ms from abort to completion). Independent review found no actionable blockers and separately exercised subprocess normal exit, failure and abort. The reviewer did not independently rerun model/browser acceptance.

CI runs deterministic contracts and general browser workflows; the real local model test is opt-in and skipped there. No claim of hosted real-ASR evidence is made.

## Limits and references

Word estimates can cut phonemes at boundaries; preview edits before applying. No speaker diarization, transcript correction UI, translation, speech synthesis, cloning or narration regeneration is supplied by this checkpoint. The base model's quality and CPU throughput need separate evaluation with representative user recordings. `MOONJELLY_SPEECH_PYTHON` and `MOONJELLY_WHISPER_MODEL_DIR` may select an existing local environment/model directory; actual runtime and weights are recorded rather than inferring model identity from its directory name.

Official sources: [faster-whisper 1.2.1](https://github.com/SYSTRAN/faster-whisper/tree/v1.2.1), [word timestamp API](https://github.com/SYSTRAN/faster-whisper/blob/v1.2.1/faster_whisper/transcribe.py), [pinned model snapshot](https://huggingface.co/Systran/faster-whisper-base/tree/ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66). Static offline settings establish the configured path; the network-denied probe corroborates that this fixture needs no network after setup.
