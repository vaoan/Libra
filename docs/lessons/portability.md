# Portability Rule

## Rule

**All AI configuration documents MUST be portable and project-agnostic.**

The `.claude/` folder and `CLAUDE.md` are designed to be copied to any new project without modification. They should contain NO project-specific information.

---

## What is Portable?

Portable documentation can be:

- Copied to a new project folder
- Used immediately without editing
- Shared across teams and projects
- Version controlled as a template

---

## Prohibited Content

### Never Include:

| Type                 | Examples                                                 |
| -------------------- | -------------------------------------------------------- |
| **Company names**    | "Acme Corp", "MyCompany", client names                   |
| **Project names**    | "dallas-frontend", "customer-portal", specific app names |
| **Personal info**    | Developer names, emails, usernames                       |
| **Specific URLs**    | `https://mycompany.com`, internal URLs                   |
| **API keys/secrets** | Real tokens, passwords, credentials                      |
| **Internal paths**   | `/home/john/projects/`, `C:\Users\John\`                 |
| **Specific ports**   | `localhost:3247` (use `localhost:3000` as generic)       |
| **Business logic**   | Company-specific workflows, proprietary processes        |
| **Dated content**    | "As of Q3 2024", specific deadlines                      |

### Allowed Content:

| Type                      | Examples                                    |
| ------------------------- | ------------------------------------------- |
| **Generic examples**      | `example.com`, `api.example.com`            |
| **Placeholder tokens**    | `YOUR_TOKEN_HERE`, `<your-api-key>`         |
| **Generic paths**         | `./src/`, `features/[feature-name]/`        |
| **Standard ports**        | `localhost:3000`, `localhost:8080`          |
| **Technology references** | Next.js, React, TypeScript                  |
| **Pattern examples**      | Generic `User`, `Order`, `Product` entities |
| **Architecture concepts** | Clean Architecture, SOLID, DRY              |

---

## File-Specific Guidelines

### CLAUDE.md

```markdown
# GOOD: Generic project documentation

This project follows Clean Architecture...

# BAD: Project-specific (project overview)

This is the Dallas Customer Portal built for Acme Corp...
```

### Skills (SKILL.md)

```markdown
# GOOD: Generic skill

Creates a new React component following project conventions.

# BAD: Project-specific (skill description)

Creates a component for the Acme Dashboard using our internal API.
```

### Rules (\*.md)

```markdown
# GOOD: Generic rule

Feature folders use kebab-case: `user-management/`

# BAD: Project-specific (rules reference)

The customer-portal feature must use the AcmeAuth provider.
```

### Examples in Code

```typescript
// GOOD: Generic examples
const user = { id: "123", email: "user@example.com" };
const API_URL = "https://api.example.com";

// BAD: Project-specific (code example)
const user = { id: "123", email: "john@acmecorp.com" };
const API_URL = "https://api.acmecorp.internal.com";
```

---

## Environment Variables

### Template File (.env.local.example)

```bash
# GOOD: Placeholders
GITHUB_TOKEN=YOUR_GITHUB_TOKEN_HERE
API_URL=https://api.example.com

# BAD: Real values
GITHUB_TOKEN=ghp_abc123realtoken456
API_URL=https://api.mycompany.com
```

### Documentation

```markdown
# GOOD: Generic instructions

1. Copy `.env.local.example` to `.env.local`
2. Replace placeholder values with your actual tokens

# BAD: Specific instructions

1. Get the API key from John in #develop-secrets channel
2. Use the staging URL from our Confluence page
```

---

## Verification Checklist

Before committing AI docs, verify:

- [ ] No company or project names
- [ ] No personal information (names, emails)
- [ ] No real API keys or secrets
- [ ] No internal URLs or paths
- [ ] No specific ports (unless standard like 3000)
- [ ] All examples use generic entities (User, Order, Product)
- [ ] All URLs use `example.com` or similar
- [ ] All tokens use `YOUR_*_HERE` placeholders

---

## Automated Checks

The `/ai-documents-audit` skill can scan for portability issues:

```bash
# Check for potential portability issues
/ai-documents-audit --docs
```

Look for patterns that might indicate non-portable content.

---

## Why Portability Matters

1. **Reusability**: Same config works for any Next.js project
2. **Security**: No accidental credential exposure
3. **Collaboration**: Share without revealing internals
4. **Templates**: Create new projects from this template
5. **Open Source**: Safe to publish publicly

---

## Making Content Portable

### Before (Non-Portable)

```markdown
## Dallas Frontend Setup

1. Clone from git@github.com:acmecorp/dallas-frontend.git
2. Get API key from John (john@acmecorp.com)
3. Set ACME_API_KEY in .env.local
4. Connect to https://api.dallas.acmecorp.com
```

### After (Portable)

```markdown
## Project Setup

1. Clone the repository
2. Copy `.env.local.example` to `.env.local`
3. Add your API credentials
4. Configure API_URL for your environment
```

---

## Exceptions

Project-specific content belongs in:

| Location                   | Purpose                             |
| -------------------------- | ----------------------------------- |
| `.env.local`               | Real credentials (gitignored)       |
| `README.md` (project root) | Project-specific setup instructions |
| `/docs/` (project root)    | Project documentation               |
| Issue tracker              | Project-specific tasks              |
| Wiki                       | Team-specific knowledge             |

**Never** put project-specific content in `.claude/` or `CLAUDE.md`.

### Approved Exceptions File

In rare cases where project-specific content is unavoidable in AI docs, document it in:

**File:** `.claude/portability-exceptions.json` (gitignored)

```json
{
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

**Rules for exceptions:**

1. Exceptions file is gitignored (project-specific)
2. Each exception must have a documented reason
3. The `/ai-documents-audit --portability` command manages this file
4. Prefer fixing violations over adding exceptions
5. Review exceptions periodically - remove when no longer needed

---

## Enforcement

When creating or modifying AI documents:

1. Review for project-specific content
2. Replace with generic alternatives
3. Use placeholders for sensitive values
4. Test by imagining the file in a different project
5. Run `/ai-documents-audit --portability` to scan for issues

### Audit Commands

```bash
# Full portability audit
/ai-documents-audit --portability

# Full audit (includes portability)
/ai-documents-audit --all
```

The audit will:

1. Scan all AI configuration files
2. Check against known exception patterns
3. Ask about new violations (exception or fix?)
4. Update exceptions file if approved
5. Report remaining violations to fix

---

## Related

- [AI Documents Audit](../skills/ai-documents-audit/SKILL.md) - Scan for issues
- [Git Workflow](./git-workflow.md) - Never commit secrets
