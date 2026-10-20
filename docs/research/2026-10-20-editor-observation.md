# Installed Descript editor observation — 2026-10-20

The user confirmed `/Applications/Descript.app` is the reference and Moonjelly/video-edit is the implementation destination. This extends the earlier Home/documentation investigation with direct inspection of the installed editor. It does not claim recovery of Descript's hosted AI backend or proprietary algorithms.

## Artifact and REA evidence

- Installed version: 2.21.1. `app.asar` SHA-256 remains `bad2f88655ce569cba1a302fcf97a03fd86bdd26d88c4005e64e8043537a8605`.
- The fresh MCP ledger had no retained analysis for that artifact. A new whole-ASAR request timed out after its 15-second per-source budget; its partial evidence was retained as `ev_302e62e609273fa607157d5fc0fc215f43c79e764f418ec112241b16c9339dbf`. Its summary reported 402 modules and explicitly incomplete main-bundle analysis. Counts from differently scoped/limited analyses are not feature counts.
- A focused request selected only `package.json` and `.webpack/renderer/main_window/preload.js`, retaining the whole archive inventory but leaving three sources unselected. Parent evidence: `ev_8c8f1628bdf53e4cb2da4517ff5fe95d4fb18c0e9af4430c984bdd7f82619e93`; summary view: `ev_ee02387e168f67b3685a0b84fb0d3d3789c7578fb8846b15512a16ab18c3ee31`. It reported two context-bridge APIs, 46 exposed API members, and literal/dynamic IPC observations. Semantic coverage hit its node ceiling and remains partial. Static relationships do not prove runtime registration, execution, policy enforcement, or AI implementation.
- Full local REA bundle: `.artifacts/descript-reference-2026-10-20.json`. It is ignored by git; proprietary bundle contents and source reconstructions are not copied into the product.

## Live editor observations

Observed through native accessibility controls and a local screenshot. The existing project was opened for inspection; no text/media edit, AI submission, export, publication, purchase or upload was performed. The Undo control remained disabled while inspecting these panels. Project content, prompts, media and account identifiers are intentionally omitted from this report.

| Surface | Directly observed contract | Implementation implication |
| --- | --- | --- |
| Script and composition | Editable transcript with speaker selector and embedded scene thumbnails; separate Compositions control | Keep transcript tokens, source clips, scenes and composition identity linked |
| Canvas | Portrait output selector, Layout, Background and Layers controls | Output shape and layered visuals are independent from spoken text |
| Timeline | Scene thumbnails/durations, video/visual layers, captions, word segments and visible timed gaps; transport, speed, split, zoom, select tool and markers | Timeline needs explicit source/composition mapping and layered scenes, not a flattened generated player |
| Underlord | AI co-editor pane; improve-video suggestions; context attachment, `@` context, `/` skills, model mode, chat history and error-calibration text | Expose context and proposed intent; retain validation, revision checks and explicit application |
| AI tools catalog | Clarity/fillers/retakes/pauses, Studio Sound, clips/highlights, eye contact, green screen, speaker centering, skin smoothing, background blur, jump-cut smoothing; some options disabled | Capability/readiness must be explicit; catalog presence is not a working provider |
| Writing tools | Script, outline, rewrite, brainstorm; title, summary, blog/social post, show notes, YouTube description/thumbnail | Script planning and publishing-text assistance are distinct text capabilities |
| Filler review | Search mode with separate repeated-word and lexical categories, including um/uh, conversational phrases and ambiguous words such as like/well | Detection is reviewable; ambiguous words require context and should not be blindly deleted |
| Pause search | Word-gap search with “more than” comparison, duration field initially 3 seconds, result count and Find-all action; UI explicitly warns that searching uses AI credits | Separate finding candidates from choosing retained pause duration and applying edits |
| Generate audio | Separate Music and Sound effects tabs. Music exposes prompt, tempo options (Auto or BPM bands), duration, lyrics toggle and additional options. SFX exposes prompt, loop toggle and duration | Music/SFX generation is separate from AI speaker narration; do not label one as proof of the other |
| AI speakers | Stock-speaker browser with search, gender/age/language filters, voice traits and preview controls; Choose speaker remains disabled until selection | Voice browsing and assignment are separate from generating narration; no voice was selected or applied during inspection |
| Generate visuals / Image | Model selector, prompt, reference image input, style, aspect ratio, batch size, advanced-settings readiness and generation history. Current visible model label was Nano Banana; the account showed an upgrade/credits gate | Persist asset provenance/history and model-driven controls; a model label does not establish an API contract or successful generation |
| Generate visuals / Video | Separate Video tab with PixVerse v5 label, prompt, start/end-frame reference inputs, style, aspect ratio and 5-second duration; advanced settings exposed 720p resolution; generation options and credits were gated | Validate model-specific reference, resolution and duration support; generated shots must fit the narration-driven scene plan |

The installed editor is visibly hosted at `web.descript.com` inside the native shell. This corroborates the earlier wrapper inference; it does not reveal server prompts, model weights, training data, provider routing or exact editing algorithms. No private API was replayed and no authentication store was read.

## Mapping into Moonjelly

The current branch implements original equivalents for linked transcript cuts, pause trims, frozen preview/export and Codex-backed edit proposals. It has real subscription-backed selected-region acceptance with non-mutating preview, explicit apply, persistence, MP4 export and undo; see [Codex evidence](../evidence/codex-editing.md). That verifies Moonjelly's behavior, not Descript's algorithm or parity.

Next required units remain automatic transcription/alignment, scene/layer editing, script/storyboard planning, real narration/regeneration, image/video/music/SFX adapters and the catalog's extended transformations. Each needs its own runtime/output acceptance. Existing user project data and Descript assets will not become product fixtures. The full goal is incomplete.
