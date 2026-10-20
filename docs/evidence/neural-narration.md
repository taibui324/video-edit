# Local neural narration checkpoint — 2026-10-20

This implements original script-to-speech functionality with local Kokoro neural inference. It does not recover Descript's voice models or use a paid speech API. ChatGPT/Codex subscription access remains the separate text-edit-planning integration.

## Contract

`pnpm voice:setup` installs the frozen Python 3.11 dependency lock (`kokoro-onnx==0.6.1`) and explicitly downloads upstream `model-files-v1.1` artifacts `kokoro-v1.0.onnx` and `voices-v1.0.bin`. Download, readiness and inference verify pinned SHA-256 values. ONNX Runtime explicitly uses CPU execution with four inference threads. Phonemization uses the package's local eSpeak library/data; no model or phonemizer download occurs in a synthesis job.

The user selects Heart/Bella/Michael, English text (3–5,000 characters) and speed 0.8–1.2×. A durable job freezes the script, voice, speed and model label. Successful WAV audio is probed, normalized to the same editing proxy, checksummed and admitted with its original script/settings, actual runtime, weight/voice checksums and sample rate. Asset admission and successful status commit in one SQLite transaction. Invalid/empty audio never becomes a ready asset.

Identical model/script/voice/speed requests reuse queued/running/successful work. Failed or cancelled work can be requested again. Opening a completed narration creates one deterministic project and reopening preserves its edits. Generation does not overwrite another project. History persists and allows selecting earlier results. Audio preview uses the generated original; editing preview and MP4 use its normalized proxy.

Cancellation aborts the Python or media subprocess and removes request/partial output. Running work becomes failed after restart; cleanup retries unadmitted partial folders for running, failed, cancelled and queued records while preserving admitted assets. Cleanup failure is visible and releases the worker for subsequent work. The worker timeout is ten minutes, distinct from a guaranteed narration duration.

## Evidence

- Production build and eleven deterministic tests pass on Node 26.8.1. The narration contract uses a clearly synthetic tone generator with real FFmpeg for concurrent deduplication, validation, audio admission/streaming, idempotent open, cancellation, invalid media and restart cleanup.
- Actual local neural inference generated two distinct voice outputs, including a changed speaking speed. The browser played audio, reloaded persisted script/history, reused identical work and opened an earlier result in the editor.
- Actual local Whisper recognized all 16 normalized words in the controlled original English script. The UI attached estimated timing, cut one word, reloaded, played synchronized captions, exported a real audio/video MP4 and undid the cut. See [sanitized run record](neural-narration-run.json). Raw screenshots, session video and MP4 remain in its ignored local artifact directory.
- A browser contract holds an old narration-open response while new footage is imported and proves the old result cannot replace the current project. Existing editor and transcription race workflows also remain covered.
- The actual Kokoro worker synthesized with network access denied by macOS `sandbox-exec` after setup. A separate actual API cancellation probe observed the Python child, cancelled it, verified process exit and removal of the request and partial media in 83 ms. This is an observed short cancellation measurement, not a performance guarantee.
- Independent review found a crash-recovery residue gap for cancelled/failed jobs; startup cleanup and a regression covering all three terminal/interrupted states fixed it. The reviewer reran the contract test and found no remaining blockers. Model/browser/network probes were run by the parent and were not independently repeated by the reviewer.

CI runs contracts and general browser tests, using synthetic provider data where labelled; actual neural/Codex/Whisper tests remain opt-in. Hosted green checks do not establish model execution.

## Remaining scope

This checkpoint produces neural audio, not generated scene visuals. It uses the existing plain canvas for video playback/export. Narration alignment is estimated by real recognition rather than forced alignment of the supplied script. English controlled-script correctness does not establish naturalness, pronunciation, arbitrary-script accuracy, other languages or long-form quality. Always listen before applying text cuts.

Sentence-level regeneration into an existing composition, custom voice cloning, multilingual narration/dubbing, scene/layer editing and generated images/video/music/SFX remain pending. The full Descript-style product goal remains incomplete.

Official sources: [Kokoro ONNX package](https://pypi.org/project/kokoro-onnx/0.6.1/), [upstream source](https://github.com/thewh1teagle/kokoro-onnx), [model release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1), [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M). Upstream identifies the wrapper as MIT and model as Apache 2.0; transitive speech dependencies retain their own licenses. Runtime/model binaries are downloaded locally and excluded from git.
