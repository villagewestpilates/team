# VWP Team App: handoff for a new Claude session

Read this first, then the owner's original build prompt (they will paste it). No team names, emails, tokens, or Sheet contents belong in this repository. It is public.

## Where things stand
- Stage 0 (setup, hello tests): done. Test A (HtmlService) fails in multi-account browsers. Test B (JSON service) works. We are building **version B**.
- Stage 1 (personal links): done and confirmed by the owner on Mac and iPhone home screen.
- Stages 2, 3 and 4 are built and published: Home, Bulletins, reading, posting, photos (stored in the Sheet Photos tab, no Drive permission), thumbnails, post-as, bold and bullets, who-has-read, Team screen, categories, Beta switch. Nudge and "Email it" buttons exist but the server answers "email is off" until stage 6. The Test Person token was rotated in stage 4, so ask the owner for the current one. A test post "Test post 2" is addressed to the owner only. Waiting on the owner to try stage 4 and say OK. Next: **Stage 5** (Resources and Contact).
- Small carry-overs for stage 2: put the Beta tag beside the VILLAGE WEST wordmark (currently below it). Replace the stage 1 placeholder Home card.
- Later: in stage 4, remind the owner to tap "New link" on their own row (their token appeared in a screenshot). At the very end, deactivate the "Test Person" row.

## Pieces
- **Front end (this repo, root):** static site on GitHub Pages at https://team.villagewestpilates.com (CNAME file, Enforce HTTPS on). Files: index.html, app.js, app.css, icons.js (Lucide 0.460.0 inlined), fonts/ (Inter variable, self-hosted), icons/, manifest.webmanifest (no start_url on purpose so the home screen shortcut keeps ?k=). Publish = commit and push to main.
- **Server:** Apps Script project owned by the studio's hello@ account. Script ID `1XU3DPukvbnu6bSOFzlNia8JqbjE1758htPSs95kpCALfCt7FbPIgyHN7`. Source is NOT in this repo. Get it with `clasp clone-script <scriptId> --rootDir src` in a scratch folder outside this repo.
- **Production deployment ID (never create another):** `AKfycbz7i8unoDEf_x9vOwhwvel71qbyrDs0QVSsQWK7Gm33_LzL9L3EVv3RS_AEXhrVUKMJjQ`. Ship server changes with `clasp push --force` then `clasp update-deployment <id> -d "Production"`.
- **Data:** Google Sheet "VWP Team App Data", private to hello@. Its ID is in Script Properties (SHEET_ID). Tabs seeded: Team (13 people + Test Person), Categories, Resources, Settings, Posts (welcome post), Reads, Views.

## How the server works (Code.js)
- doPost takes text/plain JSON `{action, k, ...}`, returns JSON. `route_` checks the token on every call (`auth_`), then calls the function in `ACTIONS`. Only `boot` exists so far.
- `ensureSeeded_()` runs seeding automatically on first request, gated by Script Property SEED_VERSION (currently 1). To add data migrations, bump SEED_VERSION and add a seedV2_. The owner never has to click Run again unless scopes change (do not add scopes).
- Helpers: `table_(tab)` reads rows as objects with `_row`; `appendRows_`; `withLock_` (LockService); `yes_`; `newToken_`; `newId_`.
- Sheet columns are defined in `TABS`; `ensureTabs_` adds missing columns without touching data. Rows are never deleted (Archived / Deactivated / Voided columns).
- Team has an `IsTest` column: Test Person must be left out of every count and never emailed.
- appsscript.json must keep the webapp block and the two scopes (see dev/appsscript.reference.json).

## Setting up a new cloud session
1. The session must be started with this repository selected so pushes work. Commit as `Claude <noreply@anthropic.com>`.
2. The environment already allows script.google.com, script.googleusercontent.com, team.villagewestpilates.com, villagewestpilates.github.io.
3. `npm i @google/clasp@3.4.1` in a scratch folder, then `NODE_USE_ENV_PROXY=1 npx clasp login --no-localhost` (feed the pasted redirect URL on stdin). The owner signs in as hello@ in a private window and pastes back the localhost address. Login does not survive between sessions. If login or first push fails twice, stop and tell the owner.
4. Testing needs the Test Person's token. Ask the owner to copy it from the Team tab (the Test Person row) and paste it in chat. Save it as `.test-token.json` (`{"k":"..."}`) outside this repo. Never use a real person's token.
5. `dev/tools/shots.js` serves the site locally and screenshots it at 390px against the real server (Playwright; proxy needs `bypass: 'localhost,127.0.0.1'` and `ignoreHTTPSErrors: true`). `dev/tools/live.js` checks the live address. Paths inside them assume the old folder layout, so adjust.
6. `dev/tools/icon.html` builds the home screen icon (sage #465a50 V monogram and TEAM on white, sage inner border). The owner approved this look.

## Owner preferences
Not technical. Plain English, click-by-click steps, short answers, one recommendation. Stop at the end of each stage for an OK. No team emails until told "go"; test emails only to the owner's personal address given in the original prompt.
