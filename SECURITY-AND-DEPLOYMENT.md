# Invitations, attendance, and deployment

## One-command deployment

```sh
npm run ship
```

This runs TypeScript checks, the security regression suite, the production build,
remote D1 migrations, then Wrangler deployment. Any failure stops the sequence.
It publishes saved project files; it does not commit or push Git changes. Migrations
are applied before new code is published and are not undone if deployment fails.
The added tables are compatible with the previous release.

`wrangler.jsonc` contains the production D1 and R2 resources recovered from the
existing built configuration. Keep it valid JSON. `scripts/ship.mjs` replaces the
build's placeholder bindings with those resources and resolves the migrations
folder absolutely. Removing bindings with `sed` would disable database access
and file storage. Secrets remain in Cloudflare; they are not copied from `.env`.

Authenticate Wrangler to the intended Cloudflare account. Configure these once:

```sh
npx wrangler secret put GMAIL_APP_PASSWORD --config wrangler.jsonc
npx wrangler secret put LECTURE_HALL_LATITUDE --config wrangler.jsonc
npx wrangler secret put LECTURE_HALL_LONGITUDE --config wrangler.jsonc
```

Enter the **actual fixed lecture hall center** as decimal-degree latitude and
longitude. No guessed coordinates are supplied. If needed, set `GMAIL_ADDRESS`
to the sender account that owns the App Password. Existing Gmail OAuth also works.
For local development, use the corresponding `.env` values. Geolocation requires
HTTPS (localhost is allowed). This version uses one fixed hall for all timetables;
configure per-room centers before using it for multiple halls.

To validate the build and Wrangler bundle without publishing or migrating:

```sh
npm run ship -- --dry-run
```

## Lecturer onboarding

Use Settings → Lecturers & administrators → Invite lecturer. The email contains
`/signup/lecturer?token=…`. Signup keeps the existing Gmail OTP verification and
password confirmation steps. An invitation expires in 24 hours and can create
only one account. Reissuing invalidates the previous link. The token digest is
stored in `lecturer_invitations.token`; plaintext tokens are never stored in D1.
The initial administrator still uses `npm run provision:lecturer`.

Routes require the same-origin `Origin` header and authenticated cookies where
applicable. The existing role model calls lecturers `admin`; there is no separate
super-administrator role in this application.

| Endpoint | Access | Request |
| --- | --- | --- |
| `POST /api/admin/lecturer-invitations` | Admin | `{ "email": "lecturer@gmail.com" }` |
| `POST /api/auth` | Invitation holder | Existing `lecturerRegister`, `verify`, `setPassword` flow; registration additionally requires `token` |
| `POST /api/attendance/checkpoints` | Lecturer | `{ "timetable": "timetable-id" }` |
| `PATCH /api/attendance/checkpoints` | Creating lecturer | `{ "id": "checkpoint-id" }` to lock |
| `POST /api/attendance/submit` | Enrolled student | `{ "sessionId": "checkpoint-id", "code": "012345", "latitude": -6.0, "longitude": 39.0, "accuracy": 10 }` |

Example coordinates above illustrate request shape only; they are not hall settings.
The old `/api/lab` attendance actions delegate to the same validation service.

## Checkpoints and location

Open a checkpoint at any lecturer-chosen point in the lecture. Each gets a new
six-digit cryptographically generated code, expires after three minutes, and
creates its own attendance roster. Beginning, middle and end checks therefore
remain separate; an earlier check-in never satisfies a later checkpoint. The
register reports each checkpoint separately, with no automatic overall lecture
pass/fail policy. Authorized manual corrections remain available and audited.

The submit button calls `currentLocation()` in `lib/browser-location.ts` once,
with `enableHighAccuracy: true`, `maximumAge: 0`, and a 15-second timeout. There
is no continuous tracking. The server validates numeric coordinate ranges,
reported accuracy of at most 50 meters, enrollment, session code, lock and expiry,
and Haversine distance of at most 50 meters. Remote submissions return HTTP 403.
The conditional attendance write rechecks checkpoint validity and prevents replay.
Student coordinates are not persisted. Legacy sessions fail closed.

Browser coordinates and reported accuracy are client-controlled. This rejects
ordinary remote use of shared codes, but cannot attest physical presence against
mock GPS or modified clients. Indoor GPS may also be too imprecise; students get
an explicit retry message rather than an automatic attendance credit.

## Implementation and verification

- Drizzle schema: `db/schema.ts`; generated migration: `drizzle/0005_gray_tony_stark.sql`.
- Services: `lib/invitations.ts`, `lib/attendance.ts`, `lib/geofence.ts`.
- Drizzle manages invitation writes and session locks. Atomic D1 batches and
  conditional SQL integrate with the existing JSON-backed attendance register.
- `npm run test:auth` uses isolated SQLite and captured mail, including invitation
  expiry/replay/rollback and checkpoint location/lock/enrollment/replay checks.

Cloudflare D1's transaction primitive is a batch; the implementation uses it for
atomic account creation and invitation consumption. References:
[Drizzle batch API](https://orm.drizzle.team/docs/batch-api) and
[Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
