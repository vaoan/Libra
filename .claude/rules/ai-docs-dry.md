---
paths:
  - ".claude/**"
  - "docs/lessons/**"
  - "CLAUDE.md"
---

# Instruction documents

Loaded when an instruction file is read. The lesson's hierarchy predates `docs/lessons/`; the first two lines below replace it.

- **Knowledge lives once, in full, in `docs/lessons/<name>.md`.** A rule, skill or agent links to it and does not restate it beyond a one-line imperative. → `docs/lessons/ai-docs-dry.md` (What to Extract)
- **Choose the home by when it must load: `CLAUDE.md` for what every session needs, a `paths:` rule for what one kind of file needs, a skill for a procedure, a lesson for the why.** → `docs/lessons/README.md`
- **Stay within budget: root under 200 lines, a rule under 100, session start at most 10,000 tokens (bytes ÷ 3), a task on one vertical slice at most 25,000.** A rule with no `paths:`, or globs matching over 40% of tracked source, counts as loading every session. Measure with Orrery's `orrery instructions`. → `docs/lessons/README.md`
- **Start `paths:` on line 1 of the file; never `@`-import a lesson**, since an import loads at launch. → `docs/lessons/README.md`
- **Write a rule line as an action with a clause of why, specific to this repository**: what to do on touching this file. Textbook explanation stays in the lesson. → `docs/lessons/README.md`
- **`pnpm check:doc-refs` fails on a backticked path or `pnpm` script that does not exist**, in `CLAUDE.md` and `.claude/**/*.md`, outside fenced blocks. So do not put an anchor inside backticks; name the section after the path. → `scripts/check-doc-references.mjs`
- **Moving a rule to `docs/lessons/`? Update what cites it.** Links to a rule that stays may keep its path; a link with an anchor goes to the lesson. → `docs/lessons/ai-docs-dry.md` (How to Reference)
- **Before writing a definition, search the rules and lessons; prefer a reference.** `/ai-documents-audit --consistency` finds drift. → `docs/lessons/ai-docs-dry.md` (When Creating New Content)
