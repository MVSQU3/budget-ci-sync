# budget-ci-sync

Optional sync API for the budget app. Devices keep SQLite offline; this service stores a shared vault in Neon Postgres. There is no email login and no file storage.

## Auth

`POST /api/sync/register` creates a vault from a shared device secret (8–128 characters; the app generates 8-character codes). The response is `{ vaultId, serverTime }`. Store `vaultId` on the device. The same secret can open that vault on another device.

The database stores only `scrypt` output plus a random salt. The server mixes `SYNC_PEPPER` into the password (`pepper:secret`) before hashing. A leaked database is not enough to recover the secret. Secrets are not written to logs.

Pull and push send `{ vaultId, secret }` again. A wrong secret and an unknown vault return the same `401` (`Secret incorrect.`). Register and failed auth are softly rate-limited in process memory. That cap is per serverless instance; swap `syncLimiter` in `src/lib/rate-limit.ts` for a shared store if abuse needs a global limit.

## Conflict policy

Push is last-write-wins on the client `updatedAt`. The row is replaced only when the incoming timestamp is **strictly newer** than the stored one (`updatedAt < incoming`). An older or equal timestamp leaves the server row in place. The response lists `applied` and `kept` ids. Deletes are tombstones: send `deletedAt` on a newer write.

## Endpoints

All three routes accept `OPTIONS` (CORS `*`, methods `POST, OPTIONS`, headers `Content-Type`, `Authorization`, `Accept`) for a mobile or web client.

### `POST /api/sync/register`

```json
{ "secret": "ABCD1234" }
```

`201`:

```json
{ "vaultId": "uuid", "serverTime": "2026-09-29T12:00:00.000Z" }
```

### `POST /api/sync/pull`

```json
{
  "vaultId": "uuid",
  "secret": "ABCD1234",
  "since": "2026-09-01T00:00:00.000Z",
  "cursors": {
    "accounts": { "updatedAt": "2026-09-01T00:00:00.000Z", "id": "acc_1" }
  },
  "limit": 100
}
```

`since` and `cursors` are optional. `since` returns rows with `updatedAt` strictly after that instant. A per-entity cursor is `(updatedAt, id)` and overrides `since` for that entity, so a page boundary is not skipped when timestamps tie. `limit` defaults to 100 and maxes at 500, applied **per** collection.

`200` returns `accounts`, `categories`, `operations`, `cursors`, `hasMore`, and `serverTime`. Keep paginating while `hasMore` is true, then use this response's `serverTime` as the next `since`.

### `POST /api/sync/push`

Send full rows (omitted collections count as empty). Nullable fields (`deletedAt`, `color`, `categoryId`, `note`) must be present, including `null`, so a partial object cannot wipe them.

```json
{
  "vaultId": "uuid",
  "secret": "ABCD1234",
  "accounts": [{
    "id": "acc_1",
    "name": "Courant",
    "currency": "EUR",
    "openingBalanceCents": 1250,
    "archived": false,
    "createdAt": "2026-09-01T00:00:00.000Z",
    "updatedAt": "2026-09-02T00:00:00.000Z",
    "deletedAt": null
  }],
  "categories": [{
    "id": "cat_1",
    "name": "Courses",
    "kind": "expense",
    "color": null,
    "createdAt": "2026-09-01T00:00:00.000Z",
    "updatedAt": "2026-09-02T00:00:00.000Z",
    "deletedAt": null
  }],
  "operations": [{
    "id": "op_1",
    "accountId": "acc_1",
    "categoryId": "cat_1",
    "amountCents": -1990,
    "occurredOn": "2026-09-15",
    "label": "Marché",
    "note": null,
    "createdAt": "2026-09-01T00:00:00.000Z",
    "updatedAt": "2026-09-02T00:00:00.000Z",
    "deletedAt": null
  }]
}
```

Ids are client-generated (`[A-Za-z0-9_-]{1,64}`). Amounts are integer cents. `kind` is `income` or `expense`. `occurredOn` is `YYYY-MM-DD`. At most 100 rows per collection. `accountId` / `categoryId` are not foreign keys, so a related row may arrive in a later push.

`200`:

```json
{
  "serverTime": "2026-09-29T12:00:00.000Z",
  "applied": { "accounts": ["acc_1"], "categories": [], "operations": [] },
  "kept": { "accounts": [], "categories": [], "operations": [] }
}
```

Errors are JSON `{ "error": "..." }` in French: `400` validation, `401` auth, `429` rate limit, `500` configuration or server failure.

## Data

| Model | Primary key | Notes |
| --- | --- | --- |
| Vault | `id` | `secretHash`, `secretSalt` only |
| Account | `(vaultId, id)` | name, currency, opening balance, archived, tombstone |
| Category | `(vaultId, id)` | name, kind, optional color, tombstone |
| Operation | `(vaultId, id)` | account, optional category, amount, date, label, note, tombstone |

## Vercel

The Neon integration on project `budget-ci-sync` already provides:

- `DATABASE_URL` — pooled connection, used at runtime
- `DATABASE_URL_UNPOOLED` — direct connection, used by Prisma Migrate (`directUrl`)

Also set `SYNC_PEPPER` to a long random string (16+ characters). Do not commit real values. `.env.example` lists placeholders only.

Runtime appends `pgbouncer=true` on pooler hosts, plus `connection_limit=1` and `connect_timeout=15`, when those parameters are missing.

Apply the migration once from a trusted machine (this repo does not run it during build):

```bash
npx prisma migrate deploy
```

Build command: `npm run build` (`prisma generate`, then `next build`). `npm test` does not need a database.

## Scripts

```bash
npm test
npm run lint
npm run typecheck
npm run build
```
