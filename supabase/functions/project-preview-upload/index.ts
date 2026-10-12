const EVENT_ID = "common-ground-2026-10-11";
const BUCKET = "project-previews";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Max-Age": "86400"
};

function response(status, data) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({}, CORS, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    })
  });
}

function getKey(name) {
  const raw = Deno.env.get(name);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.default === "string") return parsed.default;
      const first = Object.values(parsed).find(function (value) { return typeof value === "string"; });
      if (first) return first;
    }
  } catch (_error) {}
  return raw;
}

function adminHeaders(serviceKey, isLegacyJwt) {
  const headers = new Headers({ "apikey": serviceKey });
  if (isLegacyJwt) headers.set("Authorization", "Bearer " + serviceKey);
  return headers;
}

function hasImageSignature(bytes, type) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") return bytes.length >= 8 &&
    bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 &&
    bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  if (type === "image/gif") {
    const header = new TextDecoder().decode(bytes.slice(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  if (type === "image/webp") {
    return bytes.length >= 12 &&
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }
  if (type === "image/avif") {
    return bytes.length >= 12 &&
      new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp" &&
      ["avif", "avis"].indexOf(new TextDecoder().decode(bytes.slice(8, 12))) !== -1;
  }
  return false;
}

function emailMatches(row, email) {
  if (String(row.owner_email || "").trim().toLowerCase() === email) return true;
  const team = row.team && typeof row.team === "object" ? row.team : {};
  const contact = team.contact && typeof team.contact === "object" ? team.contact : {};
  if (String(contact.email || "").trim().toLowerCase() === email) return true;
  return Array.isArray(team.members) && team.members.some(function (member) {
    return String(member && member.email || "").trim().toLowerCase() === email;
  });
}

async function ensurePublicBucket(projectUrl, serviceKey, legacyServiceKey) {
  const base = projectUrl + "/storage/v1/bucket/" + BUCKET;
  const headers = adminHeaders(serviceKey, legacyServiceKey);
  const existing = await fetch(base, { headers: headers });
  if (existing.ok) {
    const bucket = await existing.json();
    return bucket && bucket.public === true;
  }
  if (existing.status !== 404) return false;

  const createHeaders = adminHeaders(serviceKey, legacyServiceKey);
  createHeaders.set("Content-Type", "application/json");
  const created = await fetch(projectUrl + "/storage/v1/bucket", {
    method: "POST",
    headers: createHeaders,
    body: JSON.stringify({
      id: BUCKET,
      name: "Project previews",
      public: true,
      file_size_limit: MAX_BYTES,
      allowed_mime_types: ALLOWED_TYPES
    })
  });
  if (created.ok) return true;
  if (created.status !== 409 && created.status !== 400) return false;

  const raced = await fetch(base, { headers: headers });
  if (!raced.ok) return false;
  const bucket = await raced.json();
  return !!bucket && bucket.public === true;
}

Deno.serve(async function (request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") return response(405, { error: "Use POST to upload a preview image." });

  const projectUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const publishableKey = getKey("SUPABASE_PUBLISHABLE_KEY") ||
    getKey("SUPABASE_PUBLISHABLE_KEYS") ||
    getKey("SUPABASE_ANON_KEY") ||
    request.headers.get("apikey") || "";
  const legacyServiceKey = getKey("SUPABASE_SERVICE_ROLE_KEY");
  const serviceKey = legacyServiceKey || getKey("SUPABASE_SECRET_KEYS");
  if (!projectUrl || !publishableKey || !serviceKey) {
    return response(503, { error: "Image uploads are not configured yet. Please contact an organiser." });
  }

  const authorization = request.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return response(401, { error: "Sign in with your registered builder email before uploading." });
  const token = tokenMatch[1];

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_BYTES + 128 * 1024) {
    return response(413, { error: "Choose an image smaller than 5 MB." });
  }

  try {
    const authResult = await fetch(projectUrl + "/auth/v1/user", {
      headers: { "apikey": publishableKey, "Authorization": "Bearer " + token }
    });
    if (!authResult.ok) return response(401, { error: "Your sign-in expired. Sign in again, then retry the upload." });
    const user = await authResult.json();
    const email = String(user && user.email || "").trim().toLowerCase();
    if (!email || !(user.email_confirmed_at || user.confirmed_at)) {
      return response(403, { error: "Use a verified builder email to upload a project image." });
    }

    const eligibilityResponse = await fetch(
      projectUrl + "/rest/v1/eligible_participants?email=eq." +
        encodeURIComponent(email) + "&select=email&limit=1",
      { headers: adminHeaders(serviceKey, !!legacyServiceKey) }
    );
    if (!eligibilityResponse.ok) return response(503, { error: "Could not verify participant access. Try again shortly." });
    const eligibleRows = await eligibilityResponse.json();
    if (!Array.isArray(eligibleRows) || !eligibleRows.length) {
      return response(403, { error: "Only recognised participants can edit a submitted project linked to their email." });
    }

    const now = Date.now();
    const opensAt = Date.parse("2026-10-12T00:00:00+08:00");
    const closesAt = Date.parse("2026-10-12T16:00:00Z");
    if (now < opensAt || now >= closesAt) {
      return response(403, { error: "Project image updates are open through 12:00 AM SGT Tuesday, 13 October." });
    }

    const eventSettingsResponse = await fetch(
      projectUrl + "/rest/v1/people_choice_settings?event_id=eq." +
        encodeURIComponent(EVENT_ID) + "&select=submissions_open&limit=1",
      { headers: adminHeaders(serviceKey, !!legacyServiceKey) }
    );
    if (!eventSettingsResponse.ok) return response(503, { error: "Could not confirm the project edit window. Try again shortly." });
    const settings = await eventSettingsResponse.json();
    if (!Array.isArray(settings) || !settings.length || settings[0].submissions_open !== true) {
      return response(403, { error: "Project updates have been closed by the organisers." });
    }

    const form = await request.formData();
    const submissionId = String(form.get("submissionId") || "");
    const file = form.get("image");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) {
      return response(400, { error: "The project could not be identified. Reload and try again." });
    }
    if (!(file instanceof File)) return response(400, { error: "Choose an image file to upload." });
    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      return response(415, { error: "Upload a JPG, PNG, WebP, GIF, or AVIF image." });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return response(413, { error: "Choose an image smaller than 5 MB." });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = file.type.toLowerCase();
    if (!hasImageSignature(bytes, mime)) {
      return response(415, { error: "That file does not appear to be a supported image." });
    }

    const submissionsResponse = await fetch(
      projectUrl + "/rest/v1/submissions?event_id=eq." +
        encodeURIComponent(EVENT_ID) + "&select=id,user_id,owner_email,status,team",
      { headers: adminHeaders(serviceKey, !!legacyServiceKey) }
    );
    if (!submissionsResponse.ok) return response(503, { error: "Could not verify the saved project. Try again shortly." });
    const allRows = await submissionsResponse.json();
    const matchingRows = allRows.filter(function (row) {
      return row.user_id === user.id || emailMatches(row, email);
    });
    const matchingReadyRows = matchingRows.filter(function (row) { return row.status === "ready"; });
    if (matchingReadyRows.length !== 1 || matchingReadyRows[0].id !== submissionId) {
      return response(403, { error: "This email is not linked to that single submitted project." });
    }

    const record = matchingReadyRows[0];

    if (!(await ensurePublicBucket(projectUrl, serviceKey, !!legacyServiceKey))) {
      return response(503, { error: "Image storage is unavailable. Please try again shortly." });
    }

    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/avif": "avif"
    };
    const objectPath = submissionId + "/preview-" + crypto.randomUUID() + "." + extensions[mime];
    const uploadHeaders = adminHeaders(serviceKey, !!legacyServiceKey);
    uploadHeaders.set("Content-Type", mime);
    uploadHeaders.set("Cache-Control", "max-age=60");
    uploadHeaders.set("x-upsert", "true");
    const uploaded = await fetch(
      projectUrl + "/storage/v1/object/" + BUCKET + "/" + objectPath,
      { method: "POST", headers: uploadHeaders, body: bytes }
    );
    if (!uploaded.ok) return response(503, { error: "The image could not be stored. Try a smaller image or retry shortly." });

    const publicUrl = projectUrl + "/storage/v1/object/public/" + BUCKET + "/" + objectPath;
    return response(200, { publicUrl: publicUrl });
  } catch (_error) {
    return response(500, { error: "The image upload failed. Reload the page and try again." });
  }
});