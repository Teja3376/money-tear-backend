/**
 * Node.js ESM resolve hook.
 *
 * `tsc` never rewrites TypeScript path aliases, so an authored
 * `import { UsersModule } from '@/modules/users/users.module'` is emitted
 * verbatim as `@/...` and would fail to resolve at runtime under ESM.
 *
 * This hook maps `@/*` onto the compiled output directory and probes for file
 * extensions on relative specifiers, so the extensionless authoring style used
 * in `src/` runs unchanged in both development and production.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ResolveHook } from 'node:module';

/** Alias prefix declared in `tsconfig.json` -> `paths`. */
const ALIAS_PREFIX = '@/';

/**
 * When running from `dist/runtime/`, the compiled source root is one level up.
 * When running from `src/runtime/` (ts-node/vitest), the source root is also one
 * level up, which keeps the mapping identical in both layouts.
 */
const COMPILED_ROOT = new URL('../', import.meta.url);

/** Probed in order; the first existing candidate wins. */
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

/**
 * Formats are only declared for TypeScript sources.
 *
 * Deliberately *not* forced to `'module'` for `.js`: the compiled output lives in
 * a `"type": "module"` package but still pulls in CommonJS dependencies
 * (`tslib`, TypeORM's CJS entrypoints). Letting Node infer the format from the
 * nearest `package.json` keeps that interop working - forcing `module` makes Node
 * treat CommonJS files as ESM and fail on their default exports.
 */
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