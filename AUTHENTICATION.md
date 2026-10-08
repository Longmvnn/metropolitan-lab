# Authentication

Students claim a lecturer-imported roster using first, middle (if any), and last names, registration number and Gmail. Names must match the full roster name, ignoring order, accents and punctuation. A linked, unverified preloaded user is reused: IDs, marks, groups and existing enrolments stay intact. No extra phone field is required.

A ten-minute email code verifies the Gmail and activates the account. The student then creates and confirms a password. Future logins use Gmail/password without another code. Existing students without passwords and students who forgot their password use the email-verified password setup/reset flow. Password reset revokes previous sessions. Password completion and successful login set a seven-day HttpOnly, SameSite=Lax session cookie (Secure over HTTPS) and open the dashboard directly. Preview identity headers cannot log anyone in.

Lecturer signup requires an administrator-issued invitation. Under Settings → Lecturers & administrators, select Invite lecturer and enter their Gmail. The existing Gmail sender emails a single-use link valid for 24 hours. The lecturer follows the link, verifies their Gmail, then creates and confirms a password. Invitation email must match the registration email. Tokens are stored as SHA-256 digests, rechecked throughout onboarding, and consumed atomically with account creation. Reinviting the same email invalidates its previous invitation. Public signup and the old direct lecturer-creation API are blocked. The existing application uses `admin` for lecturer accounts, so invited lecturers receive that role, including invitation privileges. To provision the first lecturer or reset an existing lecturer password directly in the database, run:

```sh
npm run provision:lecturer
```

For the current local preview database, use `npm run provision:lecturer -- --local` to apply the credentials directly.

Enter Gmail, full name and password at the prompts. The password is hidden. The script writes `.sites-runtime/lecturer.sql`, containing a salted PBKDF2-SHA256 hash, not the password. Apply this SQL to the intended D1 database after the migrations, then delete it. For a local preview, use Wrangler with the preview's D1 configuration and `--local --persist-to .wrangler/state --file .sites-runtime/lecturer.sql`. For a hosted database use the hosting platform's authorized migration/database workflow. Provisioning never promotes a student account, and password resets invalidate lecturer sessions. Use a unique password of 12–128 characters.

## Migration

Apply migrations in order. `0002` adds sessions, expiring OTP challenges, throttles, unique registration claims, password hashes and a verified timestamp. It preserves previously verified students. `0003` enforces case-insensitive email uniqueness. Existing lecturers must have a password provisioned; there is no default password or automatic first-visitor administrator.

Duplicate verified registration numbers or case-insensitive emails must be corrected before migration; the migration deliberately fails instead of silently selecting an account. Preloaded users keep their current placeholder email until Gmail verification. New imported roster rows do not require a user account.

The Sites access policy remains an outer access boundary: a private Site still requires platform access before visitors can reach the application login. This change does not make the Site public.

## Checks

```sh
npm run test:auth
npx tsc --noEmit
npm run build
```

Auth tests use an isolated SQLite database and captured email messages. They do not send email or modify teaching records. They cover claiming linked profiles, preservation of academic data, login/registration transitions, single-use/expired/incorrect codes, competing claims, lecturer passwords, session revocation and origin checks.

Migration `0005` adds lecturer invitations and normalized attendance checkpoint security fields. Pre-existing attendance sessions cannot accept new check-ins; open a new checkpoint after upgrading. See `SECURITY-AND-DEPLOYMENT.md` for setup and endpoint details.
