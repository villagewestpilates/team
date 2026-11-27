// Phone notification checks: runs the real server code against a pretend Sheet, mail service and notification service.
// Nothing here sends a real notification or email.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
eval(fs.readFileSync(path.join(__dirname, 'server_test.js'), 'utf8').split('const w = makeWorld();')[0]);   // borrows makeWorld()
const out = []; const ok = (n, pass, x) => out.push((pass ? 'PASS ' : 'FAIL ') + n + (x ? '  [' + x + ']' : ''));

const w = makeWorld(); const mails = []; let pushes = []; let gone = {};
w.ctx.MailApp = { sendEmail: o => mails.push(o), getRemainingDailyQuota: () => 1500 };
w.ctx.UrlFetchApp = { fetchAll: reqs => reqs.map(q => { pushes.push(q); return { getResponseCode: () => gone[q.url] ? 410 : 201 }; }) };
const setMode = m => { w.tables.Settings.find(r => r.Key === 'EmailMode').Value = m; };
w.tables.Settings.push({ Key: 'TestEmail', Value: 'owner@example.com' });
const adam = w.person('Adam', 'admin', false), chris = w.person('Charlotte', 'poster', false), molly = w.person('Molly', 'member', false), ash = w.person('Aubrey', 'member', true);
const gonePerson = w.person('Gone', 'member', false, { Deactivated: true });
const base = { body: 'Doors open at 10.', audience: 'everyone', needsRead: true, links: [] };
const to = () => mails.map(m => m.to).sort().join(',');
const reset = () => { mails.length = 0; pushes = []; };
const EP = n => 'https://web.push.apple.com/' + n;
const live = () => w.tables.Push.filter(r => !r.Voided && r.Voided !== 'TRUE');

// Signing up a phone
let r = w.call(molly, { action: 'pushKey' });
ok('the public key is a valid P-256 key', r.ok && /^B[A-Za-z0-9_-]{86}$/.test(r.key), r.key && r.key.length);
const pubKey = r.key;
ok('the key stays the same between calls', w.call(adam, { action: 'pushKey' }).key === pubKey);
ok('an address that is not a phone notification service is refused', w.call(molly, { action: 'pushOn', endpoint: 'https://example.com/hook' }).ok === false && w.call(molly, { action: 'pushOn', endpoint: 'http://web.push.apple.com/x' }).ok === false && w.call(molly, { action: 'pushOn', endpoint: 'https://evilpush.apple.com.example.com/x' }).ok === false && live().length === 0);
ok('a real phone address is saved', w.call(molly, { action: 'pushOn', endpoint: EP('molly-1') }).ok && live().length === 1 && live()[0].PersonId === molly.PersonId);
w.call(molly, { action: 'pushOn', endpoint: EP('molly-1') });
ok('the same phone twice is stored once', live().length === 1);
ok('Android and other browsers are accepted too', w.call(adam, { action: 'pushOn', endpoint: 'https://fcm.googleapis.com/fcm/send/adam-1' }).ok && live().length === 2);
ok('someone without a valid link cannot sign up a phone', w.ctx.route_({ action: 'pushOn', k: 'x'.repeat(32), endpoint: EP('nobody') }).code === 'auth');

// Off: nothing at all
r = w.call(chris, { action: 'savePost', post: Object.assign({ title: 'While off' }, base) });
ok('off: posting sends no notification and no email', r.ok && pushes.length === 0 && mails.length === 0);

// Test: only a sample to the person posting
setMode('test'); reset();
r = w.call(chris, { action: 'savePost', post: Object.assign({ title: 'In test' }, base) });
ok('test: the team gets no notification', pushes.length === 0 && mails.length === 1 && mails[0].to === 'owner@example.com', 'pushes=' + pushes.length);
reset(); r = w.call(adam, { action: 'savePost', post: Object.assign({ title: 'In test by Adam' }, base) });
ok('test: the person posting gets one sample on their own phone', pushes.length === 1 && /adam-1$/.test(pushes[0].url) && mails.length === 1 && mails[0].to === 'owner@example.com');

// Live
setMode('live'); reset();
r = w.call(chris, { action: 'savePost', post: Object.assign({ title: 'Live one' }, base) }); const p1 = r.postId;
ok('live: people with notifications on get one, and no email', pushes.map(p => p.url.split('/').pop()).sort().join(',') === 'adam-1,molly-1' && to() === 'aubrey@example.com', pushes.length + ' / ' + to());
ok('live: the result counts both', r.email.sent === 1 && r.email.push === 2, JSON.stringify(r.email));
ok('a notification carries no post content', pushes.every(p => p.payload === undefined && p.method === 'post'));

// The signature each notification service checks
const h = pushes[0].headers.Authorization, t = /t=([^,]+)/.exec(h)[1], k = /k=(\S+)/.exec(h)[1];
const [jh, jb, js] = t.split('.'); const claims = JSON.parse(Buffer.from(jb, 'base64url').toString());
const raw = Buffer.from(pubKey, 'base64url');
const keyObj = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
ok('the signature verifies against the public key', k === pubKey && crypto.verify('sha256', Buffer.from(jh + '.' + jb), { key: keyObj, dsaEncoding: 'ieee-p1363' }, Buffer.from(js, 'base64url')));
ok('the signature names the right service, the site, and a near expiry', /^https:\/\/(web\.push\.apple\.com|fcm\.googleapis\.com)$/.test(claims.aud) && claims.sub === 'https://team.villagewestpilates.com' && claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 86400, JSON.stringify(claims));

// The author is never notified about their own post
w.call(chris, { action: 'pushOn', endpoint: EP('chris-1') }); reset();
r = w.call(chris, { action: 'savePost', post: Object.assign({ title: 'Mine' }, base) });
ok('the author gets nothing for their own post', !pushes.some(p => /chris-1$/.test(p.url)) && !/charlotte/.test(to()));

// A phone that has gone away
gone[EP('molly-1')] = true; reset();
r = w.call(chris, { action: 'savePost', post: Object.assign({ title: 'After Molly reset her phone' }, base) });
ok('a phone that is gone is retired, and email takes over in the same send', !live().some(x => x.Endpoint === EP('molly-1')) && /molly@example.com/.test(to()), to());
reset(); r = w.call(chris, { action: 'savePost', post: Object.assign({ title: 'Next one' }, base) });
ok('after that she is emailed and not notified', !pushes.some(p => /molly-1$/.test(p.url)) && /molly@example.com/.test(to()));
gone = {};

// Audience and deactivated people
w.tables.Push.push({ PersonId: gonePerson.PersonId, Endpoint: EP('gone-1'), CreatedAt: new Date(), Voided: false });
w.call(ash, { action: 'pushOn', endpoint: EP('ash-1') }); reset();
r = w.call(adam, { action: 'savePost', post: Object.assign({ title: 'Apprentices' }, base, { audience: 'apprentices' }) });
ok('only the audience is notified, never a deactivated person', pushes.map(p => p.url.split('/').pop()).join(',') === 'ash-1' && mails.length === 0, pushes.map(p => p.url.split('/').pop()).join(','));
reset(); r = w.call(adam, { action: 'savePost', post: Object.assign({ title: 'Quiet' }, base, { skipEmail: true }) });
ok('skipping the email skips the notification too', pushes.length === 0 && mails.length === 0);
reset(); r = w.call(adam, { action: 'savePost', post: Object.assign({ title: 'No read needed' }, base, { needsRead: false }) });
ok('a post that does not need a read notifies no one', pushes.length === 0 && mails.length === 0);

// Nudges
w.call(molly, { action: 'pushOn', endpoint: EP('molly-2') }); reset();
r = w.call(chris, { action: 'nudge', postId: p1, ids: [molly.PersonId, ash.PersonId, adam.PersonId] });
ok('live nudge: notifications to phones, none by email for those people', r.ok && r.sent === 3 && pushes.length === 3 && mails.length === 0, JSON.stringify({ sent: r.sent, p: pushes.length, m: mails.length }));
ok('the nudge is recorded for each person', w.call(chris, { action: 'readers', postId: p1 }).groups.notOpened.concat(w.call(chris, { action: 'readers', postId: p1 }).groups.opened).filter(x => x.nudgedAt).length === 3);
w.call(molly, { action: 'markRead', postId: p1 }); reset();
r = w.call(chris, { action: 'nudge', postId: p1, ids: [molly.PersonId] });
ok('someone who has read it is never nudged', r.ok === false && pushes.length === 0 && mails.length === 0);
setMode('test'); reset();
r = w.call(chris, { action: 'nudge', postId: p1, ids: [ash.PersonId] });
ok('test nudge: the team member gets nothing on their phone', !pushes.some(p => /ash-1$/.test(p.url)) && mails.length === 1 && mails[0].to === 'owner@example.com' && r.mode === 'test');
setMode('off'); reset();
ok('off: nudge refuses as before', w.call(chris, { action: 'nudge', postId: p1, ids: [ash.PersonId] }).code === 'email_off' && pushes.length === 0);

// Switching off
setMode('live');
ok('switching off retires that phone only', w.call(molly, { action: 'pushOff', endpoint: EP('molly-2') }).ok && !live().some(x => x.Endpoint === EP('molly-2')) && live().some(x => x.Endpoint === EP('ash-1')));
ok('one person cannot switch off another person\'s phone', w.call(molly, { action: 'pushOff', endpoint: EP('ash-1') }).ok && live().some(x => x.Endpoint === EP('ash-1')));
w.call(molly, { action: 'pushOn', endpoint: EP('ash-1') });
ok('a phone handed to someone else moves to them', live().filter(x => x.Endpoint === EP('ash-1')).length === 1 && live().find(x => x.Endpoint === EP('ash-1')).PersonId === molly.PersonId);
ok('every notification is logged without the phone address', w.tables.EmailLog.filter(l => l.SentTo === 'phone notification').length >= 8 && w.tables.EmailLog.every(l => !/push\.apple|fcm\.google/.test(String(l.SentTo))));

console.log(out.join('\n'));
console.log('push pass=' + out.filter(l => l.startsWith('PASS')).length + ' fail=' + out.filter(l => l.startsWith('FAIL')).length);
