# Account deletion safety batch — August 31, 2026

Status: **backend deployed to the TTTT Supabase project on August 31, 2026 after
explicit approval**. Read-only schema/security checks and unauthenticated HTTP
checks passed. Subsequently, explicitly approved disposable-account tests passed
against live Auth, Storage and the deletion endpoint; see
[the detailed test evidence](ACCOUNT_DELETION_LIVE_TEST_20260831.md).
The updated confirmation panel was published to the website at `b6b24b7` and
verified in the served `index-DZnUBAgt.js` bundle. On September 1, a fresh
Release build containing that exact tested bundle was installed and launched on
the connected iPhone 16 Pro; its process remained running after launch.
Interactive deletion-panel checks and concurrent-fault stress tests remain outstanding.

Website release: [successful GitHub deployment](https://github.com/BrettMPierce22/TTTT/actions/runs/33429720240).
The public privacy, terms and support routes returned HTTP 200 after release.
The served app bundle contained the new confirmation/progress copy and no
server cleanup helpers, service-role setting or disposable-test identifiers.

The local tests use synthetic data in an in-memory PostgreSQL database. They
remain separate evidence from the live checks recorded below.

## Live deployment evidence — August 31

- Target: `juhdzutghafsiggwtaad`, TTTT, main/Production.
- Required columns were present. The enabled anonymization trigger/function,
  nullable player user ID with `ON DELETE SET NULL`, photo-submission RLS and
  Storage policies matched prerequisites; no conflicting new functions existed.
- Applied only `202608310001_safe_account_deletion.sql` in its explicit
  transaction. Deployed both `index.ts` and `handler.js` from commit `548311f`.
- Reloaded the dashboard and compared both persisted function files with local
  source. All seven database function body fingerprints matched the migration.
- Verified intent-table RLS, denied ordinary-user cleanup access, two restrictive
  upload policies and enabled account/league guards. The existing legacy gateway
  JWT toggle remained off; the function still validates sessions through Auth.
- Before and after: 23 accounts, 17 players, 2 leagues, 389 table listings,
  18 Storage objects and 0 photo submissions. After deployment: 0 deletion intents.
- Live endpoint: OPTIONS 200, GET 405, POST without authorization 401, POST with
  an intentionally invalid token 401. Responses include `Cache-Control: no-store`.
  No actual member session was used, and no account or image was deleted.
- Repeatable read-only verification: `supabase/checks/account-deletion-post-deploy.sql`.
- No billing settings, unrelated migrations, website release or phone installation
  were included in this deployment.
- Subsequent live tests deleted only three disposable accounts and 206 tiny test
  images. Existing account/file/league/player/table/match ID inventories matched
  the baseline exactly after cleanup. Empty accounts, cross-account isolation,
  league owners, all buckets, pagination, resumed intents, stale-token uploads,
  actual file retrieval, shared images, chat removal and history were tested.

## What changed

- The Edge Function verifies the current session before creating an administrator
  client. Target user IDs, buckets and file paths from request bodies are ignored.
- An administrator-only, paginated inventory finds owned uploads in all three
  app buckets, including league images stored under a league ID rather than a
  user ID. Unknown buckets and malformed inventory stop the request before cleanup.
- A durable deletion intent pauses authenticated uploads while cleanup is in
  progress, including retries. Deleted accounts cannot use an unexpired token to
  create new Storage objects. Existing ownership policies remain in force.
- League owners are stopped before any file or profile reference is changed.
  Ownership cannot be assigned to an account already being deleted.
- The function detaches image references and uses the Storage API to remove
  the actual files before deleting the Auth account. SQL never deletes Storage
  metadata. A database guard independently refuses Auth deletion with remaining
  uploads or owned leagues.
- The existing anonymization trigger preserves match/player history while
  removing personal fields and messages. The deletion intent cascades away when
  Auth deletion completes.
- Incomplete attempts retain the account and deletion intent where possible,
  report a retryable error, and never claim cleanup is complete based on a
  best-effort background operation. Transport errors during the final Auth call
  are reported as unconfirmed, since the server may already have completed it.
- The app explains image removal, interrupted attempts, shared content and owner
  prerequisites, announces progress/errors accessibly, and prevents repeat taps.

## Content behavior requiring review before release

Deleting an account removes images uploaded by that account, **including images
currently displayed as a shared league logo/banner or a table photo**. The
associated image reference is cleared; the shared league or someone else's table
listing is not deleted by image cleanup. Other users' uploaded files are excluded.
This behavior is stated in the confirmation panel. There is no automatic transfer
or copy of the deleting user's uploaded content to another user.

If the account owns a league, it must first delete that league or arrange an
explicit ownership transfer. The current app does not have a verified self-service
ownership-transfer screen; the confirmation directs users to support for that path.
Do not transfer ownership to an arbitrary member as part of automatic deletion.

The existing table-locator schema cascades listings created by the deleted user
and their dependent records. Verify the stewardship of imported catalog listings
and linked community contributions during the full staging audit. Do not test
deletion on the account that imported production table data.

## Verification completed locally

- `npm run check`: lint, automated tests, production build and release-file checks.
  Final local count: 58 tests across 5 files (54 added in this batch).
- `npm run test:account-deletion`: HTTP authorization/confirmation, pagination,
  supported buckets, file failures/retries, changed paths, duplicate taps,
  PostgreSQL privileges, row security, deletion guards, and data anonymization.
- Handler-to-SQL integration tests exercise successful cleanup and resumption
  after a simulated Storage outage. The fake file service deletes only synthetic
  metadata as a test stand-in; actual Supabase Storage is not contacted.
- `npx --yes deno check supabase/functions/delete-account/index.ts`.
- `npm audit --omit=dev --json`: no known shipped-dependency vulnerabilities at
  the time of the check. This is not a security guarantee.
- Native Release build succeeded and its bundled web index matches this build.
  It was not installed on the phone. Xcode emitted an account-credential warning
  but completed with cached signing; verify account sign-in before the next
  provisioning renewal. The existing development profile expires September 7.

## Deployment procedure for subsequent environments

The production deployment above was explicitly approved. Do not reapply the
non-idempotent migration there. Use this procedure for a new test environment or
future revisions; destructive provider tests still require their own scope.

1. Run `supabase/checks/account-deletion-readiness.sql` against the intended
   project using read-only access. Confirm no missing columns, inspect existing
   anonymization triggers and Storage policies, and check for conflicting names.
   Record the deployed schema/function version; do not infer it from repo files.
2. Verify the earlier account-deletion and photo-submission migrations are present
   and match the expected behavior. If prerequisites differ, adapt and retest the
   draft before seeking approval. Do not bulk-apply unrelated migrations.
3. Obtain approval for **202608310001_safe_account_deletion.sql** and deployment
   of the updated **delete-account** Edge Function. Applying this migration creates
   one intent table, helpers/guards and restrictive Storage policies; it does not
   delete existing member accounts or files. It is transactional on application.
4. In a staging project, apply that migration and deploy the complete function
   directory (`index.ts` AND `handler.js`). Keep `verify_jwt = false` only because
   the handler explicitly validates the caller with Auth; never expose the service
   role key to the web/iPhone client.
5. Use separately authorized disposable accounts and images for provider-level
   tests: no uploads, all three buckets, another user's files, shared image usage,
   league ownership, pagination, expired sessions, interrupted requests and real
   concurrent uploads. Confirm actual bytes are gone through Storage, not merely
   hidden in metadata. Confirm the deleted account cannot log in or upload.
6. Release the verified backend and app confirmation changes together. Publish
   the website and install the updated iPhone app only after the backend is verified.
   Local builds may be prepared and validated beforehand without installing them.
   An older installed client will still receive compatible response fields.

## Failure/recovery notes

- A failed request may already have detached references or removed some uploads;
  Storage and Auth deletion cannot be made one atomic cross-service transaction.
  Do not promise full rollback of an attempt.
- Retry from the account-deletion panel after resolving the underlying error.
  A durable intent is a safeguard, not a scheduled worker; no automatic background
  deletion service is introduced in this batch.
- If a user asks to stop an incomplete deletion, support must verify identity,
  ensure no deletion attempt is running, explain already-removed content, and
  explicitly approve any recovery operation. Never casually clear all intents.
- Do not drop upload guards or revert to the old function to work around failures
  while intents exist. Diagnose and roll forward, or disable the endpoint without
  deleting data while a scoped recovery is reviewed.
- The isolated fixture does not represent every live foreign key, Auth behavior,
  Storage implementation detail or concurrent transaction. Staging and real-device
  checks remain release gates.

## References

- [Supabase user deletion and Storage ownership](https://supabase.com/docs/guides/auth/managing-user-data)
- [Storage schema: metadata is read-only](https://supabase.com/docs/guides/storage/schema/design)
- [Storage ownership](https://supabase.com/docs/guides/storage/security/ownership)
- [Removing actual Storage files](https://supabase.com/docs/guides/storage/management/delete-objects)
