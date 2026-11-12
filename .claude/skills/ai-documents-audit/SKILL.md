---
name: ai-documents-audit
description: Audits installed MCP servers, explores available tools, checks existing skills, maps skill actions to MCP tools, verifies portability, and enforces DRY principles across AI configuration files. Generates comprehensive reports with optimization recommendations.
---

# AI Documents Audit

## Description

Dynamic audit tool for Claude Code AI infrastructure. Discovers all configured MCP servers, queries their available tools in real-time, scans all AI configuration documents, identifies opportunities to leverage MCP tools, **verifies portability** (ensuring no project-specific content), and **enforces DRY consistency** (detecting duplicate definitions across documents). Can automatically extract duplicated concepts to dedicated files and update references.

**This skill uses a task list to show progress during the audit.**

---

## Multi-Agent Architecture

This audit uses **sub-agents** to prevent context exhaustion. Each major audit category runs in a focused sub-agent that returns structured results.

### Why Multi-Agent?

- Full audit scans 50+ files across multiple categories
- Each scan requires detailed analysis and pattern matching
- Single-agent approach risks running out of context
- Sub-agents can run in parallel for faster execution

### Orchestration Strategy

```
┌─────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR                          │
│            (Main agent - this skill)                    │
│                                                         │
│  1. Initialize task list                                │
│  2. Spawn sub-agents (parallel where possible)          │
│  3. Sub-agents persist results to timestamped files     │
│  4. Read persisted results from each sub-agent          │
│  5. Aggregate into final report                         │
│  6. Apply updates if --update/--extract flags set       │
└─────────────────────────────────────────────────────────┘
         │           │           │           │
         ▼           ▼           ▼           ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ MCP Audit   │ │ Docs Audit  │ │ Portability │ │ Consistency │
│ Sub-Agent   │ │ Sub-Agent   │ │ Sub-Agent   │ │ Sub-Agent   │
│             │ │             │ │             │ │             │
│ ↓ PERSIST   │ │ ↓ PERSIST   │ │ ↓ PERSIST   │ │ ↓ PERSIST   │
│ mcp-audit_  │ │ docs-audit_ │ │ portability_│ │ consistency_│
│ timestamp   │ │ timestamp   │ │ timestamp   │ │ timestamp   │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

### Sub-Agents

| Sub-Agent             | Responsibility                              | Runs When                  |
| --------------------- | ------------------------------------------- | -------------------------- |
| **mcp-audit**         | Discover MCPs, query tools, build inventory | `--mcp` or `--all`         |
| **docs-audit**        | Scan docs for MCP opportunities             | `--docs` or `--all`        |
| **portability-audit** | Scan for non-portable content               | `--portability` or `--all` |
| **consistency-audit** | Scan for duplicate definitions              | `--consistency` or `--all` |

### Sub-Agent Output Persistence (CRITICAL)

> **Every sub-agent MUST persist its output to a timestamped file before returning.**

This is a critical architectural requirement for multi-agent systems:

#### Why Persistence is Required

| Reason                  | Benefit                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| **Crash Recovery**      | If orchestrator runs out of context, partial results survive                  |
| **Historical Tracking** | Multiple runs can be compared over time                                       |
| **Skill Chaining**      | Other skills (like `/fix-ai-documents-audit`) can read specific audit results |
| **Debugging**           | Inspect individual sub-agent outputs for issues                               |
| **Parallel Safety**     | Each sub-agent writes to its own file, no conflicts                           |

#### File Location Convention

All sub-agent outputs go to `.ai-context/reports/` with this naming:

```
.ai-context/reports/
├── mcp-audit_2026-01-16T10-30-00.json
├── docs-mcp-audit_2026-01-16T10-30-00.json
├── portability-audit_2026-01-16T10-30-00.json
├── consistency-audit_2026-01-16T10-30-00.json
└── ai-documents-audit_2026-01-16T10-30-00.md  ← Final aggregated report
```

**Naming format:** `{audit-type}_YYYY-MM-DDTHH-MM-SS.json`

#### Sub-Agent Persistence Requirement

Each sub-agent prompt MUST include:

```
CRITICAL: Before returning your results, you MUST:
1. Generate a timestamp in format: YYYY-MM-DDTHH-MM-SS
2. Save your JSON output to: .ai-context/reports/{audit-type}_{timestamp}.json
3. Return the file path along with your results

The file MUST be written using the Write tool, not just returned in your response.
This ensures results survive even if the orchestrator fails.
```

#### Orchestrator Reads Persisted Files

The orchestrator:

1. Spawns sub-agents (they each persist their output)
2. Reads the persisted JSON files from `.ai-context/reports/`
3. Aggregates into final markdown report
4. Saves final report with same timestamp

This means even if the orchestrator crashes after step 2, all sub-agent work is preserved.

### Sub-Agent Invocation

The orchestrator spawns sub-agents using the Task tool:

```typescript
// Spawn MCP audit sub-agent
Task({
  subagent_type: "Explore",
  description: "MCP discovery audit",
  prompt: `
    You are the MCP Audit sub-agent for /ai-documents-audit.

    YOUR TASK:
    1. Read .mcp.json and list all configured MCP servers
    2. For each server, identify available tools (mcp__[server]__*)
    3. Return a structured JSON report

    OUTPUT FORMAT (return ONLY this JSON):
    {
      "servers": [
        {
          "name": "server-name",
          "command": "node",
          "args": [".claude/tools/..."],
          "tools": ["tool1", "tool2", ...]
        }
      ],
      "totalTools": 125,
      "errors": []
    }
  `,
});
```

### Parallel Execution

When running `--all`, spawn independent audits in parallel:

```typescript
// Spawn all sub-agents in parallel
Task({
  subagent_type: "Explore",
  description: "MCP audit",
  prompt: MCP_AUDIT_PROMPT,
});
Task({
  subagent_type: "Explore",
  description: "Portability audit",
  prompt: PORTABILITY_PROMPT,
});
Task({
  subagent_type: "Explore",
  description: "Consistency audit",
  prompt: CONSISTENCY_PROMPT,
});

// Wait for all to complete, then aggregate
```

### Result Aggregation

Each sub-agent returns structured JSON. The orchestrator:

1. Parses each sub-agent's JSON output
2. Merges results into unified report structure
3. Calculates summary statistics
4. Generates final markdown report

### Handling Large File Sets

For document scanning, further split by category:

```typescript
// If many skills exist, scan in batches
const skillFiles = glob(".claude/skills/*/SKILL.md");
const batches = chunk(skillFiles, 10); // 10 files per sub-agent

for (const batch of batches) {
  Task({
    subagent_type: "Explore",
    description: `Scan skills batch ${i}`,
    prompt: `Scan these skill files for MCP opportunities: ${batch.join(", ")}`,
  });
}
```

---

## Usage

```
/ai-documents-audit [options]
```

or natural language:

```
Audit AI documents and MCP tools
Check which skills can use MCP tools
Update AI documents to use available MCP tools
```

## Parameters

| Parameter       | Required | Description                                               |
| --------------- | -------- | --------------------------------------------------------- |
| `--mcp`         | No       | Audit only MCP servers and their tools                    |
| `--docs`        | No       | Audit only AI documents for MCP opportunities             |
| `--portability` | No       | Audit only portability (no project-specific content)      |
| `--consistency` | No       | Audit only DRY/consistency (detect duplicate definitions) |
| `--all`         | No       | Run complete audit (default)                              |
| `--update`      | No       | Apply updates to documents to use MCP tools               |
| `--extract`     | No       | Extract duplicated definitions to dedicated files         |
| `--dry-run`     | No       | Show what would be updated without applying               |

## Steps (with Task Tracking)

When executing this skill, Claude MUST use the TodoWrite tool to track progress:

### Step 1: Initialize Task List

Create a task list with the following items:

```
TodoWrite([
  { content: "Discover MCP servers from .mcp.json", status: "pending" },
  { content: "Query available tools for each MCP", status: "pending" },
  { content: "Scan CLAUDE.md", status: "pending" },
  { content: "Scan skills (*.SKILL.md)", status: "pending" },
  { content: "Scan agents (*.AGENT.md)", status: "pending" },
  { content: "Scan rules (*.md)", status: "pending" },
  { content: "Scan documentation", status: "pending" },
  { content: "Scan for portability issues", status: "pending" },
  { content: "Scan for DRY/consistency issues", status: "pending" },
  { content: "Generate mapping report", status: "pending" },
  { content: "Generate recommendations", status: "pending" },
  { content: "Save audit report to .ai-context/reports/", status: "pending" }
])
```

### Step 2: Discover MCP Servers

**Mark task as in_progress, then complete when done.**

1. Read `.mcp.json` from project root
2. Parse all configured MCP servers
3. For each server, note:
   - Server name
   - Command/path
   - Expected tool prefix (`mcp__[server]__`)

**Output:** List of MCP servers discovered.

### Step 3: Query Available Tools (DYNAMIC)

**Mark task as in_progress, then complete when done.**

For each MCP server discovered:

1. Check what tools are currently available with that server's prefix
2. Build a dynamic inventory - DO NOT use hardcoded lists
3. Note tool names and capabilities

**Important:** This must be done dynamically. MCP tools can be added/updated.

### Step 4: Scan AI Documents

**Mark each document type task as in_progress, then complete.**

Scan ALL AI configuration documents:

| Document Type     | Location                    | Task               |
| ----------------- | --------------------------- | ------------------ |
| Main Instructions | `CLAUDE.md`                 | Scan CLAUDE.md     |
| Skills            | `.claude/skills/*/SKILL.md` | Scan skills        |
| Agents            | `.claude/agents/*/AGENT.md` | Scan agents        |
| Rules             | `.claude/rules/*.md`        | Scan rules         |
| Documentation     | `.claude/docs/**/*.md`      | Scan documentation |

For each document, identify:

- Bash/CLI commands that have MCP alternatives
- Natural language patterns suggesting manual operations
- References to external tools that have MCP equivalents

### Step 5: Scan for Portability Issues

**Mark task as in_progress, then complete.**

Scan all AI configuration files for non-portable content. The goal is to ensure the `.claude/` folder and related files can be copied to any project without modification.

**Files to scan:**

- `.claude/**/*.md` (all markdown files)
- `.claude/**/*.mjs` (MCP tool files)
- `CLAUDE.md`
- `.ai-context/README.md`
- `.mcp.json`

**Patterns to detect (PROHIBITED):**

| Category         | Pattern Examples                      | Severity    |
| ---------------- | ------------------------------------- | ----------- |
| Company names    | Specific company/org names            | 🔴 High     |
| Project names    | Hardcoded project names               | 🔴 High     |
| Personal info    | Names, emails (except generic)        | 🔴 High     |
| Specific URLs    | Internal URLs, non-example domains    | 🔴 High     |
| API keys/secrets | Tokens, passwords, credentials        | 🔴 Critical |
| Internal paths   | User-specific paths (`/home/john/`)   | 🟡 Medium   |
| Specific ports   | Non-standard ports (`localhost:3247`) | 🟡 Medium   |
| Repository refs  | Hardcoded owner/repo names            | 🟡 Medium   |

**Allowed patterns (NOT violations):**

- `example.com`, `api.example.com` (generic placeholders)
- `user@example.com` (generic email)
- `YOUR_TOKEN_HERE`, `<your-api-key>` (placeholders)
- `localhost:3000`, `localhost:8080` (standard ports)
- `{owner}`, `{repo}`, `[feature-name]` (template variables)
- `noreply@anthropic.com` (Claude co-author)
- Content inside "BAD" example blocks (teaching what NOT to do)

**Detection approach:**

```
# Search for potential violations
Grep for patterns:
- Email domains (not example.com/anthropic.com)
- URLs (not example.com/github.com/standard docs)
- Paths starting with /home/, /Users/, C:\Users\
- Hardcoded localhost ports (not 3000, 8080, 5432)
```

**For each violation found, note:**

- File path and line number
- The problematic content
- Suggested replacement (generic alternative)
- Severity level

**Exception handling:**

1. Check if violation is listed in `.claude/portability-exceptions.json`
2. If listed → Skip (it's an approved exception)
3. If NOT listed → Ask user: "Is this an approved exception?"
4. If user approves → Add to exceptions file
5. If user declines → Report as violation to fix

### Step 5b: Handle Portability Exceptions

**Exceptions file:** `.claude/portability-exceptions.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "description": "Approved exceptions to portability rules",
  "exceptions": [
    {
      "file": ".claude/tools/example.mjs",
      "line": 15,
      "pattern": "specific-value",
      "reason": "Required for X functionality",
      "approved_by": "user",
      "approved_date": "2024-01-15"
    }
  ]
}
```

**When a new violation is found:**

```
AskUserQuestion({
  questions: [{
    question: "Found potential portability issue in {file}:{line}: '{pattern}'. Is this an approved exception?",
    header: "Exception?",
    options: [
      { label: "Yes, add exception", description: "Add to exceptions file with a reason" },
      { label: "No, fix it", description: "Report as violation to be fixed" }
    ],
    multiSelect: false
  }]
})
```

**If user approves exception:**

1. Ask for reason (optional follow-up or use default)
2. Add to `.claude/portability-exceptions.json`
3. Mark as exception (not violation) in report

**Benefits:**

- AI docs stay 100% portable
- All exceptions documented in one place
- Exceptions file itself is gitignored (project-specific)
- Audit can be re-run without re-asking about known exceptions

### Step 5c: Scan for DRY/Consistency Issues

**Mark task as in_progress, then complete.**

Scan all AI configuration files for duplicate definitions, redundant content, and inconsistencies. The goal is to ensure each concept has a **single source of truth**.

**What is a "definition"?**

A definition is any of the following documented in AI config files:

| Definition Type    | Examples                                                        | Location Pattern |
| ------------------ | --------------------------------------------------------------- | ---------------- |
| **Concepts**       | "Clean Architecture", "Feature isolation", "Layer dependencies" | Rules, CLAUDE.md |
| **Patterns**       | Component patterns, naming conventions, folder structures       | Rules, docs      |
| **Workflows**      | Git workflow, PR process, commit conventions                    | Rules, skills    |
| **Configurations** | TypeScript config, ESLint rules, test setup                     | Rules, docs      |
| **Tool usage**     | MCP tool patterns, CLI alternatives                             | Skills, rules    |
| **Code examples**  | Same code snippet shown multiple times                          | Any markdown     |

**Detection approach:**

1. **Build definition index:**
   - Parse all AI documents
   - Extract headings, code blocks, and key concepts
   - Build searchable index of definitions

2. **Detect duplicates:**

   ```
   For each document:
     For each definition (heading, code block, concept):
       Search other documents for similar content
       If similarity > threshold:
         Flag as potential duplicate
   ```

3. **Similarity checks:**
   - Exact match: identical content in multiple files
   - Near match: same concept explained differently
   - Partial overlap: concept defined in one place, elaborated in another without reference

**Patterns to detect:**

| Issue                         | Description                                                 | Severity    |
| ----------------------------- | ----------------------------------------------------------- | ----------- |
| **Exact duplicate**           | Same content copy-pasted                                    | 🔴 High     |
| **Concept redefinition**      | Same concept explained in multiple places                   | 🔴 High     |
| **Inconsistent definition**   | Same concept defined differently                            | 🔴 Critical |
| **Branch name inconsistency** | Mixed use of non-standard branch names instead of `develop` | 🔴 Critical |
| **Missing reference**         | Related content without cross-reference                     | 🟡 Medium   |
| **Orphan definition**         | Detailed definition that should be extracted                | 🟡 Medium   |

**Example duplicates to detect:**

```markdown
# In CLAUDE.md:

## Git Workflow

Use conventional commits...

# In docs/lessons/git-workflow.md:

## Commit Format

Use conventional commits... # DUPLICATE - same concept!

# In .claude/skills/submit-pr/SKILL.md:

## Commit Message Format

Use conventional commits... # DUPLICATE - same concept!
```

**Correct approach (single source of truth):**

```markdown
# In CLAUDE.md:

## Git Workflow

See [Git Workflow Rule](docs/lessons/git-workflow.md)

# In .claude/skills/submit-pr/SKILL.md:

Follow the [commit conventions](../../../docs/lessons/git-workflow.md#commit-messages)
```

**For each duplicate found, note:**

- Files containing the duplicate
- Line numbers in each file
- The duplicated concept/content
- Severity level
- Recommended action (extract, reference, or consolidate)

### Step 5d: Handle DRY Violations

When duplicates are detected, the audit should recommend one of these actions:

**Action 1: Reference existing (most common)**

If a concept is already well-defined somewhere:

- Keep the authoritative definition
- Replace duplicates with references
- Use relative markdown links

```markdown
# Before (in skill):

## Naming Conventions

Components use PascalCase...
Files use kebab-case...
[50 lines of conventions]

# After (in skill):

## Naming Conventions

Follow the [Naming Conventions Rule](../../../docs/lessons/naming-conventions.md).
```

**Action 2: Extract to new file**

If a concept is defined in multiple places but no single authoritative source exists:

1. Create new dedicated file (rule, doc, or shared definition)
2. Move the most complete definition there
3. Update all sources to reference the new file

```markdown
# Create: .claude/rules/component-patterns.md

[Consolidated component patterns]

# Update: CLAUDE.md

See [Component Patterns](.claude/rules/component-patterns.md)

# Update: .claude/skills/create-component/SKILL.md

Follow [Component Patterns](../../rules/component-patterns.md)
```

**Action 3: Consolidate inconsistent definitions**

If the same concept is defined differently in multiple places:

1. Identify conflicts
2. Ask user which definition is correct
3. Create/update authoritative source
4. Update all references

```
AskUserQuestion({
  questions: [{
    question: "Found conflicting definitions for 'commit message format'. Which is correct?",
    header: "Conflict",
    options: [
      { label: "CLAUDE.md version", description: "type(scope): message [TICKET]" },
      { label: "git-workflow.md version", description: "type: message (TICKET)" },
      { label: "Neither - define new", description: "I'll specify the correct format" }
    ],
    multiSelect: false
  }]
})
```

### Step 5e: Apply DRY Refactoring (with --extract flag)

When `--extract` flag is provided, automatically apply DRY refactoring:

1. **Create extraction plan:**

   ```
   For each duplicate cluster:
     - Identify best location for authoritative definition
     - List all files needing updates
     - Prepare reference links
   ```

2. **Execute extraction:**
   - Create new files if needed
   - Move/consolidate content
   - Update all references
   - Add cross-reference links

3. **Verify consistency:**
   - Re-scan to confirm no duplicates remain
   - Verify all references are valid
   - Check for broken links

**Extraction rules:**

| Content Type         | Extract To                                         | Reference Format             |
| -------------------- | -------------------------------------------------- | ---------------------------- |
| Naming convention    | `docs/lessons/naming-conventions.md`               | `[Naming Conventions](path)` |
| Git workflow         | `docs/lessons/git-workflow.md`                     | `[Git Workflow](path)`       |
| Architecture pattern | `.claude/rules/architecture.md` or `.claude/docs/` | `[Architecture](path)`       |
| Component pattern    | `.claude/rules/component-patterns.md`              | `[Component Patterns](path)` |
| Shared code example  | `.claude/docs/examples/`                           | `[Example](path)`            |

### Step 6: Generate Mapping Report

**Mark task as in_progress, then complete.**

Create a mapping of:

1. **Found patterns** → **MCP alternatives**
2. **Priority** (High/Medium/Low based on frequency and confidence)
3. **Effort** to migrate

### Step 7: Generate Recommendations

**Mark task as in_progress, then complete.**

Provide actionable recommendations:

1. High-priority updates
2. New MCPs to consider
3. Documents needing attention

### Step 8: Save Audit Report

**Mark task as in_progress, then complete.**

Save the complete audit report to `.ai-context/reports/` for future reference and for use with `/fix-ai-documents-audit`.

**Filename format:** `ai-documents-audit_YYYY-MM-DDTHH-MM-SS.md`

**Location:** `.ai-context/reports/ai-documents-audit_YYYY-MM-DDTHH-MM-SS.md`

**Example:** `ai-documents-audit_2026-01-09T17-00-28.md`

**Benefits:**

- Report survives context exhaustion or crashes
- `/fix-ai-documents-audit` can read and fix issues later
- Historical tracking of audit results
- Team can review audit findings

```
Write({
  file_path: ".ai-context/reports/ai-documents-audit_2026-01-09T17-00-28.md",
  content: reportMarkdown
})
```

## Dynamic Tool Discovery

**CRITICAL:** Do NOT use hardcoded tool lists.

When querying tools:

1. Check available functions starting with `mcp__`
2. Group by server name (second segment after `mcp__`)
3. Handle ANY new MCP automatically

Example tool name pattern:

```
mcp__[server]__[tool_name]
mcp__git__git_status
mcp__github__create_pull_request
mcp__chrome-devtools__take_screenshot
mcp__[new-server]__[any-tool]  # Should work automatically
```

## Pattern Matching

### CLI → MCP Mapping (Generic)

| CLI Pattern            | MCP Check                     | Action      |
| ---------------------- | ----------------------------- | ----------- |
| `` `git [cmd]` ``      | `mcp__git__git_[cmd]` exists? | Suggest MCP |
| `` `gh [res] [act]` `` | `mcp__github__*` exists?      | Suggest MCP |
| `` `npx [pkg]` ``      | `mcp__[pkg]__*` exists?       | Suggest MCP |
| Any `` `[cli]` ``      | `mcp__[cli]__*` exists?       | Suggest MCP |

### Natural Language → MCP

| NL Pattern        | Possible MCP                          |
| ----------------- | ------------------------------------- |
| "take screenshot" | `*__screenshot`, `*__take_screenshot` |
| "navigate to"     | `*__navigate*`                        |
| "check status"    | `*__status`, `*__get_status`          |
| "create PR"       | `*__create_pull_request`              |

## Output Format

### Progress Updates (via TodoWrite)

Throughout execution, update task status:

```
- [x] Discover MCP servers from .mcp.json (6 found)
- [x] Query available tools for each MCP (~125 tools)
- [x] Scan CLAUDE.md (3 patterns)
- [ ] Scan skills (in progress...)
```

### Final Report

```markdown
## AI Documents Audit Report

Generated: [timestamp]

### MCP Servers ([count])

| Server | Tools   | Prefix          |
| ------ | ------- | --------------- |
| [name] | [count] | `mcp__[name]__` |

### Documents Scanned ([count])

| Document | Patterns | Priority       |
| -------- | -------- | -------------- |
| [path]   | [count]  | [High/Med/Low] |

### Update Opportunities

#### [document-name]

- Line [N]: `[pattern]` → `[mcp_tool]`

### Portability Audit

| Status   | Description                |
| -------- | -------------------------- |
| ✅ or ❌ | Overall portability status |

#### Violations Found ([count])

| File   | Line | Issue         | Severity | Suggested Fix |
| ------ | ---- | ------------- | -------- | ------------- |
| [path] | [N]  | [description] | 🔴/🟡    | [replacement] |

#### Approved Exceptions ([count])

| File   | Line | Pattern   | Reason   |
| ------ | ---- | --------- | -------- |
| [path] | [N]  | [pattern] | [reason] |

#### Portability Summary

- **Portable files:** [count] ✅
- **Files with issues:** [count] ❌
- **Approved exceptions:** [count] ⚠️
- **Total violations:** [count]

### DRY/Consistency Audit

| Status   | Description            |
| -------- | ---------------------- |
| ✅ or ❌ | Overall DRY compliance |

#### Duplicate Definitions Found ([count])

| Concept        | Files                 | Severity | Recommended Action            |
| -------------- | --------------------- | -------- | ----------------------------- |
| [concept name] | [file1], [file2], ... | 🔴/🟡    | Reference/Extract/Consolidate |

#### Duplicate Details

##### [Concept Name]

- **Defined in:** [list of files with line numbers]
- **Severity:** [🔴 High / 🟡 Medium]
- **Issue:** [exact duplicate / redefinition / inconsistent]
- **Recommended action:** [specific action]
- **Authoritative source:** [recommended file to keep definition]

#### Inconsistencies Found ([count])

| Concept   | Conflict                  | Files              |
| --------- | ------------------------- | ------------------ |
| [concept] | [description of conflict] | [file1] vs [file2] |

#### DRY Summary

- **Unique definitions:** [count] ✅
- **Duplicate definitions:** [count] ❌
- **Inconsistent definitions:** [count] ⚠️
- **Missing cross-references:** [count] 🔗

### Recommendations

1. **[Priority]** [Description]
```

## Examples

### Example 1: Full Audit with Progress

```
/ai-documents-audit
```

**Execution:**

1. Creates task list (user sees progress)
2. Discovers MCPs (marks complete)
3. Queries tools (marks complete)
4. Scans each document type (marks each complete)
5. Generates report
6. All tasks complete

### Example 2: Update Documents

```
/ai-documents-audit --update
```

Same as full audit, but also applies suggested updates to documents.

### Example 3: MCP Discovery Only

```
/ai-documents-audit --mcp
```

Only discovers and lists MCP servers and tools.

### Example 4: Portability Audit Only

```
/ai-documents-audit --portability
```

**Output:**

```markdown
## Portability Audit Report

### Files Scanned (35)

All files in `.claude/`, `CLAUDE.md`, `.ai-context/README.md`, `.mcp.json`

### Status: ✅ PORTABLE

All AI configuration files are portable and contain no project-specific content.

#### Summary

- **Portable files:** 35 ✅
- **Files with issues:** 0 ❌
- **Total violations:** 0
```

**Or if issues found:**

```markdown
### Status: ❌ NOT PORTABLE

#### Violations Found (2)

| File                             | Line | Issue                                     | Severity | Suggested Fix                      |
| -------------------------------- | ---- | ----------------------------------------- | -------- | ---------------------------------- |
| `.claude/skills/deploy/SKILL.md` | 15   | Hardcoded URL `https://api.mycompany.com` | 🔴 High  | Use `https://api.example.com`      |
| `.mcp.json`                      | 8    | Hardcoded repo `mycompany/myproject`      | 🔴 High  | Use relative paths or placeholders |
```

### Example 5: Consistency/DRY Audit Only

```
/ai-documents-audit --consistency
```

**Output:**

```markdown
## DRY/Consistency Audit Report

### Files Scanned (42)

All markdown files in `.claude/`, `CLAUDE.md`

### Status: ⚠️ DUPLICATES FOUND

#### Duplicate Definitions Found (3)

| Concept               | Files                                                   | Severity  | Recommended Action               |
| --------------------- | ------------------------------------------------------- | --------- | -------------------------------- |
| Commit message format | CLAUDE.md, git-workflow.md, submit-pr/SKILL.md          | 🔴 High   | Reference git-workflow.md        |
| Component naming      | CLAUDE.md, naming-conventions.md, component-patterns.md | 🔴 High   | Reference naming-conventions.md  |
| Folder structure      | CLAUDE.md, architecture.md                              | 🟡 Medium | Keep in CLAUDE.md, add reference |

#### Duplicate Details

##### Commit message format

- **Defined in:**
  - `CLAUDE.md:156` (brief)
  - `docs/lessons/git-workflow.md:89` (comprehensive)
  - `.claude/skills/submit-pr/SKILL.md:45` (partial)
- **Severity:** 🔴 High
- **Issue:** Same concept explained 3 times with slight variations
- **Recommended action:** Keep git-workflow.md as authoritative, reference from others
- **Authoritative source:** `docs/lessons/git-workflow.md`

#### DRY Summary

- **Unique definitions:** 45 ✅
- **Duplicate definitions:** 3 ❌
- **Inconsistent definitions:** 0 ⚠️
- **Missing cross-references:** 5 🔗
```

### Example 6: Extract Duplicates Automatically

```
/ai-documents-audit --consistency --extract
```

**Execution:**

1. Scans all files and identifies duplicates
2. For each duplicate cluster, determines authoritative source
3. Updates all non-authoritative files to reference the source
4. Reports changes made

**Output:**

```markdown
## DRY Extraction Report

### Changes Applied (4 files updated)

#### 1. CLAUDE.md

- Line 156: Removed inline commit format definition
- Added: `See [Commit Format](docs/lessons/git-workflow.md#commit-messages)`

#### 2. .claude/skills/submit-pr/SKILL.md

- Line 45-52: Removed commit format section
- Added: `Follow [commit conventions](../../../docs/lessons/git-workflow.md#commit-messages)`

#### 3. .claude/rules/component-patterns.md

- Line 78: Added cross-reference to naming-conventions.md

### Verification

✅ Re-scan confirms no remaining duplicates
✅ All references valid (no broken links)
```

---

## Sub-Agent Prompt Templates

The orchestrator uses these prompts when spawning sub-agents. Each returns structured JSON for aggregation.

### MCP Audit Sub-Agent Prompt

```
You are the MCP Audit sub-agent for /ai-documents-audit.

TASK: Discover all MCP servers and their available tools.

STEPS:
1. Read .mcp.json from project root
2. List all configured MCP servers (name, command, args, disabled status)
3. For each ENABLED server, find available tools matching pattern: mcp__[server-name]__*
4. Count total tools per server

DO NOT:
- Execute any tools (except Write for persistence)
- Make assumptions about tool capabilities

CRITICAL - PERSIST YOUR OUTPUT:
Before returning, you MUST:
1. Generate timestamp in format: YYYY-MM-DDTHH-MM-SS (use current time)
2. Use the Write tool to save your JSON to: .ai-context/reports/mcp-audit_{timestamp}.json
3. Return the file path in your response

OUTPUT FORMAT (save this JSON to file):
{
  "audit_type": "mcp",
  "timestamp": "2026-01-16T10-30-00",
  "outputFile": ".ai-context/reports/mcp-audit_2026-01-16T10-30-00.json",
  "servers": [
    {
      "name": "server-name",
      "command": "node",
      "args": [".claude/tools/example.mjs"],
      "disabled": false,
      "tools": ["tool1", "tool2"],
      "toolCount": 2
    }
  ],
  "summary": {
    "totalServers": 5,
    "enabledServers": 4,
    "disabledServers": 1,
    "totalTools": 125
  },
  "errors": []
}

FINAL RESPONSE: After saving the file, respond with:
"MCP audit complete. Results saved to: .ai-context/reports/mcp-audit_{timestamp}.json"
```

### Portability Audit Sub-Agent Prompt

```
You are the Portability Audit sub-agent for /ai-documents-audit.

TASK: Scan AI configuration files for non-portable content.

FILES TO SCAN:
- CLAUDE.md
- .claude/**/*.md (all markdown files)
- .claude/**/*.mjs (MCP tool files)
- .mcp.json

PATTERNS TO DETECT (violations):
- Company/project names (not generic placeholders)
- Personal info (names, emails except example.com/anthropic.com)
- Specific URLs (not example.com or standard docs)
- API keys/secrets (real tokens, not YOUR_*_HERE placeholders)
- Internal paths (/home/user/, C:\Users\...)
- Non-standard ports (not 3000, 8080, 5432)

PATTERNS TO IGNORE (not violations):
- example.com, api.example.com
- user@example.com, noreply@anthropic.com
- YOUR_TOKEN_HERE, <your-api-key>
- localhost:3000, localhost:8080
- Content inside "BAD" example blocks (teaching what NOT to do)
- {placeholder} or [variable] template syntax

ALSO CHECK:
- .claude/portability-exceptions.json for approved exceptions
- Skip patterns that match approved exceptions

CRITICAL - PERSIST YOUR OUTPUT:
Before returning, you MUST:
1. Generate timestamp in format: YYYY-MM-DDTHH-MM-SS (use current time)
2. Use the Write tool to save your JSON to: .ai-context/reports/portability-audit_{timestamp}.json
3. Return the file path in your response

OUTPUT FORMAT (save this JSON to file):
{
  "audit_type": "portability",
  "timestamp": "2026-01-16T10-30-00",
  "outputFile": ".ai-context/reports/portability-audit_2026-01-16T10-30-00.json",
  "filesScanned": 35,
  "violations": [
    {
      "file": "path/to/file.md",
      "line": 15,
      "content": "problematic content",
      "issue": "Hardcoded company URL",
      "severity": "high",
      "suggestedFix": "Use https://api.example.com"
    }
  ],
  "exceptions": [
    {
      "file": "path/to/file.md",
      "line": 10,
      "pattern": "approved-pattern",
      "reason": "Required for X"
    }
  ],
  "summary": {
    "portable": true,
    "violationCount": 0,
    "exceptionCount": 2,
    "highSeverity": 0,
    "mediumSeverity": 0
  }
}

FINAL RESPONSE: After saving the file, respond with:
"Portability audit complete. Results saved to: .ai-context/reports/portability-audit_{timestamp}.json"
```

### Consistency Audit Sub-Agent Prompt

```
You are the Consistency/DRY Audit sub-agent for /ai-documents-audit.

TASK: Detect duplicate and inconsistent definitions across AI documents.

FILES TO SCAN:
- CLAUDE.md
- .claude/rules/*.md
- .claude/skills/*/SKILL.md
- .claude/agents/*/AGENT.md
- .claude/docs/**/*.md

WHAT TO DETECT:

1. DUPLICATE DEFINITIONS - Same concept defined in multiple files:
   - Naming conventions
   - Git workflow / commit format
   - Folder structure
   - Architecture patterns
   - Component patterns

2. INCONSISTENT DEFINITIONS - Same concept defined differently:
   - Conflicting instructions
   - Different formats for same thing
   - Contradictory rules

3. BRANCH NAME INCONSISTENCIES - Critical for git workflow:
   - Mixed use of non-standard branch names instead of `develop` (should be consistent)
   - References to old branch names that were renamed
   - Pattern: search for branch-name variants that should be `develop`

4. MISSING REFERENCES - Content that should link to authoritative source:
   - Inline definitions that duplicate a rule
   - Repeated code examples
   - Workflow descriptions without links

AUTHORITATIVE SOURCE HIERARCHY:
1. Rules (.claude/rules/) - Own conventions
2. Docs (.claude/docs/) - Own explanations
3. CLAUDE.md - Overview + links
4. Skills - Should reference rules
5. Agents - Should reference rules

CRITICAL - PERSIST YOUR OUTPUT:
Before returning, you MUST:
1. Generate timestamp in format: YYYY-MM-DDTHH-MM-SS (use current time)
2. Use the Write tool to save your JSON to: .ai-context/reports/consistency-audit_{timestamp}.json
3. Return the file path in your response

OUTPUT FORMAT (save this JSON to file):
{
  "audit_type": "consistency",
  "timestamp": "2026-01-16T10-30-00",
  "outputFile": ".ai-context/reports/consistency-audit_2026-01-16T10-30-00.json",
  "filesScanned": 42,
  "duplicates": [
    {
      "concept": "Commit message format",
      "locations": [
        { "file": "CLAUDE.md", "line": 156, "type": "brief" },
        { "file": "docs/lessons/git-workflow.md", "line": 89, "type": "comprehensive" },
        { "file": ".claude/skills/submit-pr/SKILL.md", "line": 45, "type": "partial" }
      ],
      "severity": "high",
      "recommendedAction": "reference",
      "authoritativeSource": "docs/lessons/git-workflow.md"
    }
  ],
  "inconsistencies": [
    {
      "concept": "Branch naming",
      "conflict": "Different formats specified",
      "locations": [
        { "file": "file1.md", "line": 10, "definition": "feat/GH-XXX_title" },
        { "file": "file2.md", "line": 20, "definition": "feature/XXX-title" }
      ],
      "severity": "critical"
    }
  ],
  "branchNameInconsistencies": [
    {
      "file": "path/to/file.md",
      "line": 45,
      "found": "develop-alt",
      "expected": "develop",
      "context": "Create branch from `develop-alt`",
      "isCommand": false
    }
  ],
  "missingReferences": [
    {
      "file": ".claude/skills/example/SKILL.md",
      "line": 30,
      "content": "Inline naming convention",
      "shouldReference": "docs/lessons/naming-conventions.md"
    }
  ],
  "summary": {
    "compliant": false,
    "duplicateCount": 3,
    "inconsistencyCount": 1,
    "branchNameInconsistencyCount": 0,
    "missingReferenceCount": 5,
    "uniqueDefinitions": 45
  }
}

FINAL RESPONSE: After saving the file, respond with:
"Consistency audit complete. Results saved to: .ai-context/reports/consistency-audit_{timestamp}.json"
```

### Docs MCP Opportunities Sub-Agent Prompt

```
You are the Docs MCP Opportunities sub-agent for /ai-documents-audit.

TASK: Scan AI documents for CLI commands that have MCP alternatives.

FILES TO SCAN:
- CLAUDE.md
- .claude/rules/*.md
- .claude/skills/*/SKILL.md
- .claude/agents/*/AGENT.md
- .claude/docs/**/*.md

WHAT TO DETECT:

1. CLI COMMANDS in code blocks that have MCP alternatives:
   - `git *` commands → mcp__git__git_*
   - `gh *` commands → mcp__github__*
   - Browser automation → mcp__playwright__* or mcp__chrome-devtools__*

2. NATURAL LANGUAGE suggesting manual operations:
   - "run git status" → could use mcp__git__git_status
   - "create a pull request" → could use mcp__github__create_pull_request
   - "take a screenshot" → could use mcp__playwright__browser_take_screenshot

AVAILABLE MCP PREFIXES TO CHECK:
(Dynamically discover from mcp__*__ pattern)

CRITICAL - PERSIST YOUR OUTPUT:
Before returning, you MUST:
1. Generate timestamp in format: YYYY-MM-DDTHH-MM-SS (use current time)
2. Use the Write tool to save your JSON to: .ai-context/reports/docs-mcp-audit_{timestamp}.json
3. Return the file path in your response

OUTPUT FORMAT (save this JSON to file):
{
  "audit_type": "docs_mcp",
  "timestamp": "2026-01-16T10-30-00",
  "outputFile": ".ai-context/reports/docs-mcp-audit_2026-01-16T10-30-00.json",
  "filesScanned": 25,
  "opportunities": [
    {
      "file": "path/to/file.md",
      "line": 45,
      "currentPattern": "`git status`",
      "suggestedMcp": "mcp__git__git_status",
      "confidence": "high",
      "context": "Step 3: Check git status"
    }
  ],
  "summary": {
    "totalOpportunities": 12,
    "highConfidence": 8,
    "mediumConfidence": 4,
    "byMcpServer": {
      "git": 5,
      "github": 4,
      "playwright": 3
    }
  }
}

FINAL RESPONSE: After saving the file, respond with:
"Docs MCP audit complete. Results saved to: .ai-context/reports/docs-mcp-audit_{timestamp}.json"
```

---

## Implementation Notes

### For Claude (executing this skill):

1. **ALWAYS use TodoWrite** to track progress
2. **Use sub-agents** for large audits to prevent context exhaustion
3. **Spawn in parallel** when audits are independent
4. **Discover tools dynamically** - don't hardcode
5. **SUB-AGENTS MUST PERSIST OUTPUT** - Each sub-agent saves JSON to `.ai-context/reports/`
6. **Read persisted files** - Orchestrator reads from files, not just from sub-agent responses
7. **Aggregate JSON results** from persisted files into final report
8. **Report clearly** - use markdown tables

### Sub-Agent Persistence (CRITICAL)

Every sub-agent MUST:

```
1. Generate timestamp: YYYY-MM-DDTHH-MM-SS
2. Write JSON to: .ai-context/reports/{audit-type}_{timestamp}.json
3. Return file path in response
```

This ensures:

- Partial results survive orchestrator failure
- Historical audit data is preserved
- Skills like `/fix-ai-documents-audit` can read specific audit results
- Multiple runs can be tracked and compared

### Task Status Updates

```typescript
// Start task
TodoWrite([...todos, { content: "Scan CLAUDE.md", status: "in_progress" }]);

// Complete task
TodoWrite([...todos, { content: "Scan CLAUDE.md", status: "completed" }]);
```

## Python Script (Alternative)

A Python script is also available for running the audit directly from the command line.

**Location:** `.claude/skills/ai-documents-audit/scripts/ai_documents_auditor.py`

**Requirements:** Python 3.7+ (no external packages needed)

**Usage:**

```bash
# From project root
python .claude/skills/ai-documents-audit/scripts/ai_documents_auditor.py

# With options
python .claude/skills/ai-documents-audit/scripts/ai_documents_auditor.py --mode mcp     # MCP only
python .claude/skills/ai-documents-audit/scripts/ai_documents_auditor.py --mode docs    # Docs only
python .claude/skills/ai-documents-audit/scripts/ai_documents_auditor.py --json         # JSON output
python .claude/skills/ai-documents-audit/scripts/ai_documents_auditor.py -o report.md   # Save to file
```

The script is heavily documented with explanations for non-Python developers.

## Related

- [Project Intelligence](../project-intelligence/SKILL.md) - Deep multi-agent project analysis
- [Fix Audit](../fix-ai-documents-audit/SKILL.md) - Fix issues from audit reports
- [MCP-First Rule](../../../docs/lessons/mcp-first.md) - Enforces MCP tool usage
- [MCP-First Agent](../../agents/mcp-first/AGENT.md) - Proactive MCP checking
- [Portability Rule](../../../docs/lessons/portability.md) - Ensures AI config is portable
- [AI Docs DRY](../../rules/ai-docs-dry.md) - Single source of truth for AI docs
- [DRY Principle](../../../docs/lessons/dry-principle.md) - Don't Repeat Yourself in code
- [MCP Standards](../../rules/mcp-standards.md) - Portable MCP server requirements
