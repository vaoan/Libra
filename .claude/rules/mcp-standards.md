---
paths:
  - ".claude/tools/**"
  - ".mcp.json"
---

# MCP servers

Loaded when a tool under `.claude/tools/` or `.mcp.json` is read. Each line is the rule; the link is the full text, including a server skeleton to copy.

- **An MCP server is one `.mjs` file in `.claude/tools/` that runs with `node .claude/tools/x.mjs` and nothing else**: no `package.json`, no `node_modules`, so `.claude/` copies between projects. → `docs/lessons/mcp-standards.md` (Requirements)
- **Implement JSON-RPC directly with built-in modules (`fs`, `path`, `readline`, `fetch`); do not import `@modelcontextprotocol/sdk`.** To wrap an external tool, spawn it with `npx -y`. → `docs/lessons/mcp-standards.md` (Allowed Dependencies)
- **Read secrets from `process.env`, then the root `.env.local`, then `.claude/tools/.env.local`**; never in the file. → `docs/lessons/mcp-standards.md` (Secrets via .env.local)
- **Register it in `.mcp.json` with a `_note` naming what it needs, and add the placeholder to `.env.local.example`.** → `docs/lessons/mcp-standards.md` (Configuration)
