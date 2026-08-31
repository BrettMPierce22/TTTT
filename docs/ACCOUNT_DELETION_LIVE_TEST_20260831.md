# Live account-deletion test — August 31, 2026

Result: passed the scoped live scenarios below against TTTT project
`juhdzutghafsiggwtaad`. The user explicitly approved creating and deleting
disposable accounts/images. No production schema, function, billing or real
member data was changed by this test.

Run identifier: `tttt-delete-test-20260831-d798d726`.
Execution window: approximately 19:06–19:16 UTC.

## Scope and containment

- Three new accounts using reserved `example.invalid` addresses; dashboard
  creation with auto-confirm, explicitly without sending confirmation emails.
- One clearly named `DISPOSABLE DELETE TEST d798d726` league, two memberships,
  one synthetic match, synthetic league/direct messages and one account profile.
- 205 tiny subject files: 202 avatars, a league logo, a league banner and one
  private unsubmitted table photo. One additional control-account avatar.
- No fake public table listing and no interaction with real members/leagues.
- Test credentials and temporary signed links were kept in an ignored,
  mode-0600 local recovery file, never source-controlled or logged. Discard that
  file only after all test accounts are confirmed deleted. The completed run's
  local credential file was removed after cleanup and final file verification.

Disposable IDs, retained solely for audit/cleanup verification:

| Object | ID |
| --- | --- |
| Empty account | `981deeb6-56aa-48d9-b6b2-b49a7f13dc10` |
| Subject account | `e7ba1d5a-f426-4cb2-9735-640cb6897a83` |
| Control account | `08af1092-b0cc-462e-b6a5-397af716fc8d` |
| Test league | `097a4db5-aaa3-48cb-8864-59e9d14ef016` |
| Subject player | `d6049c41-e499-46b3-bb1a-fe86923fbf8d` |
| Control player | `c5b0d2c9-b8ac-4b5e-9a1e-0a7be008fe7c` |

## Verified live

1. Exact `DELETE` confirmation is required. A no-upload account deleted with
   `{deleted:true, cleanupPending:false}`; body-supplied IDs/paths did not change
   the target, and the separately authenticated control account survived.
2. League ownership returned 409 before any uploaded image was removed or an
   intent started. The blocked account could still retrieve/upload its own files.
3. Ordinary accounts received permission-denied responses from all three cleanup
   RPCs and the deletion-intent table.
4. Created a durable retry checkpoint for only the disposable subject using the
   existing `begin_account_deletion` RPC. Its 205 files remained at that point.
   New/replacement subject uploads failed; the control could update its own file.
   A guarded SQL test proved ownership could not be reassigned to the deleting
   subject. This checkpoint is not an induced real network/Storage outage.
5. Resuming through the deployed deletion endpoint removed all 205 subject files
   across the 200-row inventory page and 100-file cleanup batch boundaries.
6. Public files returned object-not-found responses; the private photo was first
   retrieved successfully through a signed URL, then that same still-valid URL
   returned object-not-found. Independent SQL showed zero remaining subject
   Storage objects, profile, Auth user or deletion intent.
7. Shared league logo/banner references were cleared while the control-owned
   league remained. The subject player was anonymized, and the synthetic match
   remained linked to that historical player. Subject league/direct messages
   disappeared; the control's message and avatar remained.
8. Deleted-account login and uploads using the previously issued token failed
   for all three disposable accounts.
9. Removed the disposable league and its synthetic history through the existing
   admin endpoint, then deleted the control account and its remaining avatar.
   Its public image URL also returned object-not-found afterward.

The deployed league policy does not permit direct client updates to league
ownership. This is consistent with the documented support-mediated transfer
path. A narrowly guarded operator query transferred **only the test league**
between **the two test accounts** and attached only test image paths. No new
ownership-transfer feature or relaxed permission was introduced.

## Cleanup proof

After cleanup, both record counts and ordered-ID fingerprints exactly matched
the pre-test baseline. Fingerprints cover IDs, not every column value.

| Existing records | Before | After | Matching ID fingerprint |
| --- | ---: | ---: | --- |
| Auth accounts | 23 | 23 | `c254c09d3db632bfd752bd76515e498c` |
| Storage objects | 18 | 18 | `67f2964bfefacb4b4662c918bbc73191` |
| Leagues | 2 | 2 | `4b963fade7c7a8bf81b15173e5f262b1` |
| Players | 17 | 17 | `ed13e118a1dade805179fb4b7d1f81be` |
| Table listings | 389 | 389 | `de7e6d912aa114c85ef770ac13cafb39` |
| Matches | 66 | 66 | `d2fe7029b9d64c1aac589d5279abe5a6` |

## Harness and remaining coverage

`scripts/live-account-deletion.mjs` is an operator-assisted live test, **not**
part of `npm test` or CI. It requires explicit disposable-test authorization and
the `--approved-disposable-tests` flag. The flag itself does not grant permission.
Account creation, tightly scoped test ownership setup, the deliberate retry
checkpoint and read-only baseline checks were performed in the dashboard.
Never rerun a partially completed setup blindly; inspect its recorded fixture
IDs. Never substitute a real member/catalog-import account or use a service-role
key in this harness. The reusable local tests remain isolated PostgreSQL tests.

This run does not prove every production failure case. Still schedule genuine
concurrent upload/delete stress tests, provider/network-fault handling and
physical-iPhone confirmation/retry testing. No provider outage was forced, no
public content moderation was bypassed, and no real-user deletion was tested.
