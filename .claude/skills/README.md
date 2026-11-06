# Claude Skills

This folder contains custom skills that extend Claude's capabilities for this project.

## Available Skills

| Skill                                                       | Command                           | Description                                                                            |
| ----------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| [create-feature](./create-feature/SKILL.md)                 | `/create-feature [name]`          | Scaffold a complete feature module                                                     |
| [create-component](./create-component/SKILL.md)             | `/create-component [name]`        | Create a React component with types                                                    |
| [create-hook](./create-hook/SKILL.md)                       | `/create-hook [name]`             | Create a custom React hook                                                             |
| [create-api-integration](./create-api-integration/SKILL.md) | `/create-api [entity]`            | Create API client and React Query hooks                                                |
| [code-review](./code-review/SKILL.md)                       | `/code-review [path]`             | Review code for DRY, SOLID, KISS, and architecture violations                          |
| [ai-documents-audit](./ai-documents-audit/SKILL.md)         | `/ai-documents-audit`             | Audits MCP servers, explores tools, scans AI documents, and maps actions to MCP tools  |
| [start-task](./start-task/SKILL.md)                         | `/start-task <ticket> [type]`     | Create a properly named branch for a GitHub issue                                      |
| [submit-pr](./submit-pr/SKILL.md)                           | `/submit-pr`                      | Submit a pull request with quality checks                                              |
| [merge-pr](./merge-pr/SKILL.md)                             | `/merge-pr [pr_number]`           | Merge a PR (squash→develop, merge commit→main)                                         |
| [review-pr-comments](./review-pr-comments/SKILL.md)         | `/review-pr-comments [pr_number]` | Review PR comments and address approved feedback                                       |
| [sync-with-develop](./sync-with-develop/SKILL.md)           | `/sync-with-develop`              | Keep feature branch up to date with develop                                            |
| [create-release](./create-release/SKILL.md)                 | `/create-release`                 | Create production release (develop → main)                                             |
| [git-workflow](./git-workflow/SKILL.md) | `/git-workflow` | Branch names and targets, commit format, PR title limit, merging, releases |
| [code-review-standards](./code-review-standards/SKILL.md) | `/code-review-standards` | Severity levels, category codes, checklists and report format for reviews |
| [supabase-wipe](./supabase-wipe/SKILL.md) | `/supabase-wipe` | Wipe a Supabase project and re-apply migrations; owner-invoked only |
| [security-audit](./security-audit/SKILL.md)                 | `/security-audit`                 | Comprehensive security vulnerability scan                                              |
| [investigate-error](./investigate-error/SKILL.md)           | `/investigate-error`              | Structured error debugging workflow                                                    |
| [checkpoint](./checkpoint/SKILL.md)                         | `/checkpoint [summary]`           | Save work state for resuming later                                                     |
| [resume-checkpoint](./resume-checkpoint/SKILL.md)           | `/resume-checkpoint`              | Resume work from a saved checkpoint                                                    |
| [capture-evidences](./capture-evidences/SKILL.md)           | `/capture-evidences [issue]`      | Capture screenshots and post as evidence to a GitHub issue                             |
| [e2e-eval](./e2e-eval/SKILL.md)                             | `/e2e-eval [env] [options]`       | Fully autonomous E2E evaluator: starts services, runs tests, diagnoses, fixes, reports |

## Usage

Invoke skills using slash commands or natural language:

```
/create-feature user-management
```

or

```
Create a new feature called user-management
```

## Structure

```
skills/
├── skill-name/
│   ├── SKILL.md          # Skill definition and instructions
│   └── templates/        # Optional code templates
└── README.md             # This file
```

## Creating New Skills

1. Create a folder with the skill name (kebab-case)
2. Add `SKILL.md` with:
   - Description
   - Usage examples
   - Step-by-step instructions
   - Code templates
3. Test the skill thoroughly
4. Update this README

## Skill Definition Format

```markdown
# Skill Name

## Description

What the skill does.

## Usage

How to invoke the skill.

## Parameters

| Parameter | Required | Description |
| --------- | -------- | ----------- |
| name      | Yes      | Description |

## Steps

1. First step
2. Second step

## Examples

Example invocations and expected output.

## Notes

Additional considerations.
```
