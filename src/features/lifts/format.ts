/** The device locale decides the format; the app never hardcodes one. */
export function formatDate(when: string | Date): string {
  return (typeof when === 'string' ? new Date(when) : when).toLocaleDateString();
}

/** A row's quieter second line, or nothing at all when there is nothing to put on it. */
export function joinNote(parts: readonly (string | null)[]): string | null {
  const present = parts.filter((part): part is string => part !== null);
  return present.length === 0 ? null : present.join(' · ');
}
