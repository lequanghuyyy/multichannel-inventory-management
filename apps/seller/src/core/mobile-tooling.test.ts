// Tooling compatibility only: not an iOS build or runtime test.
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);

it('keeps Capacitor production packaging local to the Vite bundle', () => {
  const config = readFileSync(resolve(import.meta.dirname, '../../capacitor.config.ts'), 'utf8');
  expect(config).toMatch(/webDir:\s*['"]dist['"]/);
  expect(config).not.toMatch(/server\s*:\s*\{[^}]*\burl\s*:/);
});

it('labels browser viewport checks as non-native evidence', () => {
  const playwright = readFileSync(resolve(import.meta.dirname, '../../playwright.config.ts'), 'utf8');
  expect(playwright).toContain("name: 'mobile-390x844'");
  expect(playwright).not.toContain('ios-native');
});

it('the patched UUID dependency keeps xcode project ID generation working', () => {
  const xcode = require('xcode');
  const project = xcode.project('not-read-in-this-test.pbxproj');
  project.hash = { project: { objects: {} } };
  const identifiers = new Set<string>();
  for (let index = 0; index < 100; index += 1) {
    const id: string = project.generateUuid();
    expect(id).toMatch(/^[A-F0-9]{24}$/);
    identifiers.add(id);
  }
  expect(identifiers.size).toBe(100);
});
