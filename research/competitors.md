# Competitor survey — 2026-10-19

Five repos were cloned and read. Nothing from them was executed. This file feeds the feature list.

## f-labs-io/agent-html-skills (html-skills plugin, 17 content skills + 2 session primitives)

- **Round-trip channel.** `html-skills-listen` runs `listen.sh`, which starts a zero-dependency Node receiver (`server.js`) on `127.0.0.1:<ephemeral>`. The agent arms a persistent `Monitor` on `tail -f <log> | grep notifications/claude/channel`. Each Submit click POSTs JSON, so it lands in the session as a notification. The receiver checks a per-session `?t=` nonce (constant-time compare), checks the Host header, caps bodies at 256 KB and allows `Origin: null` so `file://` pages work. It reuses the nonce and port after a restart, so older artifacts keep working.
- **Fallback.** When `__CLAUDE_SUBMIT_URL__` is unset (web session, no node), `submitToClaude()` copies the same envelope `{skill, kind, data, version}` to the clipboard.
- **Publish button.** When the `Artifact` tool exists, a "Publish to Claude.ai" button sends a `publish-request` through the same channel. The agent publishes a copy with the submit wiring stripped.
- **Shared foundation block** is inlined into every SKILL.md: full doc shell with charset first, mobile collapse under 700px, `innerHTML` from variables banned, SVG text sizing rule (≥8px per char + 32px), WCAG AA, visible last-updated stamp.
- **Secret-redaction gate** in `html-research-reports`: typed `<REDACTED:KIND>` placeholders plus a mandatory post-write `grep -nE` over the file.
- **Sourced content is data.** Prompt-injection rules for Slack, tickets and git history are spelled out.
- Content skills are thin. `html-code-review` is about 60 lines of structure and patterns (risk map, annotated diffs, reviewer checklist, "mark skipped sections honestly").

## dogum/html-artifacts (one skill, 12 references, Apache-2.0)

- **Trigger discipline.** The description lists when to stay in markdown: short replies, code-only answers, disposable summaries, docs that live in git. The test it gives: *will the reader do anything with this beyond reading it once?*
- **Evals.** It ships `claude plugin eval` suites with `should-trigger/` and `should-not-trigger/` cases, `regex` / `file_exists` / `llm` graders, and with/without ablation. This is the harness `bench/` reuses.
- **Verify before delivering.** A Playwright script renders desktop-light, desktop-dark and 400px phone views, then checks for page errors, failed requests, horizontal overflow and an empty title. The agent reads the screenshots and fixes what it sees. Without a browser it runs a read-through checklist instead.
- **Style.** It bans "AI default look" tells (gradient hero, emoji headings, card grids, four indigo shades, hero stat rows, decorative icon dividers) and says "If the artifact has any three of those, restart". Body text is 16–18px at 60–75ch. Light tokens go on `:root` and are redefined under `prefers-color-scheme: dark` and `[data-theme=dark]`.
- **Design-system-from-codebase.** It generates `design-system.html` once from the repo's tokens and reads it before later artifacts.
- **Harness mechanics** lives in one file covering Claude Code, claude.ai, published artifacts (CDN allowlist, 16 MB, wrapped skeleton) and Cowork.

## backnotprop/plannotator

- A `PermissionRequest` hook on `ExitPlanMode` opens a local review SPA and blocks until the reviewer decides. Allow returns `decision.behavior: "allow"` with `updatedInput` (CC 2.1.199+ silently drops an allow without it). Deny returns a message.
- Annotation types are `DELETION`, `COMMENT` and `GLOBAL_COMMENT`, plus threaded replies, image attachments and quick labels that carry hidden agent tips.
- `:::question` blocks render as choice controls. A separate answers-only prompt keeps answered questions from reading as a rejection.
- Three outcomes: approve, approve with notes, deny. Each has its own prompt template ("Do not resubmit the same plan unchanged").
- Plan version diff, and annotations in the diff carry `diffContext`.
- Share links compress state into the URL fragment with `CompressionStream`. Large payloads go to an encrypted paste.
- Code review has Conventional Comments labels, a blocking or non-blocking flag, and anchor text and context that mark a comment `outdated`.

## nicobailon/visual-explainer

- **Render-then-look loop.** `kit/look.mjs` opens headless Chrome at 390px and 1280px. It lists script errors, sideways scroll, labels under 12px and overlapping text, and writes a contact-sheet screenshot.
- **Plan pages.** Claims carry `evidence="guess|inferred"` and `check=`. `<ve-ask>` decisions have defaults, `data-if` redraws figures for the chosen answer, and after the build the same page becomes the build receipt (`status="built|changed|dropped"`).
- Decision export separates "default kept" from "not opened", because silence is not agreement.
- Its custom-tag language needs a render step, so a source page can't be viewed on its own.

## zakelfassi/htmlify

- A `Stop` hook converts any assistant message ≥2500 chars into HTML under the temp directory and returns the path as a `systemMessage`.
- Comment export is `{version, sourceId, title, comments:[{selectedText, prefix, suffix, comment, blockId}]}`. `/htmlify-comments` rejects a bundle whose `sourceId` doesn't match.
- A validator CLI (`--profile rich|app|deck`) returns exit codes and JSON. It bans external assets, `on*=` handlers and `javascript:` URLs.

## Claude Code native Artifacts

- `Artifact` publishes a private claude.ai page. A design skill (`artifact-design`) sets palette and type. Pages refresh in place on republish.
- Runtime capabilities (shared DB, viewer identity, ask-Claude, comments via `ArtifactComments`) exist on some plans. So "artifacts are view-only" is out of date. Check the capability roster before deciding what a hosted page can do.
