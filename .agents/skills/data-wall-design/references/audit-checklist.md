# Fullscreen data wall audit

Perform this pass on every screen in the family.

## Layout

- Header, KPI rail, and content fit inside the viewport without accidental scroll.
- Panels in the same visual row share exact top and bottom grid lines.
- No decorative footer or unused grid track consumes plot height.
- Every chart fills the remaining panel body and stays inside its bounds.
- The focal panel is visually dominant; secondary panels do not all have equal weight.

## Content

- The screen answers a clear operational question at a glance.
- KPI cards are essential and are not repeated inside panels.
- Raw codes, untranslated enums, technical errors, and placeholder copy are absent.
- Units, periods, precision, and comparison baselines are explicit and consistent.
- Alerts show what happened, severity, scope/value, and the next useful cue.

## Typography and color

- Chinese titles, primary metrics, labels, units, and captions form a clear four-level hierarchy.
- Supporting text is quieter than data; no large blocks of bold white copy.
- Domain accents remain distinct while semantic colors retain the same meaning.
- Gridlines, tracks, and decoration are visible without competing with data.

## States and motion

- Loaded, zero, empty, error, refreshing, and overflow states are intentional.
- Zero charts preserve structure without fabricating magnitude.
- Sparse charts switch to a suitable form rather than stretching one mark across a large panel.
- Animation guides attention and remains calm during continuous display.
- Reduced-motion mode disables ambient sweeps, pulsing, and nonessential rotation.

## Browser verification

- Inspect each screen in fullscreen at the target logical resolution.
- Inspect at a narrower desktop width and verify text truncation and chart resizing.
- Confirm no horizontal clipping, vertical cutoff, tooltip overflow, or overlapping legend.
- Compare screenshots as a set to ensure shared quality and domain-specific composition.
