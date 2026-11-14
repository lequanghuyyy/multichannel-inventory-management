import { resolve } from 'node:path';

// Ignored by git and deleted after Playwright. Never place session cookies in source.
export const authStatePath = resolve('.ci/e2e-session.json');
