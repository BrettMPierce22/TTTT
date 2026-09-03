// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { buildTournamentMatches } from "../../src/features/tournaments/brackets";
import { canRecordTournamentMatch } from "../../src/features/tournaments/matchRules";

const user = "10000000-0000-4000-8000-000000000001";
let db, league;
const file = (name) => readFile(new URL(name, import.meta.url), "utf8");
beforeAll(async () => {
  db = new PGlite();
  await db.exec(await file("./fixtures/moderation-league-access.sql"));
  await db.exec((await file("../migrations/202608240001_tournaments.sql")).replace("create extension if not exists pgcrypto;", ""));
  await db.exec(await file("../migrations/202609030001_tournament_score_guards.sql"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("begin");
  await db.query("insert into auth.users(id,email) values ($1,'fictional@example.invalid')", [user]);
  league = (await db.query("insert into leagues(name,owner_user_id,join_code) values ('Test league',$1,'LOCAL') returning id", [user])).rows[0].id;
  await db.query("insert into players(league_id,user_id,name,member_role) values ($1,$2,'Test organizer','admin')", [league, user]);
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
});
afterEach(async () => { await db.exec("rollback"); });

async function start(format, count, reset = true) {
  const entries = Array.from({ length: count }, (_, index) => ({ id: crypto.randomUUID(), guest_name: `Guest ${index + 1}`, seed: index + 1 }));
  const id = (await db.query("select public.create_tournament($1,'Local tournament',null,$2,'manual',5::smallint,true,$3,$4::jsonb) as id", [league, format, reset, JSON.stringify(entries)])).rows[0].id;
  const tournament = (await db.query("select * from tournaments where id=$1", [id])).rows[0];
  const matches = buildTournamentMatches(tournament, entries);
  await db.query("select public.start_tournament($1,$2::jsonb)", [id, JSON.stringify(matches)]);
  return id;
}
async function record(id, a = 3, b = 0) { await db.query("select public.record_tournament_match($1,$2::smallint,$3::smallint,'[]'::jsonb)", [id, a, b]); }
async function rejected(action, message) {
  await db.exec("savepoint rejected");
  await expect(action()).rejects.toThrow(message);
  await db.exec("rollback to savepoint rejected; release savepoint rejected");
}

for (const format of ["single_elimination", "double_elimination", "round_robin"]) {
  for (const count of [3, 4, 5, 7, 8, 9]) {
    it(`finishes ${format} with ${count} entrants using actual SQL progression`, async () => {
      const id = await start(format, count);
      let steps = 0;
      while (steps++ < 100) {
        const tournament = (await db.query("select * from tournaments where id=$1", [id])).rows[0];
        if (tournament.status === "complete") { expect(tournament.winner_entry_id).toBeTruthy(); return; }
        const matches = (await db.query("select * from tournament_matches where tournament_id=$1 order by round_number, match_number", [id])).rows;
        const playable = matches.find((match) => canRecordTournamentMatch(match, matches));
        expect(playable, JSON.stringify(matches)).toBeTruthy();
        // Force the losers finalist to win the first grand final, exercising reset.
        await record(playable.id, playable.bracket === "grand_final" && playable.round_number === 1 ? 0 : 3, playable.bracket === "grand_final" && playable.round_number === 1 ? 3 : 0);
      }
      throw new Error("Tournament did not finish within the expected number of games.");
    });
  }
}

it("rejects premature byes, negative/oversized totals and duplicate finalization", async () => {
  const id = await start("single_elimination", 3);
  const matches = (await db.query("select * from tournament_matches where tournament_id=$1", [id])).rows;
  const waiting = matches.find((match) => match.status === "scheduled" && Boolean(match.player_a_entry_id) !== Boolean(match.player_b_entry_id));
  await rejected(() => record(waiting.id), /earlier matches/);
  const ready = matches.find((match) => canRecordTournamentMatch(match, matches));
  await rejected(() => record(ready.id, 4, 0), /exactly/);
  await rejected(() => record(ready.id, 3, -1), /negative/);
  await record(ready.id);
  await rejected(() => record(ready.id), /not scheduled/);
});

it("rejects a score from someone outside the league", async () => {
  const id = await start("round_robin", 3);
  const match = (await db.query("select id from tournament_matches where tournament_id=$1 limit 1", [id])).rows[0];
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", ["10000000-0000-4000-8000-000000000099"]);
  await rejected(() => record(match.id), /participant or tournament manager/);
});

it.each([false, true])("completes double elimination when the undefeated finalist wins (reset=%s)", async (reset) => {
  const id = await start("double_elimination", 4, reset);
  for (let step = 0; step < 20; step++) {
    const tournament = (await db.query("select * from tournaments where id=$1", [id])).rows[0];
    if (tournament.status === "complete") {
      const resets = (await db.query("select status from tournament_matches where tournament_id=$1 and bracket='grand_final' and round_number=2", [id])).rows;
      expect(resets).toEqual(reset ? [{ status: "cancelled" }] : []);
      return;
    }
    const matches = (await db.query("select * from tournament_matches where tournament_id=$1", [id])).rows;
    const ready = matches.find((match) => canRecordTournamentMatch(match, matches));
    expect(ready).toBeTruthy();
    await record(ready.id);
  }
  throw new Error("Tournament did not complete");
});
