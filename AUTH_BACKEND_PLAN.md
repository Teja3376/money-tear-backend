# MoneyTear — Authentication Backend Plan

Phase: design agreed, implementation in progress.
Scope: phone-OTP identity (Supabase Auth) → NestJS API → TypeORM → Supabase PostgreSQL.

---

## 1. Audit findings (Phase 1)

| Area | Finding | Consequence |
|---|---|---|
| Repo | Git repo exists on `main` but **has zero commits** | Migration files must be committed by the user; nothing is versioned yet |
| `src/` | Stray compiled `*.js` next to `*.ts` (from a `tsc` run with no `outDir`) | Removed; builds now emit only to `dist/` |
| `public` schema | **Completely empty** — no tables at all | `src/modules/profile/*` was never migrated; it is dead code superseded by the `users` table |
| DB role | `.env` connects as `postgres` (`rolbypassrls = true`, member of `anon`/`authenticated`/`service_role`) | RLS is **not** a defence here. Authorization is enforced in NestJS guards, and RLS is enabled as defence-in-depth for direct client access |
| `auth.users` FK | Verified `has_table_privilege(..., 'REFERENCES') = true` — FK creation succeeds | The identity FK is **kept** |
| Runtime | `package.json` has `"type": "module"` but `tsconfig` said `module: commonjs` | The old build emitted CJS into an ESM package: `start:prod` (`node dist/main`) could not work. Fixed via ESM + runtime resolver hook |
| Toolchain | TypeScript 6.0.3 — `baseUrl` is deprecated (TS5101) | `paths` used without `baseUrl` |

## 2. Target architecture

```
Expo app ──phone OTP──> Supabase Auth (identity provider)
                              │ issues access token (JWT)
                              ▼
                     NestJS API  /api/*
                     ├─ JwtAuthGuard        verify token (JWKS, no network call per request after cache warm)
                     ├─ RecentAuthGuard     step-up auth policy
                     ├─ AccountStatusGuard  active / suspended / disabled
                     ├─ ZodValidationPipe   runtime validation == OpenAPI schema
                     ├─ ThrottlerGuard      per-IP limits
                     └─ AuditService        auth_audit_events
                              ▼
                     TypeORM (synchronize: false) ──> Supabase PostgreSQL
```

Supabase Auth owns OTP, identity rows and token issuance. NestJS owns **authorization**, profile, PIN and audit. No competing OTP system is introduced.

## 3. Authentication sequence

1. Client performs OTP request/verify **directly against Supabase Auth** (`signInWithOtp` / `verifyOtp`). SMS is never proxied by this backend.
2. Client sends `Authorization: Bearer <supabase_access_token>` to `/api/*`.
3. `JwtAuthGuard` → `SupabaseJwtVerifier`:
   - Asymmetric tokens: `createRemoteJWKSet(${SUPABASE_URL}/auth/v1/.well-known/jwks.json)` with `cacheMaxAge` + `cooldownDuration` → **signing-key rotation is handled safely**, and a rotated key never invalidates live sessions (unlike a cached-key-only design).
   - Legacy HS256 tokens: supported **only** when `SUPABASE_JWT_SECRET` is set, and never used as a fallback when JWKS is configured (prevents algorithm confusion).
   - Validates `iss` = `${SUPABASE_URL}/auth/v1`, `aud` = `authenticated`, `exp`, `nbf`, and signature. Payload is read **only after** verification.
   - Result is a typed `AuthenticatedUser { userId, phone, email, phoneVerified, provider, sessionId, authTime }`. A token whose `sub` is not a UUID is rejected.
4. `AccountStatusGuard` rejects `suspended` / `disabled` app accounts with 403.
5. `RecentAuthGuard` enforces the step-up policy (`auth_time` within `AUTH_RECENT_AUTH_WINDOW_SECONDS`, default 300s) for PIN setup and PIN reset.

`POST /api/auth/logout` records an audit event and returns the server-side revocation contract. It does **not** clear mobile secure storage (mobile is out of scope) and does not claim to revoke Supabase refresh tokens.

## 4. Entities

```
auth.users (Supabase-owned, never written directly)
    │ 1:1  FK ON DELETE CASCADE  (privilege verified)
    ▼
users ──1:1──> user_security
   │  (referenced by)
   ▼
auth_audit_events.user_id  (nullable, ON DELETE SET NULL)
```

- **`users`** — `id uuid PK` (FK → `auth.users.id`), `phone text`, `email text`, `first_name`, `last_name`, `date_of_birth date`, `role text` (default `user`), `status text` (active|suspended|disabled), `onboarding_completed_at timestamptz`, `created_at`, `updated_at`, `deleted_at`.
- **`user_security`** — `user_id uuid PK/FK`, `pin_hash text`, `pin_set_at timestamptz`, `failed_pin_attempts int`, `locked_until timestamptz`, `updated_at`.
- **`auth_audit_events`** — `id uuid PK`, `user_id uuid NULL`, `event_type text`, `success boolean`, `ip_address inet NULL`, `user_agent text NULL`, `metadata jsonb` (allowlisted keys only), `created_at timestamptz`. Indexes on `(user_id, created_at)` and `(event_type, created_at)`.

All columns are explicit `snake_case`; all timestamps are `timestamptz`; all IDs are UUID. `pin_hash` is never returned by any DTO.

## 5. API contracts (global prefix `/api`, no versioning)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api` | – | Service metadata |
| GET | `/api/health/live` | – | Liveness (process up) |
| GET | `/api/health/ready` | – | Readiness (DB `SELECT 1`) — distinguishes app availability from DB connectivity |
| POST | `/api/auth/bootstrap` | Bearer | Idempotently create/return the app user |
| GET | `/api/auth/me` | Bearer | Current user + profile completeness + PIN status + account status |
| POST | `/api/auth/logout` | Bearer | Audit session termination |
| GET | `/api/users/me` | Bearer | Profile |
| PATCH | `/api/users/me` | Bearer | Allowlisted profile update |
| POST | `/api/security/pin/setup` | Bearer + recent auth | Set first PIN |
| POST | `/api/security/pin/verify` | Bearer | Verify PIN, open short-lived server-side unlock state |
| POST | `/api/security/pin/change` | Bearer | Current + new PIN |
| POST | `/api/security/pin/reset` | Bearer + recent auth | Renewed-identity reset |
| GET | `/api/security/pin/status` | Bearer | `configured` only |

### PIN unlock state (explicit)

`POST /api/security/pin/verify` creates a **server-recognized** state: `PinUnlockService` stores `unlockedUntil = now + AUTH_PIN_UNLOCK_TTL_SECONDS` in a server-side TTL store keyed by user id. The response boolean is a *mirror* of server state, never the authorization itself. The state is invalidated on change/reset/setup. It is in-memory per instance (documented limitation) and no endpoint in this phase requires it yet — it exists so future high-risk operations can call `PinUnlockedGuard`.

### Security policies

- PIN: exactly 4 digits (`/^[0-9]{4}$/`), hashed with **Argon2id** (`@node-rs/argon2`, `algorithm: Argon2id`). Generic "invalid PIN" errors — never distinguishes "wrong PIN" from "locked".
- Lockout: `AUTH_PIN_MAX_ATTEMPTS` (5) failures → locked for `AUTH_PIN_LOCK_SECONDS` (900s), tracked in the DB. The counter is incremented by a **database expression** (`failed_pin_attempts + 1 ... RETURNING`) so simultaneous attempts cannot race past the threshold. The attempt that trips the lockout returns 429 immediately instead of another 401, so a client stops at once.
- Throttling: global per-IP via `@nestjs/throttler`; the four PIN routes carry a stricter per-route limit (`PIN_RATE_LIMIT_MAX`) via `@ThrottleSecuritySensitive()`. The per-user lockout counter is the second axis.
- Rate-limit and lockout responses use 429 with `Retry-After`, emitted by `AllExceptionsFilter` from `PinLockedException`.
- CORS is an explicit allowlist (`CORS_ORIGINS`); no wildcard with credentials. `helmet` sets security headers.
- Errors are normalized by one exception filter: `{ statusCode, error, message, requestId, path, timestamp }`. Stack traces are logged server-side only, and every response carries a correlation id (`X-Request-Id`, client value honoured or generated).
- **Authentication is global and opt-out**: `JwtAuthGuard` is an `APP_GUARD`; a route is public only via `@Public()`. This inverts the failure mode so a newly added controller cannot silently ship unauthenticated. Guard order: throttle → verify token → account status.

## 6. Swagger / OpenAPI design

- `src/swagger.ts` owns the `DocumentBuilder` + `SwaggerModule` setup (kept out of `main.ts`).
- `SwaggerModule.setup('api/docs', app, document, { useGlobalPrefix: false })` → **`/api/docs`**, with `useGlobalPrefix: false` so the global prefix is *not* re-applied (this is what prevents `/api/api/docs`).
- JSON at **`/api/docs-json`**.
- `addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })` — matches the `Authorization: Bearer` header read by `JwtAuthGuard`.
- Schemas come from **zod**: `z.toJSONSchema(schema, { target: 'openapi-3.0' })` is projected onto DTO classes by `createZodDto`, so documented schemas are derived from the same source of truth as runtime validation. `io: 'input'` means optional/defaulted fields are documented as optional.
- No secrets in the document; no example credentials.
- Production: `SWAGGER_ENABLED=false` disables it, but the plan is deployment-level restriction (internal-only network/ingress). An obscure path is **not** treated as security.

## 7. ESM + alias strategy (the risky part, resolved empirically)

- `tsconfig`: `module: ESNext`, `moduleResolution: bundler`, `paths: {"@/*": ["./src/*"]}` (no `baseUrl` — deprecated in TS6). This permits the preferred extensionless form `import { UsersModule } from '@/modules/users/users.module';`.
- **Proven constraint:** under `moduleResolution: nodenext`, `@/x` *without* `.js` fails to typecheck (TS2307). Emitting CJS into `"type": "module"` is also broken. So `bundler` + a runtime resolver is the only combination that satisfies the requested import style *and* actually runs.
- `tsc` does **not** rewrite path aliases, so `src/runtime/alias-hooks.ts` registers a Node `module.register()` resolve hook mapping `@/*` → `dist/*`, plus extension probing for extensionless relative specifiers. Wired via `--import ./dist/runtime/register-alias.js`, which `NODE_OPTIONS` supports, so dev and prod use the identical mechanism.
- Verified: built app starts under ESM and resolves both alias and extensionless imports.

## 8. Configuration & environment variables

Validated at boot with **zod** — the process exits with a clear message when a required value is missing. `.env` stays gitignored; `.env.example` carries placeholders only.

Required: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `SUPABASE_URL`.
Recommended: `SUPABASE_ANON_KEY` (client-side publishable key — the backend does not need it to verify tokens; it is validated for format only), `SUPABASE_JWT_SECRET` (legacy HS256 only).
Optional: `AUTH_JWT_AUDIENCE`, `AUTH_RECENT_AUTH_WINDOW_SECONDS`, `AUTH_PIN_MAX_ATTEMPTS`, `AUTH_PIN_LOCK_SECONDS`, `AUTH_PIN_UNLOCK_TTL_SECONDS`, `RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX`, `PIN_RATE_LIMIT_MAX`, `CORS_ORIGINS`, `SWAGGER_ENABLED`, `OBSERVE_APP_KEY`, `OBSERVE_APP_SECRET`.

`SUPABASE_SERVICE_ROLE_KEY` is deliberately **not** required: nothing in this phase needs privileged server-side auth calls. It is not read, not logged, and never returned.

Supabase connectivity: the pooler host (`*.pooler.supabase.com`, IPv4) is used rather than `db.<ref>.supabase.co`, which is IPv6-only on Supabase and unreachable over IPv4-only networks.

## 9. Migration strategy

- `synchronize: false` always. Migrations only. No SQL-editor table creation.
- `src/database/data-source.ts` resolves entities/migrations for both `src` (ts) and `dist` (js) layouts.
- Migrations run through `src/database/cli.ts` (`run`, `revert`, `show`, `diff`) executed with the same ESM runtime as the app — this avoids `ts-node` ESM fragility entirely.
- `migration:diff` prints the SQL a migration *would* apply so it can be reviewed before running it.
- Migrations are plain `up`/`down`; `down` drops only objects that migration created.
- Migration `1730000000000-InitialSchema` creates the three tables, indexes, the `auth.users` FK, enables RLS, and revokes `anon`/`authenticated` grants so the Data API cannot read application tables.

## 10. Test strategy

No network, no SMS, no production data.
- Unit: Argon2id hash/verify, lockout math, PIN policy, phone normalization, profile completeness, audit metadata redaction.
- JWT: real `jose` signing with a **local** test key pair — valid, expired, wrong-issuer, wrong-audience, malformed, non-UUID `sub`.
- Integration: Nest testing module with mocked TypeORM repositories — bootstrap idempotency under concurrency, profile allowlisting (role/status/id cannot be written), PIN setup→verify→change→reset flows, account-status and recent-auth guards.
- Migration: executed against a fake `QueryRunner` to assert the generated SQL (tables, FK to `auth.users`, RLS) without touching a real database.
- Swagger: the OpenAPI document is generated and asserted for every required path, the bearer scheme, and `/api/v1` absence.

### Verified empirically

Beyond the unit suite, the following were executed against a live server and database:

| Check | Result |
|---|---|
| Compiled ESM app boots and resolves `@/` aliases at runtime | pass |
| Remote JWKS fetch over HTTP (local JWKS server) | 1 fetch, then cached |
| Pre-rotation tokens still verify after the signing key changes | pass |
| A key that appears mid-cache is refused until refresh | pass |
| `users.id` FK to `auth.users` enforced | `23503` on an unknown id |
| RLS enabled + `anon`/`authenticated` grants revoked | `permission denied` for `anon` |
| `migration:run` → `revert` → `run` | pass |

> **Note on `migration:diff`:** the diff compares the database with the *entities*, and the
> entity cannot express the FK to `auth.users`. A diff may therefore propose dropping
> `FK_users_auth_user`. Review diff output before applying anything, and never apply a
> generated diff that removes the identity foreign key.

## 11. Risks

1. **Alias/runtime mismatch** — mitigated by the hook above, verified by actually booting the compiled app.
2. **Supabase `postgres` role bypasses RLS** — the app's own authorization is the real boundary; RLS is defence-in-depth only. A dedicated least-privilege `moneytear_api` role is documented as follow-up.
3. **In-memory throttle/unlock state** resets per instance — acceptable at current scale, documented.
4. **`auth_time` freshness** is Supabase-controlled; the recent-auth window cannot be shortened below what Supabase reports.

## 12. Out of scope

No mobile integration, no UPI/payments, no transactions/budgets/analytics, no API versioning.