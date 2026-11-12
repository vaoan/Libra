# MCP-First Rule

## Rule

**ALWAYS use MCP tools when available instead of bash commands.**

This rule enforces consistent usage of Model Context Protocol (MCP) tools across all interactions. It is **generic** and works with ANY MCP server - not just predefined ones.

---

## Core Principle

> Before executing any CLI operation, check if an MCP tool exists for it.

MCP tools follow this naming pattern:

```
mcp__[server-name]__[tool-name]
```

---

## Priority Order

1. **MCP Tools** (highest) - Any `mcp__*` tool
2. **Native Claude Tools** - Read, Write, Edit, Glob, Grep
3. **Bash Commands** (lowest) - Only when no alternative exists

---

## Dynamic Tool Discovery

**DO NOT rely on hardcoded tool lists.** Instead:

### For Any CLI Command

1. Extract the CLI name (e.g., `git`, `gh`, `docker`, `kubectl`)
2. Check if `mcp__[cli-name]__*` tools exist
3. If yes → Use MCP tool
4. If no → Use bash (document the fallback)

### Examples

| CLI Command        | Check For                          | If Exists            |
| ------------------ | ---------------------------------- | -------------------- |
| `git status`       | `mcp__git__git_status`             | Use MCP              |
| `gh pr create`     | `mcp__github__create_pull_request` | Use MCP              |
| `npx shadcn add`   | `mcp__shadcn__add`                 | Use MCP              |
| `docker build`     | `mcp__docker__*`                   | Use MCP if available |
| `kubectl get pods` | `mcp__kubectl__*`                  | Use MCP if available |

---

## Generic Pattern Matching

| Operation Type     | MCP Pattern                                     | Check             |
| ------------------ | ----------------------------------------------- | ----------------- |
| Git operations     | `mcp__git__git_*`                               | Always check      |
| GitHub operations  | `mcp__github__*`                                | Always check      |
| Browser automation | `mcp__chrome-devtools__*`, `mcp__playwright__*` | Check both        |
| Any CLI `[name]`   | `mcp__[name]__*`                                | Check dynamically |

---

## Allowed Bash Operations

Use bash ONLY for operations that have NO MCP alternative:

### Package Management

- `npm install`, `npm run`, `npm test`
- `yarn add`, `yarn build`
- `pip install`, `pip freeze`

### Build & Dev

- `next dev`, `next build`
- `vite build`, `webpack`
- `tsc`, `eslint`, `prettier`

### System Operations

- `mkdir -p` (no MCP for directory creation)
- `chmod`, `chown`
- Process management

---

## Enforcement Examples

### DO (Use MCP)

```
# Git status - use MCP
mcp__git__git_status()

# Create PR - use MCP
mcp__github__create_pull_request(...)

# Take screenshot - use MCP
mcp__chrome-devtools__take_screenshot()

# ANY new MCP - use it
mcp__[new-server]__[tool]()
```

### DO NOT (Avoid bash when MCP exists)

```bash
# Don't use bash for git when MCP available
git status  # Wrong

# Don't use gh CLI when MCP available
gh pr create  # Wrong

# Don't use bash for file reading
cat file.txt  # Wrong - use Read tool
```

---

## Self-Updating Behavior

This rule automatically applies to:

1. **New MCPs** - When added to `.mcp.json`, use their tools
2. **Updated MCPs** - When tools are added/changed, use new tools
3. **Removed MCPs** - Fall back to alternatives

No manual rule updates needed when MCPs change.

---

## Discovery

To see all available MCP tools:

```
/ai-documents-audit --mcp
```

Or check available tools matching `mcp__*` pattern.

---

## Benefits

| Benefit         | Description                           |
| --------------- | ------------------------------------- |
| Consistency     | Same behavior across all interactions |
| Error Handling  | Structured errors with context        |
| Response Data   | Rich, typed responses                 |
| Auto-Discovery  | New MCPs work automatically           |
| Maintainability | No hardcoded tool lists               |

---

## Related

- [MCP-First Agent](../agents/mcp-first/AGENT.md) - Proactive enforcement
- [AI Documents Audit](../skills/ai-documents-audit/SKILL.md) - MCP discovery
