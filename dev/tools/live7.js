// Live email check in TEST mode. Every message goes only to the owner's test address. Uses the Test Person.
const fs = require('fs'), path = require('path'); const { execFileSync } = require('child_process');
const K = require('../.test-token.json').k;
const U = 'https://script.google.com/macros/s/' + fs.readFileSync(path.join(__dirname, '..', 'DEPLOYMENT_ID.txt'), 'utf8').trim() + '/exec';
const call = b => JSON.parse(execFileSync('curl', ['-sS', '-L', '-m', '120', '-H', 'Content-Type: text/plain;charset=utf-8', '-d', JSON.stringify(Object.assign({ k: K }, b)), U], { encoding: 'utf8' }));
const boot = call({ action: 'boot', quiet: true });
console.log('email mode seen by an admin:', boot.settings.emailMode);
if (boot.settings.emailMode !== 'test') { console.log('STOP: not in test mode, sending nothing.'); process.exit(1); }
const team = call({ action: 'team' });
console.log('test address is set:', !!team.testEmail, '| emails Google allows today:', team.emailsLeftToday);
const adam = boot.people.find(x => x.name === 'Adam Caldwell').id;
let r = call({ action: 'savePost', post: { title: 'Test post 4: your first email', body: 'This post came with a test email.\n\n**Check your inbox** for:\n- "New from Village West" (this post)\n- "Still to read" (a nudge)\n- "Your Village West team app link"\n\nAll three are marked as tests and went only to you.', audience: 'people', audienceIds: [adam], needsRead: true, readBy: '2026-11-27', links: [] } });
console.log('post saved:', r.ok, '| email result:', JSON.stringify(r.email));
const id = r.postId;
r = call({ action: 'nudge', postId: id, ids: [adam] }); console.log('nudge:', JSON.stringify({ ok: r.ok, sent: r.sent, mode: r.mode, message: r.message }));
r = call({ action: 'emailLink', id: adam }); console.log('link email:', JSON.stringify({ ok: r.ok, mode: r.mode, message: r.message }));
const after = call({ action: 'team' }); console.log('emails used by this test:', team.emailsLeftToday - after.emailsLeftToday);
