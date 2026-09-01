# Free and paid plan proposal

Status: product decision and non-live engineering foundation. No billing,
subscription, App Store product, Stripe account or production database change
has been enabled.

## Recommended model

Keep Table Talk free for players. Charge organizers only when they need to run
larger or more advanced programs. This protects growth: a player can accept an
invite, join a public league, record a match and use safety tools without a
paywall.

### Table Talk Free

- Join an unlimited number of leagues.
- Own one active league with up to 16 active players.
- Public, private and invite-only access controls.
- Match recording, standings, history, core chat and blocking/reporting.
- Table finder, reviews and suggested edits.
- One active tournament with up to 16 entrants.
- Standard league appearance and basic statistics.

### League Plus

Launch price: **$1.99/month**.

- Own up to two active leagues with up to 32 active players each.
- Two simultaneous tournaments with up to 32 entrants each.
- Expanded organizer statistics.
- Basic league branding.

### League Pro

Launch price: **$4.99/month**.

- Own up to five active leagues with up to 100 active players each.
- Up to ten simultaneous tournaments with up to 128 entrants each.
- Advanced seeding, formats and season tools as those features ship.
- Full league and player analytics.
- CSV exports and shareable reports.
- Custom league branding and themes.
- Additional co-admin and organizer controls.
- Priority support.

Apple supplies the localized prices shown in the iPhone app; the real purchase
screen must load those prices from StoreKit rather than trusting the fallback
display copy in the web bundle. Annual products are deliberately deferred to
keep the first release understandable.

Safety, privacy, account deletion, joining a league and access to a user's own
records remain free. Existing leagues must be grandfathered before any limit is
enforced so a plan launch never disables current production data.

## App Store-safe purchase design

Premium functionality consumed inside the iPhone app is a digital service, so
the iOS purchase button should use Apple's In-App Purchase system. Use one
auto-renewable subscription group named **Table Talk Organizer Plans**, with two
monthly products at different levels. Pro is the higher level so Apple can
offer an upgrade from Plus:

- `com.tabletalktabletennis.app.leagueplus.monthly`
- `com.tabletalktabletennis.app.leaguepro.monthly`

The recommended implementation is RevenueCat's official Capacitor SDK over
StoreKit. It keeps Apple subscription state, restoration, renewals, billing
retry and entitlements consistent without requiring Table Talk to maintain a
receipt-processing service from scratch. RevenueCat currently starts free up to
$2,500 in monthly tracked revenue, then lists a 1% fee. Recheck pricing before
creating the account.

For the fastest launch, sell Pro through Apple only. A later website checkout
can use Stripe and unlock the same entitlement, but Apple treats Table Talk as a
multiplatform digital service: a feature bought on the web may be used in the
app only when that feature is also offered as an in-app purchase. Region-specific
external-purchase links add review complexity and are deliberately deferred.

## Secure entitlement path

1. The signed-in Supabase user ID becomes the RevenueCat App User ID.
2. The Capacitor SDK loads Apple's localized offerings and performs purchases or
   restores.
3. RevenueCat sends signed/idempotent webhook events to a Supabase Edge Function.
4. The Edge Function validates the webhook secret and writes the authoritative
   entitlement with a service-role client.
5. Clients can read only their own Free/Plus/Pro plan summary. They cannot
   insert, extend or edit an entitlement. Pro satisfies Plus capability checks;
   Plus never satisfies a Pro check.
6. League/tournament limits are enforced again inside guarded database
   functions. Hiding a button in React is never the security boundary.
7. Cancellation keeps Pro through the paid period. Expiration or failed billing
   returns the organizer to Free without deleting any league or match data; new
   Pro-only actions pause until the account is back within Free limits or renews.

## Release sequence

1. Approve the entitlement migration after reviewing the draft; deploy no
   billing code before that approval.
2. Join the paid Apple Developer Program and create the app in App Store Connect.
3. Add the In-App Purchase capability, subscription group and both product IDs.
4. Create the RevenueCat project and entitlements `league_plus` and
   `league_pro`; connect the matching Apple products. Do not add a payment card
   unless the user knowingly chooses a paid service after reviewing current
   pricing.
5. Add the SDK, native paywall, Restore Purchases and Manage Subscription links.
6. Deploy and test the webhook in Apple sandbox with disposable accounts.
7. Add server-side feature limits, grandfather existing leagues, and test
   purchase, renewal, cancellation, billing retry, expiration and restore.
8. Complete App Store privacy/financial agreements and disclose subscriptions
   clearly in metadata and review notes.

The local draft is `supabase/migrations/202609020001_subscription_entitlements.sql`.
It exposes only an allowlisted plan summary, keeps provider/customer identifiers
server-only, gives clients no write path, handles Plus, Pro, upgrades,
active/expired/grace-period states and includes an idempotent webhook ledger.
Isolated PostgreSQL tests cover those boundaries. It has not been applied to
Supabase.

## Current external rules checked September 1, 2026

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
  3.1.1 requires In-App Purchase to unlock digital
  functionality; 3.1.2 requires ongoing value and clear subscription terms.
- Guideline 3.1.3(b) allows access to web-purchased multiplatform features when
  the same items are also offered through In-App Purchase.
- [Apple subscription reference](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-information)
  says products are organized in a subscription group, and a user
  can hold one subscription in that group at a time.
- [Apple's Small Business Program](https://developer.apple.com/app-store/small-business-program/)
  lists a 15% commission for qualifying new or
  sub-$1M developers, but enrollment and eligibility are separate steps.
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions) support
  authenticated endpoints and public webhook
  receivers; a public webhook still requires provider signature/secret
  verification inside the function.
- [RevenueCat's Capacitor SDK](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
  supports the app's existing native wrapper, and its
  [published pricing](https://www.revenuecat.com/pricing) currently starts free
  through $2,500 of monthly tracked revenue before a listed 1% fee.
