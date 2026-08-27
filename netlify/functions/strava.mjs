/**
 * GET /api/strava
 *
 * Proxies the Strava API so the page can check off completed sessions without
 * ever seeing a credential. Returns aggregate per-day running volume only —
 * no GPS, no routes, no activity names.
 *
 * Environment variables (set in Netlify → Site configuration → Environment variables):
 *   STRAVA_CLIENT_ID
 *   STRAVA_CLIENT_SECRET
 *   STRAVA_REFRESH_TOKEN
 */

const DAYS_BACK = 21;

async function getAccessToken(id, secret, refresh) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: id,
      client_secret: secret,
      grant_type: "refresh_token",
      refresh_token: refresh,
    }),
  });
  if (!res.ok) {
    // Strava explains itself in the body — surface it, it names the offending field.
    // e.g. {"message":"Bad Request","errors":[{"resource":"RefreshToken","field":"refresh_token","code":"invalid"}]}
    const body = await res.text().catch(() => "<no body>");
    console.error("Strava token refresh rejected:", res.status, body);
    console.error(
      "credential shapes — client_id:", `${id.length} chars, numeric: ${/^\d+$/.test(id)}`,
      "| client_secret:", `${secret.length} chars (expect 40)`,
      "| refresh_token:", `${refresh.length} chars (expect 40)`
    );
    throw new Error(`token refresh failed: ${res.status} ${body}`);
  }
  const j = await res.json();
  if (j.refresh_token && j.refresh_token !== refresh) {
    console.warn("Strava issued a new refresh token — update STRAVA_REFRESH_TOKEN:", j.refresh_token);
  }
  return j.access_token;
}

async function getActivities(token) {
  const after = Math.floor(Date.now() / 1000) - DAYS_BACK * 86400;
  const out = [];
  for (let page = 1; page <= 4; page++) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`activities failed: ${res.status}`);
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

function aggregate(activities) {
  const days = {};
  for (const a of activities) {
    const sport = a.sport_type || a.type || "";
    if (!sport.includes("Run")) continue;                 // runs only
    const date = (a.start_date_local || "").slice(0, 10); // athlete-local already
    if (!date) continue;
    if (!days[date]) days[date] = { km: 0, sec: 0, runs: 0 };
    days[date].km += (a.distance || 0) / 1000;
    days[date].sec += a.moving_time || 0;
    days[date].runs += 1;
  }
  for (const d of Object.keys(days)) days[d].km = Math.round(days[d].km * 100) / 100;
  return days;
}

export default async () => {
  // Trim: pasting into the Netlify UI easily carries a trailing newline or stray quotes,
  // and Strava answers a padded credential with a flat 400.
  const clean = (v) => (v || "").trim().replace(/^["']|["']$/g, "");
  const STRAVA_CLIENT_ID = clean(process.env.STRAVA_CLIENT_ID);
  const STRAVA_CLIENT_SECRET = clean(process.env.STRAVA_CLIENT_SECRET);
  const STRAVA_REFRESH_TOKEN = clean(process.env.STRAVA_REFRESH_TOKEN);

  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
    return Response.json(
      { error: "Strava environment variables are not configured on this site." },
      { status: 500 }
    );
  }

  try {
    const token = await getAccessToken(STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN);
    const days = aggregate(await getActivities(token));
    return Response.json(
      { updated: new Date().toISOString(), days },
      {
        headers: {
          // Serve from Netlify's CDN cache for 10 minutes; stays well inside
          // Strava's rate limits even with the page open on several devices.
          "Netlify-CDN-Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
          "Cache-Control": "public, max-age=0, must-revalidate",
        },
      }
    );
  } catch (e) {
    console.error("strava function failed:", e);
    const msg = String(e.message || e);
    return Response.json(
      {
        error: msg,
        hint: msg.includes("token refresh failed")
          ? "STRAVA_REFRESH_TOKEN is being rejected. It must be the refresh_token from the " +
            "authorization-code exchange (not the access token, not the one shown on Strava's " +
            "API settings page), and it must belong to the same client_id/secret pair."
          : undefined,
      },
      { status: 502 }
    );
  }
};

export const config = { path: "/api/strava" };
