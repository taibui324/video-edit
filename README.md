# Moonjelly: AI video editing and generation

Status: research and proposed design. No editor application has been implemented yet.

The requested product combines Descript-style AI video editing with video generation and AI narration. Image generation supports scene creation. The initial workspace was empty on branch `research-rea-descript-ai`.

- [Descript investigation](docs/research/2026-10-19-descript.md): installed-app evidence, observed workflows, official documentation, and remaining unknowns.
- [Proposed product design](docs/design/video-editor-proposal.md): architecture, interaction model, delivery slices, and acceptance criteria for review.

REA 6.7.0 is installed globally at `/Users/taibui/.npm-global/bin/rea`. Its Codex MCP registration and bundled skill are installed. The CLI works in this session; a Codex restart/reconnection is needed to load the new MCP tools. No native decompiler is required for the completed JavaScript analysis.
