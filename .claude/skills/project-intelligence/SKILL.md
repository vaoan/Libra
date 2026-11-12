---
name: project-intelligence
description: Multi-agent deep analysis of the entire project including code, AI documents, and artifacts. Researches best practices and suggests improvements.
---

# Project Intelligence

## Description

A comprehensive multi-agent skill that performs deep analysis of your entire project:

- **Code Analysis** - Architecture, patterns, dependencies, quality
- **AI Documents Analysis** - Skills, rules, agents, documentation
- **Best Practices Research** - Internet research for improvements
- **MCP Discovery** - Find useful MCP servers for your stack
- **Improvement Recommendations** - Actionable suggestions with priorities

**This skill spawns multiple agents in parallel for faster, more thorough analysis.**

---

## Usage

```
/project-intelligence [options]
```

Or natural language:

```
Analyze my project and suggest improvements
Deep dive into this codebase
What can be improved in this project?
Research best practices for my stack
```

## Parameters

| Parameter         | Required | Description                                                                                     |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `--focus <area>`  | No       | Focus on specific area: `code`, `ai-docs`, `deps`, `security`, `performance`                    |
| `--research`      | No       | Enable internet research for best practices (default: enabled)                                  |
| `--no-research`   | No       | Disable internet research                                                                       |
| `--depth <level>` | No       | Analysis depth: `quick`, `standard`, `deep` (default: standard)                                 |
| `--output <path>` | No       | Save report to custom path (default: `.ai-context/reports/project-intelligence_{timestamp}.md`) |

---

## Multi-Agent Architecture

This skill uses **6 specialized agents** running in parallel:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROJECT INTELLIGENCE                         │
│                     (Orchestrator Agent)                        │
│                                                                 │
│  1. Spawn agents (parallel)  →  2. Read persisted files         │
│  3. Aggregate findings       →  4. Generate final report        │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Code Analyst   │  │  AI Docs Analyst│  │ Deps & Security │
│     Agent       │  │     Agent       │  │     Agent       │
│   ↓ PERSIST     │  │   ↓ PERSIST     │  │   ↓ PERSIST     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Best Practices  │  │  MCP Discovery  │  │  Improvement    │
│   Researcher    │  │     Agent       │  │   Synthesizer   │
│   ↓ PERSIST     │  │   ↓ PERSIST     │  │   ↓ PERSIST     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Sub-Agent Output Persistence (CRITICAL)

> **Every sub-agent MUST persist its output to a timestamped file before returning.**

See [Multi-Agent Persistence Rule](../../../docs/lessons/multi-agent-persistence.md) for full details.

#### File Location

All sub-agent outputs go to `.ai-context/reports/`:

```
.ai-context/reports/
├── code-analysis_{timestamp}.json
├── ai-docs-analysis_{timestamp}.json
├── deps-security_{timestamp}.json
├── best-practices_{timestamp}.json
├── mcp-discovery_{timestamp}.json
├── improvement-synthesis_{timestamp}.json
└── project-intelligence_{timestamp}.md  ← Final aggregated report
```

This ensures:

- Partial results survive orchestrator failure
- Historical analysis can be compared
- Other skills can read specific analysis results

### Agent Responsibilities

| Agent                         | Focus                                             | Tools Used          |
| ----------------------------- | ------------------------------------------------- | ------------------- |
| **Code Analyst**              | Architecture, patterns, code quality              | Glob, Grep, Read    |
| **AI Docs Analyst**           | Skills, rules, agents, coverage                   | Glob, Read          |
| **Deps & Security**           | Dependencies, vulnerabilities, outdated packages  | Bash, Read          |
| **Best Practices Researcher** | Internet research for stack-specific improvements | WebSearch, WebFetch |
| **MCP Discovery**             | Find relevant MCP servers for the tech stack      | WebSearch, context7 |
| **Improvement Synthesizer**   | Aggregate findings, prioritize recommendations    | Read                |

---

## Execution Steps

### Step 1: Initialize and Gather Context

```
TodoWrite([
  { content: "Detect project stack and configuration", status: "in_progress", activeForm: "Detecting project stack" },
  { content: "Launch Code Analyst agent", status: "pending", activeForm: "Analyzing code" },
  { content: "Launch AI Docs Analyst agent", status: "pending", activeForm: "Analyzing AI documents" },
  { content: "Launch Deps & Security agent", status: "pending", activeForm: "Analyzing dependencies" },
  { content: "Launch Best Practices Researcher", status: "pending", activeForm: "Researching best practices" },
  { content: "Launch MCP Discovery agent", status: "pending", activeForm: "Discovering MCPs" },
  { content: "Synthesize findings and generate report", status: "pending", activeForm: "Generating report" }
])
```

**Initial Detection:**

```
Read package.json → Detect framework (Next.js, React, etc.)
Read tsconfig.json → Detect TypeScript config
Read .mcp.json → Detect existing MCPs
Glob for key files → Detect project structure
```

### Step 2: Launch Parallel Agents

**IMPORTANT:** Launch agents 1-5 in parallel using a single message with multiple Task tool calls.

#### Agent 1: Code Analyst

```
Task({
  subagent_type: "Explore",
  description: "Analyze code architecture",
  prompt: `
    Analyze this codebase thoroughly:

    1. **Architecture Assessment**
       - Identify architectural pattern (Clean Architecture, MVC, etc.)
       - Check layer separation and dependency flow
       - Find cross-layer violations

    2. **Code Patterns**
       - Component patterns used
       - State management approach
       - Data fetching patterns
       - Error handling patterns

    3. **Code Quality**
       - Identify code smells
       - Find duplicated logic
       - Check naming consistency
       - Assess test coverage

    4. **Technical Debt**
       - TODO/FIXME comments
       - Deprecated dependencies
       - Anti-patterns

    CRITICAL - PERSIST YOUR OUTPUT:
    Before returning, you MUST:
    1. Generate timestamp in format: YYYY-MM-DDTHH-MM-SS (use current time)
    2. Use the Write tool to save your JSON to: .ai-context/reports/code-analysis_{timestamp}.json
    3. Return the file path in your response

    JSON FORMAT:
    {
      "analysis_type": "code",
      "timestamp": "{timestamp}",
      "outputFile": ".ai-context/reports/code-analysis_{timestamp}.json",
      "architecture": { ... },
      "patterns": { ... },
      "quality": { ... },
      "technicalDebt": { ... }
    }

    FINAL RESPONSE: "Code analysis complete. Results saved to: .ai-context/reports/code-analysis_{timestamp}.json"
  `
})
```

#### Agent 2: AI Docs Analyst

```
Task({
  subagent_type: "Explore",
  description: "Analyze AI documentation",
  prompt: `
    Analyze the AI configuration in .claude/ and CLAUDE.md:

    1. **Skills Coverage**
       - List all skills in .claude/skills/
       - Identify gaps (what common tasks lack skills?)
       - Check skill quality and completeness

    2. **Rules Assessment**
       - Review rules in .claude/rules/
       - Check for conflicts or redundancies
       - Identify missing rules

    3. **Agent Configuration**
       - Review agents in .claude/agents/
       - Check agent-rule relationships

    4. **Documentation Quality**
       - CLAUDE.md completeness
       - Cross-references validity
       - DRY compliance

    CRITICAL - PERSIST YOUR OUTPUT:
    Before returning, you MUST:
    1. Generate timestamp in format: YYYY-MM-DDTHH-MM-SS (use current time)
    2. Use the Write tool to save your JSON to: .ai-context/reports/ai-docs-analysis_{timestamp}.json
    3. Return the file path in your response

    JSON FORMAT:
    {
      "analysis_type": "ai_docs",
      "timestamp": "{timestamp}",
      "outputFile": ".ai-context/reports/ai-docs-analysis_{timestamp}.json",
      "skills": { ... },
      "rules": { ... },
      "agents": { ... },
      "documentation": { ... }
    }

    FINAL RESPONSE: "AI docs analysis complete. Results saved to: .ai-context/reports/ai-docs-analysis_{timestamp}.json"
  `
})
```

#### Agent 3: Deps & Security Agent

```
Task({
  subagent_type: "general-purpose",
  description: "Analyze dependencies and security",
  prompt: `
    Analyze project dependencies and security:

    1. **Dependency Analysis**
       - Read package.json
       - Identify outdated packages (check versions)
       - Find unused dependencies
       - Check for duplicate functionality

    2. **Security Assessment**
       - Look for hardcoded secrets (grep for API keys, tokens)
       - Check .gitignore for sensitive files
       - Review environment variable handling
       - Check for known vulnerable patterns

    3. **Bundle Analysis**
       - Identify large dependencies
       - Check for tree-shaking opportunities
       - Find potential bundle optimizations

    CRITICAL - PERSIST YOUR OUTPUT:
    Before returning, you MUST:
    1. Generate timestamp in format: YYYY-MM-DDTHH-MM-SS (use current time)
    2. Use the Write tool to save your JSON to: .ai-context/reports/deps-security_{timestamp}.json
    3. Return the file path in your response

    JSON FORMAT:
    {
      "analysis_type": "deps_security",
      "timestamp": "{timestamp}",
      "outputFile": ".ai-context/reports/deps-security_{timestamp}.json",
      "dependencies": { ... },
      "security": { ... },
      "bundle": { ... }
    }

    FINAL RESPONSE: "Deps & security analysis complete. Results saved to: .ai-context/reports/deps-security_{timestamp}.json"
  `
})
```

#### Agent 4: Best Practices Researcher

```
Task({
  subagent_type: "general-purpose",
  description: "Research best practices",
  prompt: `
    Research best practices for this project's tech stack:

    Detected Stack: {framework}, {language}, {ui_library}

    1. **Framework Best Practices**
       - Search for "{framework} best practices 2025"
       - Search for "{framework} performance optimization"
       - Search for "{framework} project structure"

    2. **Architecture Patterns**
       - Search for "Clean Architecture {framework}"
       - Search for "feature-based folder structure React"

    3. **Testing Strategies**
       - Search for "{framework} testing best practices"
       - Search for "Vitest vs Jest 2025"

    4. **Developer Experience**
       - Search for "{framework} developer tools 2025"
       - Search for "AI coding assistant best practices"

    Use WebSearch to find current best practices.

    CRITICAL - PERSIST YOUR OUTPUT:
    Before returning, you MUST:
    1. Generate timestamp in format: YYYY-MM-DDTHH-MM-SS (use current time)
    2. Use the Write tool to save your JSON to: .ai-context/reports/best-practices_{timestamp}.json
    3. Return the file path in your response

    JSON FORMAT:
    {
      "analysis_type": "best_practices",
      "timestamp": "{timestamp}",
      "outputFile": ".ai-context/reports/best-practices_{timestamp}.json",
      "frameworkPractices": { ... },
      "architecturePatterns": { ... },
      "testingStrategies": { ... },
      "developerExperience": { ... },
      "sources": [ ... ]
    }

    FINAL RESPONSE: "Best practices research complete. Results saved to: .ai-context/reports/best-practices_{timestamp}.json"
  `
})
```

#### Agent 5: MCP Discovery Agent

```
Task({
  subagent_type: "general-purpose",
  description: "Discover useful MCPs",
  prompt: `
    Discover MCP servers useful for this project:

    Current MCPs: {list from .mcp.json}
    Tech Stack: {framework}, {language}, {tools}

    1. **Search for MCPs**
       - WebSearch: "MCP servers for {framework}"
       - WebSearch: "Model Context Protocol servers list 2025"
       - WebSearch: "Claude MCP servers GitHub"

    2. **Check Official Sources**
       - WebFetch: https://github.com/modelcontextprotocol/servers
       - Look for community MCP registries

    3. **Evaluate Relevance**
       For each MCP found:
       - Does it match the tech stack?
       - Is it actively maintained?
       - What problems does it solve?

    4. **Check for Missing Tools**
       Based on project needs, identify gaps:
       - Database MCPs (if using databases)
       - Cloud provider MCPs (AWS, GCP, etc.)
       - CI/CD MCPs
       - Documentation MCPs

    CRITICAL - PERSIST YOUR OUTPUT:
    Before returning, you MUST:
    1. Generate timestamp in format: YYYY-MM-DDTHH-MM-SS (use current time)
    2. Use the Write tool to save your JSON to: .ai-context/reports/mcp-discovery_{timestamp}.json
    3. Return the file path in your response

    JSON FORMAT:
    {
      "analysis_type": "mcp_discovery",
      "timestamp": "{timestamp}",
      "outputFile": ".ai-context/reports/mcp-discovery_{timestamp}.json",
      "currentMcps": [ ... ],
      "recommendedMcps": [
        {
          "name": "...",
          "url": "...",
          "purpose": "...",
          "relevance": "...",
          "installCommand": "..."
        }
      ],
      "missingCategories": [ ... ],
      "sources": [ ... ]
    }

    FINAL RESPONSE: "MCP discovery complete. Results saved to: .ai-context/reports/mcp-discovery_{timestamp}.json"
  `
})
```

### Step 3: Wait for All Agents

Wait for all 5 agents to complete. Collect their findings.

### Step 4: Synthesize Findings

Launch the Improvement Synthesizer agent with all findings:

**NOTE:** The orchestrator reads the persisted JSON files from agents 1-5 and passes their content to the synthesizer.

```
Task({
  subagent_type: "general-purpose",
  description: "Synthesize improvements",
  prompt: `
    Synthesize findings from all analysis agents and create prioritized recommendations:

    ## Code Analysis Findings:
    {code_analyst_results from .ai-context/reports/code-analysis_{timestamp}.json}

    ## AI Docs Analysis Findings:
    {ai_docs_analyst_results from .ai-context/reports/ai-docs-analysis_{timestamp}.json}

    ## Deps & Security Findings:
    {deps_security_results from .ai-context/reports/deps-security_{timestamp}.json}

    ## Best Practices Research:
    {best_practices_results from .ai-context/reports/best-practices_{timestamp}.json}

    ## MCP Discovery:
    {mcp_discovery_results from .ai-context/reports/mcp-discovery_{timestamp}.json}

    Create a prioritized improvement plan:

    1. **Critical (Do Now)**
       - Security issues
       - Breaking changes
       - Major bugs

    2. **High Priority (This Sprint)**
       - Performance improvements
       - Missing essential features
       - Technical debt

    3. **Medium Priority (Backlog)**
       - Code quality improvements
       - New skills/MCPs to add
       - Documentation updates

    4. **Low Priority (Nice to Have)**
       - Optimizations
       - Cosmetic improvements

    For each recommendation:
    - What to do
    - Why it matters
    - How to implement (brief steps)
    - Estimated effort (small/medium/large)

    CRITICAL - PERSIST YOUR OUTPUT:
    Before returning, you MUST:
    1. Generate timestamp in format: YYYY-MM-DDTHH-MM-SS (use current time)
    2. Use the Write tool to save your JSON to: .ai-context/reports/improvement-synthesis_{timestamp}.json
    3. Return the file path in your response

    JSON FORMAT:
    {
      "analysis_type": "improvement_synthesis",
      "timestamp": "{timestamp}",
      "outputFile": ".ai-context/reports/improvement-synthesis_{timestamp}.json",
      "critical": [ { "issue": "...", "action": "...", "effort": "...", "why": "..." } ],
      "highPriority": [ ... ],
      "mediumPriority": [ ... ],
      "lowPriority": [ ... ],
      "overallScore": 0-100,
      "summary": "..."
    }

    FINAL RESPONSE: "Improvement synthesis complete. Results saved to: .ai-context/reports/improvement-synthesis_{timestamp}.json"
  `
})
```

### Step 5: Generate Report

Create comprehensive markdown report:

````markdown
# Project Intelligence Report

**Generated:** {YYYY-MM-DDTHH:MM:SS} (e.g., 2026-01-10T14:30:45)
**Project:** {project*name}
**Analysis Depth:** {depth}
**Report File:** project-intelligence*{YYYY-MM-DDTHH-MM-SS}.md

---

## Executive Summary

| Category     | Status   | Issues           |
| ------------ | -------- | ---------------- |
| Code Quality | {status} | {count} findings |
| AI Documents | {status} | {count} findings |
| Dependencies | {status} | {count} findings |
| Security     | {status} | {count} findings |

**Overall Score:** {score}/100

---

## Tech Stack Detected

| Component  | Value               |
| ---------- | ------------------- |
| Framework  | Next.js 15          |
| Language   | TypeScript          |
| UI Library | React 19            |
| Styling    | Tailwind CSS        |
| Testing    | Vitest + Playwright |

---

## Critical Issues (Fix Immediately)

### 1. {Issue Title}

**Severity:** Critical
**Location:** {file:line}
**Description:** {description}

**Fix:**

```typescript
{
  code_fix;
}
```
````

---

## High Priority Recommendations

### 1. {Recommendation Title}

**Category:** {category}
**Effort:** {small/medium/large}
**Impact:** {description}

**Implementation:**

1. {step 1}
2. {step 2}

---

## Recommended MCPs to Add

| MCP    | Purpose   | Install     |
| ------ | --------- | ----------- |
| {name} | {purpose} | `{command}` |

---

## Recommended New Skills

| Skill  | Purpose   | Triggers     |
| ------ | --------- | ------------ |
| {name} | {purpose} | `/{command}` |

---

## Best Practices Alignment

| Practice   | Current   | Recommended   | Gap   |
| ---------- | --------- | ------------- | ----- |
| {practice} | {current} | {recommended} | {gap} |

---

## Action Items Checklist

### This Week

- [ ] {action 1}
- [ ] {action 2}

### This Month

- [ ] {action 3}
- [ ] {action 4}

### Backlog

- [ ] {action 5}

---

## Sources

- {source 1 URL}
- {source 2 URL}

---

_Report generated by `/project-intelligence` skill_

```

### Step 6: Save Report

**IMPORTANT: Each run MUST generate a uniquely timestamped report file.**

1. **Generate timestamp** in ISO format (file-safe):
```

Format: YYYY-MM-DDTHH-MM-SS
Example: 2026-01-10T14-30-45

````

2. **Create reports directory** if it doesn't exist:
```bash
mkdir -p .ai-context/reports
````

3. **Save report** with timestamp:

   ```
   .ai-context/reports/project-intelligence_{timestamp}.md

   Example: .ai-context/reports/project-intelligence_2026-01-10T14-30-45.md
   ```

4. **Return report path** to user:
   ```
   ✅ Report saved: .ai-context/reports/project-intelligence_2026-01-10T14-30-45.md
   ```

**Note:** Using ISO timestamp with hyphens instead of colons ensures cross-platform file compatibility.

---

## Analysis Categories

### Code Analysis Checks

| Check                   | What It Looks For                            |
| ----------------------- | -------------------------------------------- |
| Architecture Compliance | Layer violations, import directions          |
| Component Patterns      | Proper structure, hooks placement            |
| State Management        | Appropriate patterns, unnecessary complexity |
| Error Handling          | Try/catch, error boundaries, fallbacks       |
| Performance             | Memo usage, re-render issues, bundle size    |
| Accessibility           | ARIA attributes, semantic HTML               |
| Testing                 | Coverage, test quality, missing tests        |

### AI Docs Checks

| Check              | What It Looks For           |
| ------------------ | --------------------------- |
| Skill Coverage     | Common tasks without skills |
| Rule Conflicts     | Contradicting rules         |
| DRY Violations     | Duplicate definitions       |
| Missing Agents     | Beneficial agent patterns   |
| Documentation Gaps | Incomplete or outdated docs |

### Security Checks

| Check            | What It Looks For            |
| ---------------- | ---------------------------- |
| Secrets Exposure | Hardcoded API keys, tokens   |
| Env Handling     | Proper .env usage, gitignore |
| Dependencies     | Known vulnerabilities        |
| Input Validation | XSS, injection vectors       |
| Auth Patterns    | Proper session handling      |

---

## Example Output

### Quick Analysis

```
/project-intelligence --depth quick
```

**Output (2-3 minutes):**

```
## Project Intelligence - Quick Scan

✅ Architecture: Clean Architecture pattern detected
✅ TypeScript: Strict mode enabled
⚠️ Dependencies: 3 outdated packages
⚠️ Security: 1 potential issue found
✅ AI Docs: 26 skills, 14 rules configured

### Top 3 Recommendations:

1. **Update React to v19.1** (security patch)
   `pnpm update react react-dom`

2. **Add Sentry MCP** for error tracking
   Already using error boundaries, Sentry would enhance monitoring

3. **Create /analyze-performance skill**
   Bundle analysis is manual - could be automated

Full report: .ai-context/reports/project-intelligence_2026-01-10T14-30-45.md
```

### Deep Analysis

```
/project-intelligence --depth deep
```

**Output (5-10 minutes):**

Full comprehensive report with all categories, research findings, and detailed recommendations.

---

## Research Sources

The Best Practices Researcher queries these sources:

| Source Type     | Examples                                      |
| --------------- | --------------------------------------------- |
| Official Docs   | Next.js docs, React docs, TypeScript handbook |
| GitHub          | Trending repos, issue discussions             |
| Dev Communities | Dev.to, Hashnode, Medium                      |
| Stack Overflow  | Top answers for stack questions               |
| MCP Registry    | Official MCP servers list                     |

---

## Integration with Other Skills

| Skill                     | Integration                       |
| ------------------------- | --------------------------------- |
| `/ai-documents-audit`     | Uses findings for AI docs section |
| `/security-audit`         | Expands on security findings      |
| `/analyze-bundle`         | Provides performance data         |
| `/fix-ai-documents-audit` | Can auto-fix some findings        |

---

## Configuration

### Custom Focus Areas

```
/project-intelligence --focus security
```

Runs only security-related agents for faster, targeted analysis.

### Disable Internet Research

```
/project-intelligence --no-research
```

Skips web searches (useful for offline or air-gapped environments).

### Custom Output

By default, reports are saved with timestamps allowing multiple runs:

```
.ai-context/reports/project-intelligence_2026-01-10T14-30-45.md
.ai-context/reports/project-intelligence_2026-01-10T16-45-22.md
.ai-context/reports/project-intelligence_2026-01-11T09-15-00.md
```

To save to a custom location (overwrites existing):

```
/project-intelligence --output ./reports/weekly-review.md
```

---

## Limitations

- **Rate Limits**: Web searches may be rate-limited
- **Private Repos**: Cannot search private GitHub repos
- **Dynamic Analysis**: Does not run the application
- **External APIs**: Cannot test API integrations

---

## Related

- [AI Documents Audit](../ai-documents-audit/SKILL.md) - `/ai-documents-audit`
- [Security Audit](../security-audit/SKILL.md) - `/security-audit`
- [Analyze Bundle](../analyze-bundle/SKILL.md) - `/analyze-bundle`
- [Fix AI Documents Audit](../fix-ai-documents-audit/SKILL.md) - `/fix-ai-documents-audit`
