/**
 * Registers the `@/` alias resolve hook for the current process.
 *
 * Used via `node --import ./dist/runtime/register-alias.js dist/main.js`, and via
 * `NODE_OPTIONS` for watched development runs, so development and production
 * execute through exactly the same module-resolution path.
 *
 * This file must stay free of aliased imports: it runs before the app graph loads.
 */
import { register } from 'node:module';

register('./alias-hooks.js', import.meta.url);