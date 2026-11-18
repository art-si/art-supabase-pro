---
name: apple-web-motion
description: Improve specifically requested Apple-style Web interaction such as interruptible drawers, drag, gesture tracking, and velocity handoff, using Emil Kowalski's guidance.
---

# Apple Web Motion

Use [Emil Kowalski's Apple Design](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md) and [Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/) as references for direct manipulation and motion continuity.

Apply the local `animate` skill first. Preserve project tokens and reduced-motion behavior. Use immediate input feedback; when an existing gesture genuinely needs a reversible transition, continue from the current rendered position and keep the target actionable during motion. Use momentum or spring tuning only when user input supplies velocity or needs continuous control. Retain native scrolling and keyboard alternatives.

An Apple-style theme using existing transitions does not need custom gestures, a spring library, or extra animation. Verify the interaction in both directions, including rapid repeated input and reduced motion.
