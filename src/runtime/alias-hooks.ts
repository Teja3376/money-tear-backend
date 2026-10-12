import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ResolveHook } from 'node:module';

const ALIAS_PREFIX = '@/';

const COMPILED_ROOT = new URL('../', import.meta.url);

const EXTENSION_CANDIDATES = ['', '.js', '.ts', '/index.js', '/index.ts'];

function firstExisting(url: URL): URL | null {
  for (const suffix of EXTENSION_CANDIDATES) {
    const candidate = new URL(url.href + suffix);
    if (existsSync(fileURLToPath(candidate))) {
      return candidate;
    }
  }
  return null;
}

function formatFor(url: URL): string | undefined {
  return url.href.endsWith('.ts') ? 'module-typescript' : undefined;
}

function resolveAlias(specifier: string): URL | null {
  const relativePath = specifier.slice(ALIAS_PREFIX.length);
  // An authored alias may or may not carry an extension; probe both.
  return firstExisting(new URL(relativePath, COMPILED_ROOT));
}

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  if (specifier.startsWith(ALIAS_PREFIX)) {
    const resolvedAlias = resolveAlias(specifier);
    if (resolvedAlias) {
      return {
        url: resolvedAlias.href,
        format: formatFor(resolvedAlias),
        shortCircuit: true,
      };
    }
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (context.parentURL?.startsWith('file:')) {
      const resolvedRelative = firstExisting(new URL(specifier, context.parentURL));
      if (resolvedRelative) {
        return {
          url: resolvedRelative.href,
          format: formatFor(resolvedRelative),
          shortCircuit: true,
        };
      }
    }
  }

  return nextResolve(specifier, context);
};
