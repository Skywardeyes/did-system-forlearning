# AI Human Collaboration HTML Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone 13-slide, defense-oriented HTML presentation from `docs/AI与人工协作过程说明.md`.

**Architecture:** One semantic HTML file contains the complete narrative, responsive presentation CSS, expandable evidence, and a vanilla-JavaScript navigation controller. A focused Node test defines the artifact contract; real-browser inspection and the project test runner provide final evidence.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, Node.js built-in test runner, real-browser inspection.

## Global Constraints

- Output: `outputs/ai-human-collaboration-presentation.html`.
- No external assets or runtime dependencies.
- Use only verified content from the source Markdown and project.
- Include 13 slides, at least 15 expandable details, keyboard/button/menu/hash/fullscreen navigation, reduced-motion support, print styles, focus styles, and narrow-screen scrolling.
- Do not modify the source Markdown, existing presentations, or application code.

---

### Task 1: Define the presentation contract

**Files:**
- Create: `test/ai-human-collaboration-presentation.test.js`

- [x] Write tests for 13 standalone slides and navigation controls.
- [x] Assert stages 1—10 occur in order and required cases/boundaries appear.
- [x] Assert expandable evidence, accessibility safeguards, valid script syntax, and resolved navigation targets.
- [x] Run `node --test test/ai-human-collaboration-presentation.test.js`; confirm `ENOENT` before implementation.

### Task 2: Implement the HTML presentation

**Files:**
- Create: `outputs/ai-human-collaboration-presentation.html`

- [x] Author the approved 13-page narrative with one primary claim per slide.
- [x] Add stage gates, rollback rules, project cases, traceability, human decisions, and AI boundaries.
- [x] Add responsive styling and expandable engineering evidence.
- [x] Add resilient navigation and hash/fullscreen behavior.
- [x] Run the focused test; confirm 4/4 pass.

### Task 3: Verify the artifact

**Files:**
- Verify: `outputs/ai-human-collaboration-presentation.html`
- Verify: `test/ai-human-collaboration-presentation.test.js`

- [x] Run placeholder, external dependency, diff, slide count, details count, and target checks.
- [x] Inspect all 13 slides at approximately 1440×900 in a real browser.
- [x] Inspect all slides at approximately 390×844 and verify no horizontal overflow.
- [x] Re-run the focused test and `npm run test:node`; require zero failures.

### Task 4: Commit the scoped deliverable

**Files:**
- Create: `outputs/ai-human-collaboration-presentation.html`
- Create: `test/ai-human-collaboration-presentation.test.js`
- Create: `docs/superpowers/plans/2026-07-13-ai-human-collaboration-html-presentation.md`

- [ ] Stage only the three planned files and run `git diff --cached --check`.
- [ ] Commit with `git commit -m "feat: add AI collaboration HTML presentation"`.
- [ ] Inspect `git show --stat --oneline --summary HEAD` and `git status --short`.
