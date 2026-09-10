/**
 * Colour arithmetic the design tokens cannot express. React Native has no
 * `color-mix`, so a token used at partial strength has to be spelled out as an
 * `rgba()` string — and spelling it out in one place keeps the alpha readable
 * at the call site instead of buried in a hard-coded literal.
 */

/** A hex token as a translucent colour: RN needs the alpha baked into the string. */
export function wash(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
