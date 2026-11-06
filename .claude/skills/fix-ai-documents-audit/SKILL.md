---
name: fix-ai-documents-audit
description: Fixes all issues found in the latest AI documents audit report. Resolves duplicates, adds missing references, and consolidates inconsistent definitions regardless of priority.
---

# Fix AI Documents Audit

## Description

Automatically fixes all issues identified in the latest AI documents audit report. This skill reads the most recent audit report, parses all pending issues, and applies fixes regardless of priority level.

**This skill uses a task list to show progress.**

---

## Usage

```
/fix-ai-documents-audit [options]
```

or natural language:

```
Fix the audit issues
Apply fixes from the latest audit
Resolve all AI document issues
```

## Parameters

| Parameter            | Required | Description                                                              |
| -------------------- | -------- | ------------------------------------------------------------------------ |
| `--report <path>`    | No       | Specific audit report to fix (default: latest in `.ai-context/reports/`) |
| `--dry-run`          | No       | Show what would be fixed without applying changes                        |
| `--priority <level>` | No       | Fix only issues of specific priority (critical/high/medium/low)          |
| `--category <type>`  | No       | Fix only specific category (consistency/portability/mcp)                 |

---

## Steps

### Step 1: Find Latest Audit Report

1. List files in `.ai-context/reports/`
2. Find the most recent `ai-documents-audit_*.md` file by timestamp
3. If no report found, inform user to run `/ai-documents-audit` first

```
Glob(".ai-context/reports/ai-documents-audit_*.md")
Sort by filename (contains ISO timestamp: YYYY-MM-DDTHH-MM-SS)
Select most recent (last in sorted list)
```

**Filename format:** `ai-documents-audit_YYYY-MM-DDTHH-MM-SS.md`

### Step 2: Parse Audit Report

Read the audit report and extract:

1. **Inconsistencies** - Same concept defined differently
2. **Missing References** - Content that should link to authoritative source
3. **Duplicates** - Same content in multiple places (actionable ones)
4. **Portability Violations** - Non-portable content (if any)

**Parsing approach:**

```markdown
Look for sections:

- "### Inconsistencies Found" → extract table rows
- "### Missing References" → extract table rows
- "### Duplicate Definitions Found" → extract actionable items
- "### Violations Found" → extract portability issues
- "## Pending Actions" → checklist of unfixed items
```

### Step 3: Create Fix Plan

For each issue, determine the fix:

| Issue Type                | Fix Strategy                                              |
| ------------------------- | --------------------------------------------------------- |
| **Inconsistency**         | Update incorrect definition to match authoritative source |
| **Missing reference**     | Add markdown link to authoritative source                 |
| **Duplicate (high)**      | Replace with reference link                               |
| **Duplicate (medium)**    | Add "See also" reference                                  |
| **Portability violation** | Replace with generic placeholder                          |

### Step 4: Initialize Task List

```
TodoWrite([
  { content: "Parse latest audit report", status: "pending", activeForm: "Parsing audit report" },
  { content: "Fix inconsistencies", status: "pending", activeForm: "Fixing inconsistencies" },
  { content: "Add missing references", status: "pending", activeForm: "Adding missing references" },
  { content: "Resolve high-priority duplicates", status: "pending", activeForm: "Resolving duplicates" },
  { content: "Fix portability issues", status: "pending", activeForm: "Fixing portability issues" },
  { content: "Update audit report", status: "pending", activeForm: "Updating audit report" },
  { content: "Verify fixes", status: "pending", activeForm: "Verifying fixes" }
])
```

### Step 5: Apply Fixes

#### 5a: Fix Inconsistencies

For each inconsistency:

1. Read the file with the incorrect definition
2. Read the authoritative source
3. Update the incorrect file to match or reference the authoritative source

```markdown
# Example: Hook naming inconsistency

File: docs/lessons/naming-conventions.md
Line: 138
Issue: Says "PascalCase" but should be "camelCase"
Fix: Edit line 138 to say "camelCase"
```

#### 5b: Add Missing References

For each missing reference:

1. Read the file that needs the reference
2. Find the section that should have the reference
3. Add appropriate markdown link

**Reference formats:**

```markdown
# From CLAUDE.md to rules:

See [Rule Name](.claude/rules/rule-file.md) for details.

# From CLAUDE.md to docs:

See [Documentation](.claude/docs/path/file.md) for details.

# From skills to rules:

Follow the [Convention Name](../../rules/rule-file.md).

# Section-specific references:

See [Section Name](path/to/file.md#section-anchor).
```

#### 5c: Resolve Duplicates

For high-severity duplicates:

1. Identify authoritative source
2. In non-authoritative files, replace inline content with reference
3. Keep brief summary if appropriate, add "See X for details"

```markdown
# Before (in CLAUDE.md):

## File Naming

| Type       | Convention | Example         |
| ---------- | ---------- | --------------- |
| Components | PascalCase | `LoginForm.tsx` |

...50 lines of details...

# After (in CLAUDE.md):

## File Naming

| Type       | Convention           | Example         |
| ---------- | -------------------- | --------------- |
| Components | PascalCase           | `LoginForm.tsx` |
| Hooks      | camelCase with `use` | `useAuth.ts`    |

See [Naming Conventions](docs/lessons/naming-conventions.md) for complete guidelines.
```

#### 5d: Fix Portability Issues

For each portability violation:

1. Read the file
2. Replace specific content with generic placeholder
3. Verify replacement maintains meaning

| Original                    | Replacement               |
| --------------------------- | ------------------------- |
| `https://api.mycompany.com` | `https://api.example.com` |
| `mycompany/myproject`       | `{owner}/{repo}`          |
| `/home/john/projects`       | `./` or `{project-root}`  |
| `john@mycompany.com`        | `user@example.com`        |

### Step 6: Update Audit Report

After applying fixes:

1. Read the audit report
2. Move fixed items to "Actions Taken" section
3. Update "Pending Actions" checklist
4. Add timestamp of fixes applied

```markdown
## Actions Taken This Session

- [x] Fixed hook naming convention - 2026-01-09T00:00:00Z
- [x] Added reference to naming-conventions.md in CLAUDE.md - 2026-01-09T00:01:00Z
      ...

## Pending Actions

- [ ] (remaining items)
```

### Step 7: Verify Fixes

1. Re-read modified files to confirm changes applied
2. Check that references are valid (files exist)
3. Optionally run `/ai-documents-audit --consistency` to verify

---

## Fix Templates

### Adding Reference to CLAUDE.md

```markdown
# For a section that duplicates a rule:

## [Section Name]

[Keep brief 1-2 line summary if needed]

See [Full Documentation](.claude/rules/[rule-file].md) for complete guidelines.
```

### Adding Cross-Reference in Skills

```markdown
# At the relevant section:

Follow the [Convention Name](../../rules/[rule-file].md).
```

### Consolidating Duplicate Definitions

```markdown
# In the NON-authoritative file, replace detailed content with:

For [concept name], see [Authoritative Source](path/to/file.md#section).
```

---

## Output Format

### Progress Updates

```
Fixing AI Documents Audit Issues
================================

Report: .claude/audit-reports/ai-documents-audit_2026-01-09T00-00-00.md

Issues Found:
- Inconsistencies: 1 (0 remaining after previous fix)
- Missing references: 4
- High-priority duplicates: 1
- Portability violations: 0

Applying fixes...

[x] Fixed: CLAUDE.md:307 - Added reference to naming-conventions.md
[x] Fixed: CLAUDE.md:382 - Added references to dry-principle.md and solid-principles.md
[x] Fixed: CLAUDE.md:29 - Added reference to docs/architecture/overview.md
[x] Fixed: overview.md - Added Sources & Inspiration link

All issues resolved!

Updated audit report: .claude/audit-reports/ai-documents-audit_2026-01-09T00-00-00.md
```

### Summary Report

```markdown
## Fix Audit Summary

**Report:** ai-documents-audit_2026-01-09T00-00-00.md
**Timestamp:** 2026-01-09T00:15:00Z

### Fixes Applied (4)

| File        | Line | Fix                                      |
| ----------- | ---- | ---------------------------------------- |
| CLAUDE.md   | 307  | Added reference to naming-conventions.md |
| CLAUDE.md   | 382  | Added references to SOLID and DRY rules  |
| CLAUDE.md   | 29   | Added reference to architecture overview |
| overview.md | 1    | Added Sources & Inspiration link         |

### Files Modified (2)

- CLAUDE.md
- .claude/docs/architecture/overview.md

### Verification

- All references valid
- No new issues introduced
```

---

## Examples

### Example 1: Fix All Issues

```
/fix-ai-documents-audit
```

Finds latest audit report, fixes all pending issues.

### Example 2: Dry Run

```
/fix-ai-documents-audit --dry-run
```

Shows what would be fixed without making changes.

### Example 3: Fix Specific Report

```
/fix-ai-documents-audit --report .claude/audit-reports/ai-documents-audit_2026-01-08.md
```

Fixes issues from a specific audit report.

### Example 4: Fix Only Critical Issues

```
/fix-ai-documents-audit --priority critical
```

Only fixes critical-priority issues.

---

## Error Handling

| Error                          | Action                                            |
| ------------------------------ | ------------------------------------------------- |
| No audit report found          | Inform user to run `/ai-documents-audit` first    |
| File not found                 | Skip and report, continue with other fixes        |
| Reference target doesn't exist | Create the target file or skip with warning       |
| Parse error                    | Report specific line/section that failed to parse |

---

## Related

- [AI Documents Audit](../ai-documents-audit/SKILL.md) - Generate audit reports
- [AI Docs DRY](../../rules/ai-docs-dry.md) - DRY principle for AI docs
- [Portability Rule](../../../docs/lessons/portability.md) - Portability requirements
