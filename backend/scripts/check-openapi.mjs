import { readFile } from 'node:fs/promises';

const document = JSON.parse(await readFile('openapi.json', 'utf8'));
const httpMethods = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
]);
const operations = Object.entries(document.paths ?? {}).flatMap(
  ([path, methods]) =>
    Object.entries(methods)
      .filter(([method]) => httpMethods.has(method))
      .map(([method, operation]) => ({
        key: `${method.toUpperCase()} ${path}`,
        method,
        operation,
      })),
);

const schemaCount = Object.keys(document.components?.schemas ?? {}).length;
const requestBodyCount = operations.filter(
  ({ operation }) => operation.requestBody,
).length;
const missingSummary = operations.filter(({ operation }) => !operation.summary);
const missingSuccessContent = operations.filter(({ operation }) => {
  const success = Object.entries(operation.responses ?? {}).find(([status]) =>
    /^2\d\d$/.test(status),
  );
  return !success?.[1]?.content;
});
const blankResponseDescriptions = operations.filter(({ operation }) =>
  Object.values(operation.responses ?? {}).some(
    (response) => !response.description,
  ),
);

const failures = [
  schemaCount < 50 && `expected at least 50 schemas, found ${schemaCount}`,
  requestBodyCount < 45 &&
    `expected at least 45 request bodies, found ${requestBodyCount}`,
  missingSummary.length &&
    `missing operation summaries: ${missingSummary.map(({ key }) => key).join(', ')}`,
  missingSuccessContent.length &&
    `missing 2xx response content: ${missingSuccessContent
      .map(({ key }) => key)
      .join(', ')}`,
  blankResponseDescriptions.length &&
    `blank response descriptions: ${blankResponseDescriptions
      .map(({ key }) => key)
      .join(', ')}`,
].filter(Boolean);

if (failures.length) {
  console.error(
    `OpenAPI documentation is incomplete:\n- ${failures.join('\n- ')}`,
  );
  process.exit(1);
}

console.info(
  `OpenAPI documentation check passed (${operations.length} operations, ${schemaCount} schemas, ${requestBodyCount} request bodies).`,
);
