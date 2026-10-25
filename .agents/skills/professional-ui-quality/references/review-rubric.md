# UI Review Rubric

Use this rubric for formal UI reviews, PR audits, approval decisions, or scored handoffs.

## Evidence Requirements

Collect both source and rendered evidence where practical:

- target files and relevant shared components;
- actual-size screenshots for representative viewports;
- light/dark and box-mode variants affected by the change;
- interaction states and console output;
- static audit, lint, and type-check results.

A source-only review is provisional. State which evidence could not be collected.

## Severity

- **P0 — Blocker**: prevents task completion, exposes unsafe/destructive behavior, or makes essential content inaccessible.
- **P1 — Major**: broken hierarchy, missing required state, serious contrast/keyboard/reflow failure, clipped actions, or design-system divergence likely to affect many users.
- **P2 — Moderate**: visible inconsistency, weak affordance, avoidable friction, unclear copy, or localized responsive defect with a reasonable workaround.
- **P3 — Minor**: polish issue that does not materially impair comprehension or operation.

Do not inflate severity for personal taste. Tie it to user impact, frequency, and scope.

## Weighted Score

Score each category from 0–5, then apply its weight:

| Category | Weight | What Good Looks Like |
| --- | --: | --- |
| Task clarity and action hierarchy | 15 | Purpose and primary action are immediately clear |
| Visual hierarchy and craft | 15 | Type, spacing, grouping, alignment, and surfaces feel intentional |
| Project system consistency | 15 | Shared components, tokens, themes, and box modes are respected |
| State completeness | 15 | Loading, empty, error, disabled, selected, and long data are complete |
| Accessibility | 15 | Semantic, keyboard, focus, contrast, and non-color cues are sound |
| Responsive and overflow resilience | 10 | Representative widths and zoom do not lose content or actions |
| Interaction feedback and motion | 10 | Feedback is timely, predictable, and reduced-motion safe |
| Content and trust | 5 | Labels, messages, numbers, and permissions are clear and consistent |

Calculate the total as `sum(category score / 5 * weight)`.

## Verdict

- **90–100 — Approved**: no P0/P1 and browser evidence is complete.
- **80–89 — Approved with minor follow-up**: no P0/P1; remaining issues are P2/P3 and bounded.
- **70–79 — Revision required**: material P1/P2 issues or incomplete state coverage.
- **Below 70 — Not ready**: systemic usability, accessibility, or visual-quality failure.

Any P0 blocks approval. Any unresolved P1 caps the verdict at “Revision required” regardless of the numeric score. Missing browser evidence makes the verdict provisional.

## Finding Format

Write only actionable findings, ordered by severity:

```text
[P1] Short problem title — file:line
Evidence: what the source or rendered UI shows.
Impact: which user task or state is affected.
Recommendation: the smallest system-consistent correction.
Verify: the state, viewport, theme, or interaction that proves the fix.
```

Avoid vague comments such as “make it prettier”, unsupported personal preferences, and praise sections that hide actionable findings.

## Review Summary Format

1. **Verdict and score**.
2. **Evidence inspected**: routes, viewports, themes, states, screenshots, and checks.
3. **Findings**: P0 through P3.
4. **Category scores** with short reasons.
5. **Residual risk or unverified evidence**.

If no actionable finding exists, say so explicitly and still report the evidence and verdict.
