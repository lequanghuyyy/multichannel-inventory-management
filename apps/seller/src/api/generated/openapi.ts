/**
 * Canonical API types for the seller app.
 *
 * `openapi.server.ts` is generated from the live Spring Boot contract
 * (`apps/api/openapi.json`, exported from `/api/v1/openapi.json`). It is authoritative for every
 * endpoint the Java backend actually serves and MUST NOT be edited by hand.
 *
 * `openapi.legacy.ts` is the frozen contract from the prototype client. It keeps the
 * not-yet-migrated screens (channel connectors, sync, reports, reservations) compiling while the
 * backend endpoints they describe are still outstanding. Paths and schemas that exist on the
 * server always win, so a migrated screen can never silently keep using the old shape.
 *
 * When a legacy endpoint is implemented in Spring Boot, it moves into `openapi.server.ts` on the
 * next generation and the legacy copy stops being referenced; once none are left, delete
 * `openapi.legacy.ts` and the merge below.
 */
import type {
  paths as ServerPaths,
  components as ServerComponents,
  operations as ServerOperations,
} from './openapi.server';
import type {
  paths as LegacyPaths,
  components as LegacyComponents,
  operations as LegacyOperations,
} from './openapi.legacy';

type LegacyOnlyPath = keyof LegacyPaths extends infer K ? (K extends keyof ServerPaths ? never : K) : never;
type MergedPathName = keyof ServerPaths | LegacyOnlyPath;
export type paths = {
  [Path in MergedPathName]: Path extends keyof ServerPaths
    ? ServerPaths[Path]
    : Path extends keyof LegacyPaths
      ? LegacyPaths[Path]
      : never;
};
export type components = {
  schemas: Omit<LegacyComponents['schemas'], keyof ServerComponents['schemas']> & ServerComponents['schemas'];
};
export type operations = Omit<LegacyOperations, keyof ServerOperations> & ServerOperations;
export type webhooks = Record<string, never>;
export type $defs = Record<string, never>;
