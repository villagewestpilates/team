// Runs the real server code (src/Code.js) against a pretend Sheet held in memory.
// This lets us check what each kind of person is allowed to see, without touching the real Sheet.
const fs = require('fs'), path = require('path'), vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.js'), 'utf8');
const log = []; const check = (n, ok, x) => log.push((ok ? 'PASS ' : 'FAIL ') + n + (x ? '  [' + x + ']' : ''));

function makeWorld() {
  const tables = {}; let uid = 0;
  const ctx = { console, JSON, Date, Math, Number, String, Object, Array, isNaN, RegExp,
    Utilities: { getUuid: () => require("crypto").randomUUID(), formatDate: (d, tz, f) => f === 'EEE, MMM d' ? new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(d) : new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => ({ SEED_VERSION: '99', SHEET_ID: 'x' }[k] || null), setProperty() {} }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { flush() {} }, ContentService: {}, MailApp: { sendEmail() {}, getRemainingDailyQuota: () => 1500 }, ScriptApp: {}, Logger: { log() {} } };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  // Swap the Sheet helpers for in-memory ones. Everything above them is the real code.
  const TABS = vm.runInContext('TABS', ctx);
  Object.keys(TABS).forEach(n => { tables[n] = []; });
  ctx.table_ = name => ({ headers: TABS[name], sh: null, rows: tables[name].map((r, i) => Object.assign({ _row: i + 2 }, r)) });
  ctx.appendRows_ = (name, objs) => objs.forEach(o => { const r = {}; TABS[name].forEach(h => { r[h] = o[h] === undefined ? '' : o[h]; }); tables[name].push(r); });
  ctx.updateRow_ = (name, row, obj) => Object.assign(tables[name][row - 2], obj);
  ctx.voidReads_ = postId => tables.Reads.forEach(r => { if (r.PostId === postId) r.Voided = true; });
  ctx.savePhoto_ = () => {}; ctx.clearPhoto_ = () => {}; ctx.photoRows_ = () => [];
  ctx.setting_ = key => (tables.Settings.find(r => r.Key === key) || {}).Value || '';
  const person = (name, role, apprentice, extra) => { const p = Object.assign({ PersonId: 'p_' + name.toLowerCase(), Name: name + ' Test', FirstName: name, Email: name.toLowerCase() + '@example.com', Role: role, Apprentice: apprentice, Token: (name + 'token').padEnd(32, 'k'), Deactivated: false, CreatedAt: new Date(), LinkSentAt: '', IsTest: false, EditTools: role !== 'member' }, extra || {}); tables.Team.push(p); return p; };
  tables.Categories.push({ CategoryId: 'cat_announcements', Name: 'Announcements', Color: '#3F5FC0', SortOrder: 1, Archived: false });
  tables.Settings.push({ Key: 'Beta', Value: true }, { Key: 'DefaultCategory', Value: 'cat_announcements' }, { Key: 'EmailMode', Value: 'off' });
  const call = (who, body) => vm.runInContext('route_', ctx)(Object.assign({ k: who.Token }, body));
  return { tables, ctx, person, call };
}

const w = makeWorld();
const adam = w.person('Adam', 'admin', false), chris = w.person('Charlotte', 'poster', false), molly = w.person('Molly', 'member', false), ash = w.person('Aubrey', 'member', true), gone = w.person('Gone', 'member', false, { Deactivated: true });
const posts = who => w.call(who, { action: 'boot', quiet: true }).posts;
const base = { body: 'Text', audience: 'everyone', needsRead: true, links: [] };

// Sign-in
check('unknown token is refused', w.call({ Token: 'nope'.padEnd(32, 'x') }, { action: 'boot' }).code === 'auth');
check('deactivated person is refused', w.call(gone, { action: 'boot' }).code === 'auth');
check('short token is refused', w.call({ Token: 'short' }, { action: 'boot' }).code === 'auth');

// Who can post
check('team member cannot post', w.call(molly, { action: 'savePost', post: Object.assign({ title: 'x' }, base) }).code === 'forbidden');
let r = w.call(chris, { action: 'savePost', post: Object.assign({ title: 'For everyone' }, base) }); const everyoneId = r.postId;
check('poster can post', r.ok && r.status === '');
check('everyone sees it, author already read', posts(molly).length === 1 && !posts(molly)[0].readAt && !!posts(chris)[0].readAt);
check('team member gets no counts or edit rights', posts(molly)[0].stats === undefined && !posts(molly)[0].canEdit);
check('count leaves out deactivated people', JSON.stringify(posts(chris)[0].stats) === '{"read":1,"total":4}', JSON.stringify(posts(chris)[0].stats));

// Audience
r = w.call(adam, { action: 'savePost', post: Object.assign({ title: 'Apprentices only' }, base, { audience: 'apprentices' }) }); const appId = r.postId;
check('apprentice sees apprentice post, others do not', posts(ash).some(p => p.id === appId) && !posts(molly).some(p => p.id === appId) && !posts(chris).some(p => p.id === appId));
check('admin sees it but is not asked to read it', posts(adam).find(p => p.id === appId).forMe === false);
r = w.call(adam, { action: 'savePost', post: Object.assign({ title: 'Just Molly' }, base, { audience: 'people', audienceIds: [molly.PersonId] }) }); const mollyId = r.postId;
check('selected-people post only reaches them', posts(molly).some(p => p.id === mollyId) && !posts(ash).some(p => p.id === mollyId));
check('someone outside the audience cannot mark it read', w.call(ash, { action: 'markRead', postId: mollyId }).ok === false);
check('nor load its photo, nor see who read it', w.call(ash, { action: 'getPhoto', postId: mollyId }).ok === false && w.call(molly, { action: 'readers', postId: mollyId }).code === 'forbidden');

// Reading
check('mark as read saves once', w.call(molly, { action: 'markRead', postId: everyoneId }).ok && w.call(molly, { action: 'markRead', postId: everyoneId }).ok && w.tables.Reads.filter(x => x.PostId === everyoneId && x.PersonId === molly.PersonId).length === 1);
w.call(ash, { action: 'viewPost', postId: everyoneId });
let g = w.call(chris, { action: 'readers', postId: everyoneId }).groups;
check('three groups: read, opened, not opened', g.read.length === 2 && g.opened.length === 1 && g.opened[0].name === 'Aubrey Test' && g.notOpened.length === 1, JSON.stringify([g.read.length, g.opened.length, g.notOpened.length]));
check('poster cannot edit or see readers on someone else\'s post', w.call(chris, { action: 'readers', postId: appId }).code === 'forbidden' && w.call(chris, { action: 'savePost', post: Object.assign({ id: appId, title: 'hack' }, base) }).code === 'forbidden');
r = w.call(chris, { action: 'savePost', change: 'small', post: Object.assign({ id: everyoneId, title: 'For everyone (typo fixed)' }, base) });
check('small fix keeps reads', !!posts(molly).find(p => p.id === everyoneId).readAt && !posts(molly).find(p => p.id === everyoneId).updated);
r = w.call(chris, { action: 'savePost', change: 'real', post: Object.assign({ id: everyoneId, title: 'For everyone (changed)' }, base) });
let pm = posts(molly).find(p => p.id === everyoneId);
check('real change resets reads and tags Updated', !pm.readAt && pm.updated === true && !!posts(chris).find(p => p.id === everyoneId).readAt);
g = w.call(chris, { action: 'readers', postId: everyoneId }).groups;
check('real change also clears old "opened" marks', g.opened.length === 0 && g.read.length === 1, JSON.stringify([g.read.length, g.opened.length, g.notOpened.length]));

// Drafts
r = w.call(chris, { action: 'savePost', post: { title: 'Half done', body: '', status: 'draft', audience: 'everyone', links: [] } }); const draftId = r.postId;
check('draft saves with only a title', r.ok && r.status === 'draft', JSON.stringify(r.message || ''));
check('draft is hidden from the team', !posts(molly).some(p => p.id === draftId) && !posts(ash).some(p => p.id === draftId));
check('author and admins see the draft, marked as a draft', posts(chris).find(p => p.id === draftId).status === 'draft' && posts(adam).find(p => p.id === draftId).status === 'draft');
check('team member cannot open a draft by its id', w.call(molly, { action: 'markRead', postId: draftId }).ok === false && w.call(molly, { action: 'viewPost', postId: draftId }).ok === false);
check('draft has a saved time', !!posts(chris).find(p => p.id === draftId).savedAt);
check('posting a draft still needs its text', w.call(chris, { action: 'savePost', post: { id: draftId, title: 'Half done', body: '', audience: 'everyone', links: [] } }).field === 'body');
r = w.call(chris, { action: 'savePost', post: Object.assign({ id: draftId, title: 'Now done' }, base) });
pm = posts(molly).find(p => p.id === draftId);
check('posting the draft makes it visible and unread for the team', r.ok && r.status === '' && !!pm && !pm.readAt && !pm.updated && !!posts(chris).find(p => p.id === draftId).readAt);

// Scheduled
const soon = new Date(Date.now() + 3600000).toISOString();
r = w.call(adam, { action: 'savePost', post: Object.assign({ title: 'Later today', publishAt: soon }, base) }); const schedId = r.postId;
check('scheduled post is saved as scheduled', r.ok && r.status === 'scheduled' && posts(adam).find(p => p.id === schedId).status === 'scheduled');
check('scheduled post is hidden from the team until its time', !posts(molly).some(p => p.id === schedId) && w.call(molly, { action: 'markRead', postId: schedId }).ok === false);
w.tables.Posts.find(p => p.PostId === schedId).PublishAt = new Date(Date.now() - 60000);   // time passes
pm = posts(molly).find(p => p.id === schedId);
check('once its time passes, the team sees it, dated when it went out', !!pm && !pm.readAt && Math.abs(new Date(pm.createdAt) - Date.now()) < 5 * 60000 && posts(adam).find(p => p.id === schedId).status === '');
r = w.call(adam, { action: 'savePost', post: Object.assign({ title: 'In the past', publishAt: new Date(Date.now() - 86400000).toISOString() }, base) });
check('a time in the past just posts now', r.ok && r.status === '');

// Removing, team admin
check('poster removes own post, gone for everyone', w.call(chris, { action: 'archivePost', postId: everyoneId }).ok && !posts(molly).some(p => p.id === everyoneId) && w.tables.Posts.length >= 4);
check('only admins reach the Team screen', w.call(chris, { action: 'team' }).code === 'forbidden' && w.call(molly, { action: 'savePerson', person: { name: 'A B', email: 'a@b.co' } }).code === 'forbidden' && w.call(adam, { action: 'team' }).ok);
check('admin cannot deactivate self or drop own admin role', w.call(adam, { action: 'setActive', id: adam.PersonId, active: false }).ok === false && w.call(adam, { action: 'savePerson', person: { id: adam.PersonId, name: 'Adam Test', email: 'adam@example.com', role: 'member' } }).ok === false);
r = w.call(adam, { action: 'savePerson', person: { name: 'New Hire', email: 'new@example.com', role: 'member', apprentice: true } });
const hire = w.tables.Team.find(t => t.PersonId === r.personId);
check('added person gets a 32-character link and can sign in', r.ok && hire.Token.length === 32 && w.call(hire, { action: 'boot' }).ok);
w.call(adam, { action: 'setActive', id: hire.PersonId, active: false });
check('deactivated: link stops, row stays', w.call(hire, { action: 'boot' }).code === 'auth' && w.tables.Team.includes(hire));
const oldTok = molly.Token; w.call(adam, { action: 'newLink', id: molly.PersonId });
check('new link: old one stops working', w.call({ Token: oldTok }, { action: 'boot' }).code === 'auth' && w.call(molly, { action: 'boot' }).ok);

// Resources
w.tables.Resources.push({ ResourceId: 'r1', Title: 'Open', Url: 'https://a.co', Section: 'Docs', Audience: 'everyone', SortOrder: 1, Archived: false }, { ResourceId: 'r2', Title: 'No link yet', Url: '', Section: 'Docs', Audience: 'everyone', SortOrder: 2, Archived: false }, { ResourceId: 'r3', Title: 'Apprentice', Url: 'https://b.co', Section: 'A', Audience: 'apprentices', SortOrder: 3, Archived: false }, { ResourceId: 'r4', Title: 'Admin', Url: 'https://c.co', Section: 'B', Audience: 'admins', SortOrder: 4, Archived: false });
const res = who => w.call(who, { action: 'boot', quiet: true }).resources.map(x => x.id).join();
check('resources by audience, blank links hidden from the team', res(molly) === 'r1' && res(ash) === 'r1,r3' && res(chris) === 'r1' && res(adam) === 'r1,r2,r3,r4', [res(molly), res(ash), res(chris), res(adam)].join(' | '));
check('nudge and email link send nothing while email is off', w.call(adam, { action: 'nudge', postId: appId, ids: [ash.PersonId] }).code === 'email_off' && w.call(adam, { action: 'emailLink', id: ash.PersonId }).code === 'email_off');

// Editing tools are separate from role
const cole = w.person('Cole', 'admin', false, { EditTools: false });
w.tables.Resources.push({ ResourceId: 'r5', Title: 'Admin doc', Url: 'https://d.co', Section: 'B', Audience: 'admins', SortOrder: 5, Archived: false });
let bc = w.call(cole, { action: 'boot', quiet: true });
check('admin without editing tools: still sees admin resources and every live post', bc.ok && bc.me.tools === false && bc.resources.some(r => r.id === 'r5') && bc.posts.some(p => p.id === appId));
check('...but gets no unfinished resources, no counts, no edit rights, cannot post', !bc.resources.some(r => r.id === 'r2') && bc.canPost === false && bc.posts.every(p => !p.canEdit && p.stats === undefined) && bc.people.length === 0);
check('...and the server refuses if they try anyway', w.call(cole, { action: 'savePost', post: Object.assign({ title: 'x' }, base) }).code === 'forbidden' && w.call(cole, { action: 'team' }).code === 'forbidden' && w.call(cole, { action: 'archivePost', postId: appId }).code === 'forbidden' && w.call(cole, { action: 'saveResource', resource: { title: 'x', section: 'y' } }).code === 'forbidden' && w.call(cole, { action: 'readers', postId: appId }).code === 'forbidden');
r = w.call(chris, { action: 'savePost', post: { title: 'Private draft', body: '', status: 'draft', audience: 'everyone', links: [] } });
check('...and does not see other people\'s drafts', !w.call(cole, { action: 'boot', quiet: true }).posts.some(p => p.id === r.postId));
r = w.call(adam, { action: 'savePerson', person: { id: cole.PersonId, name: 'Cole Test', email: 'cole@example.com', role: 'admin', tools: true } });
check('an admin can switch someone\'s editing tools on', r.ok && w.call(cole, { action: 'boot', quiet: true }).me.tools === true && w.call(cole, { action: 'team' }).ok);
r = w.call(adam, { action: 'savePerson', person: { id: adam.PersonId, name: 'Adam Test', email: 'adam@example.com', role: 'admin', tools: false } });
check('nobody can switch off their own', r.ok && w.call(adam, { action: 'team' }).ok);
r = w.call(adam, { action: 'savePerson', person: { id: molly.PersonId, name: 'Molly Test', email: 'molly@example.com', role: 'member', tools: true } });
check('editing tools never apply to a Team member', w.call(molly, { action: 'boot', quiet: true }).me.tools === false && w.call(molly, { action: 'savePost', post: Object.assign({ title: 'x' }, base) }).code === 'forbidden');

console.log(log.join('\n'));
console.log('server pass=' + log.filter(l => l.startsWith('PASS')).length + ' fail=' + log.filter(l => l.startsWith('FAIL')).length);
