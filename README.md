# run4fun — Valencia Marathon 2026

A one-page daily view of my 21-week build to the **Valencia Marathon, Sunday 6 December 2026** (target 2:59:00 — 4:14/km).

The page reads the browser's date and shows today's session with the full prescription, yesterday's planned-versus-actual, the next four sessions, and a rolling 7-day log. Completed sessions are ticked off automatically from Strava.

```
index.html                     the whole page — plan data baked in, no build step
netlify/functions/strava.mjs   serverless proxy to the Strava API
netlify.toml                   publish + function config
data/activities.json           offline fallback snapshot
TRAINING_LOG.md                block history and standing watch-items
sync.ps1                       pull, commit, push in one command
```

## Syncing changes

Claude edits the files here but has no network route to GitHub and no access to the SSH key, so it can't push. After any change:

```powershell
.\sync.ps1                      # timestamped commit message
.\sync.ps1 "swap Sat and Sun"   # your own message
```

It pulls with `--rebase --autostash` first, commits only if something actually changed, and pushes only if there's something ahead of the remote.

## How the Strava check-off works

The page calls `/api/strava` on load. That's a Netlify Function holding the API credentials as environment variables, so nothing secret reaches the browser. It fetches the last 21 days of activities and returns aggregate per-day running km — no GPS, no routes, no activity names.

Responses are cached at Netlify's edge for 10 minutes, which keeps the page fresh while staying far inside Strava's rate limits (200 requests per 15 minutes).

If the function is unavailable — or you open `index.html` straight off disk — the page falls back to the committed `data/activities.json` snapshot and says so in a banner.

A session counts as done when the day's running volume reaches 60% of what was planned. Rides and gym sessions are ignored.

## Setup

### 1. Push to GitHub

```bash
git remote add origin git@github.com:<your-username>/run4fun.git
git push -u origin main
```

### 2. Create a Strava API application

Go to <https://www.strava.com/settings/api> and create an app (any name; set the callback domain to `localhost`). Note the **Client ID** and **Client Secret**.

### 3. Get a refresh token with `activity:read_all`

Open this in a browser, replacing `YOUR_CLIENT_ID`:

```
https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=activity:read_all
```

Approve it. You'll land on a `http://localhost/?state=&code=SOME_CODE&scope=...` URL that fails to load — that's expected, copy the `code` out of the address bar. Then:

```bash
curl -X POST https://www.strava.com/oauth/token \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET \
  -d code=SOME_CODE \
  -d grant_type=authorization_code
```

Copy the `refresh_token` from the response.

### 4. Connect the repo to Netlify

Netlify → **Add new site → Import an existing project** → pick the repo. `netlify.toml` already sets everything, so accept the defaults (no build command, publish directory `.`).

### 5. Set the environment variables

Site configuration → **Environment variables** → add all three:

| Variable | Value |
| --- | --- |
| `STRAVA_CLIENT_ID` | from step 2 |
| `STRAVA_CLIENT_SECRET` | from step 2 |
| `STRAVA_REFRESH_TOKEN` | from step 3 |

Then **Deploys → Trigger deploy → Clear cache and deploy site** so the function picks them up.

On iOS, Share → Add to Home Screen gives an app-like icon.

## Local development

```bash
npm install -g netlify-cli
netlify dev        # serves the page and the function together on :8888
```

Without the CLI you can still open `index.html` directly — it just falls back to the snapshot in `data/`.

## Maintenance

- **Adjusting the plan:** the `WEEKS` array near the top of the `<script>` in `index.html` is the whole plan. Each entry is a week (Monday date, weekly km target) holding sessions keyed by day offset — `o:0` is Monday, `o:6` is Sunday. Edit, commit, push; Netlify redeploys automatically.
- **Refresh token rotation:** Strava occasionally issues a new refresh token. The function logs the new value (Netlify → Functions → strava → logs) — paste it into the environment variable.
- **Refreshing the offline snapshot:** it's only a fallback, so it can drift without harm. Copy a `/api/strava` response into `data/activities.json` if you want it current.
- **Keep the repo out of `AppData`** — deep paths break git on Windows with "Filename too long", and roaming profiles can corrupt repos.
