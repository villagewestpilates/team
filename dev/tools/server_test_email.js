// Email checks: runs the real server code against a pretend Sheet and a pretend mail service.
// Nothing here sends a real email.
const fs = require('fs'), path = require('path'), vm = require('vm');
eval(fs.readFileSync(path.join(__dirname, 'server_test.js'), 'utf8').split('const w = makeWorld();')[0]);   // borrows makeWorld()
const out = []; const ok = (n, pass, x) => out.push((pass ? 'PASS ' : 'FAIL ') + n + (x ? '  [' + x + ']' : ''));

const w = makeWorld(); const mails = []; let quota = 1500;
w.ctx.MailApp = { sendEmail: o => mails.push(o), getRemainingDailyQuota: () => quota };
const setMode = m => { w.tables.Settings.find(r => r.Key === 'EmailMode').Value = m; };
w.tables.Settings.push({ Key: 'TestEmail', Value: 'owner@example.com' });
const adam = w.person('Adam', 'admin', false), chris = w.person('Charlotte', 'poster', false), molly = w.person('Molly', 'member', false), ash = w.person('Aubrey', 'member', true);
w.person('Gone', 'member', false, { Deactivated: true }); w.person('Tester', 'admin', true, { IsTest: true }); w.person('Nomail', 'member', false, { Email: '' });
const base = { body: 'Doors open at 10. **Bring** a friend.\n- One\n- Two', audience: 'everyone', needsRead: true, links: [] };
const to = () => mails.map(m => m.to).sort().join(',');
const reset = () => { mails.length = 0; };

// Off
let r = w.call(chris, { action: 'savePost', post: Object.assign({ title: 'While off' }, base) });
ok('email off: posting sends nothing', r.ok && mails.length === 0 && r.email.sent === 0 && r.email.mode === 'off');
ok('email off: nudge and link email refuse politely', w.call(adam, { action: 'nudge', postId: r.postId, ids: [molly.PersonId] }).code === 'email_off' && w.call(adam, { action: 'emailLink', id: molly.PersonId }).code === 'email_off' && mails.length === 0);

// Test mode
setMode('test'); reset();
r = w.call(chris, { action: 'savePost', post: Object.assign({ title: 'Open house' }, base) }); const p1 = r.postId;
ok('test mode: exactly one email, to the test address only', mails.length === 1 && mails[0].to === 'owner@example.com' && r.email.sent === 1 && r.email.would === 3, to() + ' would=' + r.email.would);
ok('test mode: clearly marked, and says who it would go to', mails[0].subject === '[Test] New from Village West: Open house' && /Test email\. Nobody on the team got this/.test(mails[0].htmlBody) && /Adam Test, plus 2 more/.test(mails[0].htmlBody), mails[0].subject);
ok('sender name and reply-to are the studio', mails[0].name === 'Village West Pilates' && mails[0].replyTo === 'hello@villagewestpilates.com');
ok('button opens that person\'s link at that post', mails[0].htmlBody.includes('https://team.villagewestpilates.com/?k=' + adam.Token + '&amp;p=' + p1) && mails[0].body.includes('?k=' + adam.Token + '&p=' + p1));
ok('preview is plain text, no ** or dashes', /Doors open at 10\. Bring a friend\. One Two/.test(mails[0].htmlBody) && !/\*\*/.test(mails[0].htmlBody));
ok('no emoji and no em dashes in the email', !/[—–]|[\u{1F300}-\u{1FAFF}]/u.test(mails[0].htmlBody + mails[0].subject + mails[0].body));
reset(); r = w.call(adam, { action: 'nudge', postId: p1, ids: [molly.PersonId, ash.PersonId] });
ok('test mode: nudge sends one sample to the test address', r.ok && mails.length === 1 && mails[0].to === 'owner@example.com' && mails[0].subject === '[Test] Still to read: Open house');
reset(); r = w.call(adam, { action: 'emailLink', id: molly.PersonId });
ok('test mode: link email goes to the test address, not Molly', r.ok && to() === 'owner@example.com' && mails[0].htmlBody.includes('?k=' + molly.Token) && !molly.LinkSentAt);

// Live
setMode('live'); reset();
r = w.call(chris, { action: 'savePost', post: Object.assign({ title: 'Live one', readBy: '2026-11-27' }, base) }); const p2 = r.postId;
ok('live: goes to the audience, not the author, not deactivated, test, or no-email people', to() === 'adam@example.com,aubrey@example.com,molly@example.com' && r.email.sent === 3, to());
ok('live: each person gets their own link', mails.every(m => { const t = { 'adam@example.com': adam, 'molly@example.com': molly, 'aubrey@example.com': ash }[m.to]; return m.htmlBody.includes('?k=' + t.Token + '&amp;p=' + p2) && m.htmlBody.includes('Hi ' + t.FirstName + ','); }));
ok('live: subject, read-by date, no test note', mails[0].subject === 'New from Village West: Live one' && /Please read it by Fri, Nov 27\./.test(mails[0].htmlBody) && !/Test email/.test(mails[0].htmlBody));
reset(); r = w.call(adam, { action: 'savePost', post: Object.assign({}, base, { title: 'Apprentices', audience: 'apprentices' }) }); const pA = r.postId;
ok('live: apprentice post only emails apprentices', to() === 'aubrey@example.com', to());
reset(); w.call(chris, { action: 'savePost', post: Object.assign({ title: 'Quiet', skipEmail: true }, base) }); w.call(chris, { action: 'savePost', post: Object.assign({ title: 'FYI' }, base, { needsRead: false }) });
ok('skip-email posts and posts that don\'t need reading send nothing', mails.length === 0);
r = w.call(chris, { action: 'savePost', post: { title: 'A draft', body: 'x', status: 'draft', audience: 'everyone', needsRead: true, links: [] } }); const d1 = r.postId;
ok('saving a draft sends nothing', mails.length === 0 && r.email === null);
r = w.call(chris, { action: 'savePost', post: Object.assign({ id: d1, title: 'A draft, now posted' }, base) });
ok('posting the draft emails the team', to() === 'adam@example.com,aubrey@example.com,molly@example.com' && mails[0].subject === 'New from Village West: A draft, now posted', to());
reset(); w.call(molly, { action: 'markRead', postId: p2 });
r = w.call(chris, { action: 'savePost', change: 'small', post: Object.assign({ id: p2, title: 'Live one.' }, base) });
ok('small fix sends nothing', mails.length === 0);
r = w.call(adam, { action: 'savePost', change: 'real', post: Object.assign({ id: p2, title: 'Live one, changed' }, base) });
ok('real change re-notifies, but not the author or the person who made the change', to() === 'aubrey@example.com,molly@example.com' && mails[0].subject === 'Updated from Village West: Live one, changed', to());

// Nudges
reset(); w.call(molly, { action: 'markRead', postId: p2 });
r = w.call(chris, { action: 'nudge', postId: p2, ids: [molly.PersonId, ash.PersonId, adam.PersonId] });
ok('nudge skips anyone who has read it', r.ok && r.sent === 1 && to() === 'aubrey@example.com', to() + ' sent=' + r.sent);
ok('nudge wording', mails[0].subject === 'Still to read: Live one, changed' && /still waiting on you/.test(mails[0].htmlBody));
ok('readers shows who was nudged', !!w.call(chris, { action: 'readers', postId: p2 }).groups.notOpened.concat(w.call(chris, { action: 'readers', postId: p2 }).groups.opened).find(x => x.id === ash.PersonId).nudgedAt);
reset(); ok('poster cannot nudge on someone else\'s post, team member cannot nudge at all', w.call(chris, { action: 'nudge', postId: pA, ids: [ash.PersonId] }).code === 'forbidden' && w.call(molly, { action: 'nudge', postId: p2, ids: [ash.PersonId] }).code === 'forbidden' && mails.length === 0);
quota = 0; reset(); r = w.call(chris, { action: 'nudge', postId: p2, ids: [ash.PersonId] });
ok('daily limit reached: nudge says so and sends nothing', r.code === 'quota' && mails.length === 0);
r = w.call(chris, { action: 'savePost', post: Object.assign({ title: 'Limit day' }, base) });
ok('daily limit reached: the post still saves, and says the email did not go', r.ok && r.email.quota === true && r.email.sent === 0 && mails.length === 0);
quota = 1500;

// Scheduled
reset(); r = w.call(adam, { action: 'savePost', post: Object.assign({ title: 'Tomorrow', publishAt: new Date(Date.now() + 3600000).toISOString() }, base) }); const s1 = r.postId;
ok('scheduling sends nothing yet', mails.length === 0 && r.email === null);
w.call(molly, { action: 'boot', quiet: true }); ok('still nothing before its time', mails.length === 0);
w.tables.Posts.find(p => p.PostId === s1).PublishAt = new Date(Date.now() - 60000);
w.call(molly, { action: 'boot', quiet: true });
ok('once due, the next app open sends it', to() === 'aubrey@example.com,charlotte@example.com,molly@example.com', to());
w.call(ash, { action: 'boot', quiet: true }); w.call(adam, { action: 'boot', quiet: true });
ok('and only once', mails.length === 3);
reset(); r = w.call(adam, { action: 'savePost', post: Object.assign({ title: 'Was later', publishAt: new Date(Date.now() + 3600000).toISOString() }, base) });
r = w.call(adam, { action: 'savePost', post: Object.assign({ id: r.postId, title: 'Was later, now now' }, base) });
ok('a scheduled post that is posted early emails right then', mails.length === 3 && r.status === '', 'mails=' + mails.length);

// Links and settings
reset(); r = w.call(adam, { action: 'emailLink', id: molly.PersonId });
ok('live: link email goes to the person and records when', to() === 'molly@example.com' && mails[0].subject === 'Your Village West team app link' && !!molly.LinkSentAt && /Add to Home Screen/.test(mails[0].htmlBody));
ok('only admins can email links or change email mode', w.call(chris, { action: 'emailLink', id: molly.PersonId }).code === 'forbidden' && w.call(chris, { action: 'saveSetting', key: 'EmailMode', value: 'live' }).code === 'forbidden');
r = w.call(adam, { action: 'saveSetting', key: 'EmailMode', value: 'off' });
ok('admin can switch email off', r.ok && r.emailMode === 'off' && w.call(molly, { action: 'boot', quiet: true }).settings.emailMode === '');
ok('every send is logged', w.tables.EmailLog.length > 15 && w.tables.EmailLog.every(l => l.Timestamp && l.Type && l.Mode));

console.log(out.join('\n'));
console.log('email pass=' + out.filter(l => l.startsWith('PASS')).length + ' fail=' + out.filter(l => l.startsWith('FAIL')).length);
