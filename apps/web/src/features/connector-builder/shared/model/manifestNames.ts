// The engine's rule for node and parameter names (ManifestParser.js). Checked here too, so
// the form says it while the name is typed rather than a test run refusing the manifest.
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export function isValidManifestName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

/** A valid name close to what was typed, e.g. `v1_balance_history` for `v1/balance/history`. */
export function suggestManifestName(name: string): string | null {
  const suggestion = name
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^[^A-Za-z]+/, '')
    .replace(/_+$/, '');
  return suggestion === '' ? null : suggestion;
}

function ruleWithExample(name: string): string {
  const suggestion = suggestManifestName(name);
  return (
    'Use only letters, digits and underscores, starting with a letter' +
    (suggestion ? ` — for example ${suggestion}.` : '.')
  );
}

export function nodeNameProblem(name: string, existing: string[]): string | null {
  if (existing.includes(name)) return `A node named "${name}" already exists`;
  if (isValidManifestName(name)) return null;
  return `${ruleWithExample(name)} Put the API path in the node's Request.`;
}

export function parameterNameProblem(name: string): string | null {
  if (isValidManifestName(name)) return null;
  return `${ruleWithExample(name)} Templates refer to the parameter by this name.`;
}

/** Why a connector name cannot be saved, or null when it can. */
export function connectorNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Enter a name. Use letters, digits and underscores, and start with a letter.';
  }
  if (!isValidManifestName(trimmed)) return ruleWithExample(trimmed);
  return null;
}

/**
 * The title stored with a new connector. A blank title is saved as the name, and the
 * form has to show that same text — otherwise the placeholder looks like a title the
 * product did not keep.
 */
export function manifestWithDisplayTitle<T extends { name: string; title?: string }>(
  manifest: T
): T {
  if ((manifest.title ?? '').trim() || !manifest.name.trim()) return manifest;
  return { ...manifest, title: manifest.name.trim() };
}
