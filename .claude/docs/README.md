# Claude Documentation

This folder contains **portable** architecture documentation that Claude references for understanding project structure and patterns.

> **Important**: All content here must be generic and project-agnostic. See [Portability Rule](../../docs/lessons/portability.md).

## Available Documentation

### Architecture

| Document                               | Description                                          |
| -------------------------------------- | ---------------------------------------------------- |
| [Overview](./architecture/overview.md) | High-level architecture philosophy and core concepts |
| [Layers](./architecture/layers.md)     | Detailed documentation for each architectural layer  |

### Patterns

_Add pattern documentation as the project grows._

## Purpose

Store **portable** documentation here that:

- Explains architecture patterns (generic, not project-specific)
- Documents coding conventions and best practices
- Provides context Claude needs for tasks
- Contains reusable patterns and examples

**Do NOT include:**

- Project-specific business logic
- Company or client information
- Real API endpoints or credentials
- Internal URLs or paths

## Structure

```
docs/
├── architecture/         # System architecture docs
│   ├── overview.md       # Architecture philosophy
│   └── layers.md         # Layer responsibilities
├── patterns/             # Code pattern examples
│   └── (coming soon)
├── api/                  # API documentation
│   └── (coming soon)
└── README.md             # This file
```

## Related Files

- [CLAUDE.md](../../CLAUDE.md) - Main project documentation
- [Rules](../rules/) - Coding standards and conventions
- [Skills](../skills/) - Available automation commands

## Adding Documentation

1. Create markdown files in appropriate subfolder
2. Keep docs focused and up-to-date
3. Link related docs together
4. Remove outdated information
5. Update this README with new entries
