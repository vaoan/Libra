# AI Documents DRY Principle

## Rule

**Every concept in AI configuration documents MUST have a single source of truth.**

When a concept, pattern, workflow, or definition appears in multiple AI documents, it should be:

1. Defined in ONE authoritative location
2. Referenced from all other locations using markdown links

---

## Why This Matters

Duplicate definitions lead to:

- **Inconsistency** - Definitions drift apart over time
- **Confusion** - Which version is correct?
- **Maintenance burden** - Updates must be made in multiple places
- **Contradictions** - Different files may give conflicting guidance

---

## Authoritative Source Hierarchy

When deciding where a definition should live:

| Priority | Location                       | What Belongs There                            |
| -------- | ------------------------------ | --------------------------------------------- |
| 1        | **Rules** (`.claude/rules/`)   | Conventions, patterns, workflows, standards   |
| 2        | **Docs** (`.claude/docs/`)     | Architecture, detailed explanations, examples |
| 3        | **CLAUDE.md**                  | Quick reference, overview, links to details   |
| 4        | **Skills** (`.claude/skills/`) | Skill-specific instructions only              |
| 5        | **Agents** (`.claude/agents/`) | Agent-specific behavior only                  |

### Guidelines

- **Rules** own definitions of conventions and standards
- **Docs** own detailed explanations and architecture
- **CLAUDE.md** provides overview and links, not full definitions
- **Skills** reference rules/docs, don't redefine them
- **Agents** reference rules/docs, don't redefine them

---

## What to Extract

### MUST Extract (Define Once)

| Content Type          | Authoritative Location                          |
| --------------------- | ----------------------------------------------- |
| Naming conventions    | `.claude/rules/naming-conventions.md`           |
| Git workflow          | `.claude/rules/git-workflow.md`                 |
| Commit format         | `.claude/rules/git-workflow.md#commit-messages` |
| Architecture patterns | `.claude/rules/architecture.md`                 |
| Component patterns    | `.claude/rules/component-patterns.md`           |
| SOLID principles      | `.claude/rules/solid-principles.md`             |
| DRY principle         | `.claude/rules/dry-principle.md`                |
| Folder structure      | `.claude/rules/architecture.md`                 |
| MCP standards         | `.claude/rules/mcp-standards.md`                |

### MAY Duplicate (Context-Specific)

- Brief summaries with links to full definition
- Examples that illustrate the concept in context
- Skill-specific variations (must reference base rule)

---

## How to Reference

### From Skills/Agents to Rules

```markdown
# In .claude/skills/submit-pr/SKILL.md

## Commit Format

Follow the [commit message conventions](../../rules/git-workflow.md#commit-messages).
```

### From CLAUDE.md to Rules

```markdown
# In CLAUDE.md

## Git Workflow

See [Git Workflow](.claude/rules/git-workflow.md) for branch naming,
commit format, and PR process.
```

### From Rules to Other Rules

```markdown
# In .claude/rules/component-patterns.md

## Naming

Components follow the [Naming Conventions](./naming-conventions.md).
```

### Section Links

Use anchor links for specific sections:

```markdown
[Commit Messages](../../rules/git-workflow.md#commit-messages)
[Branch Naming](../../rules/git-workflow.md#branch-naming-convention)
[SOLID Principles](../../rules/solid-principles.md#s---single-responsibility-principle)
```

---

## Anti-Patterns

### DON'T: Copy-paste definitions

```markdown
# BAD - In CLAUDE.md:

## Commit Format

type(scope): message [GH-XXX]
Types: feat, fix, refactor, docs, style, test, chore

# BAD - In submit-pr/SKILL.md:

## Commit Format

type(scope): message [GH-XXX]
Types: feat, fix, refactor, docs, style, test, chore # DUPLICATE!
```

### DO: Reference the authoritative source

```markdown
# GOOD - In CLAUDE.md:

## Commit Format

See [Git Workflow](.claude/rules/git-workflow.md#commit-messages).

# GOOD - In submit-pr/SKILL.md:

## Commit Format

Follow [commit conventions](../../rules/git-workflow.md#commit-messages).
```

### DON'T: Partial definitions without reference

```markdown
# BAD - Partial info without link

## Components

Use PascalCase for component names.

# Missing: file naming, folder structure, etc.
```

### DO: Brief summary with link to full definition

```markdown
# GOOD - Summary + reference

## Components

Use PascalCase for components. See [Naming Conventions](../../rules/naming-conventions.md)
for complete file and folder naming rules.
```

---

## Detecting Violations

Run the AI documents audit to find duplicates:

```bash
/ai-documents-audit --consistency
```

This will:

1. Scan all AI configuration files
2. Build an index of definitions
3. Detect duplicates and inconsistencies
4. Report recommended actions

### Automatic Extraction

To automatically fix violations:

```bash
/ai-documents-audit --consistency --extract
```

This will:

1. Identify authoritative sources
2. Update duplicates to use references
3. Create new files if no authoritative source exists

---

## When Creating New Content

Before writing a definition, check:

1. **Does this already exist?** Search rules and docs first
2. **Where should it live?** Use the hierarchy above
3. **Is it skill-specific?** If no, extract to a rule
4. **Can I reference instead?** Always prefer references

### Decision Tree

```
Is this concept already defined somewhere?
├── YES → Reference it, don't redefine
└── NO → Where does it belong?
    ├── Convention/Standard → Create in .claude/rules/
    ├── Architecture detail → Create in .claude/docs/
    ├── Skill-specific only → Define in skill, but consider extraction
    └── Overview/summary → Put in CLAUDE.md with links
```

---

## Examples

### Example 1: Commit Format (Correct)

**Authoritative source:** `.claude/rules/git-workflow.md`

```markdown
## Commit Messages

Use conventional commit format:
type(scope): short description [GH-XXX]
...
```

**Reference in CLAUDE.md:**

```markdown
## Git Workflow

See [Git Workflow](.claude/rules/git-workflow.md) for commit format and branch naming.
```

**Reference in skill:**

```markdown
## Creating the Commit

Follow [commit conventions](../../rules/git-workflow.md#commit-messages).
```

### Example 2: Extracting a Duplicate

**Before (duplicate in 3 files):**

- CLAUDE.md defines folder structure
- architecture.md defines folder structure
- create-feature/SKILL.md defines folder structure

**After (single source):**

- architecture.md has the authoritative definition
- CLAUDE.md links to architecture.md
- create-feature/SKILL.md links to architecture.md

---

## Enforcement

When creating or modifying AI documents:

1. Search for existing definitions before writing
2. Use references instead of copy-paste
3. Run `/ai-documents-audit --consistency` periodically
4. Extract duplicates when found
5. Keep CLAUDE.md as an index, not a full reference

---

## Related

- [DRY Principle](./dry-principle.md) - DRY in code
- [AI Documents Audit](../skills/ai-documents-audit/SKILL.md) - Detect violations
- [Portability](./portability.md) - Keep AI docs portable
