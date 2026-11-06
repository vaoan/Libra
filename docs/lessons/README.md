# Lessons

The full text behind Libra's Claude instructions. Nothing here loads on its own: a session reads a lesson when a rule, skill or root line links to it. `@`-importing one would load it at launch, so never do that.

## Where instructions live

| Home                              | Loads                                     | Holds                                 |
| --------------------------------- | ----------------------------------------- | ------------------------------------- |
| `CLAUDE.md`                       | Every session; survives compaction        | What Libra is, invariants, commands   |
| `.claude/rules/*.md` with `paths` | On reading a file matching the globs      | One-line imperatives, each with a why |
| `.claude/skills/*/SKILL.md`       | The description at launch; body on invoke | Procedures, with their steps          |
| `docs/lessons/*.md`               | Only when read                            | The explanation, examples, history    |

Budget, at bytes divided by 3: at most 10,000 tokens at session start and 25,000 in a task touching one vertical slice. Root stays under 200 lines and each rule under 100. A rule without `paths:`, or with globs matching over 40% of tracked source, counts against session start. Orrery measures this: `orrery instructions <repo> --base origin/develop`.

`paths:` starts on line 1 of the rule file, or the file counts as unscoped.

## Reading a lesson

Every lesson named after a rule is that rule's text as it stood when it moved out of `.claude/rules/`, unchanged apart from a spelling-check comment on some. So:

- `./x.md` links still work, because the rules moved together.
- `../skills/...` means `.claude/skills/...`, `../agents/...` means `.claude/agents/...`, and `../../docs/...` means `docs/...`. `.claude/rules/x.md` in prose may now be here as `docs/lessons/x.md`.
- Several describe a state since changed. `apps/web` is now `apps/store`. The short rule states the current fact where the two differ, and the short rule wins. `portability.md` describes the time this config was a template; the root line in `CLAUDE.md` says what still applies.
- `project-overview.md` holds what the root file used to carry.
