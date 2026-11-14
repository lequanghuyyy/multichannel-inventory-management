import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

const contracts = [
  '../../../apps/api/internal/transport/openapi.json',
  '../../../docs/contracts/reservations.proposed.openapi.json',
  '../../../docs/contracts/seller-app.proposed.openapi.json',
];

for (const contract of contracts) await SwaggerParser.validate(fileURLToPath(new URL(contract, import.meta.url)));
console.log('PASS OpenAPI 3.0 contracts validate');
