# Full Review Agents Index

> Registry of all review agents and their configuration.

---

## Agent Registry

| Agent              | File                                             | Output                         | Category Code |
| ------------------ | ------------------------------------------------ | ------------------------------ | ------------- |
| Architecture       | [architecture.md](./architecture.md)             | `{id}_architecture.json`       | ARCH          |
| SOLID              | [solid.md](./solid.md)                           | `{id}_solid.json`              | SOLID         |
| DRY                | [dry.md](./dry.md)                               | `{id}_dry.json`                | DRY           |
| Component Patterns | [component-patterns.md](./component-patterns.md) | `{id}_component-patterns.json` | COMP          |
| Naming Conventions | [naming-conventions.md](./naming-conventions.md) | `{id}_naming-conventions.json` | NAME          |
| Bug Detection      | [bug-detection.md](./bug-detection.md)           | `{id}_bug-detection.json`      | BUG           |
| Tailwind           | [tailwind.md](./tailwind.md)                     | `{id}_tailwind.json`           | STYLE         |
| Testing            | [testing.md](./testing.md)                       | `{id}_testing.json`            | TEST          |
| Security           | [security.md](./security.md)                     | `{id}_security.json`           | SEC           |
| Performance        | [performance.md](./performance.md)               | `{id}_performance.json`        | PERF          |
| Pattern Discovery  | [pattern-discovery.md](./pattern-discovery.md)   | `{id}_pattern-discovery.json`  | PAT           |

---

## Output Directory

All agent outputs are written to:

```
.ai-context/reviews/agents/{review_id}_{agent_name}.json
```

Where:

- `{review_id}` = Timestamp in format `YYYY-MM-DD_HH-MM-SS`
- `{agent_name}` = Agent identifier (e.g., `architecture`, `solid`)

---

## Agent Groups

### Core Agents (Always Run)

- Architecture
- SOLID
- DRY
- Component Patterns
- Naming Conventions
- Bug Detection

### Supplementary Agents

- Tailwind
- Testing
- Security
- Performance
- Pattern Discovery

### Quick Review Agents (--quick flag)

- Architecture
- SOLID
- Security
- Bug Detection

---

## JSON Output Schema

All agents follow this base schema:

```json
{
  "agent": "agent-name",
  "timestamp": "ISO-8601 timestamp",
  "scope": "path that was analyzed",
  "summary": {
    "filesAnalyzed": 0,
    "issuesFound": 0,
    "critical": 0,
    "warning": 0,
    "suggestion": 0,
    "info": 0
  },
  "issues": [],
  "patterns": []
}
```

### Issue Schema

```json
{
  "id": "CATEGORY-NNN",
  "severity": "critical|warning|suggestion|info",
  "title": "Short descriptive title",
  "file": "path/to/file.ts",
  "line": 10,
  "description": "Detailed description",
  "rule": "reference.md#section",
  "fix": "How to fix"
}
```

---

## Adding New Agents

To add a new agent:

1. Create `{agent-name}.md` in this directory
2. Follow the template structure from existing agents
3. Define what to check
4. Specify output file pattern
5. Add to this index
6. Update SKILL.md agent list

---

## Related

- [SKILL.md](../SKILL.md) - Main skill orchestration
- [Code Review Standards](../../../../docs/lessons/code-review-standards.md) - Severity guidelines
