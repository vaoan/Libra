/**
 * Quote one argument for cmd.exe. Node's spawn hands `cmd.exe /c pnpm …`
 * a space-joined line, and cmd then parses it: a bare `|` becomes a pipe,
 * `&` a command separator, a space a new argument. The first production
 * E2E run (2026-09-28) lost its whole `--grep-invert` regex this way and
 * ran `google-login` as a command. Wrap anything cmd would interpret in
 * double quotes, escaping embedded quotes.
 */
const NEEDS_QUOTES = /[\s|&<>^()"]/;

export function quoteForCmd(arg) {
  if (!NEEDS_QUOTES.test(arg)) return arg;
  return `"${arg.replaceAll('"', '\\"')}"`;
}
