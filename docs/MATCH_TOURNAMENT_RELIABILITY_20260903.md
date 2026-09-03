# Match and tournament reliability — September 3, 2026

## App changes

- Block overlapping match submissions synchronously. For an uncertain response,
  keep a generated match primary key in memory, reconcile it through existing
  authorized reads, and reuse it on explicit retry. A confirmed success starts a
  fresh ID for the next match, even with identical players/scores. No automatic
  write retries, upsert/overwrite or new database function is used.
- Separate save success from standings-refresh failure. Never tell the user to
  record a match again merely because a subsequent read failed. Ignore late
  match-save UI responses after account/league changes.
- Extract score/rating helpers for direct tests. Reject unsupported formats,
  missing/tied/fractional/negative scores and games after a match is decided.
  Preserve the existing point-scoring and rating rules; do not impose a new
  11-point minimum or rewrite historical records.
- Extract and test bracket generation. Validate unique contiguous seeds and
  entrant limits. Resolve predetermined opening byes and empty loser-side paths
  for newly generated brackets without prematurely resolving pending feeders.
  Existing tournament rows/brackets are not repaired or rewritten.
- Require complete, valid tournament game-win totals for Best of 1/3/5/7.
  Do not offer score/bye controls until feeder matches are complete/cancelled.
  Display validation errors inside the score modal.
- Guard concurrent tournament mutations and discard old list/detail responses
  when navigating back, selecting another tournament or leaving the view.
  Preserve separate current/past sections and explicit bracket selection.
- Load tournament matches in counted pages, including the 8,128 matches in a
  128-player round robin. Fail closed on missing pages, duplicate IDs, changed
  counts, foreign tournament rows or errors. This is not an atomic snapshot.
- Match round-robin display ordering to the existing server champion rule:
  wins, then original seed. Game differential remains visible but is not used
  as an unapproved alternative championship tie-break.

## Approved server migration — deployed September 3

`202609030001_tournament_score_guards.sql` replaces only
`record_tournament_match` to reject non-scheduled matches, pending feeder paths,
negative scores and game-win totals above/below the exact winning threshold.
The existing signature, permissions and advancement logic are preserved.
No backfill, league change, table alteration or billing change is included.

The user approved this function-only deployment. It was applied through the
signed-in TTTT SQL editor, inside a transaction with exact predecessor and
replacement-body checks. A separate post-commit read verified the tested body
and unchanged owner, ACL, security-definer setting and empty search path.
Client validation is not a security boundary. Existing custom/malformed bracket
graphs, direct manager writes and broader tournament authorization need their
own review; this update is not a complete security audit.

Project: `juhdzutghafsiggwtaad`. Normalized function-body MD5 changed from
`b0179da4b076bf09d7c8e883b4597971` to `2268eac902372c7133b78d62137dd37b`.
Normalization: `md5(trim(regexp_replace(prosrc,'\s+',' ','g')))`. The following
row counts and ordered full-row fingerprints matched before and after:

| Table | Rows | Unchanged fingerprint |
| --- | ---: | --- |
| leagues | 2 | 17a661a4b722d9256921984d9e46af26 |
| matches | 66 | 28aa55013345493524d3c35801d47136 |
| tournaments | 1 | 37166084d7922406d5835a7483255d42 |
| tournament_entries | 13 | d1859ad68dd37aaa086e6d25e18a7649 |
| tournament_matches | 31 | 2f35be297bc9c74b0aa72a42eed7c72d |

No live scoring call or test fixture was used. No other migration was applied;
subscription-entitlement work remains unapplied and billing remains disabled.
The SQL-editor deployment did not modify Supabase migration-history metadata.

## Local evidence

- 297 tests pass in 27 files, with lint, production build and release checks.
- Bracket graph checks span 3–128 entrants across all three formats.
- Isolated PostgreSQL tests execute real create/start/record functions to finish
  all three formats with 3, 4, 5, 7, 8 and 9 entrants. Include third place,
  manual byes, grand-final reset and undefeated-finalist completion, plus
  invalid/premature/duplicate/unauthorized score rejection.
- Browser-component tests cover closed-by-default brackets, separate libraries,
  late-response back navigation, refresh after failure and duplicate score taps.
- Unit tests cover match-response loss, unchanged-ID retry, matching JSONB,
  definite rejection, read failure and legitimate repeated matches, plus
  chronological rating/history consistency.

These tests use fictional local data only. No production match/tournament was
created, edited or deleted. Only the approved function deployment and read-only
production checks were run. Phone interaction checks and
website publication are separate from automated test success.

The initial installation attempt could not find the phone. After it reconnected,
the matching signed Release app was installed successfully on Cody Maverick
September 3 at 15:33 local time and launched successfully at 15:37. Installation
was in place, without uninstalling or clearing app data. Hands-on interaction
has not yet been confirmed by the user.
The generic-iOS signed Release build passed. Signature
verification passed, and bundled `index-CIgJ27i7.js` and
`TournamentCenter-C0kk6WiJ.js` match the tested web build byte for byte. The
prepared artifact is `/private/tmp/tttt-phone-organizer-release/Build/Products/Release-iphoneos/App.app`.

## Remaining limits

Match retry protection is in-memory and per app session, not cross-device or
durable across app termination. Fully durable retry protection requires a
separately reviewed persisted draft/server idempotency workflow. SQL tests are
serial and do not prove concurrent score transactions are deadlock-free.
Older bracket graphs containing unresolved empty matches may need a separately
approved repair after read-only inspection; never rewrite existing events as
part of deploying this function.
