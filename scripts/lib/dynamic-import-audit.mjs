// scripts/lib/dynamic-import-audit.mjs
import { SyntaxKind } from "ts-morph";

/**
 * Find every `import(...)` expression in the project.
 *
 * ts-morph rewrites a specifier that is a plain string literal when the target
 * file moves. Anything computed — a template literal, an identifier, a
 * concatenation — is invisible to it and must be checked by hand.
 */
export function auditDynamicImports(project) {
  const found = [];

  for (const sourceFile of project.getSourceFiles()) {
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;

      const [argument] = call.getArguments();
      found.push({
        file: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
        text: call.getText(),
        static: argument?.getKind() === SyntaxKind.StringLiteral,
      });
    }
  }

  return found;
}
