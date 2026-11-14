import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const input = resolve(here, '../../../apps/api/internal/transport/openapi.json');
const output = resolve(here, '../src/api/generated/openapi.ts');
mkdirSync(dirname(output), { recursive: true });
rmSync(output, { force: true });

const command = process.platform === 'win32' ? 'cmd.exe' : 'openapi-typescript';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'openapi-typescript', input, '-o', output]
  : [input, '-o', output];
const result = spawnSync(command, args, { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
