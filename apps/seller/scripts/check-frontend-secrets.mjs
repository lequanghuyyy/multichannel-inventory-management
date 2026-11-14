import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const excluded = file => !file.includes('/node_modules/') && !file.includes('\\node_modules\\') && !file.startsWith('apps/seller/dist/') && !file.startsWith('apps/seller/coverage/');

/**
 * git ls-files is the honest file list: it is what the repository will actually ship, and it
 * skips everything the ignore rules exclude. But this checkout has no .git — a working copy
 * handed over as a directory — and a gate that cannot run is not a gate. So the same policy is
 * applied to a filesystem walk when git is absent, covering the same subtree.
 *
 * The policy itself is unchanged either way: a gate that weakened its rule when it could not
 * reach its preferred file list would be worse than no gate.
 */
function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage' || entry === '.git') continue;
    const absolute = resolve(directory, entry);
    if (statSync(absolute).isDirectory()) found.push(...walk(absolute));
    else found.push(relative(root, absolute).split(sep).join('/'));
  }
  return found;
}

let files;
try {
  files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'apps/seller'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(excluded);
} catch {
  files = walk(resolve(root, 'apps/seller')).filter(excluded);
}

// A tracked-file list says nothing about a developer's machine: an untracked .env.local or an
// already-built dist/ is exactly where a key lands and is exactly what never reaches the repo.
// Both are read directly, and both are excluded from the "unexpected VITE_ variable" rule below
// because they are configuration, not committed source.
const localEnvFiles = ['.env', '.env.local', '.env.development', '.env.production']
  .map(name => `apps/seller/${name}`)
  .filter(file => existsSync(resolve(root, file)));

const bundleFiles = [];
function collectBundleFiles(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) collectBundleFiles(absolute);
    else if (/\.[cm]?js$/.test(entry)) bundleFiles.push(relative(root, absolute).split(sep).join('/'));
  }
}
collectBundleFiles(resolve(root, 'apps/seller/dist'));

const forbidden = /\bVITE_[A-Z0-9_]*(?:PASSWORD|SECRET|PRIVATE_KEY|API_KEY|TOKEN)\b|\b(?:VITE_OPENAI|VITE_NIXTLA|VITE_AWS_SECRET|VITE_DATABASE_URL)\b/i;
const viteVariable = /\bVITE_[A-Z0-9_]+\b/g;
// A session token in web storage survives logout in a way a cookie does not, so storing one
// there is treated as a leak even when the name looks harmless.
const unsafeSessionStorage = /\b(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|getItem)\s*\([^\n)]*(?:auth|bearer|session|token)/i;

const findings = [];
for (const file of [...files, ...localEnvFiles, ...bundleFiles]) {
  if (!/\.(?:[cm]?[jt]sx?|json|ya?ml|env|html|css)$/i.test(file) || file.endsWith('.env.example') || file.endsWith('check-frontend-secrets.mjs')) continue;
  const absolutePath = file.startsWith(root) ? file : resolve(root, file);
  if (!existsSync(absolutePath)) continue;
  const content = readFileSync(absolutePath, 'utf8');
  const isLocalConfig = localEnvFiles.includes(file);
  if (forbidden.test(content)) findings.push(file);
  if (!isLocalConfig) {
    const unexpectedViteVariable = [...content.matchAll(viteVariable)].map(match => match[0]).some(name => name !== 'VITE_API_URL');
    if (unexpectedViteVariable || (!/\.test\.[cm]?[jt]sx?$/.test(file) && unsafeSessionStorage.test(content))) findings.push(file);
  }
}

if (findings.length > 0) {
  console.error(`Frontend secret-name policy failed in ${[...new Set(findings)].join(', ')}. Do not put secrets in VITE_* configuration.`);
  process.exit(1);
}

console.log(`PASS frontend secret policy (${files.length} Seller source files, ${localEnvFiles.length} local env files, ${bundleFiles.length} built bundle files checked)`);