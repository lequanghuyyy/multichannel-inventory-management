import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Canonical contract: exported from the running Spring Boot app with
//   curl -s http://127.0.0.1:8085/api/v1/openapi.json -o apps/api/openapi.json
// (see apps/api/README or the phase-05 runbook). Never edit the generated output by hand.
const here = dirname(fileURLToPath(import.meta.url));
const input = resolve(here, '../../api/openapi.json');
const output = resolve(here, '../src/api/generated/openapi.server.ts');
mkdirSync(dirname(output), { recursive: true });
rmSync(output, { force: true });

const command = process.platform === 'win32' ? 'cmd.exe' : 'openapi-typescript';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'openapi-typescript', input, '-o', output]
  : [input, '-o', output];
const result = spawnSync(command, args, { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
