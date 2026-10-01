// scripts/lib/dynamic-import-audit.mjs
import { SyntaxKind } from "ts-morph";

/**
 * Find every `import(...)` expression and `import("...")` type node in the
 * project.
 *
 * Two kinds of specifier need a human:
 *
 *  - **computed** specifiers — a template literal, an identifier, a
 *    concatenation. ts-morph cannot see through them at all.
 *  - **non-relative** specifiers — a path alias. `SourceFile.move()` only
 *    rewrites relative specifiers, and the rename engine's pass 3 only covers
 *    `ImportDeclaration`/`ExportDeclaration` nodes, so an aliased `import()`
 *    is rewritten by nobody.
 *
 * Each entry therefore carries both `static` (is the argument a string
 * literal?) and `specifier` (its value, or `null` when computed), so callers
 * can report both categories. Filtering on `static` alone silently discards
 * exactly the aliased ones.
 */
export function auditDynamicImports(project) {
  const found = [];

  for (const sourceFile of project.getSourceFiles()) {
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;

      const [argument] = call.getArguments();
      const isStatic = argument?.getKind() === SyntaxKind.StringLiteral;
      found.push({
        file: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
        text: call.getText(),
        kind: "call",
        static: isStatic,
        specifier: isStatic ? argument.getLiteralValue() : null,
      });
    }

    for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.ImportType)) {
      const argument = node.getArgument();
      const literal = argument?.asKind?.(SyntaxKind.LiteralType)?.getLiteral();
      const isStatic = literal?.getKind() === SyntaxKind.StringLiteral;
      found.push({
        file: sourceFile.getFilePath(),
        line: node.getStartLineNumber(),
        text: node.getText(),
        kind: "type",
        static: isStatic,
        specifier: isStatic ? literal.getLiteralValue() : null,
      });
    }
  }

  return found;
}

/**
 * Split an audit into the two buckets that need reporting: computed
 * specifiers, and static-but-non-relative ones (path aliases).
 */
export function partitionDynamicImports(entries) {
  const computed = entries.filter((entry) => !entry.static);
  const aliased = entries.filter(
    (entry) => entry.static && !entry.specifier.startsWith("."),
  );
  return { computed, aliased };
}
