---
name: generate-setup-guide
description: Generate a developer setup guide by analyzing project structure and workflows.
---

# Generate Setup Guide

## Description

Analyzes the project structure, dependencies, configuration, and development workflow to generate a comprehensive setup guide. The guide is designed for new developers and AI agents to quickly understand and work with the project.

**This skill uses a task list to show progress during analysis.**

## Usage

```
/generate-setup-guide
```

Or natural language:

```
Generate a setup guide
Create developer documentation
Analyze the project and create onboarding docs
Update the README with setup instructions
```

## Parameters

| Parameter   | Required | Description                                            |
| ----------- | -------- | ------------------------------------------------------ |
| `--output`  | No       | Output location: `readme` (default), `docs`, or `both` |
| `--verbose` | No       | Include detailed explanations for each section         |

## When to Use

- Setting up a new project
- Onboarding new team members
- After major configuration changes
- When AI agents need project context
- Updating documentation after dependency changes

## Output Locations

| Output   | Location                     | Purpose                      |
| -------- | ---------------------------- | ---------------------------- |
| `readme` | `README.md` (project root)   | Quick start for developers   |
| `docs`   | `.ai-context/setup-guide.md` | Detailed guide for AI agents |
| `both`   | Both locations               | Complete coverage            |

---

## Analysis Steps

### Step 1: Initialize Task List

```
TodoWrite([
  { content: "Analyze package.json and dependencies", status: "in_progress", activeForm: "Analyzing dependencies" },
  { content: "Scan project structure and architecture", status: "pending", activeForm: "Scanning structure" },
  { content: "Identify environment variables", status: "pending", activeForm: "Identifying env vars" },
  { content: "Detect available scripts and commands", status: "pending", activeForm: "Detecting scripts" },
  { content: "Analyze testing configuration", status: "pending", activeForm: "Analyzing tests" },
  { content: "Check CI/CD and deployment setup", status: "pending", activeForm: "Checking CI/CD" },
  { content: "Identify key features and patterns", status: "pending", activeForm: "Identifying patterns" },
  { content: "Generate setup guide", status: "pending", activeForm: "Generating guide" }
])
```

### Step 2: Analyze Package.json

**Read and extract:**

```typescript
// From package.json
{
  (name, // Project name
    version, // Current version
    scripts, // Available npm/pnpm scripts
    dependencies, // Runtime dependencies
    devDependencies); // Dev dependencies
}
```

**Categorize dependencies:**

| Category         | Examples                                |
| ---------------- | --------------------------------------- |
| Framework        | next, react, react-dom                  |
| State Management | zustand, @tanstack/react-query          |
| UI               | @mui/material, tailwindcss              |
| Forms            | formik, react-hook-form, zod            |
| Testing          | vitest, @testing-library/\*, playwright |
| Utilities        | axios, dayjs, lodash-es                 |

### Step 3: Scan Project Structure

**Check for standard directories:**

```bash
# Core directories
src/
├── app/           # Next.js App Router
├── features/      # Feature modules
├── shared/        # Shared code
├── stores/        # Global state
└── types/         # Global types

# Configuration
.github/           # GitHub workflows
e2e/               # E2E tests
.claude/           # AI configuration
```

**Identify architecture:**

- Clean Architecture indicators
- Feature-based organization
- Monorepo structure (if applicable)

### Step 4: Identify Environment Variables

**Scan for:**

```bash
# .env files
.env.example
.env.local.example
.env.development
.env.production

# Code usage
grep -rn "process.env" src/
grep -rn "NEXT_PUBLIC_" src/
```

**Categorize:**

| Type            | Prefix         | Example               |
| --------------- | -------------- | --------------------- |
| Public (client) | `NEXT_PUBLIC_` | `NEXT_PUBLIC_API_URL` |
| Server only     | None           | `DATABASE_URL`        |
| Secrets         | None           | `API_SECRET_KEY`      |

### Step 5: Detect Scripts and Commands

**From package.json scripts:**

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "test": "vitest",
  "test:e2e": "playwright test",
  ...
}
```

**Group by purpose:**

| Category    | Scripts                                   |
| ----------- | ----------------------------------------- |
| Development | dev, start                                |
| Build       | build, build:analyze                      |
| Testing     | test, test:watch, test:coverage, test:e2e |
| Quality     | lint, format, typecheck                   |

### Step 6: Analyze Testing Configuration

**Check for:**

```
vitest.config.ts    # Unit test config
playwright.config.ts # E2E test config
src/setupTests.ts   # Test setup
src/mocks/          # MSW mock handlers
e2e/                # E2E test files
```

**Extract key settings:**

- Test coverage thresholds
- Browser configurations
- Mock server setup

### Step 7: Check CI/CD Setup

**Scan:**

```
.github/workflows/
├── ci.yml          # Main CI pipeline
├── pr-checks.yml   # PR-specific checks
└── deploy.yml      # Deployment (if exists)
```

**Document:**

- Pipeline stages
- Required checks
- Deployment targets

### Step 8: Identify Key Features

**From `src/features/`:**

```bash
ls src/features/
# Output: auth, dashboard, users, orders, ...
```

**For each feature, note:**

- Purpose
- Key components
- API integrations

---

## Output Template

### README.md Template

````markdown
# Project Name

Brief description of the project.

## Prerequisites

- Node.js >= X.X
- pnpm >= X.X
- [Other requirements]

## Quick Start

```bash
# Clone repository
git clone [repo-url]
cd [project-name]

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your values

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Available Scripts

| Command         | Description              |
| --------------- | ------------------------ |
| `pnpm dev`      | Start development server |
| `pnpm build`    | Build for production     |
| `pnpm test`     | Run unit tests           |
| `pnpm test:e2e` | Run E2E tests            |
| `pnpm lint`     | Run linter               |

## Project Structure

```
src/
├── app/           # Next.js App Router (routing only)
├── features/      # Feature modules (domain logic)
├── shared/        # Shared components & utilities
├── stores/        # Global state (Zustand)
└── types/         # Global TypeScript types
```

## Environment Variables

| Variable              | Required | Description         |
| --------------------- | -------- | ------------------- |
| `NEXT_PUBLIC_API_URL` | Yes      | API base URL        |
| `DATABASE_URL`        | Yes      | Database connection |

See `.env.example` for all variables.

## Testing

```bash
# Unit tests
pnpm test

# Unit tests with coverage
pnpm test:coverage

# E2E tests
pnpm test:e2e

# E2E tests with UI
pnpm test:e2e:ui
```

## Architecture

This project follows Clean Architecture with feature-based organization.

See [Architecture Documentation](.claude/docs/architecture/overview.md) for details.

## Contributing

1. Create branch from `develop`: `git checkout -b feat/GH-XXX_feature-name`
2. Follow TDD: Write tests first
3. Submit PR to `develop` branch
4. Ensure all checks pass

See [Git Workflow](docs/lessons/git-workflow.md) for details.

## AI Assistance

This project is configured for AI-assisted development.

- **Claude Code Configuration**: `.claude/`
- **Rules**: `.claude/rules/`
- **Skills**: `.claude/skills/` (use `/skill-name` to invoke)

Key skills:

- `/start-task GH-XXX` - Start working on a GitHub issue
- `/submit-pr` - Submit a pull request
- `/run-tests` - Run test suite

## License

[License type]
````

### AI Context Template (.ai-context/setup-guide.md)

````markdown
# Project Setup Guide (AI Context)

> This document provides comprehensive context for AI assistants working on this project.

## Quick Context

| Aspect          | Details                                 |
| --------------- | --------------------------------------- |
| Framework       | Next.js X.X with App Router             |
| Language        | TypeScript (strict mode)                |
| State           | Zustand (client) + React Query (server) |
| Styling         | [MUI/Tailwind/etc.]                     |
| Testing         | Vitest + Playwright                     |
| Package Manager | pnpm                                    |

## Architecture Summary

[Include architecture diagram or description]

## Key Files to Know

| File                    | Purpose                    |
| ----------------------- | -------------------------- |
| `CLAUDE.md`             | Main AI instructions       |
| `src/app/layout.tsx`    | Root layout with providers |
| `src/app/providers.tsx` | Client-side providers      |
| `src/features/`         | All feature modules        |

## Feature Inventory

| Feature | Path                 | Description                    |
| ------- | -------------------- | ------------------------------ |
| auth    | `src/features/auth/` | Authentication & authorization |
| [etc.]  |                      |                                |

## Common Tasks

### Adding a New Feature

```bash
/create-feature [name]
```
````

Creates: domain/, application/, infrastructure/, presentation/ structure.

### Adding a Component

```bash
/create-component [name] [feature]
```

### Running Tests

```bash
/run-tests           # All unit tests
/run-tests [file]    # Specific file
/e2e-eval            # E2E tests
```

## Environment Setup

1. Copy `.env.example` to `.env.local`
2. Required variables:
   - `NEXT_PUBLIC_API_URL`: API endpoint
   - [List all required vars]

## Development Workflow

1. `/start-task GH-XXX` - Create branch for issue
2. Implement with TDD (tests first)
3. `/run-tests` - Verify tests pass
4. `/submit-pr` - Create pull request

## Conventions

- **Commits**: Conventional commits (`feat:`, `fix:`, etc.)
- **Branches**: `{type}/GH-{number}_{title}`
- **Tests**: Co-located with source files
- **Imports**: Use `@/` path aliases

## Important Rules

1. Never modify `app/` files directly for business logic
2. Features must not import from other features
3. All new code must have tests (TDD)
4. Follow Clean Architecture layer boundaries

## Related Documentation

- [Architecture](.claude/docs/architecture/overview.md)
- [Testing Rules](.claude/rules/testing.md)
- [Git Workflow](docs/lessons/git-workflow.md)

```

---

## Execution

### Running the Skill

When `/generate-setup-guide` is invoked:

1. **Initialize** - Create task list
2. **Analyze** - Read configs, scan directories
3. **Categorize** - Group findings by section
4. **Generate** - Create documentation
5. **Write** - Save to output location(s)
6. **Report** - Show summary of generated docs

### Output Example

```

✅ Setup guide generated successfully!

📄 Files created:

- README.md (updated)
- .ai-context/setup-guide.md (created)

📊 Analysis summary:

- 12 dependencies documented
- 8 scripts documented
- 5 environment variables found
- 6 features identified
- 3 workflow files analyzed

💡 Recommendations:

- Consider adding descriptions to package.json scripts
- Missing .env.example file
- Add CONTRIBUTING.md for contributor guidelines

```

---

## Post-Generation

After generating the guide:

1. **Review** - Check for accuracy
2. **Customize** - Add project-specific details
3. **Update** - Keep current as project evolves
4. **Share** - Commit to repository

Run this skill periodically (monthly) or after major changes to keep documentation current.

---

## Related

- [Start Task](../start-task/SKILL.md) - Development workflow
- [Architecture Rules](../../rules/architecture.md) - Project structure
- [Testing Rules](../../rules/testing.md) - Testing conventions
```
