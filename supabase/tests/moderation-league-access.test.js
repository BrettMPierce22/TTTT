// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const ADMIN_A = "10000000-0000-4000-8000-000000000001";
const ADMIN_B = "10000000-0000-4000-8000-000000000002";
const MODERATOR = "10000000-0000-4000-8000-000000000003";
const USER = "10000000-0000-4000-8000-000000000004";
const OTHER = "10000000-0000-4000-8000-000000000005";

const PUBLIC_LEAGUE = "20000000-0000-4000-8000-000000000001";
const PRIVATE_LEAGUE = "20000000-0000-4000-8000-000000000002";
const INVITE_LEAGUE = "20000000-0000-4000-8000-000000000003";
const OTHER_LEAGUE = "20000000-0000-4000-8000-000000000004";
const CHAT_LEAGUE = "20000000-0000-4000-8000-000000000005";

const ADMIN_A_PRIVATE_PLAYER = "30000000-0000-4000-8000-000000000001";
const ADMIN_A_INVITE_PLAYER = "30000000-0000-4000-8000-000000000002";
const ADMIN_A_CHAT_PLAYER = "30000000-0000-4000-8000-000000000003";
const ADMIN_B_PLAYER = "30000000-0000-4000-8000-000000000004";
const USER_CHAT_PLAYER = "30000000-0000-4000-8000-000000000005";
const OTHER_CHAT_PLAYER = "30000000-0000-4000-8000-000000000006";
const MOD_CHAT_PLAYER = "30000000-0000-4000-8000-000000000007";

let db;
const file = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const migration = async (relative) =>
  (await file(relative)).replaceAll("create extension if not exists pgcrypto;", "");
const rows = async (sql, values = []) => (await db.query(sql, values)).rows;

async function role(name, user = USER, email = "user@example.invalid") {
  await db.exec(`set local role ${name}`);
  await db.query(
    "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.email', $2, true)",
    [user, email]
  );
}

async function expectDbError(sql, pattern, values = []) {
  await db.exec("savepoint expected_error");
  await expect(db.query(sql, values)).rejects.toThrow(pattern);
  await db.exec("rollback to savepoint expected_error; release savepoint expected_error");
}

async function createLocation({
  id,
  owner = OTHER,
  name = "Community Table",
  status = "pending",
} = {}) {
  await db.query(
    `insert into public.table_locations (
      id,name,address,city,region,latitude,longitude,submitted_by,status
    ) values ($1,$2,'123 Main Street','Austin','Texas',30.2,-97.7,$3,$4)`,
    [id, name, owner, status]
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await file("./fixtures/moderation-league-access.sql"));
  await db.exec(await migration("../migrations/202608220001_table_locator.sql"));
  await db.exec(await migration("../migrations/202608240003_table_location_photos.sql"));
  await db.exec(await migration("../migrations/202608240004_location_management.sql"));
  await db.exec(await migration("../migrations/202608240002_direct_messages.sql"));
  await db.exec(await migration("../migrations/202608240006_unified_moderator_queue.sql"));
  await db.exec(await migration("../migrations/202608250001_league_access.sql"));
  await db.exec(await migration("../migrations/202608250004_table_location_photo_submissions.sql"));
  await db.exec(await migration("../migrations/202609010001_moderation_privacy_hardening.sql"));
}, 30000);

afterAll(async () => {
  if (db) await db.close();
});

beforeEach(async () => {
  await db.exec("begin");
  await db.query(
    `insert into auth.users (id,email) values
      ($1,'admin-a@example.invalid'),
      ($2,'admin-b@example.invalid'),
      ($3,'moderator@example.invalid'),
      ($4,'user@example.invalid'),
      ($5,'other@example.invalid')`,
    [ADMIN_A, ADMIN_B, MODERATOR, USER, OTHER]
  );
  await db.query(
    `insert into public.leagues (id,name,owner_user_id,join_code,access_type) values
      ($1,'Public League',$6,'PUBLIC','public'),
      ($2,'Private League',$6,'PRIVATE','private'),
      ($3,'Invite League',$6,'INVITE','invite_only'),
      ($4,'Other League',$7,'OTHER','private'),
      ($5,'Chat League',$6,'CHAT','private')`,
    [PUBLIC_LEAGUE, PRIVATE_LEAGUE, INVITE_LEAGUE, OTHER_LEAGUE, CHAT_LEAGUE, ADMIN_A, ADMIN_B]
  );
  await db.query(
    `insert into public.players (id,league_id,user_id,name,member_role) values
      ($1,$8,$7,'Private Admin','admin'),
      ($2,$9,$7,'Invite Admin','admin'),
      ($3,$10,$7,'Chat Admin','admin'),
      ($4,$11,$12,'Other Admin','admin'),
      ($5,$10,$13,'User Player','player'),
      ($6,$10,$14,'Other Player','player'),
      ($15,$10,$16,'Moderator Player','player')`,
    [
      ADMIN_A_PRIVATE_PLAYER,
      ADMIN_A_INVITE_PLAYER,
      ADMIN_A_CHAT_PLAYER,
      ADMIN_B_PLAYER,
      USER_CHAT_PLAYER,
      OTHER_CHAT_PLAYER,
      ADMIN_A,
      PRIVATE_LEAGUE,
      INVITE_LEAGUE,
      CHAT_LEAGUE,
      OTHER_LEAGUE,
      ADMIN_B,
      USER,
      OTHER,
      MOD_CHAT_PLAYER,
      MODERATOR,
    ]
  );
});

afterEach(async () => {
  await db.exec("rollback");
});

describe("unified moderator queue security", () => {
  it("denies ordinary members access to queue data and moderation actions", async () => {
    const locationId = "40000000-0000-4000-8000-000000000001";
    await createLocation({ id: locationId });
    await role("authenticated", USER);

    await expectDbError(
      "select * from public.get_moderator_queue()",
      /Moderator access is required/
    );
    await expectDbError(
      "select public.moderate_queue_item('location',$1,'approved',null)",
      /Moderator access is required/,
      [locationId]
    );
    expect(await rows("select id from public.table_locations where id=$1", [locationId])).toHaveLength(0);
  });

  it("returns pending submissions and private report context only to app moderators", async () => {
    const locationId = "40000000-0000-4000-8000-000000000002";
    const reviewId = "41000000-0000-4000-8000-000000000002";
    const reportId = "42000000-0000-4000-8000-000000000002";
    const messageId = "43000000-0000-4000-8000-000000000002";
    const chatReportId = "44000000-0000-4000-8000-000000000002";
    await createLocation({ id: locationId, status: "approved" });
    await db.query(
      "insert into public.table_location_reviews(id,location_id,user_id,rating,title,body) values ($1,$2,$3,5,'Excellent','Clean tables')",
      [reviewId, locationId, OTHER]
    );
    await db.query(
      "insert into public.table_location_reports(id,location_id,reporter_id,reason,details) values ($1,$2,$3,'incorrect','Wrong hours')",
      [reportId, locationId, USER]
    );
    await db.query(
      "insert into public.league_messages(id,league_id,player_id,message) values ($1,$2,$3,'Reported private context')",
      [messageId, CHAT_LEAGUE, OTHER_CHAT_PLAYER]
    );
    await db.query(
      `insert into public.chat_message_reports(
        id,league_id,reporter_player_id,league_message_id,reason,details
      ) values ($1,$2,$3,$4,'harassment','Private report details')`,
      [chatReportId, CHAT_LEAGUE, USER_CHAT_PLAYER, messageId]
    );
    await db.query("insert into public.table_locator_moderators(user_id) values ($1)", [MODERATOR]);
    await role("authenticated", MODERATOR, "moderator@example.invalid");

    const queue = await rows("select * from public.get_moderator_queue() order by item_type");
    expect(queue.map((item) => item.item_type)).toEqual([
      "chat_report",
      "location_report",
      "review",
    ]);
    expect(queue.find((item) => item.item_type === "chat_report")?.body).toBe("Reported private context");
    expect(queue.find((item) => item.item_type === "chat_report")?.details).toBe("Private report details");
  });

  it("allows independent moderation but blocks every form of self-moderation", async () => {
    const otherLocation = "40000000-0000-4000-8000-000000000003";
    const ownLocation = "40000000-0000-4000-8000-000000000004";
    const approvedLocation = "40000000-0000-4000-8000-000000000005";
    const ownReview = "41000000-0000-4000-8000-000000000004";
    const ownLocationReport = "42000000-0000-4000-8000-000000000004";
    const ownPhoto = "45000000-0000-4000-8000-000000000004";
    const ownMessage = "43000000-0000-4000-8000-000000000004";
    const ownChatReport = "44000000-0000-4000-8000-000000000004";
    await createLocation({ id: otherLocation, owner: OTHER });
    await createLocation({ id: ownLocation, owner: MODERATOR });
    await createLocation({ id: approvedLocation, owner: OTHER, status: "approved" });
    await db.query(
      "insert into public.table_location_reviews(id,location_id,user_id,rating) values ($1,$2,$3,4)",
      [ownReview, approvedLocation, MODERATOR]
    );
    await db.query(
      "insert into public.table_location_reports(id,location_id,reporter_id,reason) values ($1,$2,$3,'incorrect')",
      [ownLocationReport, approvedLocation, MODERATOR]
    );
    const photoPath = `${MODERATOR}/${approvedLocation}/${ownPhoto}.jpg`;
    await db.query(
      "insert into public.table_location_photo_submissions(id,location_id,contributor_id,photo_path) values ($1,$2,$3,$4)",
      [ownPhoto, approvedLocation, MODERATOR, photoPath]
    );
    await db.query(
      "insert into public.league_messages(id,league_id,player_id,message) values ($1,$2,$3,'Report me')",
      [ownMessage, CHAT_LEAGUE, OTHER_CHAT_PLAYER]
    );
    await db.query(
      "insert into public.chat_message_reports(id,league_id,reporter_player_id,league_message_id,reason) values ($1,$2,$3,$4,'spam')",
      [ownChatReport, CHAT_LEAGUE, MOD_CHAT_PLAYER, ownMessage]
    );
    await db.query("insert into public.table_locator_moderators(user_id) values ($1)", [MODERATOR]);
    await role("authenticated", MODERATOR, "moderator@example.invalid");

    await rows(
      "select public.moderate_queue_item('location',$1,'approved',null)",
      [otherLocation]
    );
    expect((await rows("select status from public.table_locations where id=$1", [otherLocation]))[0].status).toBe("approved");

    for (const [sql, values] of [
      ["select public.moderate_queue_item('location',$1,'approved',null)", [ownLocation]],
      ["select public.moderate_queue_item('review',$1,'approved',null)", [ownReview]],
      ["select public.moderate_queue_item('location_report',$1,'resolved',null)", [ownLocationReport]],
      ["select public.moderate_queue_item('chat_report',$1,'resolved',null)", [ownChatReport]],
      ["select public.moderate_table_location_photo_submission($1,'approved',null)", [ownPhoto]],
    ]) {
      await expectDbError(sql, /different moderator/, values);
    }

    await expectDbError(
      "update public.table_locations set status='approved' where id=$1",
      /different moderator/,
      [ownLocation]
    );
  });

  it("keeps chat reports private from league admins while allowing the reporter and app moderators", async () => {
    const messageId = "43000000-0000-4000-8000-000000000006";
    const reportId = "44000000-0000-4000-8000-000000000006";
    await db.query(
      "insert into public.league_messages(id,league_id,player_id,message) values ($1,$2,$3,'Private report target')",
      [messageId, CHAT_LEAGUE, OTHER_CHAT_PLAYER]
    );
    await db.query(
      "insert into public.chat_message_reports(id,league_id,reporter_player_id,league_message_id,reason) values ($1,$2,$3,$4,'threat')",
      [reportId, CHAT_LEAGUE, USER_CHAT_PLAYER, messageId]
    );

    await role("authenticated", ADMIN_A, "admin-a@example.invalid");
    expect(await rows("select id from public.chat_message_reports")).toHaveLength(0);

    await role("authenticated", USER, "user@example.invalid");
    expect(await rows("select id from public.chat_message_reports")).toEqual([{ id: reportId }]);

    await db.exec("reset role");
    await db.query("insert into public.table_locator_moderators(user_id) values ($1)", [MODERATOR]);
    await role("authenticated", MODERATOR, "moderator@example.invalid");
    expect(await rows("select id from public.chat_message_reports")).toEqual([{ id: reportId }]);
  });

  it("applies structured listing edits atomically and leaves self-submitted edits untouched", async () => {
    const locationId = "40000000-0000-4000-8000-000000000007";
    const independentReport = "42000000-0000-4000-8000-000000000007";
    const ownReport = "42000000-0000-4000-8000-000000000008";
    const prefix = "TTTT_EDIT_SUGGESTION_V1:";
    await createLocation({ id: locationId, status: "approved", name: "Original Name" });
    await db.query(
      `insert into public.table_location_reports(
        id,location_id,reporter_id,reason,details
      ) values
        ($1,$3,$4,'incorrect',$6),
        ($2,$3,$5,'incorrect',$7)`,
      [
        independentReport,
        ownReport,
        locationId,
        OTHER,
        MODERATOR,
        `${prefix}${JSON.stringify({ changes: { name: "Independent Name", tableCount: 3 } })}`,
        `${prefix}${JSON.stringify({ changes: { name: "Self Approved Name" } })}`,
      ]
    );
    await db.query("insert into public.table_locator_moderators(user_id) values ($1)", [MODERATOR]);
    await role("authenticated", MODERATOR, "moderator@example.invalid");

    await rows("select public.apply_table_location_edit_suggestion($1)", [independentReport]);
    expect(await rows("select name,table_count from public.table_locations where id=$1", [locationId])).toEqual([
      { name: "Independent Name", table_count: 3 },
    ]);

    await expectDbError(
      "select public.apply_table_location_edit_suggestion($1)",
      /different moderator/,
      [ownReport]
    );
    expect(await rows("select name from public.table_locations where id=$1", [locationId])).toEqual([
      { name: "Independent Name" },
    ]);
    expect(await rows("select status from public.table_location_reports where id=$1", [ownReport])).toEqual([
      { status: "open" },
    ]);
  });

  it("keeps direct messages private while still giving app moderators the reported message", async () => {
    const conversationId = "46000000-0000-4000-8000-000000000009";
    const messageId = "43000000-0000-4000-8000-000000000009";
    await db.query(
      `insert into public.direct_conversations(
        id,league_id,player_low_id,player_high_id
      ) values ($1,$2,$3,$4)`,
      [conversationId, CHAT_LEAGUE, USER_CHAT_PLAYER, OTHER_CHAT_PLAYER]
    );
    await db.query(
      "insert into public.direct_messages(id,conversation_id,sender_player_id,message) values ($1,$2,$3,'Private direct message')",
      [messageId, conversationId, OTHER_CHAT_PLAYER]
    );

    await role("authenticated", ADMIN_A, "admin-a@example.invalid");
    expect(await rows("select id from public.direct_messages")).toHaveLength(0);
    await expectDbError(
      "select public.report_chat_message($1,null,$2,'spam',null)",
      /Direct message not found/,
      [CHAT_LEAGUE, messageId]
    );

    await role("authenticated", USER, "user@example.invalid");
    expect(await rows("select id from public.direct_messages")).toEqual([{ id: messageId }]);
    await rows(
      "select public.report_chat_message($1,null,$2,'harassment','Direct report details')",
      [CHAT_LEAGUE, messageId]
    );

    await db.exec("reset role");
    await db.query("insert into public.table_locator_moderators(user_id) values ($1)", [MODERATOR]);
    await role("authenticated", MODERATOR, "moderator@example.invalid");
    const report = await rows("select * from public.get_moderator_queue() where item_type='chat_report'");
    expect(report).toHaveLength(1);
    expect(report[0].body).toBe("Private direct message");
    expect(report[0].context.messageType).toBe("direct");
  });
});

describe("public, private and invite-only league access", () => {
  it("joins a public league immediately and disables the legacy code bypass", async () => {
    await role("authenticated", USER, "user@example.invalid");
    const result = await rows(
      "select * from public.request_or_join_league($1,'Public Player')",
      [PUBLIC_LEAGUE]
    );
    expect(result[0].result).toBe("joined");
    expect(result[0].player_id).toBeTruthy();
    await db.exec("reset role");
    expect(await rows("select id from public.players where league_id=$1 and user_id=$2 and is_active", [PUBLIC_LEAGUE, USER])).toHaveLength(1);
    await role("authenticated", USER, "user@example.invalid");
    await expectDbError(
      "select public.join_league_v2('PRIVATE','Bypass Player')",
      /permission denied/
    );
  });

  it("keeps private joins pending until that league's admin approves them", async () => {
    await role("authenticated", USER, "user@example.invalid");
    const requested = await rows(
      "select * from public.request_or_join_league($1,'Pending Player')",
      [PRIVATE_LEAGUE]
    );
    expect(requested[0]).toMatchObject({ result: "pending", player_id: null });
    const requestId = requested[0].request_id;
    await db.exec("reset role");
    expect(await rows("select id from public.players where league_id=$1 and user_id=$2", [PRIVATE_LEAGUE, USER])).toHaveLength(0);
    await role("authenticated", USER, "user@example.invalid");
    await expectDbError(
      "select * from public.get_pending_league_join_requests($1)",
      /League admin access is required/,
      [PRIVATE_LEAGUE]
    );

    await role("authenticated", ADMIN_B, "admin-b@example.invalid");
    await expectDbError(
      "select public.review_league_join_request($1,true)",
      /League admin access is required/,
      [requestId]
    );

    await role("authenticated", ADMIN_A, "admin-a@example.invalid");
    expect(await rows("select request_id from public.get_pending_league_join_requests($1)", [PRIVATE_LEAGUE])).toEqual([{ request_id: requestId }]);
    await rows("select public.review_league_join_request($1,true)", [requestId]);

    await role("authenticated", OTHER, "other@example.invalid");
    await expectDbError(
      "select public.complete_approved_league_join($1)",
      /No approved request was found/,
      [requestId]
    );

    await role("authenticated", USER, "user@example.invalid");
    const joined = await rows("select public.complete_approved_league_join($1) as player_id", [requestId]);
    expect(joined[0].player_id).toBeTruthy();
  });

  it("requires a valid matching invitation for invite-only leagues", async () => {
    await role("authenticated", USER, "user@example.invalid");
    await expectDbError(
      "select * from public.request_or_join_league($1,'Invited Player')",
      /invite only/,
      [INVITE_LEAGUE]
    );

    await role("authenticated", ADMIN_A, "admin-a@example.invalid");
    await rows("select public.invite_to_league($1,'USER@example.invalid')", [INVITE_LEAGUE]);

    await role("authenticated", OTHER, "other@example.invalid");
    await expectDbError(
      "select * from public.request_or_join_league($1,'Wrong Person')",
      /invite only/,
      [INVITE_LEAGUE]
    );

    await role("authenticated", USER, "user@example.invalid");
    const joined = await rows(
      "select * from public.request_or_join_league($1,'Invited Player')",
      [INVITE_LEAGUE]
    );
    expect(joined[0].result).toBe("joined");
    await db.exec("reset role");
    expect((await rows("select status from public.league_invitations"))[0].status).toBe("accepted");
  });

  it("prevents ordinary users and cross-league admins from changing access or membership workflow state", async () => {
    await role("authenticated", USER, "user@example.invalid");
    const request = await rows(
      "select * from public.request_or_join_league($1,'Pending Player')",
      [PRIVATE_LEAGUE]
    );
    await expectDbError(
      "select public.update_league_access_type($1,'public')",
      /League admin access is required/,
      [PRIVATE_LEAGUE]
    );
    await expectDbError(
      "update public.league_join_requests set status='approved' where id=$1",
      /permission denied/,
      [request[0].request_id]
    );
    await expectDbError(
      "select * from public.league_invitations",
      /permission denied/
    );
    await expectDbError(
      "update public.players set member_role='admin' where id=$1",
      /permission denied/,
      [USER_CHAT_PLAYER]
    );
    await expectDbError(
      "update public.leagues set owner_user_id=$1 where id=$2",
      /permission denied/,
      [USER, PRIVATE_LEAGUE]
    );

    await role("authenticated", ADMIN_B, "admin-b@example.invalid");
    await expectDbError(
      "select public.review_league_join_request($1,true)",
      /League admin access is required/,
      [request[0].request_id]
    );
  });

  it("removes admin powers immediately when a membership becomes inactive", async () => {
    await db.query("update public.players set is_active=false where id=$1", [ADMIN_A_PRIVATE_PLAYER]);
    await role("authenticated", ADMIN_A, "admin-a@example.invalid");
    await expectDbError(
      "select * from public.get_pending_league_join_requests($1)",
      /League admin access is required/,
      [PRIVATE_LEAGUE]
    );
    await expectDbError(
      "select public.invite_to_league($1,'new@example.invalid')",
      /League admin access is required/,
      [PRIVATE_LEAGUE]
    );
  });
});
