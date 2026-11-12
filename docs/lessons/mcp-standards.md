# MCP Standards

## Rule

**All MCP servers MUST be portable, self-contained, and require no local installations.**

---

## Location

All MCP servers live in:

```
.claude/tools/
```

**Examples:**

- `.claude/tools/github-unified-mcp.mjs`
- `.claude/tools/git-mcp.mjs`
- `.claude/tools/linear-mcp.mjs`

---

## Requirements

### 1. Self-Contained

Each MCP server MUST be a single file that:

- Implements the MCP JSON-RPC protocol directly
- Does NOT require `npm install` or `pip install`
- Does NOT depend on `node_modules/` or virtual environments
- Works immediately when called with the runtime

### 2. Allowed Runtimes

MCP servers may use these widely-installed runtimes:

| Runtime | Command  | Use Case                      |
| ------- | -------- | ----------------------------- |
| Node.js | `node`   | JavaScript/TypeScript MCPs    |
| Python  | `python` | Python MCPs                   |
| Deno    | `deno`   | TypeScript with built-in deps |
| Bun     | `bun`    | Fast JavaScript runtime       |

### 3. Allowed Dependencies

**Built-in only.** Use only modules that come with the runtime:

**Node.js:**

- `fs`, `path`, `url`, `http`, `https`
- `child_process`, `readline`, `crypto`
- `fetch` (built-in since Node 18)

**Python:**

- `json`, `os`, `sys`, `urllib`
- `http.client`, `subprocess`
- Standard library only

### 4. External Dependencies via npx/pip

If an MCP wraps an external tool, spawn it dynamically:

```javascript
// GOOD: Spawn external MCP via npx (downloads on-demand)
const child = spawn("npx", ["-y", "@modelcontextprotocol/server-github"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: token },
});

// BAD: Require installed package
import { Server } from "@modelcontextprotocol/sdk"; // Requires npm install
```

### 5. Secrets via .env.local

API keys and tokens MUST be loaded from `.env.local` files:

```javascript
// Load from .env.local (project root or .claude/tools/)
function loadEnvFile(filePath, varName) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  // Parse and return value...
}

const API_KEY =
  process.env.MY_API_KEY ||
  loadEnvFile(path.join(projectRoot, ".env.local"), "MY_API_KEY") ||
  loadEnvFile(path.join(scriptDir, ".env.local"), "MY_API_KEY");
```

**Never hardcode secrets. Never commit secrets.**

---

## File Structure

```javascript
#!/usr/bin/env node
/**
 * MCP Server Name (Self-contained, no npm install required)
 *
 * Description of what the MCP does.
 *
 * Architecture:
 * - Implements MCP JSON-RPC protocol directly (no SDK dependency)
 * - Uses native Node.js modules only
 * - Loads secrets from .env.local
 *
 * Tools provided:
 * - tool_name: Description
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

// Load environment variables
function loadEnvFile(filePath, varName) {
  /* ... */
}

// API helpers
async function apiFetch(endpoint, options = {}) {
  /* ... */
}

// Tool definitions
const TOOLS = [
  {
    name: "tool_name",
    description: "What the tool does",
    inputSchema: {
      /* JSON Schema */
    },
  },
];

// Tool handlers
async function handleTool(name, args) {
  switch (name) {
    case "tool_name":
      // Implementation
      return { content: [{ type: "text", text: "Result" }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC message handling
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(id, result) {
  console.log(JSON.stringify({ jsonrpc: "2.0", id, result }));
}

function sendError(id, code, message) {
  console.log(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
}

async function handleMessage(message) {
  const { id, method, params } = JSON.parse(message);

  switch (method) {
    case "initialize":
      sendResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "mcp-name", version: "1.0.0" },
      });
      break;
    case "tools/list":
      sendResponse(id, { tools: TOOLS });
      break;
    case "tools/call":
      const result = await handleTool(params.name, params.arguments || {});
      sendResponse(id, result);
      break;
  }
}

rl.on("line", handleMessage);
console.error("MCP server running");
```

---

## Configuration

### .mcp.json Entry

```json
{
  "mcpServers": {
    "my-mcp": {
      "command": "node",
      "args": [".claude/tools/my-mcp.mjs"],
      "_note": "Description. Requires MY_API_KEY in .env.local"
    }
  }
}
```

### .env.local Entry

```bash
# .claude/tools/.env.local
MY_API_KEY=your_key_here
```

### .env.local.example Entry

```bash
# Add to .claude/tools/.env.local.example
# MY_API_KEY=YOUR_KEY_HERE
```

---

## Checklist for New MCPs

- [ ] Single file in `.claude/tools/`
- [ ] Uses `.mjs` extension (ES modules)
- [ ] No `package.json` or `requirements.txt`
- [ ] Implements MCP JSON-RPC directly
- [ ] Uses only built-in modules
- [ ] Loads secrets from `.env.local`
- [ ] Has `_note` in `.mcp.json` explaining requirements
- [ ] Template added to `.env.local.example`
- [ ] Works with just `node .claude/tools/my-mcp.mjs`

---

## Anti-Patterns

### DON'T: Require npm install

```javascript
// BAD
import { Server } from "@modelcontextprotocol/sdk";
```

### DON'T: Use local node_modules

```javascript
// BAD
import axios from "axios"; // Requires npm install
```

### DON'T: Hardcode secrets

```javascript
// BAD
const API_KEY = "sk_live_abc123";
```

### DON'T: Create separate package folders

```
// BAD
.mcp-servers/
  my-mcp/
    package.json
    node_modules/
    index.js
```

---

## Benefits

| Benefit          | Description                            |
| ---------------- | -------------------------------------- |
| **Portable**     | Copy `.claude/` folder to any project  |
| **No Setup**     | Works immediately, no install commands |
| **Secure**       | Secrets in gitignored `.env.local`     |
| **Simple**       | Single file per MCP                    |
| **Maintainable** | All MCPs in one place                  |

---

## Related

- [MCP-First Rule](./mcp-first.md) - Always prefer MCP tools
- [Portability Rule](./portability.md) - Keep everything portable
