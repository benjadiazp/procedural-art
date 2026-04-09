/**
 * Prepends #define statements to a GLSL shader string.
 * Useful for injecting compile-time constants into .glsl files imported with ?raw.
 */
export function injectDefines(glsl: string, defines: Record<string, string | number>): string {
  const header = Object.entries(defines)
    .map(([k, v]) => `#define ${k} ${v}`)
    .join('\n');
  return header + '\n' + glsl;
}
