# AI Human Collaboration Process Document Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a detailed defense-ready Markdown document describing the ten-stage AI/human collaboration process used for DID/VC requirements, implementation, testing, defect correction, and acceptance.

**Architecture:** Build one new Markdown document around a role model, ten consistent stage templates, collaboration gates, rollback paths, traceability tables, a Mermaid process diagram, and verified project examples. Add a Node document test so required sections and facts remain reviewable.

**Tech Stack:** Markdown, Mermaid, Node.js text tests, current DID/VC project documentation.

## Global Constraints

- Create `docs/AI与人工协作过程说明.md`.
- Include all ten user-provided stages in order.
- For every stage, identify goal, input, AI/Agent work, human work, output, approval gate, and rollback path.
- Distinguish the coordinating AI, development Agent, testing Agent, and human decision maker.
- Include a Mermaid process diagram and a requirement-to-delivery traceability table.
- Use only verified DID/VC project examples and avoid invented dialogue or people.
- Clearly state that AI/Agents do not independently own scope, business priority, or final acceptance.

---

### Task 1: Create the detailed collaboration document test-first

**Files:**
- Create: `docs/AI与人工协作过程说明.md`
- Create: `test/ai-human-collaboration-document.test.js`

**Interfaces:**
- Consumes: the approved design and current project requirements/testing references.
- Produces: a structured document with ten numbered stage headings, role definitions, Mermaid flow, traceability table, project cases, responsibility boundaries, and defense summary.

- [ ] **Step 1: Write the failing document test**

Assert that the output file exists; includes ten stage headings in order; includes each stage's goal/input/AI work/human work/output/gate/rollback labels; contains role, parallel-agent, traceability, human-decision, AI-boundary, Mermaid, real-case, and defense-summary sections; and mentions verified DID/VC examples.

- [ ] **Step 2: Run the focused test and observe ENOENT**

Run: `node --test test/ai-human-collaboration-document.test.js`

Expected: FAIL because the new Markdown file does not exist.

- [ ] **Step 3: Write the full Markdown document**

Create the document with concise but detailed prose, consistent stage templates, tables, lists, a Mermaid flowchart, and real examples covering lifecycle, logging, DID Method selection, seven-check validation, test coverage review, concurrent-write/UI defects, and human acceptance.

- [ ] **Step 4: Run the focused test**

Run: `node --test test/ai-human-collaboration-document.test.js`

Expected: all assertions pass.

- [ ] **Step 5: Commit the document, test, and plan**

```bash
git add docs/AI与人工协作过程说明.md test/ai-human-collaboration-document.test.js docs/superpowers/plans/2026-07-13-ai-human-collaboration-document.md
git commit -m "docs: add AI human collaboration process guide"
```

### Task 2: Verify document structure and project consistency

**Files:**
- Verify: `docs/AI与人工协作过程说明.md`
- Verify: `test/ai-human-collaboration-document.test.js`

**Interfaces:**
- Consumes: completed document.
- Produces: fresh evidence that the document is structurally complete and consistent with the project.

- [ ] **Step 1: Scan for missing or placeholder content**

Confirm there are no empty headings, `TODO`, `TBD`, duplicated stage numbers, or skipped heading levels.

- [ ] **Step 2: Cross-check project examples**

Compare the DID Method, lifecycle, logging, testing, defect, and acceptance descriptions against current project documents.

- [ ] **Step 3: Run the designated Node suite**

Run: `npm run test:node`

Expected: zero failures, including the new document test.
