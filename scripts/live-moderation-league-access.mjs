// Explicitly approved disposable production test only. No administrator key.
// Passwords/tokens live in a mode-0600 ignored file; never log that file.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = new URL('../', import.meta.url);
const STATE = new URL('moderation-league-access-live-run.local', ROOT);
const PROJECT = 'https://juhdzutghafsiggwtaad.supabase.co';
const PREFIX = 'tttt-access-test-20260901-';
const [phase, approval] = process.argv.slice(2);
assert.equal(approval, '--approved-disposable-tests', 'Explicit test authorization flag required');

const save = (state, exclusive = false) => writeFile(STATE, JSON.stringify(state, null, 2), {
  mode: 0o600,
  flag: exclusive ? 'wx' : 'w',
});

if (phase === 'prepare') {
  const tag = `${PREFIX}${randomBytes(4).toString('hex')}`;
  const accounts = Object.fromEntries(['owner', 'applicant', 'reviewer'].map((name) => [name, {
    email: `${tag}-${name}@example.invalid`,
    password: randomBytes(32).toString('base64url'),
  }]));
  const baseline = {
    captured_at: '2026-09-01T18:33:39.990055+00:00',
    auth_users: { count: 23, ids_md5: 'ed8e585098f17c3e76200dfd162b0c73' },
    storage_objects: { count: 18, ids_md5: '1d28ccdec6f47f3db53f74040247cd48' },
    leagues: { count: 2, ids_md5: '9fe98ead2232f264b3a43de1438fdde9', rows_md5: '36ea17a559a06513a90f8e1f35ee6517' },
    players: { count: 17, ids_md5: '97bda2da5fb19ccdafe3b7d8b41435dc' },
    matches: { count: 66, ids_md5: '52f2d8823c93e0b873eb6ca4348227e2' },
    table_locations: { count: 389, ids_md5: '3331efbd8c340e1d6f9259a2794d36a6' },
    table_reviews: { count: 1, ids_md5: '8e5ea47fb16348b677521876c8169c7f' },
    location_reports: { count: 1, ids_md5: '74729fdc724d161b8806f7660b4adcfb' },
    chat_reports: { count: 0, ids_md5: 'd41d8cd98f00b204e9800998ecf8427e' },
    photo_submissions: { count: 0, ids_md5: 'd41d8cd98f00b204e9800998ecf8427e' },
    join_requests: { count: 0 },
    invitations: { count: 0 },
    moderators: { count: 1, ids_md5: 'aee2211ab3f960c5863d918ddbafdfe0' },
  };
  await save({ project: PROJECT, tag, accounts, leagues: {}, evidence: [], baseline, created: new Date().toISOString() }, true);
  console.log(JSON.stringify({ tag, emails: Object.fromEntries(Object.entries(accounts).map(([name, account]) => [name, account.email])) }));
  process.exit(0);
}

const state = JSON.parse(await readFile(STATE, 'utf8'));
assert.equal(state.project, PROJECT);
assert.match(state.tag, /^tttt-access-test-20260901-[0-9a-f]{8}$/);
for (const account of Object.values(state.accounts)) {
  assert.ok(account.email.startsWith(`${state.tag}-`) && account.email.endsWith('@example.invalid'));
}

process.loadEnvFile(fileURLToPath(new URL('.env.local', ROOT)));
assert.equal(process.env.VITE_SUPABASE_URL, PROJECT);
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(publicKey);
const clients = {};

function ok(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? result.error.status ?? ''} ${result.error.message}`);
  return result.data;
}

function denied(result, label) {
  assert.ok(result.error, `${label} must be denied`);
  assert.ok(['42501', 'PGRST301', 'PGRST302'].includes(result.error.code) || /permission|access|invite only|not found/i.test(result.error.message), `${label}: unexpected error ${result.error.code} ${result.error.message}`);
}

async function note(check, detail = true) {
  const entry = { check, detail, at: new Date().toISOString() };
  state.evidence.push(entry);
  await save(state);
  console.log(JSON.stringify(entry));
}

async function login(name) {
  const account = state.accounts[name];
  assert.ok(account && !account.deleted, 'Cannot sign in a deleted test account');
  const client = createClient(PROJECT, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const data = ok(await client.auth.signInWithPassword({ email: account.email, password: account.password }), `Sign in ${name}`);
  assert.equal(data.user.email, account.email);
  if (account.id) assert.equal(data.user.id, account.id); else account.id = data.user.id;
  account.token = data.session.access_token;
  clients[name] = client;
  await save(state);
  return client;
}

async function callDelete(name) {
  const account = state.accounts[name];
  const response = await fetch(`${PROJECT}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { apikey: publicKey, Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'DELETE' }),
    signal: AbortSignal.timeout(90000),
  });
  return { status: response.status, body: await response.json() };
}

async function proveDeleted(name) {
  const account = state.accounts[name];
  const client = createClient(PROJECT, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.ok(result.error, `${name} must not sign in after deletion`);
}

try {
  if (phase === 'setup-leagues') {
    assert.ok(!state.leagueSetupComplete, 'League setup is already complete');
    await login('owner'); await login('applicant'); await login('reviewer');
    assert.equal(new Set(Object.values(state.accounts).map((account) => account.id)).size, 3);
    if (!state.leagueSetupStarted) {
      state.leagueSetupStarted = true; await save(state);
    }

    for (const access of ['public', 'private', 'invite_only']) {
      if (state.leagues[access]?.id) {
        const recorded = state.leagues[access];
        const rows = ok(await clients.owner.from('leagues').select('id,name,owner_user_id,access_type').eq('id', recorded.id), `Verify recorded ${access} league`);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].name, recorded.name);
        assert.equal(rows[0].owner_user_id, state.accounts.owner.id);
        assert.equal(rows[0].access_type, access);
        continue;
      }
      const suffix = access.replace('_', '-').toUpperCase();
      const name = `DISPOSABLE ${suffix} ${state.tag.slice(-8)}`;
      const discriminator = { public: 'PUB', private: 'PRI', invite_only: 'INV' }[access];
      const joinCode = `T${state.tag.slice(-6).toUpperCase()}${discriminator}`;
      const id = ok(await clients.owner.rpc('create_league_v3', {
        p_league_name: name,
        p_join_code: joinCode,
        p_player_name: 'Disposable Owner',
        p_access_type: access,
      }), `Create ${access} test league`);
      assert.match(id, /^[0-9a-f-]{36}$/);
      state.leagues[access] = { id, name, joinCode };
      await save(state);
    }

    const publicJoin = ok(await clients.applicant.rpc('request_or_join_league', {
      p_league_id: state.leagues.public.id,
      p_player_name: 'Disposable Applicant',
    }), 'Join public league');
    assert.equal(publicJoin[0].result, 'joined');
    state.publicApplicantPlayerId = publicJoin[0].player_id;

    const privateRequest = ok(await clients.applicant.rpc('request_or_join_league', {
      p_league_id: state.leagues.private.id,
      p_player_name: 'Disposable Applicant',
    }), 'Request private league access');
    assert.equal(privateRequest[0].result, 'pending');
    state.privateRequestId = privateRequest[0].request_id;
    denied(await clients.applicant.rpc('review_league_join_request', { p_request_id: state.privateRequestId, p_approve: true }), 'Applicant self-approval');
    const ownerQueue = ok(await clients.owner.rpc('get_pending_league_join_requests', { p_league_id: state.leagues.private.id }), 'Read private request as owner');
    assert.deepEqual(ownerQueue.map((row) => row.request_id), [state.privateRequestId]);
    ok(await clients.owner.rpc('review_league_join_request', { p_request_id: state.privateRequestId, p_approve: true }), 'Approve private request');
    state.privateApplicantPlayerId = ok(await clients.applicant.rpc('complete_approved_league_join', { p_request_id: state.privateRequestId }), 'Complete approved private join');

    denied(await clients.applicant.rpc('request_or_join_league', {
      p_league_id: state.leagues.invite_only.id,
      p_player_name: 'Disposable Applicant',
    }), 'Uninvited invite-only join');
    state.invitationId = ok(await clients.owner.rpc('invite_to_league', {
      p_league_id: state.leagues.invite_only.id,
      p_email: state.accounts.applicant.email,
    }), 'Create invite-only invitation');
    const invitedJoin = ok(await clients.applicant.rpc('request_or_join_league', {
      p_league_id: state.leagues.invite_only.id,
      p_player_name: 'Disposable Applicant',
    }), 'Accept invite-only invitation');
    assert.equal(invitedJoin[0].result, 'joined');
    state.inviteApplicantPlayerId = invitedJoin[0].player_id;

    denied(await clients.applicant.rpc('join_league_v2', {
      p_join_code: state.leagues.private.joinCode,
      p_player_name: 'Legacy Bypass Attempt',
    }), 'Legacy private-league bypass');
    denied(await clients.applicant.from('league_join_requests').select('*'), 'Direct join-request table read');
    denied(await clients.applicant.from('league_invitations').select('*'), 'Direct invitation table read');

    const discovery = ok(await clients.applicant.rpc('get_discoverable_leagues'), 'Discover leagues');
    const testRows = discovery.filter((row) => Object.values(state.leagues).some((league) => league.id === row.league_id));
    assert.equal(testRows.length, 3);
    assert.equal(testRows.every((row) => row.is_member), true);
    state.leagueSetupComplete = true;
    await save(state);
    await note('Public, private and invite-only membership flows passed', {
      public: state.leagues.public.id,
      private: state.leagues.private.id,
      inviteOnly: state.leagues.invite_only.id,
    });
    await note('Workflow tables and legacy private-join bypass rejected direct client access');
  } else if (phase === 'moderation') {
    assert.ok(state.moderatorsGranted && !state.moderationStarted, 'Guarded moderator roles must be granted only to recorded test accounts');
    await login('owner'); await login('applicant'); await login('reviewer');
    state.moderationStarted = true; await save(state);
    assert.equal(ok(await clients.owner.rpc('is_app_moderator'), 'Owner test moderator check'), true);
    assert.equal(ok(await clients.reviewer.rpc('is_app_moderator'), 'Reviewer test moderator check'), true);
    assert.equal(ok(await clients.applicant.rpc('is_app_moderator'), 'Applicant ordinary-user check'), false);
    denied(await clients.applicant.rpc('get_moderator_queue'), 'Ordinary user moderator queue');

    state.locationId = ok(await clients.owner.from('table_locations').insert({
      name: `DISPOSABLE TABLE ${state.tag.slice(-8)}`,
      address: '1 Disposable Test Way',
      city: 'Testville',
      region: 'TS',
      postal_code: '00000',
      latitude: 0,
      longitude: 0,
      venue_type: 'other',
      access_type: 'unknown',
      indoor: true,
      table_count: 1,
      notes: `${state.tag}: original disposable note`,
      submitted_by: state.accounts.owner.id,
      status: 'pending',
    }).select('id').single(), 'Create pending disposable location').id;
    await save(state);
    const ownerQueue = ok(await clients.owner.rpc('get_moderator_queue'), 'Read own item in moderator queue');
    assert.equal(ownerQueue.some((item) => item.item_type === 'location' && item.item_id === state.locationId), true);
    denied(await clients.owner.rpc('moderate_queue_item', {
      p_item_type: 'location', p_item_id: state.locationId, p_action: 'approved', p_note: 'self review attempt',
    }), 'Self-moderation of location');
    const stillPending = ok(await clients.owner.from('table_locations').select('status').eq('id', state.locationId).single(), 'Read unchanged pending location');
    assert.equal(stillPending.status, 'pending');
    ok(await clients.reviewer.rpc('moderate_queue_item', {
      p_item_type: 'location', p_item_id: state.locationId, p_action: 'approved', p_note: 'independent disposable review',
    }), 'Independent location approval');

    const proposedNote = `${state.tag}: independently applied edit`;
    state.locationReportId = ok(await clients.owner.from('table_location_reports').insert({
      location_id: state.locationId,
      review_id: null,
      reporter_id: state.accounts.owner.id,
      reason: 'incorrect',
      details: `TTTT_EDIT_SUGGESTION_V1:${JSON.stringify({ changes: { notes: proposedNote } })}`,
      status: 'open',
    }).select('id').single(), 'Create disposable structured edit report').id;
    await save(state);
    denied(await clients.owner.rpc('apply_table_location_edit_suggestion', { p_report_id: state.locationReportId }), 'Self-application of structured edit');
    const beforeIndependentEdit = ok(await clients.owner.from('table_locations').select('notes').eq('id', state.locationId).single(), 'Read unchanged disposable listing');
    assert.notEqual(beforeIndependentEdit.notes, proposedNote);
    ok(await clients.reviewer.rpc('apply_table_location_edit_suggestion', { p_report_id: state.locationReportId }), 'Independent atomic structured edit');
    const afterIndependentEdit = ok(await clients.reviewer.from('table_locations').select('notes,status').eq('id', state.locationId).single(), 'Read independently updated listing');
    assert.equal(afterIndependentEdit.notes, proposedNote);
    assert.equal(afterIndependentEdit.status, 'approved');
    const resolvedEdit = ok(await clients.reviewer.from('table_location_reports').select('status,resolved_by').eq('id', state.locationReportId).single(), 'Read resolved structured edit');
    assert.equal(resolvedEdit.status, 'resolved');
    assert.equal(resolvedEdit.resolved_by, state.accounts.reviewer.id);

    const publicPlayers = ok(await clients.owner.from('players').select('id,user_id').eq('league_id', state.leagues.public.id), 'Read disposable public league players');
    const ownerPlayer = publicPlayers.find((player) => player.user_id === state.accounts.owner.id);
    const applicantPlayer = publicPlayers.find((player) => player.user_id === state.accounts.applicant.id);
    assert.ok(ownerPlayer && applicantPlayer);
    state.publicOwnerPlayerId = ownerPlayer.id;
    state.conversationId = ok(await clients.owner.rpc('get_or_create_direct_conversation', {
      p_league_id: state.leagues.public.id,
      p_other_player_id: applicantPlayer.id,
    }), 'Create disposable private conversation');
    state.directMessageId = ok(await clients.owner.rpc('send_direct_message', {
      p_conversation_id: state.conversationId,
      p_message: `${state.tag}: disposable report target`,
    }), 'Send disposable direct message');
    state.chatReportId = ok(await clients.applicant.rpc('report_chat_message', {
      p_league_id: state.leagues.public.id,
      p_league_message_id: null,
      p_direct_message_id: state.directMessageId,
      p_reason: 'other',
      p_details: `${state.tag}: privacy test`,
    }), 'Report disposable direct message');
    await save(state);
    const reviewerQueue = ok(await clients.reviewer.rpc('get_moderator_queue'), 'Reviewer reads unified queue');
    assert.equal(reviewerQueue.some((item) => item.item_type === 'chat_report' && item.item_id === state.chatReportId), true);
    await note('Ordinary-user denial, self-review denial and independent location/edit moderation passed');
    await note('Disposable direct-message report reached only the unified moderator workflow', { chatReportId: state.chatReportId });
  } else if (phase === 'chat-privacy') {
    assert.ok(state.ownerModeratorRevoked && state.chatReportId && !state.chatPrivacyStarted, 'Owner test moderator must be revoked before league-admin privacy test');
    await login('owner'); await login('applicant'); await login('reviewer');
    state.chatPrivacyStarted = true; await save(state);
    assert.equal(ok(await clients.owner.rpc('is_app_moderator'), 'Revoked owner moderator check'), false);
    denied(await clients.owner.rpc('get_moderator_queue'), 'League admin moderator queue after role revocation');
    const adminView = ok(await clients.owner.from('chat_message_reports').select('id').eq('id', state.chatReportId), 'League admin report visibility check');
    assert.deepEqual(adminView, []);
    const reporterView = ok(await clients.applicant.from('chat_message_reports').select('id,status').eq('id', state.chatReportId), 'Reporter reads own report');
    assert.deepEqual(reporterView.map((row) => row.id), [state.chatReportId]);
    const reviewerView = ok(await clients.reviewer.from('chat_message_reports').select('id,status').eq('id', state.chatReportId), 'App moderator reads report');
    assert.deepEqual(reviewerView.map((row) => row.id), [state.chatReportId]);
    ok(await clients.reviewer.rpc('moderate_queue_item', {
      p_item_type: 'chat_report', p_item_id: state.chatReportId, p_action: 'resolved', p_note: null,
    }), 'Resolve disposable chat report');
    await note('Reporter privacy passed: league admin denied, reporter and independent app moderator allowed');
  } else if (phase === 'cleanup') {
    assert.ok(state.chatPrivacyStarted && !state.cleanupStarted, 'Complete all live workflow checks before cleanup');
    await login('owner'); await login('applicant'); await login('reviewer');
    state.cleanupStarted = true; await save(state);
    for (const [access, league] of Object.entries(state.leagues)) {
      const rows = ok(await clients.owner.from('leagues').select('id,name,owner_user_id').eq('id', league.id), `Verify ${access} cleanup target`);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, league.name);
      assert.equal(rows[0].owner_user_id, state.accounts.owner.id);
      ok(await clients.owner.rpc('admin_delete_league', { p_league_id: league.id }), `Delete only disposable ${access} league`);
      league.deleted = true; await save(state);
    }
    for (const name of ['owner', 'applicant', 'reviewer']) {
      const result = await callDelete(name);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.deleted, true);
      state.accounts[name].deleted = true;
      await save(state);
      await proveDeleted(name);
    }
    state.cleaned = true; await save(state);
    await note('All three disposable leagues and accounts were removed');
  } else if (phase === 'report') {
    console.log(JSON.stringify({
      tag: state.tag,
      accounts: Object.fromEntries(Object.entries(state.accounts).map(([name, account]) => [name, { email: account.email, id: account.id, deleted: !!account.deleted }])),
      leagues: state.leagues,
      locationId: state.locationId,
      locationReportId: state.locationReportId,
      chatReportId: state.chatReportId,
      evidence: state.evidence,
      baseline: state.baseline,
    }, null, 2));
  } else if (phase === 'purge-local-secrets') {
    assert.ok(state.cleaned && Object.values(state.accounts).every((account) => account.deleted), 'Do not discard recovery credentials before cleanup');
    assert.ok(state.finalBaselineVerified, 'Do not discard recovery credentials before the operator baseline check');
    await unlink(STATE);
    console.log('Removed only the completed disposable test credential file.');
  } else {
    throw new Error('Unknown phase');
  }
} catch (error) {
  console.error(error.message);
  console.error('Stopped; exact disposable fixture inventory retained in ignored local state for scoped recovery.');
  process.exitCode = 1;
}
