# Table Talk Table Tennis

Table Talk Table Tennis is a React/Vite league hub for rankings, matches,
players, tournaments, league/direct chat, rivalries, and community table discovery. The same application
can be deployed to the web or packaged as an iPhone app with Capacitor.

## Local development

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and add the Supabase project URL and
   publishable key.
3. Run `npm run dev`.

Do not use a Supabase service-role key in this client application.

## iPhone app

The native Xcode project is in `ios/App`. See
`docs/IOS_DEVELOPMENT.md` for the exact setup and physical-iPhone workflow.

Useful commands:

- `npm run ios:sync` rebuilds the web app and syncs it into Xcode.
- `npm run ios:open` opens the iOS project in Xcode.

## React + Vite tooling

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Table locator setup

The community table locator is implemented in `src/features/table-locator` and
uses the migration at
`supabase/migrations/202608220001_table_locator.sql`.

1. Apply the migration to the Supabase project.
2. Add at least one trusted moderator from the Supabase SQL Editor:

   ```sql
   insert into public.table_locator_moderators (user_id)
   select id from auth.users where email = 'your-admin-email@example.com'
   on conflict (user_id) do nothing;
   ```

3. Start the application with `npm run dev` and open **Find Tables**.

All submitted locations and written ratings remain pending until a moderator
approves them. Users can report locations or reviews and block reviewers. The
browser location request is initiated only after the user taps a location
button; the device position is not stored as a separate record.

See `docs/APP_STORE_READINESS.md` before shipping the iOS build.

## Tournament and direct-chat setup

Apply these migrations in filename order after the table-locator migration:

1. `supabase/migrations/202608240001_tournaments.sql`
2. `supabase/migrations/202608240002_direct_messages.sql`

The tournament migration adds league-scoped single-elimination,
double-elimination, and round-robin events with organizer/admin permissions.
The direct-message migration keeps one-to-one conversations private to their
two active league players and adds reporting and blocking controls.

See `docs/TOURNAMENTS_AND_CHAT.md` for the feature and release-test checklist.

## Unified moderator queue

Apply `supabase/migrations/202608240006_unified_moderator_queue.sql` only after
the earlier table-locator and chat migrations. Existing trusted members of
`table_locator_moderators` become application moderators; no service-role key
is used by the client.

The **Moderator Queue** navigation item is visible only to those trusted
accounts. It combines pending table locations, pending ratings, location
reports, and league/direct-message reports. Queue reads and moderation actions
are authorized again inside security-definer database functions so hiding the
navigation item is never the security boundary.

## Account deletion setup

1. Apply `supabase/migrations/202608240005_account_deletion.sql`.
2. Deploy the authenticated Edge Function in
   `supabase/functions/delete-account`.
3. Test the complete flow with a disposable account before release.

The function performs its own server-side JWT verification, and
`supabase/config.toml` disables only Supabase's legacy gateway check so modern
publishable-key sessions work. Never place the Supabase service-role key in the
React app or any `VITE_` environment variable.

## Public safety, legal, and support pages

The website includes permanent public URLs for App Store Connect:

- `/privacy/`
- `/terms/`
- `/community/`
- `/support/`

Each address redirects to the matching signed-out policy view:

- `/#/legal/privacy`
- `/#/legal/terms`
- `/#/legal/community`
- `/#/legal/support`

Set `VITE_SUPPORT_EMAIL` to a monitored mailbox before release. Use
`https://tabletalktabletennis.com/privacy/` for App Store Connect's Privacy
Policy URL and `https://tabletalktabletennis.com/support/` for the app-version
Support URL. Verify both in a signed-out browser before submitting a build.
