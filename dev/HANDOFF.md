# Village West Team App: project handoff

Last updated: 2026-11-27.

Read this first, then open the tracker (the private Asana project named "Village West Team App"). This file holds what is true about the product and how it is built. The tracker holds what is outstanding. `CLAUDE.md` at the repository root holds how to work with the owner.

This repository is public. Nothing here names team members, and no emails, phone numbers, tokens, or Sheet contents belong in it.

## 1. What this is

An internal team app for Village West, a boutique Pilates studio growing into a wider group (Pilates, Athletic Club, Wellness Collaborative). Leadership posts updates, each team member marks them as read, and the app holds resources and contact shortcuts. About 13 people will use it.

The owner is not technical and manages everything from an iPhone. See `CLAUDE.md` for how to communicate and when to ask.

## 2. Status

- **Live and working:** everything in section 5. The owner is the only real user so far. Nothing has been sent to the team.
- **Email and notifications are in Test mode.** Emails go only to the owner's own address, and a sample notification goes only to the phone of whoever is posting. Only the owner switches it to Live. Never switch it for them.
- **Not written yet, on purpose:** the admin guide, the team guide, and the message that sends the team their links. The owner will say when.
- **Design is parked.** An independent audit was done on 2026-11-25 and three visual directions were mocked up. The owner chose to settle functionality first. The mock-ups and the audit findings are in the tracker.

## 3. Architecture

A standard Apps Script web page failed for anyone signed in to more than one Google account, which is most of this team. So the screen lives outside Google and talks to Apps Script as a JSON service.

- **Front end (this repo, root):** a static site on GitHub Pages at https://team.villagewestpilates.com (CNAME file, Enforce HTTPS on, DNS at Squarespace). Hand-written HTML, CSS, and JavaScript. No framework, no build step, no CDN. Files: `index.html`, `app.js`, `app.css`, `icons.js` (Lucide 0.460.0, inlined), `sw.js` (notifications only), `fonts/` (Inter, self-hosted), `icons/`, `brand/wordmark.png`, `manifest.webmanifest`, `version.json`.
- **Server:** one Google Apps Script project owned by the studio's main Google account. Script ID `1XU3DPukvbnu6bSOFzlNia8JqbjE1758htPSs95kpCALfCt7FbPIgyHN7`. The source (`Code.js`, `appsscript.json`) is kept in the private repository `villagewestpilates/team-server` under `src/`, because its starter data contains private details. Apps Script is the live copy; the private repository is the backup and the place to edit.
- **Production deployment ID, never create another:** `AKfycbz7i8unoDEf_x9vOwhwvel71qbyrDs0QVSsQWK7Gm33_LzL9L3EVv3RS_AEXhrVUKMJjQ` (at version 13). Every personal link depends on this address and on the site address. Neither may change.
- **Database:** a Google Sheet, "VWP Team App Data", private to the owning account. Tabs: Posts, Team, Reads, Views, Categories, Resources, Settings, Photos, EmailLog, Push. Rows are never deleted. Columns named Archived, Deactivated, and Voided keep history.
- **Scopes:** spreadsheets, send-mail, and external requests (for phone notifications). Adding a scope means the owner must approve it. Do it in this order so the app never pauses: push the code, have the owner run `authorize` in the editor and tap Allow, and only then update the deployment.

### How the server works
- `doPost` takes text/plain JSON `{action, k, ...}` and returns JSON. `route_` checks the token on every call, then runs the function in `ACTIONS`.
- `ensureSeeded_()` runs migrations automatically on the first request after a deploy, gated by Script Property `SEED_VERSION` (now 10). Bump the number whenever `TABS` gains a tab or column.
- `TABS` defines the Sheet columns. `ensureTabs_` adds missing tabs and columns without touching data.
- Helpers: `table_`, `appendRows_`, `updateRow_`, `withLock_`, `cell_` (stops text being read as a formula).
- All email goes through `sendMail_`, the only caller of MailApp. All phone notifications go through `sendPush_`, the only caller of UrlFetchApp.
- Phone notifications are standard Web Push with no content in them. The signing key pair is made on first use and kept in Script Properties. Apps Script has no built-in for the signature, so `Code.js` carries its own (checked against Node's cryptography in the tests). BigInt literals such as `1n` are rejected by the Apps Script uploader; use `BigInt(1)`.

### How the front end works
- `index.html` fetches `version.json` uncached, then loads `app.css`, `icons.js`, and `app.js` with that number. **Bump `version.json` on every publish.** Do not add static script or stylesheet tags back.
- One boot call loads everything. The last response is cached on the phone so the app paints instantly, then refreshes quietly.
- Screens are tracked after the `#`. The `?k=` token stays in the address so a home screen icon keeps working. The app always opens on Home, except an email link with `&p=POSTID`.
- The manifest has no `start_url` on purpose, so the saved icon keeps the person's own link.
- `sw.js` shows notifications and opens the app when one is tapped. It must never intercept page loads or cache anything.

## 4. Access model

- **Personal links, no passwords.** Each person has a random 32-character token. Their link is the site address plus `?k=TOKEN`. The token is sent in the request body, never in the Apps Script address. Deactivating a person or issuing a new link takes effect immediately.
- **Role decides what someone can SEE:** Admin (everything, including Admins-only resources), Poster, Team member. The Apprentices group is separate and controls some resources and post audiences.
- **"Editing tools" decides what someone can DO.** It is a per-person switch (Team column `EditTools`). Only people with it can post, edit, see read counts, or manage the team. It is on for the owner and the studio manager only, by the owner's choice.
- **Edit mode** is a per-phone switch in Settings, only shown to people with editing tools. It is off by default so they see the app the way the team does.
- The server enforces all of this. The UI switches are convenience, not security. This was reviewed on 2026-11-25.

## 5. What is built

- **Home:** official wordmark top and center with a Beta tag above it, greeting with a time-of-day icon, day and time stamp. "N posts to read" banner (only with two or more), unread cards, "Good to know", "Already read". What Home shows when someone is caught up is an open question with the owner.
- **Reading:** opening a post never marks it read. Only the "Mark as read" button does, and it cannot be undone by the reader. The app waits for the server to save the read before moving on, and says so at the button if it did not save. Longer posts hold the button for three seconds. Swipe sideways or use the bottom Back button to leave.
- **Bulletins:** one compact list, pinned group first, search, filters by category and unread.
- **Posting:** title, text (bold and bullets), photo, category, audience (everyone, apprentices, selected people), needs-read switch, read-by date (a past date is refused), pin, custom button wording, two link buttons, event date for promotions, "posted by" for admins, and "Don't notify people about this post". Drafts with saved times. Scheduled posts in studio time. A review step before anything goes out. Editing asks "small fix or real change?"; a real change resets reads and notifies again.
- **Who has read:** Read, Opened but not marked, Not opened, with last visit and nudges.
- **Notifying people:** new post, real change, nudge, and personal link. One switch, Off, Test, or Live, covers email and phone notifications. In Live, people who turned notifications on get a notification and everyone else gets an email. A phone that has gone away is retired and email takes over.
- **Phone notifications:** a switch in Settings, per phone. On iPhone the app must be opened from its Home Screen icon. Verified on a real iPhone on 2026-11-26. Not yet tested on Android.
- **Resources:** searchable sections managed in the app. Each can have a one-line description and hidden search words. Entries without a link are hidden from the team.
- **Contact:** the studio line plus people, each with what to reach them about and an optional Call button. Admins edit the list in the app. Stored as JSON in the Sheet's Settings tab.
- **Settings (fifth tab, everyone):** text size (Standard, Large, Largest), notifications, home screen tips, who you are signed in as. People with editing tools also get Edit mode, and Admins with tools get a Team view: add or edit people, links, deactivate, Beta switch, email and notifications mode, categories.

## 6. Decisions the owner has made (do not undo without asking)

- Wording: "read", "Open and read", "Mark as read". Never "sign", "sign off", or "confirm". The note under the button reads "This tells the studio you've read it."
- Four categories to start: Announcements, Policies, Schedule, Promotions & Events.
- No emoji, no em dashes, warm plain voice.
- Soft gray page with white cards.
- The "VILLAGE WEST" wordmark without "PILATES", because the brand is growing into a wider umbrella.
- Home screen icon: sage V and TEAM on white with a sage border.
- No initial bubble beside the name. Read status shown apart from the author's name.
- Swipe to go back is preferred over a top-left arrow.
- Photos are stored inside the Sheet, to avoid a Drive permission.
- Bulletins as compact rows.
- Phone notifications over text messages. A texting service and Arketa's text broadcasts were considered and kept only as fallbacks.
- Functionality before visual design.
- The owner's tap on Merge is the approval. See `CLAUDE.md`.

## 7. Approaches tried and rejected

- **Apps Script HtmlService front end:** fails with multiple Google accounts. Do not go back to it.
- **Asking people to use a private window:** breaks the home screen icon and email links.
- **Fading or sliding whole screens in:** made text appear to resize on iPhone. Screens now appear in place under a brief veil.
- **A floating Edit mode switch:** covered content. It lives in Settings.
- **Scheduling inside the form:** hard to find. It starts from the review step.
- **Showing a post as read before the server saved it:** a read could be lost on a weak signal while the person believed it counted.
- **Free email-to-text for notifications:** carriers have been shutting it down.

## 8. Tests

Run everything with `bash tools/all.sh <output folder>` from a scratch folder laid out as `site/` (a copy of this repo's root), `tools/` (a copy of `dev/tools`), and `src/` (the server code from the private repository). Playwright with Chromium is needed. Making this run straight from the repositories is in the tracker.

As of 2026-11-28, 383 checks pass.

- **Browser checks, 266:** Chromium at phone width against a faked server, with the clock fixed at 2026-11-25 so dates never go stale. They cover layout, flows, wording, error states, the notification switch, and the contact editor. The phone's notification system is faked.
- **Server checks, 117:** the real `Code.js` run in Node against an in-memory Sheet, a pretend mail service, and a pretend notification service (`server_test.js`, `server_test_email.js`, `server_test_push.js`). They cover permissions, audiences, drafts, scheduling, who gets emailed or notified in each mode, and the notification signature.
- **Live checks:** scripts named `live*.js` that hit the real deployment as the Test Person. Run by hand, and several are stale.

Limits to be honest about: no Safari or WebKit, no VoiceOver, no continuous integration, no visual regression, no automated accessibility scan in the suite, and no Android device. The owner's iPhone is the only real device used so far.

## 9. Known gaps and risks

The tracker is the full list. The ones that shape how to work:

- **No separate test environment.** One Sheet, one deployment. Live tests use a "Test Person" row that is hidden from counts and never emailed. Design experiments use separate pages with made-up data.
- **No backup of the Sheet** beyond Google's own version history. Awaiting the owner's decision.
- **The Test Person is an Admin with editing tools,** and an admin's view includes every person's link. It was deactivated on 2026-11-28. The app hides it from the Team view, so it is switched on or off in the data Sheet: Team tab, the Deactivated cell in its row.
- **The owner issued themselves a new link** on 2026-11-28, because an early one appeared in a screenshot. The old one no longer works.
- **Editing a post overwrites its text.** After a "real change" there is no record of the wording people originally read.
- **The Views tab logs every app open per person.** The owner has not yet decided whether that is wanted.
- **A dead one-time endpoint (`claimTest`)** is still in the server code. It answers without a token but is locked after first use.
- **Scheduled-post notices** go out the next time anyone opens the app after the scheduled time.
- **Accessibility:** not yet usable with VoiceOver, the Largest text size breaks some layouts, and the app ignores the iPhone's own text size. Findings are in the tracker and are meant to be fixed with the redesign.
- **Repository history was rewritten on 2026-11-25** to remove personal phone numbers and team members' names. A copy of the old history is in the private repository on the branch `archive/team-history-before-scrub`. GitHub Support was asked to clear the old copies held by pull requests 1 to 3. Never merge or push anything based on a clone from before that date.
- **Before launch:** the linked Drive files are all Restricted, some resources have no link, and the written guides are not done.

## 10. Other things in the owner's Google and GitHub accounts

- `villagewestpilates/team-server` (private): server code under `src/`, and `push-test/` from the notification trial.
- An Apps Script project named "VW notification test (safe to delete)" and the page at `/lab/push/` in this repo. Both are from the trial. Keep them until Android has been tested, then remove them.
- A private page with the three design directions. The link is in the tracker.

## 11. Setting up a new cloud session

1. Start it with this repository selected. For server work, also add `villagewestpilates/team-server` with permission to push.
2. For read-only work, nothing else is needed.
3. To change the live server, install clasp in a scratch folder outside any repository: `npm i @google/clasp@3.4.1`. Sign in with `NODE_USE_ENV_PROXY=1 npx clasp login --no-localhost`, or with a small script that keeps the PKCE verifier in a file so the link still works if the session pauses while the owner is signing in. The owner taps the link, picks the studio's main account in Google's chooser, and pastes back the "localhost" address their browser lands on. A private window is not needed for this.
4. **The sign-in expires within hours.** Expect to sign in again each working day, and check before promising the owner a quick update.
5. If a Google link opens as the wrong account for the owner, give them the same link with `/u/2/` after the host, or the account number their last sign-in showed as `authuser`.
6. Before changing the live project, pull it and confirm it matches the private repository. Then `clasp push --force`, then `clasp update-deployment <production id> -d "Production"`. Use clasp 3.x command names only. Afterward, post a request with a made-up token and confirm the reply is `{"ok":false,"code":"auth"}`.
7. Live tests need the Test Person, which is deactivated. Ask the owner first. They would set its Deactivated cell back to FALSE in the Team tab of the data Sheet and copy its token from the Token cell in the same row (the app's Team view does not show the Test Person). Keep the token outside every repository. Never use a real person's token.
8. Browser tests need the proxy bypassed for localhost and Edit mode switched on first (`localStorage vwp.edit = 1`); the scripts in `dev/tools` already do this.
9. Commit as `Claude <noreply@anthropic.com>`. Work on the session's own branch and send changes to the owner as a pull request. Restart that branch from the latest `main` after each merge.

## 12. Environment notes for cloud sessions

- The network allows the Apps Script hosts and the app's own address. Google, GitHub, and Apple documentation sites are blocked, so research on them comes from search summaries unless the owner widens the environment.
- Connected services include Asana (the tracker), Google Drive, Gmail, Calendar, the studio's booking system, and Canva.
- Claude Code Projects is available on the owner's account and has not been adopted yet.
- A Mac can be attached but has not been needed. The owner's iPhone is the real-device test.
