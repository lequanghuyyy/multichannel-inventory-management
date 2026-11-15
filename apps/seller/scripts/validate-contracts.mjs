import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

// `apps/api/openapi.json` is the live Spring Boot export and the source of the generated
// TypeScript client. Validate it before regenerating so a broken export fails here, not at
// `tsc` time with hundreds of unreadable type errors.
const contracts = [
  '../../../apps/api/openapi.json',
];

for (const contract of contracts) await SwaggerParser.validate(fileURLToPath(new URL(contract, import.meta.url)));
console.log('PASS OpenAPI 3.0 contracts validate');
