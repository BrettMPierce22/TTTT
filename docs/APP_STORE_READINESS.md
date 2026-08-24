# App Store readiness

This is the shipping checklist for the Table Talk Table Tennis iPhone app. It
is intentionally kept next to the source so product changes and App Store
requirements can be reviewed together.

## Implemented in the table locator foundation

- New locations and written ratings default to `pending`.
- Only approved locations and ratings are publicly visible.
- Row Level Security prevents users from approving content or changing another
  user's records.
- Moderators can approve or reject submissions and resolve reports.
- Users can report inaccurate, private, unsafe, or abusive content.
- Users can block a reviewer and hide that reviewer's content.
- Listings require confirmation that the venue is public and not a residence.
- Device location is requested only after a user action and is not stored as a
  separate tracking record.
- User-owned locator content cascades when its authentication account is
  deleted.
- The iOS project includes a clear location-while-in-use purpose string.
- The layout accounts for iPhone safe areas around the status area and bottom
  navigation.
- League and direct chat include message reporting, player blocking, and basic
  server-side profanity masking.
- Direct conversations are visible only to their two active league players.

## Required before App Store submission

- Add an in-app account deletion flow that removes the Supabase Auth user and
  associated user-generated content.
- Publish a privacy policy, terms of use, community standards, and support
  contact page.
- Document the moderation response process and test it with realistic reports.
- Add an admin report queue for chat reports before public release, and verify
  that the published support contact can receive urgent safety reports.
- Add a camera or photo-library purpose string before introducing any feature
  that requests those permissions.
- Complete App Store privacy disclosures for Supabase, maps, location, photos,
  analytics, and every other included SDK.
- Package and test the app as an iOS target with meaningful iPhone features,
  not a remote website-only wrapper.
- Add secure handling for universal links, password resets, and authentication
  callbacks.
- Test offline, slow-network, denied-permission, empty-state, and account
  deletion behavior on physical iPhones.
- Run the release candidate through TestFlight and provide App Review with a
  working demo account and clear review notes.

## Security release checks

- Confirm no Supabase service-role key or other administrator secret is shipped
  in the web or iOS bundle.
- Review every public table and storage bucket policy.
- Re-run `npm audit --omit=dev`, `npm run build`, and the project lint/tests.
- Confirm moderator membership is limited to trusted accounts.
- Confirm reports receive a documented, timely response.
- Confirm all public links use HTTPS.
