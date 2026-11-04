import { readFile, writeFile } from 'node:fs/promises';
import openapiTS from 'openapi-typescript';

const schema = new URL('../../contracts/dashboard.openapi.json', import.meta.url);
const output = new URL('../../src/api/generated.ts', import.meta.url);
const document = JSON.parse(await readFile(schema, 'utf8'));
function checkRefs(value) {
  if (!value || typeof value !== 'object') return;
  if ('$ref' in value && !value.$ref.startsWith('#/')) throw new Error('Only local contract references are allowed.');
  for (const child of Object.values(value)) checkRefs(child);
}
checkRefs(document);
const source = await openapiTS(document, {
  defaultNonNullable: false,
  fetch: async () => { throw new Error('Type generation must be offline.'); },
});
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== source) {
    throw new Error('Generated API types are outdated. Run npm run generate:api.');
  }
  console.log('Generated API types match the pinned OpenAPI contract.');
} else {
  await writeFile(output, source);
  console.log('Generated src/api/generated.ts from contracts/dashboard.openapi.json.');
}
