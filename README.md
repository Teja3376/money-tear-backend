# MoneyTear API

NestJS backend for the MoneyTear mobile app: Supabase phone-OTP identity verification, user
bootstrap, profile management, a four-digit application PIN, security audit events, and
Swagger/OpenAPI documentation.

- **Design & rationale:** [`AUTH_BACKEND_PLAN.md`](./AUTH_BACKEND_PLAN.md)

## Stack

NestJS 12 · TypeScript (ESM) · TypeORM · PostgreSQL (Supabase) · Supabase Auth (JWT/JWKS) ·
zod · Argon2id · Vitest · oxlint

## Quick start

```bash
npm install
cp .env.example .env      # then fill in real values
npm run migration:run     # create the schema (never `synchronize`)
npm run build
npm run start:prod
```

| URL | Purpose |
|---|---|
| `http://localhost:3000/api` | Service root |
| `http://localhost:3000/api/health/live` | Liveness (process only) |
| `http://localhost:3000/api/health/ready` | Readiness (checks the database) |
| `http://localhost:3000/api/docs` | **Swagger UI** |
| `http://localhost:3000/api/docs-json` | **OpenAPI JSON** |

All routes live under `/api`. There is no API versioning and no `/v1`.

## Authentication

Supabase Auth is the identity provider and handles phone OTP end to end. The mobile client signs
in against Supabase directly and then calls this API with the resulting access token:

```
Authorization: Bearer <supabase-access-token>
```

Every protected request has its token **cryptographically verified** (signature, issuer, audience,
expiry) against Supabase's JWKS before any application logic runs. A key rotated by Supabase is
picked up automatically without invalidating existing sessions.

`POST /api/auth/bootstrap` then idempotently provisions the application user for that verified
identity.

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/bootstrap` | Create or return the application user (idempotent) |
| `GET` | `/api/auth/me` | Current user, profile completeness, PIN + account status |
| `POST` | `/api/auth/logout` | Record a logout (see the "scope" field for what it does) |
| `GET` | `/api/users/me` | Current profile |
| `PATCH` | `/api/users/me` | Update allowlisted profile fields |
| `POST` | `/api/security/pin/setup` | Set the first PIN (requires recent authentication) |
| `POST` | `/api/security/pin/verify` | Verify the PIN; opens a short-lived **server-side** unlock state |
| `POST` | `/api/security/pin/change` | Change the PIN (current PIN required) |
| `POST` | `/api/security/pin/reset` | Clear the PIN (requires renewed authentication) |
| `GET` | `/api/security/pin/status` | Whether a PIN is configured |

## Security notes

- The PIN is stored only as an **Argon2id** hash; it is never returned or logged.
- Failed attempts are counted **in the database** and lock the PIN temporarily; PIN routes also get
  a stricter per-IP rate limit. Responses are generic so they cannot be used to probe state.
- Setting or resetting a PIN requires *recent authentication* (`auth_time` within the configured
  window). A user id, phone number or email is never accepted as proof of identity.
- Profile updates are allowlisted; `role`, `status`, ids and security columns are server-owned.
- Error responses never contain stack traces, and audit rows never contain PINs, OTPs, tokens or
  credentials (the metadata is allowlisted).
- Row Level Security is enabled on all application tables and Data API roles are revoked, so the
  tables are not reachable through PostgREST.
- Authenticated by default: every route requires a token unless it is explicitly marked `@Public()`.

## Database

`synchronize` is **always** disabled. Schema changes happen only through reviewed migrations:

```bash
npm run migration:show    # list migrations
npm run migration:diff    # print the SQL a migration *would* apply — review this first
npm run migration:run     # apply
npm run migration:revert  # undo the most recent one
```

`users.id` references `auth.users(id)`. The application **never** writes to `auth.users`; it only
reads the identity through that foreign key.

## Development

```bash
npm run build          # compile to dist/
npx tsc --noEmit       # typecheck
npm test               # unit + integration
npm run test:e2e       # HTTP-level e2e
npm run lint           # oxlint (type-aware)
npm run start:dev      # build + watch
```

### ESM and path aliases

The package is ESM (`"type": "module"`). Source uses `moduleResolution: "bundler"`, so imports are
written without a `.js` suffix:

```ts
import { UsersModule } from '@/modules/users/users.module';
```

`tsc` does not rewrite aliases, so `src/runtime/alias-hooks.ts` registers a Node resolve hook that
maps `@/*` onto the compiled output. It is wired through `--import` in the npm scripts, so
development and production resolve modules identically.

## Configuration

Validated at startup with zod — the process exits with a message naming the offending variables if
anything required is missing. See [`.env.example`](./.env.example) for the full list.

`SUPABASE_SERVICE_ROLE_KEY` is deliberately **not** used: nothing in this phase needs privileged
server-side auth calls.

## Scope

This phase covers authentication, users, PIN security and documentation only. Mobile integration,
UPI payments and expense processing are intentionally out of scope.