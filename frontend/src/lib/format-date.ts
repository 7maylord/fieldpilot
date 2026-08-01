/* Terse, scannable readouts for the operations UI: 24-hour clock, no seconds,
   month abbreviated. Field crews read these at a glance, not in prose. */

export function formatTimestamp(value: string | Date) {
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDay(value: string | Date) {
  return new Date(value).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
