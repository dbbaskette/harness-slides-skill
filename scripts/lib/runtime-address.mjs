// The one address callers are given for the installed runtime.
// The installer keeps the code in <shared>/versions/<id> and points <shared>/current at it; an update installs a new
// folder, moves the pointer and removes the old folder. Node resolves links before it runs a script, so code sees
// itself in the versioned folder. Anything handed to a caller or written into a project names <shared>/current
// instead, which keeps working after an update. A source checkout, or a copy the pointer does not select, is itself.
import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
export async function stableRuntime(runtime) {
  const actual = await realpath(runtime), versions = dirname(actual);
  if (basename(versions) !== 'versions') return actual;
  const current = join(dirname(versions), 'current');
  try { if ((await lstat(current)).isSymbolicLink() && await realpath(current) === actual) return current; } catch { /* No pointer selects this copy. */ }
  return actual;
}
