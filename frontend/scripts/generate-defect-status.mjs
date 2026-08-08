#!/usr/bin/env node
// Generates src/generated/defect-status.ts from the single source of truth
// at backend/src/defects/defect-state.ts. Never hand-edit the output — run
// `pnpm --dir frontend defect-status:generate` after changing the backend
// file, or let `defect-status:check` catch the drift in CI.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export function parseDefectState(source) {
  const statusesMatch =
    /export const defectStatuses = \[([\s\S]*?)\] as const;/.exec(source);
  if (!statusesMatch)
    throw new Error('Could not find `defectStatuses` in defect-state.ts');
  const statuses = [...statusesMatch[1].matchAll(/'([a-z_]+)'/g)].map(
    (match) => match[1],
  );

  // ponytail: \s* (not a bare \n) before the closing brace — removing the
  // last row leaves dangling indentation ("  };") that a literal \n\}; misses.
  const transitionsMatch =
    /const transitions: Record<DefectStatus, readonly DefectStatus\[\]> = \{([\s\S]*?)\n\s*\};/.exec(
      source,
    );
  if (!transitionsMatch)
    throw new Error(
      'Could not find the `transitions` table in defect-state.ts',
    );
  const transitions = {};
  for (const line of transitionsMatch[1].split('\n')) {
    const row = /^\s*(\w+): \[([^\]]*)\],?$/.exec(line);
    if (!row) continue;
    const [, from, targetsRaw] = row;
    transitions[from] = [...targetsRaw.matchAll(/'([a-z_]+)'/g)].map(
      (match) => match[1],
    );
  }

  if (Object.keys(transitions).length !== statuses.length)
    throw new Error(
      `defect-state.ts's statuses list and transitions table are out of sync: extracted ${Object.keys(transitions).length} transition rows but ${statuses.length} statuses. Its format changed in a way this generator does not understand — update the regexes in generate-defect-status.mjs.`,
    );

  return { statuses, transitions };
}

function main() {
  const sourcePath = path.join(
    root,
    '../../backend/src/defects/defect-state.ts',
  );
  const outPath = path.join(root, '../src/generated/defect-status.ts');
  const { statuses, transitions } = parseDefectState(
    readFileSync(sourcePath, 'utf8'),
  );

  const output = `// GENERATED FILE — do not edit by hand.
// Source of truth: backend/src/defects/defect-state.ts
// Regenerate with: pnpm --dir frontend defect-status:generate

export const defectStatuses = [
${statuses.map((status) => `  '${status}',`).join('\n')}
] as const;
export type DefectStatus = (typeof defectStatuses)[number];

export const defectTransitions: Record<DefectStatus, readonly DefectStatus[]> = {
${statuses
  .map(
    (status) =>
      `  ${status}: [${transitions[status].map((t) => `'${t}'`).join(', ')}],`,
  )
  .join('\n')}
};
`;
  writeFileSync(outPath, output);
  console.log(`Wrote ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
