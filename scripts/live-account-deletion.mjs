// Explicitly approved disposable production test only. No administrator key.
// Passwords/tokens live in a mode-0600 ignored file; never log that file.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = new URL('../', import.meta.url);
const STATE = new URL('account-deletion-live-run.local', ROOT);
const PROJECT = 'https://juhdzutghafsiggwtaad.supabase.co';
const [phase, approval] = process.argv.slice(2);
assert.equal(approval, '--approved-disposable-tests', 'Explicit test authorization flag required');
const save = (state, exclusive = false) => writeFile(STATE, JSON.stringify(state, null, 2), {
  mode: 0o600, flag: exclusive ? 'wx' : 'w',
});
if (phase === 'prepare') {
  const tag = `tttt-delete-test-20260831-${randomBytes(4).toString('hex')}`;
  const accounts = Object.fromEntries(['empty', 'subject', 'control'].map(name => [name, {
    email: `${tag}-${name}@example.invalid`, password: randomBytes(32).toString('base64url'),
  }]));
  await save({ project: PROJECT, tag, accounts, uploads: [], evidence: [], created: new Date().toISOString() }, true);
  console.log(JSON.stringify({ tag, emails: Object.fromEntries(Object.entries(accounts).map(([name, a]) => [name, a.email])) }));
  process.exit(0);
}

const state = JSON.parse(await readFile(STATE, 'utf8'));
assert.equal(state.project, PROJECT);
assert.match(state.tag, /^tttt-delete-test-20260831-[0-9a-f]{8}$/);
for (const a of Object.values(state.accounts)) assert.ok(a.email.startsWith(state.tag+'-') && a.email.endsWith('@example.invalid'));
process.loadEnvFile(fileURLToPath(new URL('.env.local', ROOT)));
assert.equal(process.env.VITE_SUPABASE_URL, PROJECT);
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(publicKey);
const clients = {};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8ZkAAAAASUVORK5CYII=', 'base64');
function ok(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? result.error.status ?? ''} ${result.error.message}`);
  return result.data;
}
async function note(check, detail = true) {
  const entry = { check, detail, at: new Date().toISOString() };
  state.evidence.push(entry); await save(state); console.log(JSON.stringify(entry));
}
async function login(name) {
  const account = state.accounts[name];
  assert.ok(account && !account.deleted, 'Cannot sign in a deleted test account');
  const client = createClient(PROJECT, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const data = ok(await client.auth.signInWithPassword({ email: account.email, password: account.password }), `Sign in ${name}`);
  assert.equal(data.user.email, account.email);
  if (account.id) assert.equal(data.user.id, account.id); else account.id = data.user.id;
  account.token = data.session.access_token; clients[name] = client; await save(state); return client;
}
async function callDelete(name, body = { confirmation: 'DELETE' }) {
  const response = await fetch(`${PROJECT}/functions/v1/delete-account`, {
    method: 'POST', headers: { apikey: publicKey, Authorization: `Bearer ${state.accounts[name].token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90000),
  });
  return { status: response.status, body: await response.json() };
}
async function upload(name, bucket, path, label) {
  const account = state.accounts[name];
  const allowedPrefix = bucket === 'league-assets' ? `${state.leagueId}/` : `${account.id}/`;
  assert.ok(path.startsWith(allowedPrefix) && path.includes(state.tag));
  const item = { name, bucket, path, label, uploaded: false };
  state.uploads.push(item); await save(state);
  ok(await clients[name].storage.from(bucket).upload(path, png, { contentType: 'image/png', upsert: false, cacheControl: '0' }), `Upload ${label}`);
  item.uploaded = true; await save(state); return path;
}
async function download(name, item) {
  return clients[name].storage.from(item.bucket).download(item.path, { transform: undefined });
}
async function proveDeleted(name) {
  const account = state.accounts[name];
  const loginClient = createClient(PROJECT, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const response = await loginClient.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.ok(response.error, 'Deleted test account must not be able to sign in');
  const stale = createClient(PROJECT, publicKey, { global: { headers: { Authorization: `Bearer ${account.token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const stalePath = `${account.id}/${state.tag}-stale-token.png`;
  const attempt = await stale.storage.from('player-avatars').upload(stalePath, png, { contentType: 'image/png', upsert: false });
  if (!attempt.error) {
    state.uploads.push({name,bucket:'player-avatars',path:stalePath,label:'unexpected-stale-upload',uploaded:true}); await save(state);
    throw new Error('Deleted-account token uploaded a file; exact path recorded for cleanup');
  }
  await note(`${name}: login and stale-token upload rejected`);
}

try {
  if (phase === 'setup') {
    assert.ok(!state.setupStarted, 'Setup already started; inspect saved state instead of duplicating fixtures');
    for (const name of ['empty','subject','control']) await login(name);
    state.setupStarted = true; await save(state);
    const denied = await callDelete('empty', { confirmation: 'NO' });
    assert.equal(denied.status, 400); await note('Missing DELETE confirmation rejected');
    const empty = await callDelete('empty', { confirmation: 'DELETE', userId: state.accounts.control.id, bucket: 'league-assets', path: 'not-a-test-target' });
    assert.equal(empty.status, 200, JSON.stringify(empty.body)); assert.equal(empty.body.deleted, true); assert.equal(empty.body.cleanupPending, false);
    state.accounts.empty.deleted = true; await save(state);
    await proveDeleted('empty'); await login('control'); await note('No-upload deletion succeeds; body-supplied other user ignored');
    state.joinCode = `DELTEST${state.tag.slice(-8).toUpperCase()}`;
    state.leagueName = `DISPOSABLE DELETE TEST ${state.tag.slice(-8)}`;
    state.leagueId = ok(await clients.subject.rpc('create_league_v2', { p_league_name: state.leagueName, p_join_code: state.joinCode, p_player_name: 'Disposable deletion subject' }), 'Create isolated league');
    assert.match(state.leagueId, /^[0-9a-f-]{36}$/); await save(state);
    state.controlPlayerId = ok(await clients.control.rpc('join_league_v2', { p_join_code: state.joinCode, p_player_name: 'Disposable deletion control' }), 'Join isolated league');
    const players = ok(await clients.subject.from('players').select('id,user_id,name').eq('league_id',state.leagueId), 'Read isolated memberships');
    assert.equal(players.length,2); state.subjectPlayerId = players.find(p=>p.user_id===state.accounts.subject.id).id; await save(state);
    await upload('subject','player-avatars',`${state.accounts.subject.id}/${state.tag}-avatar-000.png`,'owner-gate-avatar');
    const blocked = await callDelete('subject');
    assert.equal(blocked.status,409,JSON.stringify(blocked.body)); assert.equal(blocked.body.code,'owned_leagues');
    assert.equal(blocked.body.leagues.length,1); assert.equal(blocked.body.leagues[0].id,state.leagueId);
    const image = ok(await download('subject',state.uploads[0]),'Owner-gate image retained'); assert.equal(image.size,png.length);
    await upload('subject','player-avatars',`${state.accounts.subject.id}/${state.tag}-avatar-001.png`,'owner-gate-uploads-still-allowed');
    await note('League owner blocked before file cleanup; uploads still permitted');
    await upload('subject','league-assets',`${state.leagueId}/${state.tag}-logo.png`,'shared-logo');
    await upload('subject','league-assets',`${state.leagueId}/${state.tag}-banner.png`,'shared-banner');
    // Personal photos may be unsubmitted. Never create a fake public map listing.
    await upload('subject','table-location-photos',`${state.accounts.subject.id}/${state.tag}/table.png`,'private-table-photo');
    await upload('control','player-avatars',`${state.accounts.control.id}/${state.tag}-control-avatar.png`,'other-users-file');
    // Total subject assets exceed the 200-row inventory page and 100-file cleanup batch.
    for (let i=2;i<202;i++) {
      await upload('subject','player-avatars',`${state.accounts.subject.id}/${state.tag}-avatar-${String(i).padStart(3,'0')}.png`,`pagination-${i}`);
      if(i%50===0) await note('Pagination fixture progress',i+1);
    }
    await note('Fixture ready', { leagueId: state.leagueId, subjectId:state.accounts.subject.id, controlId:state.accounts.control.id, subjectPlayerId:state.subjectPlayerId, controlPlayerId:state.controlPlayerId, subjectFiles:state.uploads.filter(x=>x.name==='subject'&&x.uploaded).length });
  } else if (phase === 'shared-fixture') {
    assert.ok(state.leagueId && state.subjectPlayerId && !state.sharedFixtureStarted);
    await login('subject'); await login('control');
    state.sharedFixtureStarted=true; await save(state);
    for (const [rpc,args] of [
      ['get_account_deletion_assets',{p_user_id:state.accounts.subject.id}],
      ['begin_account_deletion',{p_user_id:state.accounts.subject.id}],
      ['prepare_account_deletion_asset_batch',{p_user_id:state.accounts.subject.id,p_bucket_id:'player-avatars',p_object_ids:[randomUUID()]}],
    ]) {
      const result=await clients.control.rpc(rpc,args); assert.ok(result.error,`${rpc} must reject an ordinary account`);
      assert.equal(result.error.code,'42501');
    }
    const intents=await clients.control.from('account_deletion_intents').select('user_id'); assert.ok(intents.error); assert.equal(intents.error.code,'42501');
    await note('Ordinary accounts cannot call cleanup RPCs or read deletion intents');
    ok(await clients.subject.rpc('admin_set_player_role',{p_player_id:state.controlPlayerId,p_role:'admin'}),'Make only the disposable control a test-league administrator');
    const avatar=state.uploads.find(x=>x.label==='owner-gate-avatar');
    const avatarUrl=clients.subject.storage.from(avatar.bucket).getPublicUrl(avatar.path).data.publicUrl;
    ok(await clients.subject.from('players').update({avatar_url:avatarUrl,profile_description:'Synthetic deletion test profile'}).eq('id',state.subjectPlayerId).eq('user_id',state.accounts.subject.id),'Set own test player avatar');
    ok(await clients.subject.from('account_profiles').upsert({user_id:state.accounts.subject.id,display_name:'Disposable deletion subject',avatar_url:avatarUrl,profile_description:'Synthetic deletion test profile'},{onConflict:'user_id'}),'Set own test account profile');
    state.matchId=randomUUID(); await save(state);
    ok(await clients.subject.from('matches').insert({id:state.matchId,league_id:state.leagueId,player_a_id:state.subjectPlayerId,player_b_id:state.controlPlayerId,format:1,games:[{a:11,b:6}],created_by:state.accounts.subject.id}),'Create synthetic historical match');
    ok(await clients.subject.rpc('send_league_message',{p_league_id:state.leagueId,p_message:`${state.tag}: subject message to be removed`}), 'Create synthetic league message');
    state.conversationId=ok(await clients.subject.rpc('get_or_create_direct_conversation',{p_league_id:state.leagueId,p_other_player_id:state.controlPlayerId}),'Create disposable private conversation'); await save(state);
    ok(await clients.subject.rpc('send_direct_message',{p_conversation_id:state.conversationId,p_message:`${state.tag}: synthetic private message to be removed`}), 'Create synthetic direct message');
    ok(await clients.control.rpc('send_league_message',{p_league_id:state.leagueId,p_message:`${state.tag}: control message to retain`}), 'Create control league message');
    const logo=state.uploads.find(x=>x.label==='shared-logo'); const banner=state.uploads.find(x=>x.label==='shared-banner');
    const updated=ok(await clients.subject.from('leagues').update({owner_user_id:state.accounts.control.id,logo_path:logo.path,logo_url:clients.subject.storage.from(logo.bucket).getPublicUrl(logo.path).data.publicUrl,banner_path:banner.path,banner_url:clients.subject.storage.from(banner.bucket).getPublicUrl(banner.path).data.publicUrl}).eq('id',state.leagueId).eq('name',state.leagueName).eq('owner_user_id',state.accounts.subject.id).select('id'),'Assign only the disposable test league to the disposable control');
    if(updated.length===0) {
      // The deployed legacy schema denies direct league updates. An operator
      // must set references/ownership only on the recorded disposable league.
      state.needsOperatorTransfer=true; await save(state);
      await note('Operator fixture setup required by league update policy', {leagueId:state.leagueId,subjectId:state.accounts.subject.id,controlId:state.accounts.control.id});
    } else assert.deepEqual(updated,[{id:state.leagueId}]);
    const photo=state.uploads.find(x=>x.label==='private-table-photo');
    photo.signedUrl=ok(await clients.subject.storage.from(photo.bucket).createSignedUrl(photo.path,1800),'Sign temporary private test photo').signedUrl; await save(state);
    const before=await fetch(photo.signedUrl,{cache:'no-store'}); assert.equal(before.status,200); assert.equal((await before.arrayBuffer()).byteLength,png.length);
    await note('Historical match and synthetic messages ready; private photo bytes retrieved');
  } else if (phase === 'sign-private-photo') {
    await login('subject');
    const photo=state.uploads.find(x=>x.label==='private-table-photo');
    photo.signedUrl=ok(await clients.subject.storage.from(photo.bucket).createSignedUrl(photo.path,1800),'Sign temporary private test photo').signedUrl; await save(state);
    const before=await fetch(photo.signedUrl,{cache:'no-store'}); assert.equal(before.status,200); assert.equal((await before.arrayBuffer()).byteLength,png.length);
    await note('Private test photo bytes verified using a temporary signed link');
  } else if (phase === 'intent-guards') {
    await login('subject'); await login('control');
    const blockedPath=`${state.accounts.subject.id}/${state.tag}-intent-blocked.png`;
    const blocked=await clients.subject.storage.from('player-avatars').upload(blockedPath,png,{contentType:'image/png'});
    if(!blocked.error) {state.uploads.push({name:'subject',bucket:'player-avatars',path:blockedPath,label:'unexpected-intent-upload',uploaded:true}); await save(state);}
    assert.ok(blocked.error,'Durable deletion intent must block new uploads');
    const avatar=state.uploads.find(x=>x.label==='owner-gate-avatar');
    const replace=await clients.subject.storage.from(avatar.bucket).update(avatar.path,png,{contentType:'image/png'}); assert.ok(replace.error,'Deletion intent must block replacements');
    await clients.control.from('leagues').update({owner_user_id:state.accounts.subject.id}).eq('id',state.leagueId).eq('owner_user_id',state.accounts.control.id);
    const ownership=ok(await clients.control.from('leagues').select('owner_user_id').eq('id',state.leagueId).single(),'Read unchanged test ownership');
    assert.equal(ownership.owner_user_id,state.accounts.control.id,'Ordinary API cannot assign ownership to deleting subject; database trigger is checked separately');
    const control=state.uploads.find(x=>x.name==='control'); const allowed=await clients.control.storage.from(control.bucket).update(control.path,png,{contentType:'image/png'}); ok(allowed,'Other account can still update its own photo');
    await note('Durable-intent retry state blocks subject uploads/replacements/ownership but not control uploads');
  } else if (phase === 'delete-subject') {
    assert.ok(state.leagueId && state.subjectPlayerId);
    await login('subject'); await login('control');
    const league = ok(await clients.control.from('leagues').select('id,name,owner_user_id,logo_path,banner_path').eq('id',state.leagueId).single(),'Read test league');
    assert.equal(league.name,state.leagueName); assert.equal(league.owner_user_id,state.accounts.control.id,'Transfer only this test league to its test control before proceeding');
    assert.ok(league.logo_path?.includes(state.tag) && league.banner_path?.includes(state.tag));
    const result = await callDelete('subject');
    await note('Subject deletion response', result);
    assert.equal(result.status,200,JSON.stringify(result.body)); assert.equal(result.body.deleted,true); assert.equal(result.body.cleanupPending,false);
    state.accounts.subject.deleted=true; await save(state);
    await proveDeleted('subject');
    const kept = ok(await clients.control.from('leagues').select('id,owner_user_id,logo_path,logo_url,banner_path,banner_url').eq('id',state.leagueId).single(),'Shared test league remains');
    assert.equal(kept.owner_user_id,state.accounts.control.id);
    for(const key of ['logo_path','logo_url','banner_path','banner_url']) assert.equal(kept[key],null);
    const player = ok(await clients.control.from('players').select('id,user_id,name,avatar_url,is_active').eq('id',state.subjectPlayerId).single(),'Historical player retained');
    assert.equal(player.user_id,null); assert.equal(player.name,'Deleted Player'); assert.equal(player.avatar_url,null); assert.equal(player.is_active,false);
    const match=ok(await clients.control.from('matches').select('id,player_a_id,player_b_id').eq('id',state.matchId).single(),'Historical match remains');
    assert.equal(match.player_a_id,state.subjectPlayerId); assert.equal(match.player_b_id,state.controlPlayerId);
    const messages=ok(await clients.control.from('league_messages').select('player_id').eq('league_id',state.leagueId),'Read only disposable league messages');
    assert.equal(messages.some(x=>x.player_id===state.subjectPlayerId),false); assert.equal(messages.some(x=>x.player_id===state.controlPlayerId),true);
    const direct=ok(await clients.control.from('direct_messages').select('id').eq('conversation_id',state.conversationId),'Read only disposable conversation'); assert.equal(direct.length,0);
    for(const item of state.uploads.filter(x=>x.name==='subject'&&x.uploaded)) {
      const result = await download('control',item);
      assert.ok(result.error,`Deleted file still downloadable: ${item.label}`);
      // Private-file access denial alone is not proof of removal; separately verify SQL inventory.
      if(item.bucket!=='table-location-photos') {
        const {data:{publicUrl}}=clients.control.storage.from(item.bucket).getPublicUrl(item.path);
        const response=await fetch(`${publicUrl}?verify=${randomUUID()}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        assert.ok([400,404].includes(response.status),`Unexpected public file response: ${item.label} ${response.status}`);
        assert.match(await response.text(),/not.?found|does not exist/i);
      } else if(item.signedUrl) {
        const response=await fetch(item.signedUrl,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        assert.ok([400,404].includes(response.status),'Previously retrievable private photo must be removed');
        assert.match(await response.text(),/not.?found|does not exist/i);
      }
    }
    const other = state.uploads.find(x=>x.name==='control');
    const retained=ok(await download('control',other),'Other account file remains'); assert.equal(retained.size,png.length);
    await note('Shared league/player/match history retained; own chat removed; shared image references cleared; other user file/message retained');
    await note('All deleted subject file downloads rejected', state.uploads.filter(x=>x.name==='subject'&&x.uploaded).length);
  } else if (phase === 'cleanup') {
    assert.ok(state.accounts.subject.deleted && state.accounts.empty.deleted,'Verify earlier deletion phases before cleanup');
    await login('control');
    const leagues=ok(await clients.control.from('leagues').select('id,name,owner_user_id').eq('id',state.leagueId),'Verify exact cleanup target');
    if(leagues.length) {
      assert.equal(leagues.length,1); assert.equal(leagues[0].name,state.leagueName); assert.equal(leagues[0].owner_user_id,state.accounts.control.id);
      ok(await clients.control.rpc('admin_delete_league',{p_league_id:state.leagueId}),'Remove only isolated test league');
    }
    const result=await callDelete('control'); assert.equal(result.status,200,JSON.stringify(result.body)); assert.equal(result.body.deleted,true);
    state.accounts.control.deleted=true; await save(state); await proveDeleted('control');
    await note('Disposable league and remaining control account cleaned up');
  } else if (phase === 'final-check') {
    assert.ok(Object.values(state.accounts).every(a=>a.deleted));
    const control=state.uploads.find(x=>x.name==='control');
    const response=await fetch(`${PROJECT}/storage/v1/object/public/${control.bucket}/${control.path}?verify=${randomUUID()}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    assert.ok([400,404].includes(response.status)); assert.match(await response.text(),/not.?found|does not exist/i);
    await note('Final control photo public URL no longer serves bytes');
  } else if (phase === 'report') {
    console.log(JSON.stringify({tag:state.tag,accounts:Object.fromEntries(Object.entries(state.accounts).map(([name,a])=>[name,{email:a.email,id:a.id,deleted:!!a.deleted}])),leagueId:state.leagueId,subjectPlayerId:state.subjectPlayerId,controlPlayerId:state.controlPlayerId,files:state.uploads.length,evidence:state.evidence},null,2));
  } else if (phase === 'purge-local-secrets') {
    assert.ok(Object.values(state.accounts).every(a=>a.deleted),'Do not discard recovery credentials before all test accounts are deleted');
    await unlink(STATE); console.log('Removed only the completed test run credential file.');
  } else throw new Error('Unknown phase');
} catch(error) {
  // Supabase operation messages contain no passwords/tokens. Never dump client or state objects.
  console.error(error.message); console.error('Stopped; exact fixture inventory retained in ignored local state for scoped recovery.'); process.exitCode=1;
}
