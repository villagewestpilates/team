// Live check of drafts and scheduling on the real server, using only the Test Person. Leaves two hidden rows.
const fs = require('fs'), path = require('path'); const { execFileSync } = require('child_process');
const K = require('../.test-token.json').k;
const U = 'https://script.google.com/macros/s/' + fs.readFileSync(path.join(__dirname, '..', 'DEPLOYMENT_ID.txt'), 'utf8').trim() + '/exec';
const call = b => JSON.parse(execFileSync('curl', ['-sS', '-L', '-m', '90', '-H', 'Content-Type: text/plain;charset=utf-8', '-d', JSON.stringify(Object.assign({ k: K }, b)), U], { encoding: 'utf8' }));
const me = call({ action: 'boot', quiet: true }).me.id;
let r = call({ action: 'savePost', post: { title: 'Throwaway draft check', body: '', status: 'draft', audience: 'people', audienceIds: [me], links: [] } });
let p = r.posts.find(x => x.id === r.postId);
console.log('draft saved:', r.ok, '| status:', r.status, '| saved time present:', !!p.savedAt, '| not counted as read:', !p.readAt);
const id = r.postId;
r = call({ action: 'savePost', post: { id, title: 'Throwaway draft check', body: 'Now with text', audience: 'people', audienceIds: [me], needsRead: true, links: [], publishAt: new Date(Date.now() + 2 * 86400000).toISOString() } });
p = r.posts.find(x => x.id === id);
console.log('draft turned into scheduled:', r.status === 'scheduled', '| publish time kept:', !!p.publishAt, '| status on post:', p.status);
r = call({ action: 'savePost', post: { id, title: 'Throwaway draft check', body: 'Now with text', audience: 'people', audienceIds: [me], needsRead: true, links: [] } });
p = r.posts.find(x => x.id === id);
console.log('scheduled turned into posted:', r.status === '', '| live:', p.status === '');
r = call({ action: 'archivePost', postId: id }); console.log('removed:', r.ok && !r.posts.find(x => x.id === id));
