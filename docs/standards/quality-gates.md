# Quality Gates

> What the automated checks actually verify, which ones are staged, and the
> gates that were found not to work.

This document exists because of a recurring defect found across this codebase:
**checks that exist, report green, and structurally cannot detect the thing
they are named after.** A gate nobody has tried to make fail is not yet a gate.

---

## The rule

When you add or promote a check, prove it can fail. Write the violation,
watch the check reject it, then delete the violation. Record here what you
proved.

---

## TypeScript

`noUncheckedIndexedAccess` is set in `tsconfig.base.json`, so every workspace
inherits it and a new workspace gets it without opting in.

It was enabled workspace by workspace and found real defects, not just noise:

| Defect                                                                                                                                   | Where                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| A `finally` block whose `return` discarded any in-flight exception                                                                       | store cart context                                              |
| The same drag-reorder `splice` bug three times: the removed element was inserted back without checking it existed                        | studio product table, payments display and form section editors |
| Four state updaters that would write `{ ...undefined, ...partial }` — a record missing every required field — when handed a stale index  | admin template editor                                           |
| `email.split("@")[0]` used as a display name, which is only non-empty for a well-formed address                                          | four call sites across store and admin                          |
| `PERMISSION_TEMPLATES` annotated `Record<string, string[]>`, which erased its literal keys and collapsed `TemplateKey` to plain `string` | admin user permissions                                          |

---

## ESLint — Playwright rules

The `eslint-plugin-playwright` recommended set applies to `apps/*/e2e/**`.
Before this was configured the plugin matched only `apps/*/src`, so 26 spec
files had no rules applied at all.

`playwright/expect-expect` is an **error**, not a warning. A test that asserts
nothing passes no matter how the product behaves, which makes it the one
defect a test suite cannot detect on its own.

Making it truthful took configuration. It reported 11 violations and **all 11
were false**: three were Playwright setup/teardown projects that use `test()`
for fixture work, and eight were tests whose assertions live in a helper the
rule cannot see through. Every helper listed in `assertFunctionNames` was
checked to contain real assertions. A rule with no true positives is noise
that trains people to ignore it — and would hide the first real case.

Proved it fires: an assertion-free spec is rejected as an error, and the same
file named `*.setup.ts` is correctly exempt.

Six rules have now been driven to zero and promoted to error:

| Rule                                | Sites                     | What it catches                                                                              |
| ----------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| `expect-expect`                     | 0 real                    | a test that asserts nothing                                                                  |
| `no-conditional-expect`             | 5                         | an assertion that may never run                                                              |
| `no-force-option`                   | 4                         | a click that skips actionability -- it passed even if a real buyer could not open their cart |
| `no-useless-not`                    | 25                        | `not.toBeVisible()` where `toBeHidden()` says it positively                                  |
| `prefer-web-first-assertions`       | 15, all exempted in place | `expect(await x.isVisible()).toBe(true)` instead of a retrying assertion                     |
| `consistent-spacing-between-blocks` | 1                         | formatting                                                                                   |

Two of those needed care.

**Promoting a rule needs an explicit `"error"`.** The recommended set ships
several as warnings, so removing one from the staged list leaves it a warning
and the promotion silently does nothing. That was caught only by planting a
violation and watching it fail to error -- which is the whole reason this
document asks you to prove a gate can fail.

**`prefer-web-first-assertions` is armed but exempted 15 times.** Every hit in
this suite compares a value captured earlier against one captured later --
"this block's testid now equals the one that block had before the drag" --
which `toHaveAttribute` cannot express. Each site carries an
`eslint-disable-next-line` with that reason, rather than the rule being turned
off, so the genuine pattern is still caught. This is the rule whose `--fix`
rewrote `const href = await link.getAttribute("href")` into
`const href = link`.

`no-conditional-in-test` was promoted the same way, and found three tests that
could not fail for the thing they were named after:

- `smoke-all-apps` "all apps load": an unreachable app was logged and
  `continue`d, so with every app down the test still passed.
- `smoke-all-apps` "all apps load **without errors**": page errors were
  collected and then only `console.log`ged. It passed while an app threw on
  load -- the single thing it exists to catch.
- `product-detail-seller-card`: a bare `test.skip()` when the fixture data was
  missing, which reported nothing. It is now an annotated skip that says what
  went unverified.

Its remaining sites are exempted where a conditional is honest: Playwright
setup/teardown projects (fixture work is branchy by nature), the manual-only
OAuth harnesses (a hosted sign-in shows different screens by session state),
and idempotent form setup inside a serial flow.

Two rules remain staged as warnings with their counts recorded in
`eslint.config.mjs` -- `no-networkidle` (117), `no-wait-for-timeout` (93),
`no-conditional-in-test` (26) and `no-skipped-test` (5). Each needs per-site
judgement about what to wait for instead, so they are driven to zero one at a
time. Do not run `eslint --fix` blindly over them: `prefer-web-first-assertions` rewrote
`const href = await link.getAttribute("href")` into `const href = link`,
silently turning a string into a Locator and breaking three assertions below
it. Typecheck caught it. Review every hunk.

---

## Known gaps

### An E2E test that disables itself

`apps/store/e2e/product-detail-seller-card.spec.ts` reads:

```ts
const supabase = await getSupabaseAdmin();
if (!supabase) return test.skip();
const { data: product } = await supabase.from("products")…;
if (!product) return test.skip();
```

Both branches turn a missing precondition into a skip. If the E2E database
holds no product with a `seller_id`, the seller-card assertion never runs and
the suite still reports green.

The durable fix is for the test to seed its own product instead of querying
for one that may not exist. That needs a store-side seeding helper — the auth
suite's `createProduct` drives the studio UI and is not reusable here.

### Permanently skipped OAuth tests

`discord-login.spec.ts` and `google-login.spec.ts` call `test.skip(true, …)`
unconditionally. The reason is real: both providers block automated browsers
and the tests need a pre-seeded profile. They are manual-only by design, but
they are also coverage the suite does not have — treat the OAuth paths as
untested by CI.

---

## knip

`knip` is now **enforced in CI** and reports zero.

It was previously left advisory on the reasoning that its ~205 findings were
unused-export noise, and that the sibling AeleOS repo runs it with
`--no-exit-code` too. That reasoning was wrong twice over.

First, "205 findings" was one number covering three unrelated things, and only
one of them was fuzzy. Second, most of the count was an artefact of knip's own
configuration: every workspace set `project` to `src/**`, so knip never saw
`e2e/` or `tests/`, and anything consumed only there was reported as unused.
A gate measuring the wrong file set is the failure this document is about,
and it had been dismissed as noise rather than read.

With the config corrected — `project` and `entry` extended to `tests/` and
`e2e/`, dead entry patterns removed, `.mts` config names fixed — knip found
two defects that had been invisible:

- **`@clerk/backend` was imported by three e2e files and declared in no
  `package.json` at all.** It resolved only as a transitive dependency of
  `@clerk/nextjs`, so a minor bump of that package could have removed it with
  no lockfile signal and no warning.
- **`packages/api` declared three export subpaths whose targets do not
  exist** — `./generated/*`, `./types/generated`, `./graphql/generated`. Worse,
  `.claude/rules/architecture.md` instructed importing from exactly those
  paths, so the repository's own AI instructions told the reader to write an
  import that cannot resolve. No code had done it, which is why nothing broke.

The remaining 201 sorted cleanly once classified:

| what it was                                 | count | what it needed        |
| ------------------------------------------- | ----: | --------------------- |
| barrel re-exports nothing imports           |   134 | drop from the barrel  |
| destructured bindings nothing uses          |    29 | drop from the pattern |
| exports consumed only inside their own file |    27 | drop the `export`     |
| declarations consumed nowhere               |     8 | delete                |

Nine barrels emptied completely and were deleted. Five test files carried a
`vi.mock` for one of them — a module the components never imported, so the
mock had never once been consulted.

One genuine knip false positive surfaced: a test declared a type through an
inline `import("...").ActiveTemplate[]`, a form knip does not follow. That was
fixed in the test rather than suppressed in the config; a normal `import type`
is clearer and is also what knip can see.

A second false positive cost a CI run and is worth recording, because the
local checks could not have caught it. knip reported `ui` as an unused
dependency of `apps/playground`, and a grep for `from "ui"` in that app agreed.
Both were looking only at TypeScript. The app consumes the package from CSS:

```css
@import "ui/globals";
```

Removing the dependency still passed `lint`, `typecheck`, `test` and `build`
locally, because pnpm's workspace links resolve `ui` whether or not the
manifest asks for it. Docker builds from a clean install, and only there did it
fail: `Can't resolve 'ui/globals'`. Every one of the seven apps imports `ui`
this way, so it is never legitimately unused; it now sits in
`ignoreDependencies` beside `tailwindcss` and `tw-animate-css`, which are in
that list for exactly the same reason. `knip.json` is JSON and cannot hold the
explanation, which is why it is here.

The lesson generalises: a dependency check that reads only the import graph of
one language will be wrong about a polyglot build, and a local build that
resolves through workspace links cannot confirm a manifest is complete.

Its _file_ report had already been made truthful earlier — it went from 28
unused files to 0, and only four of the 28 were real:

| Was reported                                                         | Why it was wrong                                                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 7x `shared/infrastructure/i18n/request.ts`                           | next-intl loads these by config path, never by import                                              |
| 7x `.claude/tools/*.mjs`                                             | MCP servers launched by `.mcp.json` as `node <path>`                                               |
| `docker/*.mjs`, `scripts/**/*.mjs`, `docker/ci/playwright.config.ts` | executed by Docker and by hand, never imported                                                     |
| 4 feature barrels                                                    | mandated by the architecture rule — see below                                                      |
| `apps/studio`, `packages/app-components`, `packages/auth`            | were missing from `knip.json` entirely, so their files were judged against the wrong project graph |

Four files were genuinely dead and are deleted:

- `HomeSections.tsx` and `SocialIcons.tsx` were pure re-export barrels created
  only to satisfy a past naming review that flagged "test file has no matching
  source file". Nothing ever imported them; the tests import the real
  components directly. Both had passing tests, so coverage looked healthy for
  files no product code used.
- `packages/api/src/supabase/client.ts` — an anon-key browser client superseded
  by `browser.ts` and exported from nowhere.
- `vitest.aliases.ts` — a shared-alias helper none of the seven
  `vitest.config.mts` files ever adopted.

### The feature barrel rule: measured, and it holds

This section previously recorded the rule as "inconsistent with itself",
evidenced by **126 deep imports against 6 barrel imports**, and left the
decision open. That comparison was counting the wrong thing.

`.claude/rules/architecture.md` mandates a barrel as each feature's public API,
and separately forbids features importing each other. So the barrel is the
interface for code _outside_ the feature -- and 427 of those "deep imports" are
a feature importing itself, which the rule never asked to go through a barrel.

Split by who is doing the importing:

| importer          | via barrel | deep  |
| ----------------- | ---------- | ----- |
| within a feature  | 0          | 427   |
| **`app/` routes** | **38**     | **0** |
| another feature   | 3          | 13    |

Routes were 31 to 7 when this was measured. The seven are fixed: four already
had what they needed on the barrel, and three barrels were widened to export
what an API route consumes -- a route is outside the feature, so what it needs
is part of the public API by definition. The rule is now satisfied wherever it
applies, and there is nothing to decide.

### What that measurement did surface: 13 cross-feature imports

Those violate a stated MUST, and they are the real finding.

```
  1  admin: users -> audit                         1  payments: checkout -> orders
  4  payments: assigned-orders -> received-orders  1  payments: received-orders -> assigned-orders
  1  store: cart -> products                       1  store: products -> cart
  2  studio: products -> seller-admins             1  studio: seller-admins -> products
  1  studio: products -> orders
```

Three of those pairs imported **each other**: assigned-orders and
received-orders, cart and products, products and seller-admins. A cycle at
feature level usually means one feature wearing two names, and each of them
turned out to be exactly that. All thirteen are now resolved, and none were
resolved by moving an import until the check stopped counting:

- `admin: users -> audit` — `insertAuditLog` was infrastructure both features
  called, so it moved to `shared/infrastructure`.
- `store: cart <-> products` — the cart's state, reducer, cookie persistence
  and `useAddToCart` were never the drawer's business; they moved to
  `shared/application/cart` and the cart feature became the drawer that reads
  them.
- `studio: products <-> seller-admins`, `products -> orders` — two pages were
  composition roots that happened to live inside a feature; they moved to
  `shared/presentation/pages`.
- `payments: assigned-orders <-> received-orders` — counting the files settled
  it. received-orders held fourteen; assigned-orders held six, none of which
  was a component, a type, or a domain rule. It was a query and a page, so the
  two were merged and assigned-orders was deleted.

`scripts/check-feature-boundaries.mjs` now holds the count at **0** and fails
on the first new one.

---

## Documentation that no longer describes its code

`scripts/check-doc-freshness.mjs` reports an exported symbol whose
implementation changed while its TSDoc did not. It is a heuristic and says so:
nothing can see that prose went stale on its own. It catches the case that
matters — a symbol whose behaviour moved under a comment that still confidently
describes the old one.

Two properties keep it from becoming noise people learn to ignore. It reports
per **symbol**, so the message names `getSupabaseAccessToken` rather than a
file. And it collapses whitespace runs, so re-indenting cannot trigger it.

There is no suppression flag, deliberately: a suppression flag becomes the
thing everyone types. The way past it is to touch the doc, and restating an
invariant that still holds is itself worth writing. For the same reason,
deleting the doc is reported too — otherwise deletion _is_ the suppression
flag.

It is ported from the sibling AeleOS repository with one change. AeleOS
enforces `jsdoc/require-jsdoc`, so every export there carries a doc and an
empty-to-empty comparison can only mean "the doc did not move". Libra
documents 335 of its 1002 exported symbols. Without the change the same
comparison would fire on every undocumented export anyone edited — a
documentation-coverage mandate wearing a freshness check's name, and one
nobody agreed to. So a symbol undocumented on both sides is skipped, which
guards the docs that exist and widens on its own as coverage grows.

It covers `.ts`, `.tsx` and `.mjs`. The last is not in the AeleOS original,
and is here because this repo's tooling lives in `scripts/` and is among its
most doc-dense code; leaving it out would be the same not-looking this
document is about. Including it widened the sample by nine commits and
produced no new findings.

Measured against the 37 source-touching commits that preceded it, it would
have failed 10. Spot-checking those: `getSupabaseAccessToken` grew a
three-second Clerk hydration wait while its doc still described the old
immediate-null behaviour — the exact failure the gate is for. Two others were
a test-id prop and a deleted lint directive, where the doc had not gone stale
and the author would have to touch it anyway. That is the accepted cost, and
27% is the retroactive rate rather than the steady-state one: under the gate
authors touch the doc, and the rate falls toward zero.

---

## A gate in package.json is not a gate

`check:a11y-patterns` existed as a script and ran in **no workflow and no
hook** — findable by anyone who went looking for it, enforced on nobody. It is
the same failure this document catalogues elsewhere in a quieter form: not a
check scoped to the files it already passes, but a check with no caller at
all.

Finding it by accident is not a method, so all 58 `package.json` scripts were
then checked against `.github/` and `.husky/`. Two more were in the same
state: **`check-css-sync`** and **`check-env-parity`**. Everything else
unreferenced was a developer command — `tunnel`, `fix:all`, `supabase:reset`,
`user:grant-role` — which is what an unreferenced script is supposed to look
like. All three gates now run in the CI hygiene block.

A fourth turned up later, from a different direction: **`test-inventory-diff`**.
It answers the one question a test count cannot -- did a rework drop a case?
Neither a file count nor a total catches that, because both can hold while an
assertion disappears. It ran nowhere, and when finally run it reported 14 lost
cases.

None were lost. All fourteen were checked individually against the live test
tree and every one was present. The committed inventory predated the scanner's
`LEGACY_SNAPSHOT` exclusion, so it counted `tests/legacy` as well as the live
tree and listed those names twice; the diff compares sorted lists with `comm`,
which is duplicate-sensitive, so a name appearing twice before and once now
produced a line of output. The report was surplus, not loss.

A rename trips it too, and that needed an answer. The gate compares case
NAMES, so replacing a test with a better-named one reads as a loss, and the
comparison is against the base branch — regenerating `tests/INVENTORY.md` on
the branch does not change what CI compares. Without a way through, the gate
blocks ordinary work, and a gate that blocks ordinary work is one somebody
deletes.

`tests/retired-cases.txt` is that way through, and it is deliberately
awkward: one line per case, the name exactly as it appeared, and a reason
after `#`. You have to name the assertion you are dropping and say what
replaced it, in a tracked file a reviewer sees in the diff. Retired names are
subtracted from the losses rather than from the baseline, so a case that comes
back stops being reported as retired instead of staying hidden.

It is not a suppression flag in the sense this document warns about elsewhere.
A flag is one token that silences everything; this silences exactly one named
case and leaves the reasoning in the repository. Verified: with the file in
place, deleting an unrelated case still fails with exit 1.

That episode is the reason the CI step carries a warning in its comment.
Regenerating `tests/INVENTORY.md` makes any failure disappear without
answering it, which is precisely how a real loss would be buried. The rule is
to check each reported name against the live tree first, and to say what was
checked -- the baseline moves only after that, never instead of it.

`check-css-sync` had a second, worse problem. Its header says it "ensures
globals.css files are synchronized across **all apps**". It held a hardcoded
list of five — store, studio, landing, payments, admin — and this repository
has **seven** apps with a `globals.css`. `auth` and `playground` were absent,
so the check printed "in sync across all apps" while declining to look at two
of them. That is this document's central failure in its purest form, sitting
inside a gate that was also not running.

Both omitted files happened to be byte-identical to the reference. That is
luck rather than evidence: the check could not have said otherwise, and it was
not running anywhere to say it. The list is now derived from
`git ls-files apps/*/src/app/globals.css`, which is the same reasoning that
keeps the other gates honest — a hand-maintained list drifts from the
repository the moment someone adds an app and does not think of this file.

`check-env-parity` exited **0** when it found fewer than two env files,
printing "nothing to compare". The politest form of the same thing: success
reported from an empty comparison. All four `.env.*` files are tracked in git,
so any checkout that can run the script has them, and their absence means the
working tree is wrong rather than the comparison unnecessary. It now exits 1.

Both were made to fail deliberately before being trusted to pass — a rule
appended to `apps/auth/src/app/globals.css` for the first, a copy of the
second run from a directory with no env files.

---

## The pre-commit hook blocks on errors, not warnings

`lint-staged` used to run `eslint --no-warn-ignored --max-warnings=0` over
staged files. That directly contradicts the staging strategy above: rules are
deliberately left as warnings so they can be driven to zero one at a time, and
a hook that rejects every warning in a touched file makes those files
uneditable.

The practical effect was worse than it sounds. The only way to commit a change
to an E2E spec was `--no-verify`, which skips **Secretlint and the Prettier
check as well**. A gate strict enough to be routinely bypassed protects less
than a gate that runs.

The hook now blocks on errors — which include every promoted rule and the
whole recommended set — while warnings stay visible in `pnpm lint` and in CI's
Quality Checks job, which has always allowed them.

---

## cspell

Now enforced in CI's repo-hygiene step. It reported 70 issues across 36 files;
**one was a real typo** — a test named `"checks granted permissions and leaves
ungrated ones unchecked"`. The rest were vocabulary the config did not know.

Adding the `en-GB` dictionary cleared the British spellings (`serialised`,
`normalises`, `initialises`, `unrecognised`) that a US-only dictionary rejects.

**The Spanish dictionary was tried and rejected.** This app is bilingual and
`cspell.json` hand-maintains a Spanish word list, which does not scale — every
new Spanish string in a component or test trips it. So `@cspell/dict-es-es`
looked like the right fix. It is not: with it enabled, issues went from 70 to
**396**. The remaining Spanish terms are in the word list instead, and the
dependency was removed again.

Proved the gate fires: a comment reading `// intentionaly mispeled coment`
produces three errors, two with suggested corrections.

## Not attempted: the two timing rules

`no-networkidle` (117) and `no-wait-for-timeout` (93) are the largest staged
rules and the main flakiness source. Their shape was measured so whoever picks
them up does not have to:

| Shape                                                                       | Count |
| --------------------------------------------------------------------------- | ----- |
| `goto(…, { waitUntil: "networkidle" })` with an assertion immediately after | 70    |
| `goto` with no immediate assertion                                          | 23    |
| `waitForLoadState("networkidle")` with an assertion after                   | 11    |
| `waitForLoadState` with no assertion                                        | 13    |

The first group is the safe one: the following web-first assertion already
retries, so the `waitUntil` can simply go.

They were deliberately **not** changed in bulk. The E2E suite cannot be run
locally — it needs a live Supabase and the `auth.setup.ts` session artifact —
and the failure mode for wait-condition changes is _intermittent_ flakiness,
which one green CI run does not disprove. Rewriting 70 wait conditions on the
strength of a single pipeline would trade a visible problem for an invisible
one. Do these per app, with someone able to run the suite repeatedly.

---

## jscpd

Configured, and still **not enforced in CI**, but its number is now honest.

It reported 7.75% duplication against a 5% threshold. A chunk of that was the
framework, not the codebase: Next.js requires `layout.tsx`, `error.tsx`,
`global-error.tsx`, `not-found.tsx`, `loading.tsx` and `template.tsx` to exist
as real files at specific paths in every app. Seven apps means seven
near-identical copies of each, and they cannot be deduplicated -- the shared
part is already extracted (`GlobalErrorFallback` lives in
`packages/app-components`; what remains is the `"use client"` directive, a
Sentry `useEffect`, and a default export). Measuring those as duplication
measures Next.js.

Excluding them takes the figure from **7.75% to 6%**.

The remaining 6% is real, and is concentrated in four places:

| Where                                                                                                                  | Clones | What it is                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| `studio` `SectionItems{Accordion,Cards,Gallery,TwoColumn}.tsx`                                                         | 21     | four renderers of the same section data in different layouts |
| `admin` / `payments` report UI (`ReportTable`, `ReportFiltersBar`, `SellerReportFiltersBar`)                           | 10     | two apps with near-identical report screens                  |
| `admin` / `payments` Excel export (`exportOrdersToExcel`, `exportDelegatedOrdersToExcel`, `exportSellerOrdersToExcel`) | 8      | the same worksheet-building code three times                 |
| `packages/ui` (`status-card`, `mini-area-chart`)                                                                       | 4      | variant components                                           |

Driving this under 5% needs component-extraction decisions that are product
calls, not mechanical cleanup -- whether admin's and payments' report screens
_should_ share a component, or are expected to diverge. This repo's own rules
say to favour KISS over DRY and to treat coincidental duplication as something
to leave alone, so the extraction should be a deliberate choice by someone who
knows where those screens are heading.

The Excel exporters are the strongest candidate: three copies of worksheet
construction is knowledge duplication, not coincidence.

---

## CI's change filter had holes

`ci.yml` skips the quality, unit-test, build and E2E jobs for docs-only PRs,
decided by a path filter. The filter listed some tool configs and not others,
so a change to an unlisted one was treated as documentation and went
completely unverified.

This was found the way these things should be: the PR that edited
`.jscpd.json` had every check skipped.

Added to the filter: `.jscpd.json`, `.secretlintrc.*`, `.secretlintignore`,
`.syncpackrc.*`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, `orval.config.*`,
`.prettierrc*`, `.prettierignore`, `.gitattributes`, `.env.ci`, `.husky/**`
and `config/**`.

Two of those matter beyond tidiness. `pnpm-workspace.yaml` defines which
workspaces exist, so adding or removing one would have skipped CI entirely.
`.secretlintrc.*` and `.secretlintignore` configure secret scanning: weakening
them was a docs-only change.

If you add a root-level config file, add it to **both** the `tooling` and
`code` filters in `.github/workflows/ci.yml`. A config that changes behaviour
but not the filter is invisible to CI.

---

## Accessibility

`.claude/rules/testing.md` documented an accessibility testing section, and
`build-checks.md` listed an `accessibility` job in `pr-checks.yml`. Neither
existed: no axe dependency, no a11y test file, no such job. Both documents now
describe what is actually there.

What is actually there: `vitest-axe` runs over the shared components in
`packages/ui` and `packages/app-components`. Those suites are part of the
normal unit-test run, so CI enforces them through **Unit Tests** — there is no
separate job to forget to add.

It found real defects on its first run:

| Component          | Defect                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProgressBar`      | `role="progressbar"` with `aria-valuenow/min/max` and **no accessible name** — a screen reader announced "42%" with no indication of what was progressing (WCAG 4.1.2) |
| `CircularProgress` | **no role at all** — visually a progress indicator, invisible to assistive technology, and with nothing for a checker to find fault with                               |

Both now require an accessible name _in their type_ — exactly one of
`aria-label` or `aria-labelledby`, via `RequiredAccessibleName`. That turns it
into a compile error rather than something to remember, and it immediately
stopped 23 existing renders from compiling.

Use the same type for any new component that declares a value-carrying role
(`progressbar`, `meter`, `slider`).

Both suites include a test that deliberately fails — an unlabelled `<Input>`,
an icon-only `<button>` — so a suite of green assertions cannot quietly stop
checking anything.

### Page level

`@axe-core/playwright` now runs against `landing`'s public routes — home,
terms, privacy — at WCAG 2.1 AA, plus a dark-mode contrast check. Those routes
need no session and no seeded data, so a failure is about the page and nothing
else.

This is a different check from the component suites, not a bigger one. axe
over a rendered component tree cannot see colour contrast computed against the
real theme, focus order across a whole document, or a heading hierarchy that
only exists once a layout composes.

Still to do: the same treatment for the authenticated apps, which need a
session fixture first.

**Both layers earned their place immediately, and on different defects.**

The route checks found white on `--warning` at 3.34:1 — a token pairing, fixed
in `colors.css` and now guarded by `contrast.test.ts`.

The dark-mode check then found two more that **no token test can see**, because
neither is a token pairing at all:

| Element                            | Measured | Cause        |
| ---------------------------------- | -------- | ------------ |
| `RolesSection` paragraphs          | 4.39:1   | `opacity-90` |
| `RolesSection` "coming soon" badge | 3.85:1   | `opacity-70` |

An opacity modifier blends the element — foreground and background together —
toward whatever is behind it. The tokens involved all pass on their own; the
rendered result does not. `.claude/rules/tailwind.md` already warned that
low-opacity text is risky and asked for computed contrast to be verified.
Nothing verified it. Those three modifiers are gone; reach for a muted token
when something needs de-emphasising.

The first failure also exposed a gap in `contrast.test.ts` itself: it paired
`muted-foreground` only with `muted`, when its commonest use by far is on
`background` — secondary copy, captions, help text. Both that and `card` are
now checked.

### Landing's E2E suite had never run

Adding the spec surfaced this. `apps/landing` has had a `playwright.config.ts`
and `navbar-auth-state.spec.ts` all along, but the CI job maps pnpm filter
names to `scripts/e2e.mjs --app` values, and there was no `landing` case — so
it hit the `*)` branch and printed "No E2E suite for landing, skipping."
`e2e.mjs` did not accept `landing` either.

Both now do. If you add a Playwright config to an app, add it in **both**
places or the suite is silently never run.

### A naming hazard, now removed

`Label` in `packages/ui` was a **status badge that rendered a `<span>`**, not a
form label. The name collided with the shadcn convention, where `label.tsx`
_is_ the form label — so anyone importing `Label` to label an input would
silently get no association at all, which is the exact defect the `label` axe
rule exists to catch. That is how it was found: the first draft of the
accessibility suite assumed `Label` was a form label, and axe failed.

It is now `StatusLabel` in `StatusLabel.tsx`. Nothing imported it, so the
rename cost nothing, and it frees `label.tsx` for a real form label — there
isn't one in this package yet, which is worth knowing before building a form
against `ui`. A test pins the shape so the trap cannot come back.

---

## The PR Title check could not see a corrected title

`pr-checks.yml` ran on `[opened, synchronize, reopened]`. `edited` -- the event
GitHub fires when a title, body or base branch changes -- was missing.

So the check that exists specifically to police the PR title validated it once,
at open, and a corrected title could never clear the failure. The only way
through was to push an unrelated commit. `Branch Target` had the same problem
when a PR was retargeted.

Found by hitting it: a title three characters over the 80-character subject
limit stayed red through two corrections, because no run was triggered by
either.

`edited` is now in the trigger list. `changes`, `security` and `summary` opt
out of it, so fixing a typo does not re-run an audit or rewrite the summary
comment.

---

## The timing rules: the rule that makes a wait removable

`no-networkidle` (117) and `no-wait-for-timeout` (93) are being driven down per
app rather than in bulk, for the reason recorded above: the failure mode is
intermittent, and one green pipeline does not disprove it.

`admin` is done — 29 sites to 6. What made it safe is a single distinction,
and it is not "does an assertion follow":

**A wait is redundant only before a _positive_ assertion.** `expect(x)
.toBeVisible()` retries until the thing appears, so whatever the wait was
buying, the assertion buys again.

**A wait before a _negative_ assertion is load-bearing.**
`expect(x).toBeHidden()`, `not.toContain`, `toHaveCount(0)` all pass when the
page has not rendered yet. Remove the settle window and the test does not
become flaky — it becomes a **false pass**, which is worse, because nothing
ever goes red to tell you.

The first pass over `admin` missed this and removed the wait in front of five
negative assertions. The diff was re-read, reverted, and redone with the check
built into the transform. The six waits that remain are annotated in place with
why.

CI then caught a second half of the rule that the first version missed, and
it is the more subtle one.

**The assertion has to _retry_, not merely be positive.**
`expect(url.searchParams.get("status")).toBe("approved")` is a positive
assertion, but it reads `page.url()` once. It never retries. Two admin filter
tests are debounced, so removing the sleep in front of a one-shot read raced
the update and they failed — exactly the intermittent failure this ratchet is
being paced to avoid, surfaced by doing one app at a time.

The fix was not to put the sleep back. `await expect(page).toHaveURL(...)`
retries, so the wait stays gone and the assertion is robust on top. Four
one-shot URL reads in that file are now retrying assertions.

So the full rule is: **a wait is redundant only in front of a positive,
retrying assertion.** A Playwright web-first matcher (`toBeVisible`,
`toHaveURL`, `toHaveText`) retries. A plain `expect()` over a value you already
read does not.

Apply that to `payments` (31) and `auth` (149).

---

## A gate that named the wrong app

Arming `smoke-all-apps` surfaced a real React #418 hydration error — and
attributed it to `landing`, which was wrong by construction.

The listener was registered **inside** the loop:

```ts
for (const [appName, url] of Object.entries(APPS)) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message)); // never removed
```

Every iteration adds another listener and none are removed, so an error thrown
while visiting app N is pushed into the arrays of apps 1..N. `landing` is
first in `APPS`, so it collected all seven apps' errors.

Demonstrated with two throwing pages rather than argued:

```
OLD: {"landing":["boom from landing","boom from store"], "store":["boom from store"]}
NEW: {"landing":["boom from landing"],                   "store":["boom from store"]}
```

There is now one listener, registered before the loop, writing to whichever
app is currently loaded.

**What this cost.** A `test.fixme` was added naming `landing` and describing a
plausible cause — `useCurrentUserPermissions` seeding state from a browser
cookie the server cannot read. Chasing it found nothing, because `landing` was
probably never the culprit: it does not throw in dev, in a production build,
or with a permissions cookie set, and every one of its routes is dynamically
rendered (`ƒ`), so the static-prerender theory was wrong too. The exclusion and
the fixme are gone.

The lesson is not about Playwright listeners. An arming change made a real
failure visible, and the first instinct was to explain the failure rather than
to check whether the thing reporting it was telling the truth. **Verify the
attribution before debugging the accusation.**

<!-- cspell:ignore intentionaly mispeled coment ungrated -->
<!-- The four above are quoted on purpose: three are the deliberate typo
     used to prove the cspell gate fires, and one is the real typo it
     found. Spelling them correctly here would delete the evidence. -->

## Four items that were waiting on someone, resolved

They had been recorded as needing a decision or a credential. Three did not.

**Docker Hub credentials for CI — not needed, and never were.** The
`docker-build` job authenticates to `ghcr.io` with the built-in `GITHUB_TOKEN`
via `docker/login-action`. There is no reference to Docker Hub anywhere in
`.github/workflows/`, `docker/` or `scripts/`, and the job has succeeded in
every recent run on `develop`. Nothing to provide.

**The Clerk test sign-in flake — not reproducing.** It has not failed in the
last six `develop` runs. The switch to `@clerk/testing`'s ticket-based
`emailAddress` mode is the likely reason: the earlier password strategy
silently established no session. Every playwright config also sets
`retries: 2` under CI, so a transient failure of an external service does not
fail the job on its own.

**The feature barrel rule** — measured and settled; see the section above.

**Five orphaned GitHub secrets** — deleted, on the owner's instruction. They
were the `SUPABASE_AUTH_EXTERNAL_*` pair for Google and Discord plus a dev
redirect URI, left behind when Clerk replaced Supabase Auth's own providers.
Nothing read them, which was re-checked before deletion rather than taken from
the earlier note: no workflow, no script, no env file, absent from `.secrets`
and from `sync-secrets.yml`'s `env:` block. The repository went from 61 secrets
to 56.

Deleting them removed them from CI; it revoked nothing. If the matching OAuth
applications are still live in the Google and Discord consoles, those client
secrets remain valid there. See
[Environment System](../environment.md#five-github-secrets-that-were-deleted).

---

## Three gates that ask the wrong question on a release PR

`check-migration-edits`, `check-doc-freshness` and `test-inventory-diff` all
compare the head against the **PR's base**. For a feature branch that is
exactly right. For `develop` → `main` it is exactly wrong: the base is the last
release, so the diff is everything merged since it, and each of those changes
already answered the check when it went into `develop`.

The v2026.09.05.1 release PR is where this surfaced. `check-migration-edits`
failed on thirteen deleted migration files — the squash into
`20260902120000_baseline.sql`, which had been justified, reviewed and merged
weeks earlier. The gate was not wrong about what it saw; it was answering a
question that had already been settled, and answering it as though it were new.

All three now skip when `github.base_ref` is `main`. Pointing them at `develop`
instead would have been worse: on a release PR `develop` **is** the head, so
every one of them would pass while comparing a branch to itself — a vacuous
pass, which is the failure this whole document is about. A skip says so in the
log.

---

## Instructions that point at things that are not there

`.claude/**` and `CLAUDE.md` are loaded into every session. A wrong instruction
there is not a stale comment — it is a confident, wrong direction given to
whoever reads next, and it costs time before anyone works out that the document
was the thing that was wrong.

The knip work turned up the worst case: `.claude/rules/architecture.md` told the
reader to `import type { GlobalMetrics } from "api/types/generated"`, a subpath
`packages/api` declared but whose target directory had never been created. The
example was from a dashboard API this project does not have. No code had
followed the instruction, which is the only reason nothing broke.

Auditing the rest found that it was not alone:

| what was cited                            | reality                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/web`, 12 times across 4 files       | there is no `apps/web`; the reference app is `apps/store`, as CLAUDE.md says |
| `packages/api/src/mutator/customFetch.ts` | it is at `src/rest/mutator/customFetch.ts`                                   |
| `pnpm type-check`                         | the script is `typecheck`                                                    |
| `pnpm dev:admin`                          | no such script                                                               |
| `pnpm test:coverage:<app>` × 5            | no such scripts; per-app coverage is `pnpm --filter <app> test:coverage`     |
| `.claude/tools/skillsmp-mcp.mjs`          | no such tool                                                                 |

The `apps/web` set is the one worth pausing on. `monorepo-architecture.md`
opened with "the `apps/web` application is the **reference standard**", while
CLAUDE.md names `apps/store`. Two instruction files disagreeing about which app
is the standard is worse than either being merely out of date.

`scripts/check-doc-references.mjs` now fails on any cited path or `pnpm` script
that does not exist. It reads **prose only** — fenced code blocks are skipped,
because a skill that generates setup guides shows an example `package.json`
with scripts this repository does not have, and an audit skill shows an example
report row naming a file that never existed. Both are illustrations, not
claims. Paths matched by `.gitignore` are skipped too, since
`.claude/portability-exceptions.json` is documented as deliberately untracked.

Writing that exemption exposed a real formatting bug: a README template in
`generate-setup-guide` had a stray closing fence, so eighty lines of template
content — including a command table citing a `pnpm test:e2e` this repo does not
have — escaped the code block and rendered as live instruction. The fence is
fixed rather than the checker taught to ignore it.

---

## One AeleOS gate that does not port: `check-agent-notes`

AeleOS fails a build when a directory's agent note went unread while code under
it changed. Every `CLAUDE.md` and `AGENTS.md` governs its directory; a change
below one must be accompanied by a change to it. It is a good gate there. It
does not transfer here, for two reasons that are worth writing down so nobody
re-derives them.

**Its central mechanism conflicts with a rule this repo already has.** The
check walks up from a changed file to the nearest governing note and demands an
edit. AeleOS's root `CLAUDE.md` is 118KB of running record, so that demand is
normal there. Libra's root `CLAUDE.md` is a portable template, and
[portability.md](../lessons/portability.md) requires it to stay
project-agnostic — no project names, no dated content, no running record. A
gate that demanded an edit to it on every commit would push exactly the
project-specific churn that rule forbids into the file the rule protects. The
gate would be fighting the codebase's own stated standard, not enforcing it.

**With the root exempted, there is almost nothing left to guard.** Libra has
two notes: the root template and `.claude/tools/CLAUDE.md`. Across the last 200
commits on `develop`, exactly one changed something under `.claude/tools/`
without also editing that note. Roughly 200 lines of script and tests to catch
a drift that occurs half a percent of the time is ceremony, and this document
argues elsewhere that a gate nobody's work meets becomes a gate everybody
learns to satisfy hollowly.

The precondition that would change the answer is real subtree notes — a
`CLAUDE.md` per app or per package, each describing that subtree's actual
invariants. With those in place the gate has bounded, meaningful subjects, the
root exemption stops being load-bearing, and porting it is worth doing. Until
then it would be a check scoped to a directory it already passes, which is the
failure this whole document catalogues.

`check-doc-freshness` covers the adjacent ground in the meantime: it is per
symbol rather than per directory, so it cannot see a note whose subject is a
different file, but it does guard the prose that sits directly above the code
it describes.
