---
name: apple-web-theme
description: Design or refine the optional Apple-inspired Silver Mist Web appearance in art-supabase-pro, using naplesblue's visual reference and the project's shared Art and Element Plus tokens.
---

# Apple Web Theme

Use [naplesblue's design system](https://github.com/naplesblue/apple-design-skill/blob/main/design-system.md) and [rendered reference source](https://github.com/naplesblue/apple-design-skill/blob/main/reference.html) for visual direction: unified neutral surfaces, readable tonal hierarchy, and strong grouping with fine dividers. Use [Apple HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials) to decide where translucency adds a real foreground/background distinction.

Apply the local `professional-ui-quality`, `art-supabase-pro-conventions`, and `project-code-quality` skills. Adapt the reference into `src/assets/styles/core/silver-mist.scss` under the workspace appearance selector. Keep the established theme accent, semantic statuses, density, and Art/Element Plus component contracts. Keep data surfaces opaque; only use supported, bounded blur on a layer that actually overlaps content, with an opaque fallback. Use existing project motion unless the change specifically needs `apple-web-motion`.

Compare Silver Mist with a standard preset on the same real workflow and viewport. Verify light/dark, boundary and selected states, narrow viewport, expanded settings, and a popup rendered outside the app root. Apply `apple-hig-review` for a focused Apple design review.
