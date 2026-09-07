import path from "node:path";

/**
 * Convert a filename stem to kebab-case.
 *
 * Two passes are needed. The first splits a lowercase-or-digit followed by an
 * uppercase letter (`loginForm` -> `login-Form`). The second splits a run of
 * capitals followed by a capital-then-lowercase, which is what separates an
 * acronym from the word after it (`MSWProvider` -> `MSW-Provider`). Without
 * the second pass, `MSWProvider` would collapse to `mswprovider`.
 */
export function toKebab(stem) {
  return stem
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Split a basename into its stem and the whole remaining suffix, so compound
 * extensions survive: `LoginForm.test.tsx` -> `LoginForm` + `.test.tsx`.
 * The search starts at index 1 so a leading dot is never treated as the
 * separator.
 */
function splitBasename(base) {
  const dot = base.indexOf(".", 1);
  return dot === -1 ? [base, ""] : [base.slice(0, dot), base.slice(dot)];
}

export function buildRenamePlan(files) {
  const plan = [];
  const byTarget = new Map();

  for (const file of files) {
    const dir = path.dirname(file);
    const [stem, suffix] = splitBasename(path.basename(file));
    const target = path.posix.join(dir, toKebab(stem) + suffix);

    byTarget.set(target, [...(byTarget.get(target) ?? []), file]);

    if (target !== file) {
      plan.push({
        from: file,
        to: target,
        caseOnly: target.toLowerCase() === file.toLowerCase(),
      });
    }
  }

  const collisions = [...byTarget]
    .filter(([, sources]) => sources.length > 1)
    .map(([target, sources]) => ({ target, sources }));

  return { plan, collisions };
}
