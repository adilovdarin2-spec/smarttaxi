# Astryx AI — product brief for Claude

## Important context

`C:\dev\smarttaxi` is the **SmartTaxi** repository. There is no Astryx source
code in this workspace yet. Astryx below is the planned standalone product,
assembled from the founder's specification. Do not rename, rewrite, or mix it
into SmartTaxi.

## What Astryx AI is

**Astryx AI is a local-first Personal Agent OS:** a desktop application where
one assistant can understand a goal, plan work, use explicitly enabled tools,
verify the result, and show a human-readable work log.

It is not just a chat UI. Its product promise is: **reasoning + memory +
skills + tools, under the owner's control**.

The primary user is a founder/developer who wants one workspace for coding,
research, browser work, documents, visual design, and connected devices.

### Product principles

1. **Human remains in control.** Read-only actions may run autonomously;
   consequential actions (sending, publishing, payments, deleting data,
   installing software, changing credentials) require a clear confirmation.
2. **Local-first and privacy-aware.** Store project context, embeddings, tool
   history, and personal preferences locally by default. Cloud models are an
   opt-in capability per task.
3. **Evidence before claims.** Each action produces an artifact, command
   result, citation, screenshot, test, or diff. The agent never says "done"
   without verification.
4. **Capability-scoped tools.** Files, browser sessions, terminal, Git,
   Android, and connectors are independently enabled with per-project scopes.
5. **One coherent experience.** Chat, agent runs, files, task plan, preview,
   approvals, and `/design` live in the same desktop workspace.

## Core capabilities

### Agent workspace

- Chat with streaming answers, plan, live progress, and reversible task log.
- Agentic loop: plan -> tool action -> observe -> validate -> continue/ask.
- Multiple focused agents only when useful: code, browser/research, design,
  and device operations, coordinated by one orchestrator.
- Skills are modular instructions loaded only for the active task, e.g.
  `/design`, Docker, Flutter, React, Python, SQL, QA, or Android/ADB.

### Engineering mode (Codex-like)

- Open a repository, search code, read diffs, edit files, run tests/builds,
  use Git and diagnose errors.
- LSP diagnostics and definitions; Tree-sitter code structure; project RAG.
- Sandboxed terminal execution, with a preview of commands and artifacts.
- Test-first verification, change summary, and rollback-aware Git workflow.

### Operator mode (Claude-like computer use)

- Read the currently authorised browser tab and page semantics.
- Browser automation via Playwright/DOM before coordinate clicking.
- Desktop and Android control only for explicitly connected/approved surfaces.
- File organization, document processing, spreadsheet/PDF/image work, and
  external services through MCP/connectors.

### `/design` mode

`/design` turns Astryx into a product designer, not merely an image generator:

- accepts a brief, existing screen, repository, or screenshot;
- proposes an information architecture and screen inventory;
- creates a design system: tokens, type scale, grids, components, states;
- produces web/mobile UI proposals, icons/illustrations when needed, 2D
  assets, and optional 3D scene/asset briefs;
- implements approved UI into the active codebase and validates responsive,
  accessibility, and empty/loading/error states;
- never copies another product's branding, text, or proprietary artwork.

## Recommended production architecture

```text
Desktop UI (Tauri or Electron + React/Next + assistant-ui)
  └── Agent runtime API (Python/FastAPI or TypeScript)
       ├── Orchestrator: LangGraph or Agno
       ├── Model router: local Ollama/LM Studio + opt-in cloud models
       ├── Skills registry and policy/approval engine
       ├── MCP client and connector gateway
       ├── Project index: Tree-sitter + Qdrant
       ├── Long-term memory: Mem0-compatible local store
       ├── Structured output: Pydantic AI / JSON Schema
       └── Audit trail, artifacts, rollback checkpoints
            ├── filesystem + Git + terminal sandbox
            ├── browser (Playwright)
            ├── Android (ADB/uiautomator2)
            └── approved external MCP services
```

### Suggested model routing for the current PC

- Fast local tool/GUI intent: a small multimodal or code model.
- Local coding: Qwen2.5-Coder 7B GGUF for RTX 3070 8 GB.
- Larger reasoning: a quantized 14B model with hybrid VRAM/RAM, or an opt-in
  cloud reasoning model for tasks where latency/cost is acceptable.
- Never store passwords, access tokens, or raw account secrets in long-term
  memory. Use the OS credential vault instead.

## Build order for Astryx

1. Define local desktop shell, auth/identity, workspace model, and permissions
   UX; build the task timeline and approval cards first.
2. Add file/Git/terminal tools with command previews, artifact capture, and
   project sandboxing.
3. Add model router, structured tool calls, Skills registry, and run recovery.
4. Add code intelligence: LSP, Tree-sitter, repository indexing, local RAG.
5. Add browser reading/automation; then Android tools for a connected device.
6. Add long-term memory with a visible memory viewer/edit/delete control.
7. Add `/design`: visual brief -> system -> screens -> implementation -> QA.
8. Add optional connectors one by one, with scoped OAuth and audit events.
9. Security/reliability pass: confirmations, rate limits, secret vault,
   redaction, encrypted local data, error telemetry, tests, recovery.

## What remains before Astryx can be called a product

- A separate Astryx repository and runnable desktop shell do not exist yet.
- The exact first-release user and first three jobs-to-be-done need freezing.
- Permission model, threat model, local data format, and cloud model policy
  need written decisions.
- `/design` needs a component/token format and implementation target.
- Browser/desktop/phone capabilities need individual safety and QA suites.
- A real eval set is needed: coding tasks, browsing tasks, design tasks,
  recovery from failures, and approval-boundary tests.

## SmartTaxi: current factual status (separate project)

Already implemented in this repo: Flutter passenger/driver app, web client,
Node API, PostgreSQL, Docker configuration, map/routing integration, regions,
intercity routes, driver workflows, admin tooling, tariffs, and a blue/white
visual system. The Android debug app was built and installed on a connected
phone; the current Flutter source tests pass 25/25.

Still to finish before a commercial release:

1. Import and audit a complete licensed/official address registry for every
   enabled region. Existing code prevents road codes and bare streets from
   becoming confirmed pickup points, but coverage is only as complete as the
   imported data.
2. Final device QA for every rider/driver screen and web/mobile visual parity.
3. Production configuration: real domains, backups, monitoring, TLS, secrets,
   load tests, and a release checklist.
4. Integrate a legally licensed source for speed limits, cameras, and road
   alerts; validate it region by region.
5. Payments and SMS/Infobip are intentionally postponed by the founder.
6. iOS build, signing, and App Store work are intentionally postponed.

## Visual material to provide Claude

### User-provided visual references (do not copy literally)

Attach these three files from Downloads to Claude. Use them as direction for
hierarchy, polish, spacing and blue/white mood; do not reuse their logos,
copy, vehicle artwork, or icons:

- `C:\Users\User\Downloads\Смарт дизайн 1`
- `C:\Users\User\Downloads\Смарт дизайн 2`
- `C:\Users\User\Downloads\смарт дизайн 3`

### Current SmartTaxi evidence/screenshots

Attach this compact set first:

- `C:\dev\smarttaxi\tmp-tariff-flow-final.png` — tariff selection.
- `C:\dev\smarttaxi\tmp-tariff-flow-picker-ready.png` — address map picker
  and blue square/triangle marker.
- `C:\dev\smarttaxi\docs\status\phone-3d-final-qa.png` — native 3D map.
- `C:\dev\smarttaxi\tmp-smarttaxi-passenger-menu.png` — passenger menu.
- `C:\dev\smarttaxi\tmp-smarttaxi-payment.png` — payment choice.
- `C:\dev\smarttaxi\tmp-smarttaxi-driver-home.png` — driver home.
- `C:\dev\smarttaxi\tmp-smarttaxi-driver-navigator.png` — driver navigation.

### Design assets Claude may inspect in the repository

- `C:\dev\smarttaxi\apps\mobile\smarttaxi_app\assets\map\marker_address_pick_2026.png`
- `C:\dev\smarttaxi\apps\mobile\smarttaxi_app\assets\map\marker_my_location_2026.png`
- `C:\dev\smarttaxi\apps\mobile\smarttaxi_app\assets\map\marker_destination_2026.png`
- `C:\dev\smarttaxi\apps\mobile\smarttaxi_app\assets\cars\tariff_economy_white_sedan_flutter.png`
- `C:\dev\smarttaxi\apps\mobile\smarttaxi_app\assets\cars\tariff_comfort_white_sedan_flutter.png`
- `C:\dev\smarttaxi\apps\mobile\smarttaxi_app\assets\cars\tariff_business_white_premium_sedan_flutter.png`

## Paste this task into Claude

> You are joining two separate products. Do not merge their codebases.
> First, understand **Astryx AI** as a local-first Personal Agent OS: a
> controlled desktop workspace for coding, browser work, design, files and
> connected devices, with skills, memory, evidence-based tool runs and explicit
> confirmations for consequential actions. Propose its v1 architecture and
> implementation plan without claiming nonexistent code is implemented.
>
> Separately review **SmartTaxi**. Use the supplied screenshots and design
> references only as visual direction; do not copy other brands/assets. The
> target is a premium blue-and-white mobile-first taxi experience, where web
> and mobile flows are functionally and visually aligned. Prioritize the
> address picker and tariff screen: clear street + house address confirmation,
> markers visually above 3D buildings, readable map labels, honest server-side
> price, and two real tariff choices in KZT. Preserve the existing product
> logic and do not substitute mock data for production behaviour.
