/**
 * The catalog's URL write that has been requested but not yet applied.
 *
 * nuqs never writes the URL synchronously: its queue flushes on a timer
 * (nuqs 2.8: `setTimeout(0)`, then the throttle since the last flush). It
 * writes shallow state through `history.replaceState`, which Next's router
 * turns into ACTION_RESTORE — and a restore discards any navigation still in
 * flight. So a product card clicked a moment after typing in the search box
 * navigated, then had that navigation silently undone when the search write
 * landed; the page stayed on the catalog (production E2E, 2026-09-28 and
 * again 2026-10-01). Flushing the search on blur did not close the gap,
 * because the flush itself is deferred.
 *
 * The writer registers each write here; navigation that must not lose that
 * race waits for it first. Module state on purpose: there is one URL.
 */
let pendingWrite: Promise<void> | null = null;

/** Resolves when the write settles, either way, and never rejects. */
async function settle(write: Promise<unknown>): Promise<void> {
  try {
    await write;
  } catch {
    // A failed write must not block navigation; nuqs reports its own errors.
  }
}

export function trackPendingUrlWrite(write: Promise<unknown>): void {
  const tracked = settle(write);
  pendingWrite = tracked;
  tracked.then(() => {
    if (pendingWrite === tracked) pendingWrite = null;
  });
}

/** The write still in flight, or null when the URL is settled. */
export function getPendingUrlWrite(): Promise<void> | null {
  return pendingWrite;
}
