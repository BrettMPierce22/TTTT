# Tournaments and chat

## Supabase setup

Run these files in the Supabase SQL Editor in this exact order:

1. `supabase/migrations/202608240001_tournaments.sql`
2. `supabase/migrations/202608240002_direct_messages.sql`

The first migration creates the shared league-player and league-admin helper
functions used by both features. Do not expose a service-role key to the app.

## Tournament Center

- Single elimination with optional third-place match
- Double elimination with optional grand-final reset
- Round robin with calculated standings
- Rating, random, and manual seeding
- League-player and named guest entrants
- Best-of 1, 3, 5, or 7 match settings
- Draft, active, complete, and cancelled states
- Organizer/admin management and participant score reporting

## Chat Center

- League Chat opens whenever the Chat tab is selected.
- Direct Messages can be started with any other active league player.
- Direct conversations are private to their two members.
- Members can report messages and block another player.
- Send, delete, report, and block operations are validated by database RPCs.

## Release test checklist

- Create, seed, start, score, and complete each tournament format.
- Test brackets with 3, 4, 5, 8, and 16 entrants, including byes.
- Confirm a normal league member cannot edit another organizer's bracket.
- Confirm each tournament participant can report only their own match score.
- Start a direct chat from each side and verify a third account cannot read it.
- Report a league message and a direct message, then verify each report exists.
- Block and unblock another player and verify messaging behavior both ways.
- Test empty states, slow connections, and app relaunch on an iPhone.
