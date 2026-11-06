---
name: full-review
description: Run a multi-agent code review and generate a comprehensive report.
---

# Full Review Skill

> Multi-agent code review system that analyzes your codebase against all project standards, discovers patterns, catches bugs, and researches best practices.

---

## Description

The `/full-review` skill launches 11 specialized review agents in parallel to comprehensively analyze your codebase. Each agent focuses on a specific aspect of code quality, writes its findings to a JSON file, and then the orchestrator aggregates all findings into a timestamped report.

**After generating the report, a GitHub issue is automatically created** with the review summary and full report content for team tracking and collaboration.

KISS is enforced as a **guardrail** across all agents (simplicity over unnecessary abstraction). Generated files are checked for **consistency only** (typing, naming, signature/shape mismatches), never for refactor or improvement suggestions.

**This skill uses the [Multi-Agent Persistence Pattern](../../../docs/lessons/multi-agent-persistence.md) for crash recovery and historical tracking.**

---

## Multi-Agent Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      FULL REVIEW                                │
│                   (Orchestrator Agent)                          │
│                                                                 │
│  1. Spawn 11 agents (parallel)  →  2. Read persisted files      │
│  3. Aggregate findings          →  4. Generate final report     │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Architecture   │  │     SOLID       │  │      DRY        │
│     Agent       │  │     Agent       │  │     Agent       │
│   ↓ PERSIST     │  │   ↓ PERSIST     │  │   ↓ PERSIST     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Component     │  │    Naming       │  │      Bug        │
│   Patterns      │  │  Conventions    │  │   Detection     │
│   ↓ PERSIST     │  │   ↓ PERSIST     │  │   ↓ PERSIST     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│     Agent       │  │     Agent       │  │     Agent       │
│   ↓ PERSIST     │  │   ↓ PERSIST     │  │   ↓ PERSIST     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    Security     │  │  Performance    │  │    Pattern      │
│     Agent       │  │     Agent       │  │   Discovery     │
│   ↓ PERSIST     │  │   ↓ PERSIST     │  │   ↓ PERSIST     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Sub-Agent Output Persistence (CRITICAL)

> **Every review agent MUST persist its findings to a timestamped JSON file before returning.**

See [Multi-Agent Persistence Rule](../../../docs/lessons/multi-agent-persistence.md) for full details.

#### File Location

All agent outputs go to `.ai-context/reviews/agents/`:

```
.ai-context/reviews/
├── agents/                              # Agent outputs (JSON)
│   ├── {review_id}_architecture.json
│   ├── {review_id}_solid.json
│   ├── {review_id}_dry.json
│   ├── {review_id}_component-patterns.json
│   ├── {review_id}_naming-conventions.json
│   ├── {review_id}_bug-detection.json
│   ├── {review_id}_tailwind.json
│   ├── {review_id}_testing.json
│   ├── {review_id}_security.json
│   ├── {review_id}_performance.json
│   └── {review_id}_pattern-discovery.json
└── {review_id}_review.md                # Final aggregated report
```

**Review ID Format:** `YYYY-MM-DD_HH-MM-SS` (e.g., `2026-01-16_14-30-00`)

This ensures:

- Partial results survive orchestrator failure
- Historical reviews can be compared over time
- `/fix-full-review` skill can read specific review results

---

## Usage

```
/full-review [--path <scope>] [--focus <categories>] [--severity <levels>]
```

Or natural language:

- "Run a full code review"
- "Review the dashboard feature"
- "Check for SOLID violations and bugs"

---

## Parameters

| Parameter    | Required | Default | Description                                                     |
| ------------ | -------- | ------- | --------------------------------------------------------------- |
| `--path`     | No       | `src/`  | Scope of review (e.g., `src/features/dashboard`)                |
| `--focus`    | No       | all     | Comma-separated categories to focus on                          |
| `--severity` | No       | all     | Filter by severity: `critical`, `warning`, `suggestion`, `info` |
| `--quick`    | No       | false   | Run only critical agents (ARCH, SOLID, SEC, BUG)                |
| `--no-issue` | No       | false   | Skip creating a GitHub issue with the report                    |

### Focus Categories

`arch`, `solid`, `dry`, `comp`, `name`, `style`, `test`, `sec`, `perf`, `bug`, `pat`

---

## Execution Steps

### Step 1: Initialize Review

1. Generate review ID: `YYYY-MM-DD_HH-MM-SS`
2. Create output directory: `.ai-context/reviews/agents/`
3. Initialize TodoWrite for progress tracking
4. Set scope path (default: `src/`)

```bash
# Create agents output directory
mkdir -p .ai-context/reviews/agents
```

### Step 2: Build Agent Prompts

For each agent, read its definition from `.claude/skills/full-review/agents/{agent}.md` and build the prompt by replacing:

- `{scope_path}` → The path being reviewed (e.g., `src/`)
- `{review_id}` → The generated review ID (e.g., `2024-01-15_14-30-00`)

**Critical instruction to include in each agent prompt:**

```
IMPORTANT: After completing your analysis, you MUST use the Write tool to save your findings to:
.ai-context/reviews/agents/{review_id}_{agent_name}.json

Do NOT just return the findings - you MUST write them to the file.
This is critical for the review aggregation process.
```

### Step 3: Launch Review Agents (Parallel)

Launch all agents simultaneously using the Task tool with `subagent_type: "general-purpose"`:

**Core Agents (Always Run):**

1. Architecture Agent → `{id}_architecture.json`
2. SOLID Agent → `{id}_solid.json`
3. DRY Agent → `{id}_dry.json`
4. Component Patterns Agent → `{id}_component-patterns.json`
5. Naming Conventions Agent → `{id}_naming-conventions.json`
6. Bug Detection Agent → `{id}_bug-detection.json`

**Supplementary Agents:** 7. Tailwind Agent → `{id}_tailwind.json` 8. Testing Agent → `{id}_testing.json` 9. Security Agent → `{id}_security.json` 10. Performance Agent → `{id}_performance.json` 11. Pattern Discovery Agent → `{id}_pattern-discovery.json`

**Example Agent Launch:**

```
Task(
  description: "Architecture review agent",
  subagent_type: "general-purpose",
  prompt: """
You are the Architecture Review Agent...

[Include full prompt from agents/architecture.md]

CRITICAL - PERSIST YOUR OUTPUT:
Before returning, you MUST:
1. Use the Write tool to save your findings to:
   .ai-context/reviews/agents/{review_id}_architecture.json
2. Return the file path in your response

Do NOT just return the findings - you MUST write them to the file first.

JSON FORMAT:
{
  "agent": "architecture",
  "review_id": "{review_id}",
  "outputFile": ".ai-context/reviews/agents/{review_id}_architecture.json",
  "scope": "{scope_path}",
  "issues": [
    {
      "id": "ARCH-001",
      "severity": "critical|warning|suggestion|info",
      "file": "path/to/file.ts",
      "line": 42,
      "title": "Issue title",
      "description": "Detailed description",
      "rule": "architecture.md#section",
      "fix": "How to fix this issue"
    }
  ],
  "summary": {
    "critical": 0,
    "warning": 0,
    "suggestion": 0,
    "info": 0
  }
}

FINAL RESPONSE: "Architecture review complete. Results saved to: .ai-context/reviews/agents/{review_id}_architecture.json"
"""
)
```

### Step 4: Wait for Completion

Monitor agent completion via TodoWrite updates. All agents run in parallel and write to their designated output files.

### Step 5: Collect Agent Outputs

After all agents complete, read each JSON output file:

```
.ai-context/reviews/agents/{review_id}_architecture.json
.ai-context/reviews/agents/{review_id}_solid.json
.ai-context/reviews/agents/{review_id}_dry.json
.ai-context/reviews/agents/{review_id}_component-patterns.json
.ai-context/reviews/agents/{review_id}_naming-conventions.json
.ai-context/reviews/agents/{review_id}_bug-detection.json
.ai-context/reviews/agents/{review_id}_tailwind.json
.ai-context/reviews/agents/{review_id}_testing.json
.ai-context/reviews/agents/{review_id}_security.json
.ai-context/reviews/agents/{review_id}_performance.json
.ai-context/reviews/agents/{review_id}_pattern-discovery.json
```

Parse each JSON file and collect all issues.

### Step 6: Aggregate Results

1. Collect all issues from all agent outputs
2. Deduplicate overlapping issues (same file + line + similar description)
3. Sort by severity (Critical > Warning > Suggestion > Info)
4. Renumber issue IDs sequentially per category
5. Collect all patterns discovered
6. Collect rule suggestions

### Step 7: Generate Report

Write comprehensive report to `.ai-context/reviews/{review_id}_review.md` following the authoritative format in:

See [Report Format](../../../docs/lessons/code-review-standards.md#report-format).

Include branch and scope if available for context.

### Step 8: Create GitHub Issue

**Always create a GitHub issue with the review report** (unless `--no-issue` is specified).

Use the `mcp__github__create_issue` tool:

```
mcp__github__create_issue({
  owner: "{repo_owner}",
  repo: "{repo_name}",
  title: "Code Review Report - {review_id}",
  body: "{report_content}",
  labels: ["code-review", "automated"]
})
```

**Issue Title Format:**

```
📋 Code Review Report - {YYYY-MM-DD HH:MM}
```

**Issue Body Format:**

```markdown
## Code Review Summary

**Generated:** {timestamp}
**Branch:** {current_branch}
**Scope:** {scope_path}
**Review ID:** `{review_id}`

### Results

| Severity      | Count   |
| ------------- | ------- |
| 🔴 Critical   | {count} |
| 🟠 Warning    | {count} |
| 🟡 Suggestion | {count} |
| ℹ️ Info       | {count} |

**Total Issues:** {total}

---

### 🔴 Critical Issues

{List critical issues with file paths and descriptions}

### 🟠 Top Warnings

{List top 5 warning issues}

---

### Action Items

- [ ] Fix {critical_count} critical issues before merge
- [ ] Review {warning_count} warnings
- [ ] Consider {suggestion_count} suggestions

---

<details>
<summary>📄 Full Report</summary>

{Full markdown report content}

</details>

---

_Generated by `/full-review` skill_
_Full report saved to: `.ai-context/reviews/{review_id}_review.md`_
```

**Labels to Apply:**

- `code-review` - For filtering review issues
- `automated` - Indicates auto-generated content
- Add severity label if critical issues exist: `priority: high`

### Step 9: Display Summary

Show the user:

1. Summary table (severity counts)
2. Critical issues list
3. Path to full report
4. **Link to created GitHub issue**
5. Suggestion to run `/fix-full-review`

---

## Agent Definitions

All agent prompts are defined in: `.claude/skills/full-review/agents/`

| Agent              | Definition File                                         | Output Category |
| ------------------ | ------------------------------------------------------- | --------------- |
| Architecture       | [architecture.md](./agents/architecture.md)             | ARCH            |
| SOLID              | [solid.md](./agents/solid.md)                           | SOLID           |
| DRY                | [dry.md](./agents/dry.md)                               | DRY             |
| Component Patterns | [component-patterns.md](./agents/component-patterns.md) | COMP            |
| Naming Conventions | [naming-conventions.md](./agents/naming-conventions.md) | NAME            |
| Bug Detection      | [bug-detection.md](./agents/bug-detection.md)           | BUG             |
| Tailwind           | [tailwind.md](./agents/tailwind.md)                     | STYLE           |
| Testing            | [testing.md](./agents/testing.md)                       | TEST            |
| Security           | [security.md](./agents/security.md)                     | SEC             |
| Performance        | [performance.md](./agents/performance.md)               | PERF            |
| Pattern Discovery  | [pattern-discovery.md](./agents/pattern-discovery.md)   | PAT             |

See [agents/index.md](./agents/index.md) for full agent registry.

---

## Output Structure

```
.ai-context/reviews/
├── agents/                              # Agent outputs (JSON)
│   ├── 2024-01-15_14-30-00_architecture.json
│   ├── 2024-01-15_14-30-00_solid.json
│   ├── 2024-01-15_14-30-00_dry.json
│   └── ... (one per agent)
├── 2024-01-15_14-30-00_review.md        # Aggregated report
└── .gitkeep
```

---

## Examples

### Full Review

```
User: /full-review

Claude: Starting comprehensive code review...

Review ID: 2024-01-15_14-30-00
Scope: src/

[TodoWrite: 12 agents queued]

Launching review agents in parallel:
✓ Architecture Agent
✓ SOLID Agent
✓ DRY Agent
✓ Component Patterns Agent
✓ Naming Conventions Agent
✓ Bug Detection Agent
✓ Tailwind Agent
✓ Testing Agent
✓ Security Agent
✓ Performance Agent
✓ Pattern Discovery Agent

[All agents complete - collecting outputs...]

Reading agent outputs...
- architecture.json: 3 issues
- solid.json: 5 issues
- bug-detection.json: 2 issues (1 critical)
...

## Review Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 1 |
| 🟠 Warning | 8 |
| 🟡 Suggestion | 12 |
| ℹ️ Info | 4 |

### Critical Issues Found:

**[BUG-001] Missing null check in useDashboard hook**
- File: `src/features/dashboard/application/hooks/useDashboard.ts:15`
- Fix: Add optional chaining: `data?.metrics`

📄 Full report saved to: `.ai-context/reviews/2024-01-15_14-30-00_review.md`

📋 GitHub Issue created: #123 - Code Review Report - 2024-01-15 14:30
   https://github.com/owner/repo/issues/123

Run `/fix-full-review` to address these issues interactively.
```

### Focused Review

```
User: /full-review --path src/features/dashboard --focus arch,solid,bug

Claude: Running focused review on dashboard feature...

Review ID: 2024-01-15_15-00-00
Scope: src/features/dashboard
Agents: Architecture, SOLID, Bug Detection (3/12)

[3 agents complete]

No critical issues found!

Warnings: 2
- [SOLID-001] DashboardPage handles too many concerns
- [ARCH-001] Consider extracting metrics formatting

Full report: `.ai-context/reviews/2024-01-15_15-00-00_review.md`
```

### Quick Review

```
User: /full-review --quick

Claude: Running quick review (critical agents only)...

Agents: Architecture, SOLID, Security, Bug Detection (4/12)

[Review complete - 45 seconds]

All clear! No critical issues detected.
```

---

## Notes

- Review agents run in parallel for speed (~2-3 minutes for full review)
- Each agent persists output to a timestamped JSON file (see [Multi-Agent Persistence Rule](../../../docs/lessons/multi-agent-persistence.md))
- The orchestrator reads and aggregates all persisted outputs
- Partial results survive orchestrator failure due to persistence
- Historical reviews can be compared across multiple runs
- Reports are git-tracked for team visibility
- **A GitHub issue is automatically created** with the review report for team tracking
  - Labels: `code-review`, `automated`, and `priority: high` if critical issues exist
  - Use `--no-issue` to skip issue creation
- Use `--quick` for pre-commit checks
- Use `/fix-full-review` to address findings interactively
- Apply [KISS Principle](../../../docs/lessons/kiss-principle.md) as a guardrail on all recommendations
- Follow [Generated Code Policy](../../rules/generated-code-policy.md) for any `generated`/`__generated__` files

---

## Troubleshooting

### Agent outputs are empty

If an agent's JSON file is missing or empty:

1. The agent may have failed to persist its output
2. Check if the agent completed its analysis (look for "Results saved to:" message)
3. Re-run the specific agent category with `--focus`

### Missing output files

Ensure the output directory exists:

```bash
mkdir -p .ai-context/reviews/agents
```

### Partial results

Thanks to the persistence pattern, partial results are preserved:

1. The orchestrator reports which agents completed (have JSON files)
2. Available results are aggregated into the final report
3. Missing agent data is noted in the report
4. You can re-run just the failed agents with `--focus`

### Recovering from orchestrator failure

If the orchestrator crashes mid-review:

1. Agent outputs already written are preserved in `.ai-context/reviews/agents/`
2. Check which `{review_id}_*.json` files exist
3. Re-run the review - the orchestrator will detect existing files

---

## Related

- [Code Review Standards](../../../docs/lessons/code-review-standards.md) - Severity levels and checklists
- [Fix Full Review Skill](../fix-full-review/SKILL.md) - `/fix-full-review` to fix issues
- [Agents Index](./agents/index.md) - Full agent registry
- [Architecture Rules](../../rules/architecture.md)
- [SOLID Principles](../../../docs/lessons/solid-principles.md)
