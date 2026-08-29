// Runs every test file in this directory; exits non-zero if any fails.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => /^(test|audit)-.*\.mjs$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.error(`FAIL: ${f}`); }
}
console.log(failed ? `\n${failed} suite(s) failed` : `\nAll ${files.length} suites passed`);
process.exit(failed ? 1 : 0);
