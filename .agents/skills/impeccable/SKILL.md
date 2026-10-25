---
name: impeccable
description: Supplement the art-supabase-pro professional-ui-quality standard with Impeccable methods for requested comprehensive UI audits, design critiques, and substantial refinement. Preserve Art/Element Plus components and project rules; do not use as a replacement design system.
metadata:
  version: 4.5.1-project.1
---

# Impeccable — project adapter

The primary standard is `../professional-ui-quality/SKILL.md`, including its visual baseline, checklist, browser evidence and review rubric. Also apply local `project-code-quality` and `art-supabase-pro-conventions`.

## Scope and precedence

This entrypoint adapts upstream Impeccable 4.5.1 from https://github.com/pbakaus/impeccable. The upstream reference, script and agent resources are retained under the Apache-2.0 license in LICENSE. This is a project adaptation, not an unmodified upstream installation. See source.json for the acquired snapshot fingerprint.

When updating, compare a pinned upstream snapshot and refresh needed resources while preserving this adapter and the primary skill. Do not run an upstream installer/update over this folder in a way that replaces the project contract.

Use upstream references as diagnostic methods. Their tool orchestration, setup/init requirements, independent-agent recipe, automatic hooks, report persistence, forced follow-up questions, aesthetic bans, and alternative scoring do not override this adapter or local rules. Do not run upstream init/document, replace the visual system, start live helpers, install hooks, invoke bundled agents, or change workflow rules merely because a reference suggests it. Delegation follows the session's applicable authorization rules.

Business screens use Operate mode: task completion, scanability, consistency and efficient sustained use outrank novelty. Keep approved page structures, Chinese/system fonts, dense tables, semantic status colors, shared Art components, --theme-color, --art-* tokens, light/dark themes and border/shadow modes. An intentional bounded table/panel scrollbar is valid. Never hide overflow as a substitute for fixing layout. Preserve the global reduced-motion contract and the local animate skill.

Treat upstream cognitive-load item counts as prompts for investigation, not hard caps on business columns, menus, filters or choices. Judge recognition, grouping and the actual decision task; do not remove authorized actions or useful data to satisfy a numerical heuristic.

Preserve tenant and button authorization, ordinary-user AI access rules and MasterDataDeleteGuard. Do not replace reference checks and deletion confirmation with optimistic deletion/Undo. Do not modify factual copy or invent metrics to suit a layout.

## Select the method

- Audit: read reference/audit.md. Review measurable accessibility, performance, theming, responsiveness and implementation integrity. Verify candidates against project context; do not automatically fix findings.
- Critique: read the design-review, cognitive-load and heuristic sections of reference/critique.md. Review primary task, information hierarchy, discoverability and recovery. Use the local review rubric; do not invoke the upstream critique orchestration or require extra approval/questions.
- Polish: read reference/polish.md. Preserve identity and behavior. Classify drift as missing shared token, one-off implementation, conceptual mismatch or local defect. Fix only the user's authorized scope, at the narrowest shared ownership boundary.
- Hardening/copy: read reference/harden.md or reference/clarify.md when state recovery, long content, permissions or unclear business wording warrant it.

Read only the references needed for the request. Other bundled upstream commands are reference material, not automatic task expansion.

## Evidence and completion

For comprehensive audits, inventory main src and every modules/*/src tree. Record source coverage separately from browser coverage. Run existing pnpm ui:audit, lint, lint:stylelint and typecheck; use relevant existing browser tests and the primary skill's visual-audit.mjs. Reuse project tests and tools instead of adding a competing audit framework.

The upstream launcher/detector is optional evidence. A detector exit 2 means candidate findings; exit 1/127 or runtime failure means unavailable/incomplete. Record actual engine version separately from source skill version. Do not claim a clean detector proves accessibility or visual quality. Verify source positions, theme context, generated utility behavior and rendered user impact before promoting a candidate to a finding.

Report P0–P3 according to the primary skill. Each finding needs location, evidence, user impact, smallest compatible correction and verification. Mark source-only findings as such. Do not fabricate a whole-project visual score when browser coverage is incomplete. Preserve unrelated working changes and identify baseline failures. Store screenshots and machine logs in ignored .artifacts; put the requested durable review in project architecture documentation.
