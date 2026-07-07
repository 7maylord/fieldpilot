export function nextCheckpointSequence(
  current: bigint,
  changes: readonly bigint[],
) {
  return changes.reduce(
    (latest, sequence) => (sequence > latest ? sequence : latest),
    current,
  );
}
