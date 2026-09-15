export function ordinal(n: number) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/** "A, B and C", or "A, B and 3 more" past `max`. */
export function joinNames(names: string[], max = 3) {
  if (names.length <= max) return listFormat.format(names);
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

export const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1);
