---
paths:
  - "**/*.stories.tsx"
  - "**/.storybook/**"
---

# Storybook

Loaded when a story or Storybook config is read. Storybook is not installed in this repository today: no dependency, no config, no stories. These rules apply if it is added. Long how-to: `.claude/skills/storybook/SKILL.md`.

- **Use `@storybook/nextjs-vite`**, for the Vite build and Vitest integration with the Next.js features intact. → `docs/lessons/storybook.md` (Framework)
- **Story presentational components that take data as props.** A component that fetches its own data needs API mock setup in every story, so split it first. → `docs/lessons/storybook.md` (Dumb vs Smart Components)
- **Give every variant and state a story: loading, error, empty, many items**, with data from a factory rather than literals in the story. → `docs/lessons/storybook.md` (Anti-Patterns)
- **Title stories by hierarchy (`Atoms/Button`, `Features/Auth/LoginForm`)**, write interaction tests in `play`, and reuse stories in Vitest through `composeStories`. → `docs/lessons/storybook.md` (Story Organization)
