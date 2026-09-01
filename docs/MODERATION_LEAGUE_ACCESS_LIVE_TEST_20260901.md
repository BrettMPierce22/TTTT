# Moderator and league-access live test — September 1, 2026

Result: passed against the TTTT production project
`juhdzutghafsiggwtaad` using the explicitly approved disposable scope. The two
existing leagues were not edited.

Run identifier: `tttt-access-test-20260901-64f0a533`.
Execution window: approximately 18:33–18:41 UTC.

## Disposable scope

- Three auto-confirmed accounts using reserved `example.invalid` addresses.
- Three isolated leagues named `DISPOSABLE PUBLIC 64f0a533`, `DISPOSABLE
  PRIVATE 64f0a533`, and `DISPOSABLE INVITE-ONLY 64f0a533`.
- One private join request, one invitation, one clearly marked table listing,
  one structured listing-edit report, one direct message, and one chat report.
- Temporary moderator membership for the disposable owner and independent
  reviewer. The owner's temporary role was removed before the league-admin
  report-privacy check.

The recovery inventory and credentials were kept in an ignored mode-0600 file.
That file was removed only after every disposable account and league was deleted
and the production baseline matched.

## Verified live

1. A public league joined immediately.
2. A private league returned `pending`; the applicant could not approve their
   own request. The exact test-league owner approved it, and the applicant then
   completed the join.
3. The invite-only league rejected the applicant before an invitation, accepted
   the exact email invitation, and then joined.
4. Direct reads of the request and invitation workflow tables were denied, and
   the legacy join function could not bypass private access.
5. An ordinary account could not read the moderator queue.
6. A temporary moderator could see their own pending listing but could not
   approve it. The independent disposable moderator approved it.
7. The same self-review guard rejected the submitter's attempt to apply a
   structured listing edit. The independent moderator applied the edit and
   resolved its report atomically.
8. A disposable direct-message report reached the unified queue. After removing
   the disposable league owner's moderator role, that league admin could not
   read the report or queue. The reporter could read their own report, and the
   independent app moderator could read and resolve it.

## Cleanup proof

All three disposable leagues and accounts were deleted. Their players,
invitation, request, location, reports, conversation and message cascaded with
the recorded disposable parents. No test uploads were created.

Every baseline count and ID fingerprint matched afterward. The full serialized
row fingerprint of the two existing leagues also matched, proving their fields
were unchanged.

| Existing production data | Before | After | Matching fingerprint |
| --- | ---: | ---: | --- |
| Auth accounts | 23 | 23 | `ed8e585098f17c3e76200dfd162b0c73` |
| Storage objects | 18 | 18 | `1d28ccdec6f47f3db53f74040247cd48` |
| Leagues | 2 | 2 | IDs: `9fe98ead2232f264b3a43de1438fdde9` |
| Existing league rows | 2 | 2 | Full rows: `36ea17a559a06513a90f8e1f35ee6517` |
| Players | 17 | 17 | `97bda2da5fb19ccdafe3b7d8b41435dc` |
| Matches | 66 | 66 | `52f2d8823c93e0b873eb6ca4348227e2` |
| Table listings | 389 | 389 | `3331efbd8c340e1d6f9259a2794d36a6` |
| Table reviews | 1 | 1 | `8e5ea47fb16348b677521876c8169c7f` |
| Location reports | 1 | 1 | `74729fdc724d161b8806f7660b4adcfb` |
| App moderators | 1 | 1 | `aee2211ab3f960c5863d918ddbafdfe0` |

Chat reports, photo submissions, join requests and invitations all returned to
zero.

## Reusable harness

`scripts/live-moderation-league-access.mjs` is operator-assisted and is not part
of CI. It refuses to run without `--approved-disposable-tests`, stores an exact
recovery inventory, verifies names/owners before cleanup, and does not contain a
service-role key. The flag records scope; it never substitutes for the user's
explicit approval.

