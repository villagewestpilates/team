# Village West Team App: project handoff

Last updated: 2026-11-25, at the end of the first build session.

Read this first. It is written for a session that has never seen the project. This repository is public, so nothing here names team members, and no emails, phone numbers, tokens, or Sheet contents belong in it.

## 1. What this is

An internal team app for Village West, a boutique Pilates studio growing into a wider group (Pilates, Athletic Club, Wellness Collaborative). Leadership posts updates, each team member marks them as read, and the app holds resources and contact shortcuts. About 13 people use it.

The owner is not technical and manages everything from an iPhone. They want plain English, short answers, one recommendation rather than a menu, and click-by-click steps for anything they do themselves.

## 2. Status

- **Built and live:** stages 0 to 6 of the original plan, plus a round of UX fixes. Nothing has been sent to the team. The owner is the only real user so far.
- **Email is in TEST mode.** Every email goes only to the owner's own address. Only the owner switches it to live. Never switch it for them.
- **Not written yet, on purpose:** the admin guide, the team guide, and the text to send the team with their links. The owner said they are not ready for these.
- **Next:** the owner wants an independent product, design, and strategy review before launch. Their brief asks for read-only discovery first. The previous session started that discovery and stopped to hand off (see section 11).

## 3. Architecture

Chosen after a test in stage 0. A standard Apps Script web page failed for anyone signed in to more than one Google account, which is most of this team. So the screen lives outside Google and talks to Apps Script as a JSON service.

- **Front end (this repo, root):** a static site on GitHub Pages at https://team.villagewestpilates.com (CNAME file, Enforce HTTPS on, DNS at Squarespace). Hand-written HTML, CSS, and JavaScript. No framework, no build step, no CDN. Files: `index.html`, `app.js`, `app.css`, `icons.js` (Lucide 0.460.0, inlined), `fonts/` (Inter, self-hosted), `icons/`, `brand/wordmark.png`, `manifest.webmanifest`, `version.json`.
- **Server:** one Google Apps Script project owned by the studio's main Google account. Script ID `1XU3DPukvbnu6bSOFzlNia8JqbjE1758htPSs95kpCALfCt7FbPIgyHN7`. The source (`Code.js`, about 1,150 lines, and `appsscript.json`) is NOT in this repo because its seed data contains private details. It lives in Apps Script, with numbered versions.
- **Production deployment ID, never create another:** `AKfycbz7i8unoDEf_x9vOwhwvel71qbyrDs0QVSsQWK7Gm33_LzL9L3EVv3RS_AEXhrVUKMJjQ` (at version 11). Every personal link depends on this address and on the site address. Neither may change.
- **Database:** a Google Sheet, "VWP Team App Data", private to the owning account. Tabs: Posts, Team, Reads, Views, Categories, Resources, Settings, Photos, EmailLog. Rows are never deleted. Columns named Archived, Deactivated, and Voided keep history.
- **Scopes:** spreadsheets and send-mail only. Adding any scope means the owner must click Allow again, and the live app stops answering until they do.

### How the server works
- `doPost` takes text/plain JSON `{action, k, ...}` and returns JSON. `route_` checks the token on every call, then runs the function in `ACTIONS`.
- `ensureSeeded_()` runs data migrations automatically on the first request after a deploy, gated by Script Property `SEED_VERSION` (now 8). Add a `seedVn_` and bump the number.
- `TABS` defines the Sheet columns. `ensureTabs_` adds missing columns without touching data.
- Helpers: `table_`, `appendRows_`, `updateRow_`, `withLock_`, `cell_` (stops text being read as a formula).
- All email goes through `sendMail_`, the only caller of MailApp.

### How the front end works
- `index.html` fetches `version.json` uncached, then loads `app.css`, `icons.js`, and `app.js` with that number. **Bump `version.json` on every publish.** Do not add static script or stylesheet tags back.
- One boot call loads everything. The last response is cached on the phone so the app paints instantly, then refreshes quietly.
- Screens are tracked after the `#`. The `?k=` token stays in the address so a home screen icon keeps working. The app always opens on Home, except an email link with `&p=POSTID`.
- The manifest has no `start_url` on purpose, so the saved icon keeps the person's own link.

## 4. Access model

- **Personal links, no passwords.** Each person has a random 32-character token. Their link is the site address plus `?k=TOKEN`. The token is sent in the request body, never in the Apps Script address. Deactivating a person or issuing a new link takes effect immediately.
- **Role decides what someone can SEE:** Admin (everything, including Admins-only resources), Poster, Team member. The Apprentices group is separate and controls some resources and post audiences.
- **"Editing tools" decides what someone can DO.** It is a per-person switch (Team column `EditTools`). Only people with it can post, edit, see read counts, or manage the team. It is on for the owner and the studio manager only. The other Admin and the one Poster have it off for now, by the owner's choice.
- **Edit mode** is a per-phone switch in Settings, only shown to people with editing tools. It is off by default so they see the app the way the team does.
- The server enforces all of this. The UI switches are convenience, not security.

## 5. What is built

- **Home:** official wordmark top and center with a Beta tag above it, greeting with a time-of-day icon, day and time stamp. "N posts to read" banner (only with two or more), unread cards, "Good to know", "Already read".
- **Reading:** opening a post never marks it read. Only the "Mark as read" button does, and it cannot be undone by the reader. Longer posts hold the button for three seconds. Reading moves through unread posts in order, then shows "You're all caught up" with a small celebration. Swipe sideways or use the bottom Back button to leave.
- **Bulletins:** one compact list, pinned group first, search, filters by category and unread.
- **Posting:** title, text (bold and bullets), photo, category, audience (everyone, apprentices, selected people), needs-read switch, read-by date, pin, custom button wording, two link buttons, event date for promotions, "posted by" for admins. Drafts with saved times. Scheduled posts in studio time. A review step before anything goes out. Editing asks "small fix or real change?"; a real change resets reads and re-notifies.
- **Who has read:** Read, Opened but not marked, Not opened, with last visit and nudges.
- **Resources:** searchable sections managed in the app. Entries without a link are hidden from the team.
- **Contact:** text-message shortcuts. Numbers are stored in the Sheet's Settings tab.
- **Settings (fifth tab, everyone):** text size (Standard, Large, Largest), home screen tips, who you are signed in as. People with editing tools also get Edit mode, and Admins with tools get a Team view: add or edit people, links, deactivate, Beta switch, email mode, categories.
- **Email:** new post, real change, nudge, personal link. Modes are off, test, and live.

## 6. Decisions the owner has made (do not undo without asking)

- Wording: "read", "Open and read", "Mark as read". Never "sign", "sign off", or "confirm".
- Four categories to start: Announcements, Policies, Schedule, Promotions & Events.
- No emoji, no em dashes, warm plain voice.
- Soft gray page with white cards (replaced the original pure white).
- The "VILLAGE WEST" wordmark without "PILATES", because the brand is growing into a wider umbrella.
- Home screen icon: sage V and TEAM on white with a sage border.
- No initial bubble beside the name. Read status shown apart from the author's name ("By [first name]").
- Swipe to go back is preferred over a top-left arrow.
- Photos are stored inside the Sheet, to avoid a Drive permission.
- Bulletins as compact rows (a change from the original spec; the owner agreed, and may revisit after real use).

## 7. Approaches tried and rejected

- **Apps Script HtmlService front end:** fails with multiple Google accounts. Do not go back to it.
- **Asking people to use a private window:** breaks the home screen icon and email links.
- **Fading or sliding whole screens in:** made text appear to resize on iPhone. Screens now appear in place under a brief veil.
- **A floating Edit mode switch:** covered content. It lives in Settings.
- **Scheduling inside the form:** hard to find. It starts from the review step.

## 8. Tests: what "296 checks" actually means

Run everything with `bash dev/tools/all.sh <output folder>`. The tools expect a `site` folder and `src/Code.js` beside a `tools` folder, and the Playwright package.

- **Browser checks, about 217:** Chromium at phone width against a **faked server**. They cover layout, flows, wording, and error states. They do not prove the real server and the real screen agree.
- **Server checks, 79:** the real `Code.js` run in Node against an in-memory Sheet and a pretend mail service (`server_test.js`, `server_test_email.js`). They cover permissions, audiences, drafts, scheduling, and who gets emailed.
- **Live checks, a handful:** scripts named `live*.js` that hit the real deployment as the Test Person. They are run by hand and several are stale.

Limits to be honest about: no real iPhone or Safari, no real team member's view of the live system, no continuous integration, no visual regression, and no automated accessibility scan. It is a useful functional baseline, not a complete one.

## 9. Known gaps and risks

- **No separate test environment.** One Sheet, one deployment. Live tests use a "Test Person" row that is hidden from counts and never emailed. Design experiments should use static prototypes with made-up data so they cannot touch real data or send anything.
- **Server code has no home outside Google and whatever session last cloned it.** Recommended: a private GitHub repository. Needs the owner's approval.
- **No backup of the Sheet** beyond Google's own version history.
- **Tokens are long-lived bearer links.** One appeared in a screenshot early on. The owner should issue themselves a new link.
- **Editing a post overwrites its text.** After a "real change" there is no record of the wording people originally read. This matters if read records are ever used as proof of acknowledgment.
- **The Views tab logs every app open per person.** Admins see "last in the app". The owner should decide whether that level of tracking is wanted.
- **A staff phone number sits in this repository's early history.** It was removed from the current files. Scrubbing history is possible and was left for the owner to decide.
- **A dead one-time endpoint (`claimTest`)** is still in the server code and should be removed.
- **The Test Person is an Admin with editing tools.** Deactivate it before launch.
- **Scheduled-post emails** go out the next time anyone opens the app after the scheduled time. A time trigger would make them exact but needs one more permission. Undecided.
- **Before launch:** the linked Drive files are all Restricted, five resources have no link, and the written guides are not done.

## 10. Owner's wish list for later (not started, not approved)

Certifications with expiry reminders, an onboarding checklist, class milestone badges from the studio's booking system, open sub requests, birthdays and zodiac (opt-in), a perks page, shout-outs, a Monday digest, polls and RSVPs, a records export, a "preview as a team member" mode.

## 11. Discovery for the product and strategy review: verified so far (2026-11-25)

Confirmed by direct observation in the cloud session:
- Claude Code 2.1.332. Model `claude-fable-5-2`. Permission mode "auto". Anthropic cloud environment with limited network access; the environment allows the Apps Script hosts and the app's own address.
- This repository has no `CLAUDE.md` and no `.claude` folder. This file is the only durable project knowledge.
- The repository was clean and fully pushed, with a single branch, `main`.
- Available in that session: subagents, a workflow tool for multi-agent runs, creating and messaging other cloud sessions, scheduled tasks, skills, a headless browser with Playwright, and connectors for Google Drive, Gmail, Calendar, the studio's booking system, Canva, and others. A Mac was not attached.

Checked against official sources:
- Agent teams are real but experimental and off by default, and use far more tokens. https://code.claude.com/docs/en/agent-teams
- Nothing was found under the names "Claude Ship" or "PR Steward". The official feature is Code Review, which reviews pull requests and does not merge them. https://code.claude.com/docs/en/code-review
- Google Workspace CLI launched in March 2026. A November 24 general availability announcement could not be confirmed. https://github.com/googleworkspace/cli/releases
- GitHub Agentic Workflows is active; version 1.0.1 shipped October 27, 2026. https://github.github.com/gh-aw/blog/2026-11-02-weekly-update/
- Hooks in a repository's settings file do not run in every kind of cloud session, so they cannot be assumed as a safeguard. https://code.claude.com/docs/en/cloud-environments

Not yet done: the capability inventory in full, the comparison of workflows, the security review beyond section 9, the Apple and Mac investigation, and the automation opportunities.

## 12. Setting up a new cloud session

1. Start it with this repository selected so pushes work. Commit as `Claude <noreply@anthropic.com>`.
2. For read-only work, nothing else is needed. The front end and these notes are all here.
3. To read or change the server: in a scratch folder outside this repo, `npm i @google/clasp@3.4.1`, then `NODE_USE_ENV_PROXY=1 npx clasp login --no-localhost`. The owner signs in as the studio's main account in a private window and pastes back the address the browser lands on. Then `clasp clone-script <scriptId> --rootDir src`. The login does not survive between sessions. If login or the first push fails twice, stop and tell the owner.
4. Ship server changes with `clasp push --force`, then `clasp update-deployment <production id> -d "Production"`. Use clasp 3.x command names only.
5. Live tests need the Test Person's token. Ask the owner to copy it from the Team tab and paste it in chat. Keep it outside this repo. Never use a real person's token.
6. Browser tests need the proxy bypassed for localhost and Edit mode switched on first (`localStorage vwp.edit = 1`); the scripts in `dev/tools` already do this.

## 13. Working rules

- Stop and ask before anything that changes what the team sees, costs money, needs a new account, sends email, or changes someone's access.
- Say what was tested and what could not be tested. Never claim something works without running it.
- Push back when a request is a bad idea, and recommend one alternative.
