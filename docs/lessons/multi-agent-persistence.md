# Multi-Agent Persistence Rule

> **Every sub-agent in a multi-agent workflow MUST persist its output to a timestamped file.**

---

## Why This Rule Exists

Multi-agent workflows (orchestrator spawning sub-agents) are prone to:

- Context exhaustion mid-workflow
- Orchestrator failures losing sub-agent work
- No historical tracking of results
- Skills unable to chain on previous results

**Persistence solves all of these.**

---

## The Rule

### Sub-Agents MUST:

1. **Generate a timestamp** in format: `YYYY-MM-DDTHH-MM-SS`
2. **Write output to file** before returning
3. **Return the file path** in their response

### File Location

All sub-agent outputs go to `.ai-context/reports/`:

```
.ai-context/reports/
├── {audit-type}_{timestamp}.json      ← Sub-agent outputs (JSON)
├── {skill-name}_{timestamp}.md        ← Final aggregated reports (Markdown)
└── {skill-name}_{timestamp}.json      ← Final reports (optional JSON)
```

### Naming Convention

| Output Type    | Pattern                             | Example                                     |
| -------------- | ----------------------------------- | ------------------------------------------- |
| Sub-agent JSON | `{sub-agent-type}_{timestamp}.json` | `mcp-audit_2026-01-16T10-30-00.json`        |
| Final report   | `{skill-name}_{timestamp}.md`       | `ai-documents-audit_2026-01-16T10-30-00.md` |

---

## Implementation

### In Sub-Agent Prompts

Every sub-agent prompt template MUST include:

```
CRITICAL - PERSIST YOUR OUTPUT:
Before returning, you MUST:
1. Generate timestamp in format: YYYY-MM-DDTHH-MM-SS (use current time)
2. Use the Write tool to save your JSON to: .ai-context/reports/{type}_{timestamp}.json
3. Return the file path in your response

FINAL RESPONSE: After saving the file, respond with:
"{Type} complete. Results saved to: .ai-context/reports/{type}_{timestamp}.json"
```

### In Orchestrator

The orchestrator:

```
1. Spawns sub-agents (they persist their output)
2. Reads persisted JSON files from .ai-context/reports/
3. Aggregates into final report
4. Saves final report with same timestamp
```

### JSON Output Format

All sub-agent JSON outputs MUST include:

```json
{
  "audit_type": "mcp",
  "timestamp": "2026-01-16T10-30-00",
  "outputFile": ".ai-context/reports/mcp-audit_2026-01-16T10-30-00.json"
  // ... actual output data ...
}
```

The `outputFile` field allows the orchestrator to verify where the file was saved.

---

## Benefits

| Benefit                 | Description                                               |
| ----------------------- | --------------------------------------------------------- |
| **Crash Recovery**      | Partial results survive orchestrator failure              |
| **Historical Tracking** | Compare results across multiple runs                      |
| **Skill Chaining**      | `/fix-ai-documents-audit` can read specific audit results |
| **Debugging**           | Inspect individual sub-agent outputs                      |
| **Parallel Safety**     | Each sub-agent writes to unique file                      |
| **Resumability**        | Can resume from last successful sub-agent                 |

---

## Skills Using This Pattern

| Skill                   | Sub-Agents                              | Output Files        |
| ----------------------- | --------------------------------------- | ------------------- |
| `/ai-documents-audit`   | mcp, docs-mcp, portability, consistency | `*-audit_*.json`    |
| `/project-intelligence` | (various analysis agents)               | `*-analysis_*.json` |
| `/full-review`          | 12 review agents                        | `*-review_*.json`   |

---

## Anti-Patterns

### DON'T: Return data only in response

```
// BAD - Data lost if orchestrator fails
Sub-agent returns: { "results": [...] }
```

### DO: Persist then return path

```
// GOOD - Data survives any failure
Sub-agent:
1. Writes to .ai-context/reports/results_2026-01-16T10-30-00.json
2. Returns: "Results saved to: .ai-context/reports/results_2026-01-16T10-30-00.json"
```

### DON'T: Use non-timestamped filenames

```
// BAD - Overwrites previous runs
.ai-context/reports/mcp-audit.json
```

### DO: Always include timestamp

```
// GOOD - Preserves history
.ai-context/reports/mcp-audit_2026-01-16T10-30-00.json
```

---

## Orchestrator Template

When implementing a multi-agent skill, follow this pattern:

```typescript
// 1. Spawn sub-agents (parallel if independent)
Task({ subagent_type: "Explore", prompt: SUB_AGENT_A_PROMPT }); // Persists to file A
Task({ subagent_type: "Explore", prompt: SUB_AGENT_B_PROMPT }); // Persists to file B

// 2. Read persisted results
Read(".ai-context/reports/sub-agent-a_{timestamp}.json");
Read(".ai-context/reports/sub-agent-b_{timestamp}.json");

// 3. Aggregate into final report
const finalReport = aggregateResults(resultA, resultB);

// 4. Save final report
Write(".ai-context/reports/{skill-name}_{timestamp}.md", finalReport);
```

---

## Related

- [AI Documents Audit](../skills/ai-documents-audit/SKILL.md) - Reference implementation
- [Project Intelligence](../skills/project-intelligence/SKILL.md) - Multi-agent analysis
- [Full Review](../skills/full-review/SKILL.md) - 12-agent review system
