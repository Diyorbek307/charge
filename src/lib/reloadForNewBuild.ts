/**
 * After a deploy, a page opened earlier still asks for the old build's files,
 * which are gone: "Failed to fetch dynamically imported module". Reloading gets
 * the new build. Once a minute at most, so a real outage does not loop.
 */
const KEY = 'voli-build-reload';
// The last two: a part of the old build paired with a part of the new one has no default export to read.
const CHUNK = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|of undefined \(reading 'default'\)|undefined is not an object \(evaluating '[^']*\.default'\)/i;

export function isMissingBuildFile(err: unknown) {
  return CHUNK.test(String((err as Error)?.message ?? err));
}

/** Reloads the page when `err` is a missing build file; true when it did. */
export function reloadForNewBuild(err: unknown) {
  if (!isMissingBuildFile(err)) return false;
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY) ?? 0);
  } catch {
    /* storage blocked: reload anyway, the minute guard is lost */
  }
  if (Date.now() - last < 60_000) return false;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* see above */
  }
  window.location.reload();
  return true;
}
