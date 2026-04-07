"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { URL } = require("node:url");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    if (process.env[key] !== undefined) {
      continue;
    }
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
    process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, ".env"));
loadEnvFile(path.join(__dirname, ".env.local"));

const PORT = Number(process.env.PORT || 8787);
const IS_VERCEL_RUNTIME = /^(1|true)$/i.test(String(process.env.VERCEL || "").trim()) || Boolean(process.env.VERCEL_ENV);
const GEM_API_KEY = process.env.GEM_API_KEY || "";
const GEM_API_BASE_URL = (process.env.GEM_API_BASE_URL || "https://api.gem.com").replace(/\/$/, "");
const ASHBY_API_KEY = process.env.ASHBY_API_KEY || "";
const ASHBY_API_BASE_URL = (process.env.ASHBY_API_BASE_URL || "https://api.ashbyhq.com").replace(/\/$/, "");
const BACKEND_SHARED_TOKEN = process.env.BACKEND_SHARED_TOKEN || "";
const ALLOWED_EXTENSION_ORIGINS = new Set(
  String(process.env.ALLOWED_EXTENSION_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const GEM_DEFAULT_USER_ID = String(process.env.GEM_DEFAULT_USER_ID || "").trim();
const GEM_DEFAULT_USER_EMAIL = String(process.env.GEM_DEFAULT_USER_EMAIL || "").trim();
const ASHBY_CREDITED_TO_USER_ID = String(process.env.ASHBY_CREDITED_TO_USER_ID || "").trim();
const ASHBY_CREDITED_TO_USER_EMAIL = String(
  process.env.ASHBY_CREDITED_TO_USER_EMAIL || GEM_DEFAULT_USER_EMAIL || ""
).trim();
const LOG_DIR = process.env.LOG_DIR || (IS_VERCEL_RUNTIME ? "/tmp/gem-linkedin-shortcuts-backend-logs" : path.join(__dirname, "logs"));
const LOG_FILE = path.join(LOG_DIR, "events.jsonl");
const LOG_MAX_BYTES = Number(process.env.LOG_MAX_BYTES || 5 * 1024 * 1024);
const PROJECTS_SCAN_MAX = Number(process.env.PROJECTS_SCAN_MAX || 20000);
const CUSTOM_FIELDS_SCAN_MAX = Number(process.env.CUSTOM_FIELDS_SCAN_MAX || PROJECTS_SCAN_MAX || 20000);
const SEQUENCES_SCAN_MAX = Number(process.env.SEQUENCES_SCAN_MAX || 20000);
const ASHBY_JOBS_SCAN_MAX = Number(process.env.ASHBY_JOBS_SCAN_MAX || 5000);
const ASHBY_CANDIDATES_SCAN_MAX = Number(process.env.ASHBY_CANDIDATES_SCAN_MAX || 100000);
const GEM_CANDIDATE_LOOKUP_SCAN_MAX = Number(process.env.GEM_CANDIDATE_LOOKUP_SCAN_MAX || 5000);
const GEM_CUSTOM_FIELDS_CACHE_TTL_MS = Number(process.env.GEM_CUSTOM_FIELDS_CACHE_TTL_MS || 10 * 60 * 1000);
const GEM_CUSTOM_FIELD_CANDIDATE_CONTEXT_TTL_MS = Number(
  process.env.GEM_CUSTOM_FIELD_CANDIDATE_CONTEXT_TTL_MS || 2 * 60 * 1000
);
const GEM_LINKEDIN_URL_LOOKUP_TTL_MS = Number(process.env.GEM_LINKEDIN_URL_LOOKUP_TTL_MS || 10 * 60 * 1000);
const GEM_CANDIDATE_SEARCH_SCAN_MAX = Number(process.env.GEM_CANDIDATE_SEARCH_SCAN_MAX || 50000);
const GEM_CANDIDATE_SEARCH_TTL_MS = Number(process.env.GEM_CANDIDATE_SEARCH_TTL_MS || 15 * 60 * 1000);
const GEM_CANDIDATE_SEARCH_PROBE_MAX_PAGES = Number(process.env.GEM_CANDIDATE_SEARCH_PROBE_MAX_PAGES || 8);
const GEM_CANDIDATE_SEARCH_PROBE_PARALLEL = Number(process.env.GEM_CANDIDATE_SEARCH_PROBE_PARALLEL || 8);
const GEM_CANDIDATE_SEARCH_PROBE_MIN_STRONG_MATCHES = Number(
  process.env.GEM_CANDIDATE_SEARCH_PROBE_MIN_STRONG_MATCHES || 3
);
const GEM_CANDIDATE_SEARCH_NAME_QUERY_MAX_PAGES = Number(process.env.GEM_CANDIDATE_SEARCH_NAME_QUERY_MAX_PAGES || 40);
const GEM_CANDIDATE_SEARCH_REFRESH_PARALLEL = Number(process.env.GEM_CANDIDATE_SEARCH_REFRESH_PARALLEL || 8);
const GEM_CANDIDATE_SEARCH_PROBE_EMPTY_QUERY_MAX_PAGES = Number(
  process.env.GEM_CANDIDATE_SEARCH_PROBE_EMPTY_QUERY_MAX_PAGES || 1
);
const GEM_CANDIDATE_SEARCH_QUERY_PROBE_TTL_MS = Number(process.env.GEM_CANDIDATE_SEARCH_QUERY_PROBE_TTL_MS || 60 * 1000);
const GEM_CANDIDATE_SEARCH_QUERY_PROBE_CACHE_MAX = Number(process.env.GEM_CANDIDATE_SEARCH_QUERY_PROBE_CACHE_MAX || 150);
const ASHBY_CANDIDATE_INDEX_TTL_MS = Number(process.env.ASHBY_CANDIDATE_INDEX_TTL_MS || 10 * 60 * 1000);
const ASHBY_WRITE_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.ASHBY_WRITE_ENABLED || "false").trim());
const ASHBY_WRITE_REQUIRE_CONFIRMATION = !/^(0|false|no|off)$/i.test(
  String(process.env.ASHBY_WRITE_REQUIRE_CONFIRMATION || "true").trim()
);
const ASHBY_WRITE_CONFIRMATION_TOKEN = String(process.env.ASHBY_WRITE_CONFIRMATION_TOKEN || "").trim();
const ASHBY_WRITE_DEFAULT_CONFIRMATION = "I_UNDERSTAND_THIS_WRITES_TO_ASHBY";
const ASHBY_WRITE_ALLOWED_METHODS = new Set(
  String(
    process.env.ASHBY_WRITE_ALLOWED_METHODS ||
      "candidate.create,application.create,application.changeStage,application.changeSource,application.update"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

let ashbyCreditedToUserCache = {
  keyTitle: "",
  userId: "",
  resolvedAtMs: 0
};
let ashbyCandidateIndexCache = {
  builtAtMs: 0,
  builtAt: "",
  scannedCount: 0,
  isComplete: false,
  syncToken: "",
  candidatesById: {},
  linkedInToCandidateIds: {}
};
let ashbyCandidateIndexRefreshPromise = null;
let gemLinkedInUrlLookupCache = {
  builtAtMs: 0,
  builtAt: "",
  scannedCount: 0,
  isComplete: false,
  urlToCandidateIds: {}
};
let gemLinkedInUrlLookupRefreshPromise = null;
let gemCandidateSearchCache = {
  builtAtMs: 0,
  builtAt: "",
  scannedCount: 0,
  isComplete: false,
  candidates: []
};
let gemCandidateSearchRefreshPromise = null;
let gemCustomFieldCatalogCache = {
  builtAtMs: 0,
  builtAt: "",
  scannedCount: 0,
  isComplete: false,
  fields: []
};
let gemCustomFieldCatalogRefreshPromise = null;
const gemCustomFieldCandidateContextCache = new Map();
const gemCandidateSearchProbeHistory = new Map();

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function redactForLog(value, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }
  if (depth > 4) {
    return "[Truncated]";
  }
  if (typeof value === "string") {
    return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => redactForLog(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/token|api[_-]?key|authorization|secret|password/i.test(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      out[key] = redactForLog(nested, depth + 1);
    }
    return out;
  }
  return String(value);
}

function summarizeForLog(value) {
  if (Array.isArray(value)) {
    const first = value[0];
    return {
      type: "array",
      count: value.length,
      first_id: first && typeof first === "object" ? first.id || "" : ""
    };
  }
  if (value && typeof value === "object") {
    return {
      type: "object",
      keys: Object.keys(value).slice(0, 20),
      id: value.id || ""
    };
  }
  return { type: typeof value };
}

function ensureLogFile() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "", "utf8");
  }
}

function rotateLogIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return;
    }
    const stats = fs.statSync(LOG_FILE);
    if (stats.size <= LOG_MAX_BYTES) {
      return;
    }
    const rotated = path.join(LOG_DIR, `events-${Date.now()}.jsonl`);
    fs.renameSync(LOG_FILE, rotated);
    fs.writeFileSync(LOG_FILE, "", "utf8");
  } catch (_error) {
    // Avoid blocking API behavior if log rotation fails.
  }
}

function logEvent(entry) {
  const record = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    level: entry.level || "info",
    source: entry.source || "backend",
    event: entry.event || "event",
    message: entry.message || "",
    link: entry.link || "",
    requestId: entry.requestId || "",
    route: entry.route || "",
    runId: entry.runId || "",
    actionId: entry.actionId || "",
    durationMs: entry.durationMs || 0,
    details: redactForLog(entry.details || {})
  };

  try {
    ensureLogFile();
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(record)}\n`, "utf8");
    rotateLogIfNeeded();
  } catch (_error) {
    // If file logging fails we still continue serving requests.
  }

  return record;
}

function readRecentLogs(limit = 200) {
  ensureLogFile();
  const max = Math.max(1, Math.min(Number(limit) || 200, 1000));
  const text = fs.readFileSync(LOG_FILE, "utf8");
  const lines = text.split("\n").filter(Boolean);
  const selected = lines.slice(-max);
  const logs = [];
  for (const line of selected) {
    try {
      logs.push(JSON.parse(line));
    } catch (_error) {
      // Ignore malformed lines.
    }
  }
  return logs;
}

function getRequestOrigin(req) {
  return String(req?.headers?.origin || "").trim();
}

function isAllowedExtensionOrigin(origin) {
  return Boolean(origin) && ALLOWED_EXTENSION_ORIGINS.has(origin);
}

function buildCorsHeaders(req) {
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Backend-Token",
    Vary: "Origin"
  };
  const origin = getRequestOrigin(req);
  if (ALLOWED_EXTENSION_ORIGINS.size === 0) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }
  if (isAllowedExtensionOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function writeJson(req, res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...buildCorsHeaders(req)
  });
  res.end(JSON.stringify(payload));
}

function writeHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=300"
  });
  res.end(html);
}

const PRIVACY_POLICY_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Privacy Policy - Gem LinkedIn Shortcuts</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin: 32px auto; max-width: 860px; padding: 0 16px; color: #202124; line-height: 1.5; }
      h1, h2 { line-height: 1.2; }
      code { background: #f4f6f8; padding: 1px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>Privacy Policy - Gem LinkedIn Shortcuts</h1>
    <p><strong>Last updated:</strong> March 26, 2026</p>
    <p>Gem LinkedIn Shortcuts is an internal recruiting workflow extension.</p>
    <h2>What data the extension accesses</h2>
    <ul>
      <li>Profile context from supported pages when a user triggers an action, including LinkedIn, Gem candidate/project, and GitHub profile URLs, visible names, and visible contact details.</li>
      <li>User-configured extension settings such as shortcuts, backend URL, and optional defaults.</li>
      <li>User-entered action data such as project selection, notes, reminder dates, and custom-field values.</li>
      <li>Action logs generated by the extension and backend for troubleshooting.</li>
    </ul>
    <h2>What data the extension does not store</h2>
    <ul>
      <li>Gem API keys and Ashby API keys are not stored in the extension.</li>
      <li>Chrome Web Store builds should not ship org-wide backend shared tokens inside the extension bundle.</li>
      <li>Credentials remain on your organization's backend service.</li>
    </ul>
    <h2>How data is used</h2>
    <p>Data is used only to execute user-initiated recruiting actions and to provide debugging logs when your team investigates failures.</p>
    <h2>Data sharing</h2>
    <ul>
      <li>The extension sends requests to your organization's backend endpoint.</li>
      <li>The backend calls Gem and Ashby APIs as required.</li>
      <li>Data is not sold.</li>
    </ul>
    <h2>Data retention</h2>
    <ul>
      <li>Local extension logs are stored in browser local storage until cleared or rotated by log limits.</li>
      <li>Backend-side retention is controlled by your organization's backend and hosting/logging policy.</li>
    </ul>
    <h2>Security</h2>
    <ul>
      <li>Backend routes are allowlisted to extension-supported actions.</li>
      <li>Optional backend shared-token validation and extension-origin allowlisting can be enabled on the backend.</li>
      <li>Sensitive fields (token/key/secret/password-like values) are redacted in logs where possible.</li>
    </ul>
    <h2>User controls</h2>
    <ul>
      <li>Users can enable/disable the extension.</li>
      <li>Users can change/reset shortcuts and settings.</li>
      <li>Users can clear local extension logs.</li>
    </ul>
    <h2>Contact</h2>
    <p>For questions about this extension or this policy, contact your internal extension owner/admin.</p>
  </body>
</html>
`;

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function buildGemUrl(pathname) {
  return `${GEM_API_BASE_URL}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function buildAshbyUrl(methodName) {
  const normalized = String(methodName || "").trim().replace(/^\/+/, "");
  if (!normalized) {
    throw new Error("Ashby method name is required.");
  }
  return `${ASHBY_API_BASE_URL}/${normalized}`;
}

function omitUndefined(value) {
  const out = {};
  for (const [k, v] of Object.entries(value || {})) {
    if (v !== undefined && v !== null && v !== "") {
      out[k] = v;
    }
  }
  return out;
}

function isLikelyAshbyWriteMethod(methodName) {
  const normalized = String(methodName || "").trim().replace(/^\/+/, "");
  if (!normalized) {
    return false;
  }
  const operation = normalized.includes(".") ? normalized.split(".").slice(1).join(".") : normalized;
  return /(add|anonymize|archive|cancel|change|create|delete|remove|restore|set|submit|transfer|update|upload)/i.test(
    operation
  );
}

function resolveAshbyWriteConfirmation(options = {}) {
  if (!options || typeof options !== "object") {
    return "";
  }
  return String(options.writeConfirmation || options.confirmation || "").trim();
}

function assertSafeAshbyWrite(methodName, payload, audit = {}, options = {}) {
  const normalized = String(methodName || "").trim().replace(/^\/+/, "");
  if (!isLikelyAshbyWriteMethod(normalized)) {
    return;
  }

  if (!ASHBY_WRITE_ENABLED) {
    const message =
      "Ashby write blocked. Set ASHBY_WRITE_ENABLED=true only after explicit approval and safety checks.";
    logEvent({
      level: "warn",
      source: "backend",
      event: "ashby.write.blocked",
      message,
      requestId: audit.requestId,
      route: audit.route,
      runId: audit.runId,
      actionId: audit.actionId,
      details: {
        method: normalized,
        reason: "write_disabled"
      }
    });
    throw new Error(message);
  }

  if (!ASHBY_WRITE_ALLOWED_METHODS.has(normalized)) {
    const message = `Ashby write blocked for non-allowlisted method: ${normalized}`;
    logEvent({
      level: "warn",
      source: "backend",
      event: "ashby.write.blocked",
      message,
      requestId: audit.requestId,
      route: audit.route,
      runId: audit.runId,
      actionId: audit.actionId,
      details: {
        method: normalized,
        reason: "method_not_allowlisted"
      }
    });
    throw new Error(message);
  }

  if (ASHBY_WRITE_REQUIRE_CONFIRMATION) {
    const confirmation = resolveAshbyWriteConfirmation(options);
    if (!confirmation) {
      const message = "Ashby write blocked. Missing write confirmation token.";
      logEvent({
        level: "warn",
        source: "backend",
        event: "ashby.write.blocked",
        message,
        requestId: audit.requestId,
        route: audit.route,
        runId: audit.runId,
        actionId: audit.actionId,
        details: {
          method: normalized,
          reason: "missing_confirmation"
        }
      });
      throw new Error(message);
    }

    const expected = ASHBY_WRITE_CONFIRMATION_TOKEN || ASHBY_WRITE_DEFAULT_CONFIRMATION;
    if (confirmation !== expected) {
      const message = "Ashby write blocked. Invalid write confirmation token.";
      logEvent({
        level: "warn",
        source: "backend",
        event: "ashby.write.blocked",
        message,
        requestId: audit.requestId,
        route: audit.route,
        runId: audit.runId,
        actionId: audit.actionId,
        details: {
          method: normalized,
          reason: "invalid_confirmation"
        }
      });
      throw new Error(message);
    }
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Ashby write blocked. Invalid write payload.");
  }
  if (Object.keys(payload).length === 0) {
    throw new Error("Ashby write blocked. Empty write payload.");
  }
}

function getAshbyAuthHeader() {
  return `Basic ${Buffer.from(`${ASHBY_API_KEY}:`).toString("base64")}`;
}

function getAshbyWriteOptions() {
  if (ASHBY_WRITE_REQUIRE_CONFIRMATION && !ASHBY_WRITE_CONFIRMATION_TOKEN) {
    throw new Error(
      "Ashby writes require confirmation token. Set ASHBY_WRITE_CONFIRMATION_TOKEN in backend env, or set ASHBY_WRITE_REQUIRE_CONFIRMATION=false to disable the extra confirmation gate."
    );
  }
  return {
    writeConfirmation: ASHBY_WRITE_CONFIRMATION_TOKEN
  };
}

function getHealthPayload() {
  const warnings = [];
  if (!GEM_API_KEY) {
    warnings.push("GEM_API_KEY is not set.");
  }
  if (!ASHBY_API_KEY) {
    warnings.push("ASHBY_API_KEY is not set.");
  }
  if (ASHBY_WRITE_ENABLED && ASHBY_WRITE_REQUIRE_CONFIRMATION && !ASHBY_WRITE_CONFIRMATION_TOKEN) {
    warnings.push(
      "Ashby writes are enabled, confirmation is required, and ASHBY_WRITE_CONFIRMATION_TOKEN is not set."
    );
  }

  return {
    ok: true,
    config: {
      gemApiKeyConfigured: Boolean(GEM_API_KEY),
      ashbyApiKeyConfigured: Boolean(ASHBY_API_KEY),
      ashbyWriteEnabled: ASHBY_WRITE_ENABLED,
      ashbyWriteRequireConfirmation: ASHBY_WRITE_REQUIRE_CONFIRMATION,
      ashbyWriteConfirmationConfigured: Boolean(ASHBY_WRITE_CONFIRMATION_TOKEN)
    },
    warnings
  };
}

async function ashbyRequest(methodName, payload = {}, audit = {}, options = {}) {
  if (!ASHBY_API_KEY) {
    throw new Error("Server is missing ASHBY_API_KEY.");
  }

  const normalizedMethod = String(methodName || "").trim().replace(/^\/+/, "");
  if (!normalizedMethod) {
    throw new Error("Ashby method name is required.");
  }

  assertSafeAshbyWrite(normalizedMethod, payload, audit, options);
  const url = buildAshbyUrl(normalizedMethod);
  const body = omitUndefined(payload);

  logEvent({
    source: "backend",
    event: "ashby.request.start",
    message: `POST ${normalizedMethod}`,
    link: url,
    requestId: audit.requestId,
    route: audit.route,
    runId: audit.runId,
    actionId: audit.actionId,
    details: {
      payload: body
    }
  });

  const start = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: getAshbyAuthHeader()
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = text;
  }

  const durationMs = Date.now() - start;
  const success = Boolean(response.ok && parsed && typeof parsed === "object" && parsed.success === true);
  if (!success) {
    const message =
      parsed?.errorInfo?.message ||
      (Array.isArray(parsed?.errors) ? parsed.errors.join(", ") : "") ||
      parsed?.message ||
      text ||
      `Ashby API request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status || 400;
    error.data = parsed;

    logEvent({
      level: "error",
      source: "backend",
      event: "ashby.request.error",
      message,
      link: url,
      requestId: audit.requestId,
      route: audit.route,
      runId: audit.runId,
      actionId: audit.actionId,
      durationMs,
      details: {
        status: response.status,
        response: parsed
      }
    });
    throw error;
  }

  logEvent({
    source: "backend",
    event: "ashby.request.success",
    message: `POST ${normalizedMethod}`,
    link: url,
    requestId: audit.requestId,
    route: audit.route,
    runId: audit.runId,
    actionId: audit.actionId,
    durationMs,
    details: {
      status: response.status,
      summary: summarizeForLog(parsed?.results)
    }
  });

  return parsed;
}

async function gemRequest(pathname, { method = "GET", query = {}, body } = {}, audit = {}) {
  if (!GEM_API_KEY) {
    throw new Error("Server is missing GEM_API_KEY.");
  }

  const url = new URL(buildGemUrl(pathname));
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  logEvent({
    source: "backend",
    event: "gem.request.start",
    message: `${method} ${pathname}`,
    link: url.toString(),
    requestId: audit.requestId,
    route: audit.route,
    runId: audit.runId,
    actionId: audit.actionId,
    details: { query, body }
  });

  const start = Date.now();
  const response = await fetch(url.toString(), {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": GEM_API_KEY,
      Authorization: `Bearer ${GEM_API_KEY}`
    },
    body:
      method === "GET" || method === "HEAD" || body === undefined
        ? undefined
        : JSON.stringify(body)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = text;
  }

  const durationMs = Date.now() - start;
  if (!response.ok) {
    const message =
      typeof data === "object" && data && data.message
        ? data.message
        : text || `Gem API request failed with ${response.status}`;
    logEvent({
      level: "error",
      source: "backend",
      event: "gem.request.error",
      message,
      link: url.toString(),
      requestId: audit.requestId,
      route: audit.route,
      runId: audit.runId,
      actionId: audit.actionId,
      durationMs,
      details: {
        status: response.status,
        response: data
      }
    });

    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  logEvent({
    source: "backend",
    event: "gem.request.success",
    message: `${method} ${pathname}`,
    link: url.toString(),
    requestId: audit.requestId,
    route: audit.route,
    runId: audit.runId,
    actionId: audit.actionId,
    durationMs,
    details: {
      status: response.status,
      summary: summarizeForLog(data)
    }
  });

  return data;
}

function sanitizeLinkedInHandle(raw) {
  return String(raw || "").trim().replace(/^@/, "");
}

function sanitizeSocialHandle(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@/, "");
}

function buildGitHubUrlFromHandle(handle) {
  const clean = sanitizeSocialHandle(handle);
  if (!clean) {
    return "";
  }
  return `https://github.com/${encodeURIComponent(clean)}`;
}

function addGemCandidateLookupKey(keys, value) {
  const profileKey = normalizeProfileUrl(value);
  if (profileKey) {
    keys.add(profileKey);
  }
  const linkedInKey = normalizeLinkedInUrl(value);
  if (linkedInKey && linkedInKey.includes("linkedin.com/")) {
    keys.add(linkedInKey);
  }
}

function getGemCandidateLookupKeys(candidate) {
  const keys = new Set();
  const handleUrl = buildLinkedInUrlFromHandle(candidate?.linked_in_handle || candidate?.linkedInHandle || "");
  if (handleUrl) {
    addGemCandidateLookupKey(keys, handleUrl);
  }

  const profileUrls = Array.isArray(candidate?.profile_urls) ? candidate.profile_urls : [];
  for (const url of profileUrls) {
    addGemCandidateLookupKey(keys, url);
  }

  const profiles = Array.isArray(candidate?.profiles) ? candidate.profiles : [];
  for (const profile of profiles) {
    if (!profile || typeof profile !== "object") {
      continue;
    }
    const network = normalizeTextToken(profile.network || profile.type || profile.site || "");
    const profileUrl = firstNonEmpty(profile.url, profile.link, profile.href, profile.value);
    if (profileUrl) {
      addGemCandidateLookupKey(keys, profileUrl);
      continue;
    }
    const username = firstNonEmpty(profile.username, profile.handle);
    if (username && network === "linkedin") {
      addGemCandidateLookupKey(keys, buildLinkedInUrlFromHandle(username));
      continue;
    }
    if (username && network === "github") {
      addGemCandidateLookupKey(keys, buildGitHubUrlFromHandle(username));
    }
  }

  return Array.from(keys);
}

function getGemCandidateLinkedInKeys(candidate) {
  return getGemCandidateLookupKeys(candidate).filter((key) => key.includes("linkedin.com/"));
}

function gemLinkedInLookupSize(cache = gemLinkedInUrlLookupCache) {
  if (!cache || !cache.urlToCandidateIds || typeof cache.urlToCandidateIds !== "object") {
    return 0;
  }
  return Object.keys(cache.urlToCandidateIds).length;
}

function getGemLinkedInLookupAgeMs(cache = gemLinkedInUrlLookupCache) {
  if (!cache || !cache.builtAtMs) {
    return Number.POSITIVE_INFINITY;
  }
  return Date.now() - Number(cache.builtAtMs);
}

function isGemLinkedInLookupFresh(cache = gemLinkedInUrlLookupCache) {
  return getGemLinkedInLookupAgeMs(cache) <= GEM_LINKEDIN_URL_LOOKUP_TTL_MS;
}

function rememberGemCandidateLinkedInKeys(candidate) {
  const candidateId = String(candidate?.id || "").trim();
  if (!candidateId) {
    return;
  }
  const keys = getGemCandidateLookupKeys(candidate);
  if (keys.length === 0) {
    return;
  }
  if (!gemLinkedInUrlLookupCache || typeof gemLinkedInUrlLookupCache !== "object") {
    gemLinkedInUrlLookupCache = {
      builtAtMs: Date.now(),
      builtAt: new Date().toISOString(),
      scannedCount: 0,
      isComplete: false,
      urlToCandidateIds: {}
    };
  }
  const map = {
    ...(gemLinkedInUrlLookupCache.urlToCandidateIds && typeof gemLinkedInUrlLookupCache.urlToCandidateIds === "object"
      ? gemLinkedInUrlLookupCache.urlToCandidateIds
      : {})
  };
  for (const key of keys) {
    map[key] = candidateId;
  }
  gemLinkedInUrlLookupCache = {
    builtAtMs: gemLinkedInUrlLookupCache.builtAtMs || Date.now(),
    builtAt: gemLinkedInUrlLookupCache.builtAt || new Date().toISOString(),
    scannedCount: Math.max(Number(gemLinkedInUrlLookupCache.scannedCount) || 0, Object.keys(map).length),
    isComplete: Boolean(gemLinkedInUrlLookupCache.isComplete),
    urlToCandidateIds: map
  };
}

async function refreshGemLinkedInUrlLookup(audit) {
  const configuredScanLimit = Number.isFinite(Number(GEM_CANDIDATE_LOOKUP_SCAN_MAX))
    ? Number(GEM_CANDIDATE_LOOKUP_SCAN_MAX)
    : 0;
  const scanLimit = configuredScanLimit > 0 ? Math.min(configuredScanLimit, 50000) : 0;
  if (scanLimit <= 0) {
    return gemLinkedInUrlLookupCache;
  }
  const pageSize = 100;
  const maxPages = Math.max(1, Math.ceil(scanLimit / pageSize));
  const candidates = await listPaged("/v0/candidates", audit, {
    pageSize,
    maxPages,
    limit: scanLimit
  });

  const urlToCandidateIds = {};
  for (const candidate of candidates) {
    const candidateId = String(candidate?.id || "").trim();
    if (!candidateId) {
      continue;
    }
    const keys = getGemCandidateLookupKeys(candidate);
    for (const key of keys) {
      if (!urlToCandidateIds[key]) {
        urlToCandidateIds[key] = candidateId;
      }
    }
  }

  gemLinkedInUrlLookupCache = {
    builtAtMs: Date.now(),
    builtAt: new Date().toISOString(),
    scannedCount: Array.isArray(candidates) ? candidates.length : 0,
    isComplete: Array.isArray(candidates) ? candidates.length < scanLimit : false,
    urlToCandidateIds
  };

  logEvent({
    source: "backend",
    event: "gem.linkedin_lookup.refreshed",
    message: "Refreshed Gem LinkedIn URL lookup cache.",
    requestId: audit.requestId,
    route: audit.route,
    runId: audit.runId,
    actionId: audit.actionId,
    details: {
      scanLimit,
      scannedCount: gemLinkedInUrlLookupCache.scannedCount,
      urlCount: gemLinkedInLookupSize(gemLinkedInUrlLookupCache),
      isComplete: gemLinkedInUrlLookupCache.isComplete
    }
  });

  return gemLinkedInUrlLookupCache;
}

function ensureGemLinkedInUrlLookup(audit) {
  if (!(Number.isFinite(Number(GEM_CANDIDATE_LOOKUP_SCAN_MAX)) && Number(GEM_CANDIDATE_LOOKUP_SCAN_MAX) > 0)) {
    return Promise.resolve(gemLinkedInUrlLookupCache);
  }
  const fresh = isGemLinkedInLookupFresh(gemLinkedInUrlLookupCache);
  if (fresh && gemLinkedInLookupSize(gemLinkedInUrlLookupCache) > 0) {
    return Promise.resolve(gemLinkedInUrlLookupCache);
  }
  if (gemLinkedInUrlLookupRefreshPromise) {
    return gemLinkedInUrlLookupRefreshPromise;
  }
  gemLinkedInUrlLookupRefreshPromise = refreshGemLinkedInUrlLookup(audit).finally(() => {
    gemLinkedInUrlLookupRefreshPromise = null;
  });
  return gemLinkedInUrlLookupRefreshPromise;
}

async function findGemCandidateByLinkedInUrl(linkedInUrl, audit) {
  const normalizedUrl = normalizeLinkedInUrl(linkedInUrl);
  if (!normalizedUrl || !normalizedUrl.includes("linkedin.com/")) {
    return null;
  }

  const cachedId = String(gemLinkedInUrlLookupCache?.urlToCandidateIds?.[normalizedUrl] || "").trim();
  if (cachedId) {
    try {
      const candidate = await gemRequest(`/v0/candidates/${cachedId}`, {}, audit);
      if (candidate?.id) {
        rememberGemCandidateLinkedInKeys(candidate);
        return candidate;
      }
    } catch (_error) {
      // Fall through to full index refresh if cached id is stale.
    }
  }

  const index = await ensureGemLinkedInUrlLookup(audit);
  const indexedId = String(index?.urlToCandidateIds?.[normalizedUrl] || "").trim();
  if (!indexedId) {
    return null;
  }
  try {
    const candidate = await gemRequest(`/v0/candidates/${indexedId}`, {}, audit);
    if (candidate?.id) {
      rememberGemCandidateLinkedInKeys(candidate);
      return candidate;
    }
  } catch (_error) {
    return null;
  }
  return null;
}

async function findGemCandidateByProfileUrl(profileUrl, audit) {
  const normalizedUrl = normalizeProfileUrl(profileUrl);
  if (!normalizedUrl) {
    return null;
  }

  const cachedId = String(gemLinkedInUrlLookupCache?.urlToCandidateIds?.[normalizedUrl] || "").trim();
  if (cachedId) {
    try {
      const candidate = await gemRequest(`/v0/candidates/${cachedId}`, {}, audit);
      if (candidate?.id) {
        rememberGemCandidateLinkedInKeys(candidate);
        return candidate;
      }
    } catch (_error) {
      // Fall through to full index refresh if cached id is stale.
    }
  }

  const index = await ensureGemLinkedInUrlLookup(audit);
  const indexedId = String(index?.urlToCandidateIds?.[normalizedUrl] || "").trim();
  if (!indexedId) {
    return null;
  }

  try {
    const candidate = await gemRequest(`/v0/candidates/${indexedId}`, {}, audit);
    if (candidate?.id) {
      rememberGemCandidateLinkedInKeys(candidate);
      return candidate;
    }
  } catch (_error) {
    return null;
  }

  return null;
}

async function findCandidateByLinkedIn(payload, audit) {
  const handle = sanitizeLinkedInHandle(payload?.linkedInHandle || payload?.linkedinHandle);
  const linkedInUrl = firstNonEmpty(payload?.linkedInUrl, payload?.linkedinUrl, payload?.profileUrl);

  if (!handle && !linkedInUrl) {
    throw new Error("linkedInHandle or linkedInUrl is required.");
  }

  if (handle) {
    const list = await gemRequest(
      "/v0/candidates",
      {
        query: { linked_in_handle: handle, page_size: 1 }
      },
      audit
    );
    const byHandle = Array.isArray(list) && list.length > 0 ? list[0] : null;
    if (byHandle?.id) {
      rememberGemCandidateLinkedInKeys(byHandle);
      return { candidate: byHandle };
    }
  }

  if (linkedInUrl) {
    const byUrl = await findGemCandidateByLinkedInUrl(linkedInUrl, audit);
    if (byUrl?.id) {
      return { candidate: byUrl };
    }
  }

  return { candidate: null };
}

async function findCandidateByEmail(payload, audit) {
  const email = normalizeUserEmail(payload?.email || payload?.emailAddress);
  if (!email) {
    throw new Error("email is required.");
  }

  const list = await gemRequest(
    "/v0/candidates",
    {
      query: {
        email,
        page_size: 20
      }
    },
    audit
  );
  const candidates = Array.isArray(list) ? list : [];
  if (candidates.length === 0) {
    return { candidate: null };
  }

  const exact = candidates.find((candidate) =>
    extractCandidateEmailsForUpdate(candidate).some(
      (entry) => normalizeUserEmail(entry?.emailAddress || "") === email
    )
  );
  const resolved = exact || candidates[0] || null;
  if (resolved?.id) {
    rememberGemCandidateLinkedInKeys(resolved);
  }
  return { candidate: resolved && resolved.id ? resolved : null };
}

async function findCandidateByProfileUrl(payload, audit) {
  const profileUrl = firstNonEmpty(payload?.profileUrl, payload?.url, payload?.githubUrl, payload?.linkedinUrl);
  const normalized = normalizeProfileUrl(profileUrl);
  if (!normalized) {
    throw new Error("profileUrl is required.");
  }
  const candidate = await findGemCandidateByProfileUrl(normalized, audit);
  return { candidate: candidate && candidate.id ? candidate : null };
}

function normalizeCandidateResolutionStrings(values, normalize = (value) => String(value || "").trim()) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalize(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function collectCandidateResolutionEmails(payload = {}) {
  return normalizeCandidateResolutionStrings(
    [
      payload.email,
      payload.emailAddress,
      payload.contactEmail,
      ...(Array.isArray(payload.emails) ? payload.emails : []),
      ...(Array.isArray(payload.contactEmails) ? payload.contactEmails : [])
    ],
    (value) => normalizeUserEmail(value)
  );
}

function collectCandidateResolutionProfileUrls(payload = {}) {
  return normalizeCandidateResolutionStrings(
    [
      payload.profileUrl,
      payload.url,
      payload.githubUrl,
      payload.linkedInUrl,
      payload.linkedinUrl,
      ...(Array.isArray(payload.profileUrls) ? payload.profileUrls : [])
    ],
    (value) => normalizeProfileUrl(value)
  );
}

async function resolveCandidateByContext(payload, audit) {
  const candidateId = String(payload?.candidateId || payload?.gemCandidateId || "").trim();
  const linkedInHandle = sanitizeLinkedInHandle(payload?.linkedInHandle || payload?.linkedinHandle);
  const linkedInUrl = firstNonEmpty(payload?.linkedInUrl, payload?.linkedinUrl);
  const emails = collectCandidateResolutionEmails(payload);
  const profileUrls = collectCandidateResolutionProfileUrls(payload);

  if (!candidateId && !linkedInHandle && !linkedInUrl && emails.length === 0 && profileUrls.length === 0) {
    throw new Error("candidateId, linkedInHandle, linkedInUrl, emails, or profileUrls is required.");
  }

  if (candidateId) {
    try {
      const byId = await getCandidate({ candidateId }, audit);
      if (byId?.candidate?.id) {
        rememberGemCandidateLinkedInKeys(byId.candidate);
        return {
          candidate: byId.candidate,
          matchedBy: "candidateId"
        };
      }
    } catch (_error) {
      // Continue with the remaining lookup strategies.
    }
  }

  if (linkedInHandle || linkedInUrl) {
    const byLinkedIn = await findCandidateByLinkedIn(
      {
        linkedInHandle,
        linkedInUrl
      },
      audit
    );
    if (byLinkedIn?.candidate?.id) {
      return {
        candidate: byLinkedIn.candidate,
        matchedBy: linkedInHandle ? "linkedInHandle" : "linkedInUrl"
      };
    }
  }

  for (const email of emails) {
    const byEmail = await findCandidateByEmail({ email }, audit);
    if (byEmail?.candidate?.id) {
      return {
        candidate: byEmail.candidate,
        matchedBy: "email"
      };
    }
  }

  const normalizedLinkedInKeys = new Set(
    [normalizeLinkedInUrl(linkedInUrl), normalizeProfileUrl(linkedInUrl)].filter(Boolean)
  );
  for (const profileUrl of profileUrls) {
    if (normalizedLinkedInKeys.has(normalizeProfileUrl(profileUrl))) {
      continue;
    }
    const byProfileUrl = await findCandidateByProfileUrl({ profileUrl }, audit);
    if (byProfileUrl?.candidate?.id) {
      return {
        candidate: byProfileUrl.candidate,
        matchedBy: "profileUrl"
      };
    }
  }

  return {
    candidate: null,
    matchedBy: ""
  };
}

function normalizeUserEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function resolveUserIdFromGemEmail(email, audit) {
  const normalizedEmail = normalizeUserEmail(email);
  if (!normalizedEmail) {
    return "";
  }
  const users = await gemRequest(
    "/v0/users",
    {
      query: { email: normalizedEmail, page_size: 20 }
    },
    audit
  );
  if (!Array.isArray(users) || users.length === 0) {
    return "";
  }

  const matched = users.find(
    (user) => normalizeUserEmail(user?.email) === normalizedEmail && String(user?.id || "").trim()
  );
  if (matched?.id) {
    return String(matched.id).trim();
  }
  return String(users[0]?.id || "").trim();
}

async function resolveCreatedByUserId(explicitUserId, explicitUserEmail, audit) {
  const directUserId = String(explicitUserId || "").trim();
  if (directUserId) {
    return directUserId;
  }
  const directUserEmail = normalizeUserEmail(explicitUserEmail);
  if (directUserEmail) {
    const resolvedFromEmail = await resolveUserIdFromGemEmail(directUserEmail, audit);
    if (resolvedFromEmail) {
      return resolvedFromEmail;
    }
  }
  if (GEM_DEFAULT_USER_ID) {
    return GEM_DEFAULT_USER_ID;
  }
  const defaultEmail = normalizeUserEmail(GEM_DEFAULT_USER_EMAIL);
  if (!defaultEmail) {
    return "";
  }
  return resolveUserIdFromGemEmail(defaultEmail, audit);
}

function extractCandidateOwnerUserId(candidate) {
  return String(
    candidate?.created_by ||
      candidate?.createdBy ||
      candidate?.user_id ||
      candidate?.userId ||
      candidate?.owner_id ||
      candidate?.ownerId ||
      ""
  ).trim();
}

async function resolveUserIdWithCandidateFallback({ explicitUserId, explicitUserEmail, candidateId, audit, purpose }) {
  const resolved = await resolveCreatedByUserId(explicitUserId, explicitUserEmail, audit);
  if (resolved) {
    return resolved;
  }

  const normalizedCandidateId = String(candidateId || "").trim();
  if (!normalizedCandidateId) {
    return "";
  }

  try {
    const candidate = await gemRequest(`/v0/candidates/${normalizedCandidateId}`, {}, audit);
    const ownerUserId = extractCandidateOwnerUserId(candidate);
    if (ownerUserId) {
      logEvent({
        source: "backend",
        event: "user_id.fallback.candidate_owner",
        message: `Resolved ${purpose} from candidate owner.`,
        requestId: audit.requestId,
        route: audit.route,
        runId: audit.runId,
        actionId: audit.actionId,
        details: {
          candidateId: normalizedCandidateId,
          userId: ownerUserId
        }
      });
      return ownerUserId;
    }
  } catch (error) {
    logEvent({
      level: "warn",
      source: "backend",
      event: "user_id.fallback.candidate_owner_failed",
      message: `Could not resolve ${purpose} from candidate owner.`,
      requestId: audit.requestId,
      route: audit.route,
      runId: audit.runId,
      actionId: audit.actionId,
      details: {
        candidateId: normalizedCandidateId,
        error: error?.message || "unknown_error"
      }
    });
  }

  return "";
}

function normalizeIsoDate(raw) {
  const value = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return "";
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return value;
}

async function createCandidateFromLinkedIn(payload, audit) {
  const linkedInHandle = sanitizeLinkedInHandle(payload?.linkedInHandle || payload?.linkedinHandle);
  const linkedInUrl = firstNonEmpty(payload?.linkedInUrl, payload?.linkedinUrl, payload?.profileUrl);
  if (!linkedInHandle && !linkedInUrl) {
    throw new Error("linkedInHandle or linkedInUrl is required.");
  }

  const createdBy = await resolveCreatedByUserId(payload.createdByUserId, payload.createdByUserEmail, audit);
  if (!createdBy) {
    throw new Error(
      "Gem requires created_by. Set createdByUserEmail or createdByUserId in extension options, or set GEM_DEFAULT_USER_ID/GEM_DEFAULT_USER_EMAIL in backend env. Also verify the extension backend URL points to the backend where these env vars are configured."
    );
  }

  const body = omitUndefined({
    created_by: createdBy,
    first_name: payload.firstName,
    last_name: payload.lastName,
    linked_in_handle: linkedInHandle || undefined,
    profile_urls: linkedInUrl ? [linkedInUrl] : undefined,
    autofill: Boolean(linkedInHandle)
  });

  try {
    const candidate = await gemRequest("/v0/candidates", { method: "POST", body }, audit);
    rememberGemCandidateLinkedInKeys(candidate);
    return { candidate };
  } catch (error) {
    const duplicateId = error?.data?.errors?.duplicate_candidate?.id;
    if (duplicateId) {
      logEvent({
        source: "backend",
        event: "candidate.duplicate_resolved",
        message: "Resolved duplicate candidate by existing id.",
        requestId: audit.requestId,
        route: audit.route,
        runId: audit.runId,
        actionId: audit.actionId,
        details: { duplicateId }
      });
      const candidate = await gemRequest(`/v0/candidates/${duplicateId}`, {}, audit);
      rememberGemCandidateLinkedInKeys(candidate);
      return { candidate };
    }
    throw error;
  }
}

async function createCandidateFromContext(payload, audit) {
  const linkedInHandle = sanitizeLinkedInHandle(payload?.linkedInHandle || payload?.linkedinHandle);
  const linkedInUrl = firstNonEmpty(payload?.linkedInUrl, payload?.linkedinUrl);
  const createdBy = await resolveCreatedByUserId(payload.createdByUserId, payload.createdByUserEmail, audit);
  if (!createdBy) {
    throw new Error(
      "Gem requires created_by. Set createdByUserEmail or createdByUserId in extension options, or set GEM_DEFAULT_USER_ID/GEM_DEFAULT_USER_EMAIL in backend env. Also verify the extension backend URL points to the backend where these env vars are configured."
    );
  }

  const emails = [];
  const seenEmails = new Set();
  const addEmail = (value) => {
    const email = normalizeUserEmail(value);
    if (!email || seenEmails.has(email) || !isValidEmailAddress(email)) {
      return;
    }
    seenEmails.add(email);
    emails.push(email);
  };
  addEmail(payload?.email);
  addEmail(payload?.emailAddress);
  if (Array.isArray(payload?.contactEmails)) {
    payload.contactEmails.forEach((value) => addEmail(value));
  }

  const profileUrls = [];
  const seenProfileUrls = new Set();
  const addProfileUrl = (value) => {
    const raw = String(value || "").trim();
    if (!raw) {
      return;
    }
    const normalized = normalizeProfileUrl(raw);
    if (!normalized || seenProfileUrls.has(normalized)) {
      return;
    }
    seenProfileUrls.add(normalized);
    profileUrls.push(raw);
  };
  addProfileUrl(payload?.profileUrl);
  addProfileUrl(payload?.url);
  addProfileUrl(payload?.githubUrl);
  addProfileUrl(payload?.gemProfileUrl);
  addProfileUrl(linkedInUrl);
  if (Array.isArray(payload?.profileUrls)) {
    payload.profileUrls.forEach((value) => addProfileUrl(value));
  }
  if (linkedInHandle) {
    addProfileUrl(buildLinkedInUrlFromHandle(linkedInHandle));
  }

  if (!linkedInHandle && emails.length === 0 && profileUrls.length === 0) {
    throw new Error("At least one identifier is required (linkedInHandle, email, or profileUrl).");
  }

  const body = omitUndefined({
    created_by: createdBy,
    first_name: payload.firstName,
    last_name: payload.lastName,
    linked_in_handle: linkedInHandle || undefined,
    profile_urls: profileUrls.length > 0 ? profileUrls : undefined,
    emails:
      emails.length > 0
        ? emails.map((email, index) => ({
            email_address: email,
            is_primary: index === 0
          }))
        : undefined,
    autofill: Boolean(linkedInHandle)
  });

  try {
    const candidate = await gemRequest("/v0/candidates", { method: "POST", body }, audit);
    rememberGemCandidateLinkedInKeys(candidate);
    return { candidate };
  } catch (error) {
    const duplicateId = error?.data?.errors?.duplicate_candidate?.id;
    if (duplicateId) {
      logEvent({
        source: "backend",
        event: "candidate.duplicate_resolved",
        message: "Resolved duplicate candidate by existing id.",
        requestId: audit.requestId,
        route: audit.route,
        runId: audit.runId,
        actionId: audit.actionId,
        details: { duplicateId }
      });
      const candidate = await gemRequest(`/v0/candidates/${duplicateId}`, {}, audit);
      rememberGemCandidateLinkedInKeys(candidate);
      return { candidate };
    }
    throw error;
  }
}

async function addCandidateToProject(payload, audit) {
  const projectId = String(payload.projectId || "").trim();
  const candidateId = String(payload.candidateId || "").trim();
  if (!projectId || !candidateId) {
    throw new Error("projectId and candidateId are required.");
  }
  const userId = await resolveCreatedByUserId(payload.userId, payload.userEmail, audit);

  const baseBody = { candidate_ids: [candidateId] };

  if (!userId) {
    await gemRequest(
      `/v0/projects/${projectId}/candidates`,
      {
        method: "PUT",
        body: baseBody
      },
      audit
    );
    invalidateGemCustomFieldCandidateContext(candidateId);
    return { projectId, candidateId, userId: "" };
  }

  try {
    await gemRequest(
      `/v0/projects/${projectId}/candidates`,
      {
        method: "PUT",
        body: {
          ...baseBody,
          user_id: userId
        }
      },
      audit
    );
    invalidateGemCustomFieldCandidateContext(candidateId);
    return { projectId, candidateId, userId };
  } catch (error) {
    const message = String(error?.data?.message || error?.message || "");
    const lacksWriteAccess = /permission to perform the action|write access/i.test(message);
    if (!lacksWriteAccess) {
      throw error;
    }

    logEvent({
      level: "warn",
      source: "backend",
      event: "project.add_candidate.user_id_fallback",
      message: "Retrying project add without user_id after permission error.",
      requestId: audit.requestId,
      route: audit.route,
      runId: audit.runId,
      actionId: audit.actionId,
      details: {
        projectId,
        candidateId,
        attemptedUserId: userId
      }
    });

    await gemRequest(
      `/v0/projects/${projectId}/candidates`,
      {
        method: "PUT",
        body: baseBody
      },
      audit
    );
    invalidateGemCustomFieldCandidateContext(candidateId);
    return { projectId, candidateId, userId: "" };
  }
}

function slugifyGemProjectName(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildGemProjectUrl(projectId, projectName = "") {
  const id = String(projectId || "").trim();
  if (!id) {
    return "";
  }
  const slug = slugifyGemProjectName(projectName);
  const segment = slug ? `${slug}--${id}` : id;
  return `https://www.gem.com/projects/${segment}`;
}

async function createProject(payload, audit) {
  const name = String(payload?.name || "").trim();
  if (!name) {
    throw new Error("Project name is required.");
  }
  const description = String(payload?.description || "").trim();
  const requestedPrivacy = normalizeTextToken(payload?.privacyType || payload?.privacy_type || "");
  const privacyType = ["shared", "personal", "confidential"].includes(requestedPrivacy) ? requestedPrivacy : "shared";
  const userId = await resolveCreatedByUserId(payload?.userId, payload?.userEmail, audit);
  if (!userId) {
    throw new Error(
      "Gem requires project.user_id. Set createdByUserEmail or createdByUserId in extension options, or set GEM_DEFAULT_USER_ID/GEM_DEFAULT_USER_EMAIL in backend env."
    );
  }

  const body = omitUndefined({
    user_id: userId,
    name,
    description: description || undefined,
    privacy_type: privacyType
  });
  const project = await gemRequest(
    "/v0/projects",
    {
      method: "POST",
      body
    },
    audit
  );

  return {
    project: {
      id: String(project?.id || "").trim(),
      name: String(project?.name || name).trim(),
      privacyType: String(project?.privacy_type || privacyType).trim(),
      description: String(project?.description || description).trim(),
      createdAt: String(project?.created_at || project?.createdAt || project?.created || "").trim(),
      url: buildGemProjectUrl(project?.id, project?.name || name)
    }
  };
}

async function listProjects(payload, audit) {
  const requestedLimitRaw = Number(payload.limit);
  const requestedLimit =
    Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
      ? Math.max(1, Math.min(requestedLimitRaw, PROJECTS_SCAN_MAX))
      : 0;
  const scanTarget = requestedLimit || PROJECTS_SCAN_MAX;
  const query = String(payload.query || "").trim();
  const pageSize = 100;
  const maxPages = Math.max(1, Math.ceil(scanTarget / pageSize));
  let aggregated = [];

  for (let page = 1; page <= maxPages; page += 1) {
    let pageData = null;
    try {
      pageData = await gemRequest(
        "/v0/projects",
        {
          query: {
            page_size: pageSize,
            page
          }
        },
        audit
      );
    } catch (error) {
      // Gem may return 404 for out-of-range pages instead of an empty page.
      if (Number(error?.status) === 404 && page > 1) {
        logEvent({
          level: "warn",
          source: "backend",
          event: "projects.list.pagination_end_404",
          message: "Stopping project pagination after receiving 404 on a later page.",
          requestId: audit.requestId,
          route: audit.route,
          runId: audit.runId,
          actionId: audit.actionId,
          details: {
            page,
            pageSize
          }
        });
        break;
      }
      throw error;
    }
    const projects = Array.isArray(pageData) ? pageData : [];
    aggregated = aggregated.concat(projects);
    if (projects.length < pageSize || aggregated.length >= scanTarget) {
      break;
    }
  }

  const seen = new Set();
  let normalized = aggregated
    .map((project) => ({
      id: String(project.id || ""),
      name: String(project.name || ""),
      archived: Boolean(project.archived || project.is_archived || false),
      createdAt: String(project.created_at || project.createdAt || project.created || "")
    }))
    .filter((project) => {
      if (!project.id || seen.has(project.id)) {
        return false;
      }
      seen.add(project.id);
      return true;
    });

  if (query) {
    const lower = query.toLowerCase();
    normalized = normalized.filter((project) => project.name.toLowerCase().includes(lower));
  }

  if (requestedLimit > 0) {
    normalized = normalized.slice(0, requestedLimit);
  }

  return { projects: normalized };
}

function getGemCustomFieldCatalogAgeMs(cache = gemCustomFieldCatalogCache) {
  if (!cache?.builtAtMs) {
    return Number.POSITIVE_INFINITY;
  }
  return Date.now() - Number(cache.builtAtMs);
}

function isGemCustomFieldCatalogFresh(cache = gemCustomFieldCatalogCache) {
  return getGemCustomFieldCatalogAgeMs(cache) <= GEM_CUSTOM_FIELDS_CACHE_TTL_MS;
}

function normalizeGemCandidateProjectIds(projectIds) {
  return Array.isArray(projectIds)
    ? projectIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
}

function cloneCandidateCustomFieldMembershipById(memberships) {
  const clone = new Map();
  if (!(memberships instanceof Map)) {
    return clone;
  }
  memberships.forEach((membership, fieldId) => {
    const normalizedFieldId = String(fieldId || "").trim();
    if (!normalizedFieldId) {
      return;
    }
    const rawValue = membership?.value;
    clone.set(normalizedFieldId, {
      value: Array.isArray(rawValue)
        ? rawValue.map((value) => String(value || "").trim()).filter(Boolean)
        : rawValue === undefined || rawValue === null
          ? rawValue ?? null
          : String(rawValue),
      valueOptionIds: Array.isArray(membership?.valueOptionIds)
        ? membership.valueOptionIds.map((id) => String(id || "").trim()).filter(Boolean)
        : []
    });
  });
  return clone;
}

function getGemCustomFieldCandidateContextAgeMs(entry) {
  if (!entry?.fetchedAtMs) {
    return Number.POSITIVE_INFINITY;
  }
  return Date.now() - Number(entry.fetchedAtMs);
}

function isGemCustomFieldCandidateContextFresh(entry) {
  return getGemCustomFieldCandidateContextAgeMs(entry) <= GEM_CUSTOM_FIELD_CANDIDATE_CONTEXT_TTL_MS;
}

function setGemCustomFieldCandidateContext(candidateId, candidateContext) {
  const normalizedCandidateId = String(candidateId || "").trim();
  if (!normalizedCandidateId) {
    return null;
  }
  const entry = {
    fetchedAtMs: Date.now(),
    candidateProjectIds: normalizeGemCandidateProjectIds(candidateContext?.candidateProjectIds),
    candidateCustomFieldMembershipById: cloneCandidateCustomFieldMembershipById(
      candidateContext?.candidateCustomFieldMembershipById
    )
  };
  gemCustomFieldCandidateContextCache.set(normalizedCandidateId, entry);
  return entry;
}

function getGemCustomFieldCandidateContext(candidateId) {
  const normalizedCandidateId = String(candidateId || "").trim();
  if (!normalizedCandidateId) {
    return null;
  }
  const entry = gemCustomFieldCandidateContextCache.get(normalizedCandidateId) || null;
  if (!entry) {
    return null;
  }
  if (!isGemCustomFieldCandidateContextFresh(entry)) {
    gemCustomFieldCandidateContextCache.delete(normalizedCandidateId);
    return null;
  }
  return {
    candidateId: normalizedCandidateId,
    candidateProjectIds: normalizeGemCandidateProjectIds(entry.candidateProjectIds),
    candidateCustomFieldMembershipById: cloneCandidateCustomFieldMembershipById(entry.candidateCustomFieldMembershipById)
  };
}

function invalidateGemCustomFieldCandidateContext(candidateId) {
  const normalizedCandidateId = String(candidateId || "").trim();
  if (!normalizedCandidateId) {
    return;
  }
  gemCustomFieldCandidateContextCache.delete(normalizedCandidateId);
}

function rememberGemCustomFieldCandidateContextFromCandidate(candidate) {
  const normalizedCandidateId = String(candidate?.id || "").trim();
  if (!normalizedCandidateId) {
    return null;
  }
  return setGemCustomFieldCandidateContext(normalizedCandidateId, {
    candidateProjectIds: normalizeGemCandidateProjectIds(candidate?.project_ids),
    candidateCustomFieldMembershipById: buildCandidateCustomFieldMembershipById(candidate?.custom_fields)
  });
}

function normalizeGemCustomFieldCatalog(fields) {
  const seen = new Set();
  return (Array.isArray(fields) ? fields : [])
    .map((field) => ({
      id: String(field.id || ""),
      name: String(field.name || ""),
      scope: String(field.scope || ""),
      projectId: String(field.project_id || ""),
      valueType: String(field.value_type || ""),
      isHidden: Boolean(field.is_hidden),
      createdAt: String(field.created_at || ""),
      options: Array.isArray(field.options)
        ? field.options
            .map((option) => ({
              id: String(option.id || ""),
              value: String(option.value || ""),
              isHidden: Boolean(option.is_hidden)
            }))
            .filter((option) => option.id && !option.isHidden)
        : []
    }))
    .filter((field) => {
      if (!field.id || seen.has(field.id) || field.isHidden) {
        return false;
      }
      seen.add(field.id);
      return true;
    });
}

async function refreshGemCustomFieldCatalog(audit) {
  const configuredScanLimit = Number.isFinite(Number(CUSTOM_FIELDS_SCAN_MAX))
    ? Number(CUSTOM_FIELDS_SCAN_MAX)
    : 0;
  const scanLimit = configuredScanLimit > 0 ? Math.min(configuredScanLimit, 50000) : 0;
  if (scanLimit <= 0) {
    gemCustomFieldCatalogCache = {
      builtAtMs: Date.now(),
      builtAt: new Date().toISOString(),
      scannedCount: 0,
      isComplete: true,
      fields: []
    };
    return gemCustomFieldCatalogCache;
  }

  const pageSize = 100;
  const maxPages = Math.max(1, Math.ceil(scanLimit / pageSize));
  const fields = await listPaged("/v0/custom_fields", audit, {
    pageSize,
    maxPages,
    limit: scanLimit
  });
  const normalized = normalizeGemCustomFieldCatalog(fields);

  gemCustomFieldCatalogCache = {
    builtAtMs: Date.now(),
    builtAt: new Date().toISOString(),
    scannedCount: Array.isArray(fields) ? fields.length : 0,
    isComplete: Array.isArray(fields) ? fields.length < scanLimit : false,
    fields: normalized
  };

  logEvent({
    source: "backend",
    event: "gem.custom_fields_catalog.refreshed",
    message: "Refreshed Gem custom field catalog cache.",
    requestId: audit.requestId,
    route: audit.route,
    runId: audit.runId,
    actionId: audit.actionId,
    details: {
      scanLimit,
      scannedCount: gemCustomFieldCatalogCache.scannedCount,
      customFieldCount: normalized.length,
      isComplete: gemCustomFieldCatalogCache.isComplete
    }
  });

  return gemCustomFieldCatalogCache;
}

function ensureGemCustomFieldCatalog(audit, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  if (!forceRefresh && isGemCustomFieldCatalogFresh(gemCustomFieldCatalogCache) && Array.isArray(gemCustomFieldCatalogCache.fields)) {
    return Promise.resolve(gemCustomFieldCatalogCache);
  }
  if (gemCustomFieldCatalogRefreshPromise) {
    return gemCustomFieldCatalogRefreshPromise;
  }
  gemCustomFieldCatalogRefreshPromise = refreshGemCustomFieldCatalog(audit).finally(() => {
    gemCustomFieldCatalogRefreshPromise = null;
  });
  return gemCustomFieldCatalogRefreshPromise;
}

function buildCandidateCustomFieldMembershipById(memberships) {
  const map = new Map();
  (Array.isArray(memberships) ? memberships : []).forEach((membership) => {
    const membershipFieldId = String(membership?.id || membership?.custom_field_id || "").trim();
    if (!membershipFieldId) {
      return;
    }
    const valueOptionIdsRaw = Array.isArray(membership?.value_option_ids)
      ? membership.value_option_ids
      : Array.isArray(membership?.option_ids)
        ? membership.option_ids
        : [];
    const valueOptionIds = valueOptionIdsRaw.map((id) => String(id || "").trim()).filter(Boolean);
    map.set(membershipFieldId, {
      value: membership?.value,
      valueOptionIds
    });
  });
  return map;
}

function normalizeGemStatusToken(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findDerivedGemStatusField(customFields) {
  const fields = Array.isArray(customFields) ? customFields : [];
  if (fields.length === 0) {
    return null;
  }
  const exactMatches = fields.filter((field) => normalizeGemStatusToken(field?.name) === "status");
  const fuzzyMatches = exactMatches.length > 0
    ? exactMatches
    : fields.filter((field) => normalizeGemStatusToken(field?.name).startsWith("status"));
  if (fuzzyMatches.length === 0) {
    return null;
  }
  return fuzzyMatches
    .slice()
    .sort((left, right) => {
      const leftLabels = Array.isArray(left?.currentValueLabels)
        ? left.currentValueLabels.map((label) => String(label || "").trim()).filter(Boolean)
        : [];
      const rightLabels = Array.isArray(right?.currentValueLabels)
        ? right.currentValueLabels.map((label) => String(label || "").trim()).filter(Boolean)
        : [];
      const leftScore = (leftLabels.length ? 4 : 0) + (left?.scope === "team" ? 2 : 0) + (left?.scope === "project" ? 1 : 0);
      const rightScore = (rightLabels.length ? 4 : 0) + (right?.scope === "team" ? 2 : 0) + (right?.scope === "project" ? 1 : 0);
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }
      return String(left?.name || "").localeCompare(String(right?.name || ""));
    })[0];
}

function getDerivedGemStatusLabels(customFields) {
  const statusField = findDerivedGemStatusField(customFields);
  return Array.isArray(statusField?.currentValueLabels)
    ? statusField.currentValueLabels.map((label) => String(label || "").trim()).filter(Boolean)
    : [];
}

async function resolveCustomFieldCandidateContext(payload, audit, options = {}) {
  const candidateId = String(payload.candidateId || "").trim();
  if (!candidateId) {
    return {
      candidateId: "",
      candidateProjectIds: [],
      candidateCustomFieldMembershipById: new Map(),
      cacheStatus: "skipped",
      fetchDurationMs: 0
    };
  }

  if (!options.forceRefresh) {
    const cachedContext = getGemCustomFieldCandidateContext(candidateId);
    if (cachedContext) {
      return {
        ...cachedContext,
        cacheStatus: "hit",
        fetchDurationMs: 0
      };
    }
  }

  const startedAt = Date.now();
  const candidate = await gemRequest(`/v0/candidates/${candidateId}`, {}, audit);
  const candidateContext = {
    candidateId,
    candidateProjectIds: normalizeGemCandidateProjectIds(candidate?.project_ids),
    candidateCustomFieldMembershipById: buildCandidateCustomFieldMembershipById(candidate?.custom_fields)
  };
  setGemCustomFieldCandidateContext(candidateId, candidateContext);
  return {
    ...candidateContext,
    cacheStatus: options.forceRefresh ? "refreshed" : "miss",
    fetchDurationMs: Date.now() - startedAt
  };
}

async function listCustomFields(payload, audit) {
  const startedAt = Date.now();
  const requestedLimitRaw = Number(payload.limit);
  const requestedLimit =
    Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
      ? Math.max(1, Math.min(requestedLimitRaw, CUSTOM_FIELDS_SCAN_MAX))
      : 0;
  const catalogOnly = Boolean(payload.catalogOnly);
  const forceRefresh = Boolean(payload.forceRefresh);
  const catalogCacheStatus =
    !forceRefresh && isGemCustomFieldCatalogFresh(gemCustomFieldCatalogCache) && Array.isArray(gemCustomFieldCatalogCache.fields)
      ? "hit"
      : forceRefresh
        ? "refreshed"
        : "miss";
  const [catalog, candidateContext] = await Promise.all([
    ensureGemCustomFieldCatalog(audit, { forceRefresh }),
    catalogOnly
      ? Promise.resolve({
          candidateId: String(payload.candidateId || "").trim(),
          candidateProjectIds: [],
          candidateCustomFieldMembershipById: new Map(),
          cacheStatus: "skipped",
          fetchDurationMs: 0
        })
      : resolveCustomFieldCandidateContext(payload, audit, { forceRefresh })
  ]);

  const candidateProjectIds = Array.isArray(candidateContext.candidateProjectIds) ? candidateContext.candidateProjectIds : [];
  const candidateCustomFieldMembershipById =
    candidateContext.candidateCustomFieldMembershipById instanceof Map
      ? candidateContext.candidateCustomFieldMembershipById
      : new Map();
  const candidateId = String(candidateContext.candidateId || "").trim();

  let customFields = (Array.isArray(catalog?.fields) ? catalog.fields : [])
    .filter((field) => {
      if (field.scope === "project") {
        return !catalogOnly && Boolean(field.projectId) && candidateProjectIds.includes(field.projectId);
      }
      if (field.scope === "team") {
        return true;
      }
      return false;
    })
    .map((field) => {
      const membership = candidateCustomFieldMembershipById.get(field.id) || null;
      let currentOptionIds = Array.isArray(membership?.valueOptionIds) ? membership.valueOptionIds.slice() : [];
      const optionValueById = new Map(field.options.map((option) => [option.id, option.value]));
      const optionIdByLowerValue = new Map(
        field.options.map((option) => [String(option.value || "").trim().toLowerCase(), option.id])
      );
      let currentValueLabels = [];

      if (currentOptionIds.length > 0) {
        currentValueLabels = currentOptionIds.map((id) => optionValueById.get(id) || id).filter(Boolean);
      } else if (Array.isArray(membership?.value)) {
        currentValueLabels = membership.value.map((value) => String(value || "").trim()).filter(Boolean);
      } else if (membership?.value !== undefined && membership?.value !== null) {
        const rawValue = String(membership.value || "").trim();
        if (rawValue) {
          currentValueLabels = [rawValue];
        }
      }

      if (currentOptionIds.length === 0 && currentValueLabels.length > 0) {
        const derivedOptionIds = currentValueLabels
          .map((label) => optionIdByLowerValue.get(String(label || "").trim().toLowerCase()) || "")
          .filter(Boolean);
        if (derivedOptionIds.length > 0) {
          currentOptionIds = Array.from(new Set(derivedOptionIds));
        }
      }

      return {
        ...field,
        currentOptionIds,
        currentValueLabels,
        options: field.options.slice().sort((a, b) => a.value.localeCompare(b.value))
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const statusLabels = getDerivedGemStatusLabels(customFields);

  if (requestedLimit > 0) {
    customFields = customFields.slice(0, requestedLimit);
  }

  const result = {
    candidateId,
    customFields,
    statusLabels,
    candidateProjectIds
  };
  logEvent({
    source: "backend",
    event: "custom_fields.list.resolved",
    message: `Resolved ${customFields.length} custom fields.`,
    requestId: audit.requestId,
    route: audit.route,
    runId: audit.runId,
    actionId: audit.actionId,
    durationMs: Date.now() - startedAt,
    details: {
      candidateId,
      catalogOnly,
      forceRefresh,
      catalogCacheStatus,
      candidateContextCacheStatus: candidateContext?.cacheStatus || "skipped",
      candidateFetchDurationMs: Number(candidateContext?.fetchDurationMs) || 0,
      candidateProjectCount: candidateProjectIds.length,
      customFieldCount: customFields.length
    }
  });
  return result;
}

async function setCandidateCustomField(payload, audit) {
  const candidateId = String(payload.candidateId || "").trim();
  const customFieldId = String(payload.customFieldId || "").trim();
  if (!candidateId || !customFieldId) {
    throw new Error("candidateId and customFieldId are required.");
  }

  const valueType = String(payload.customFieldValueType || payload.valueType || "").trim();
  const optionId = String(payload.customFieldOptionId || payload.optionId || "").trim();
  const optionIdsRaw = Array.isArray(payload.customFieldOptionIds)
    ? payload.customFieldOptionIds
    : Array.isArray(payload.optionIds)
      ? payload.optionIds
      : [];
  const optionIds = optionIdsRaw.map((id) => String(id || "").trim()).filter(Boolean);
  let value = payload.value === undefined ? null : payload.value;
  if (valueType === "single_select") {
    const singleValue = optionId || optionIds[0] || "";
    if (!singleValue) {
      throw new Error("single_select custom fields require option id.");
    }
    value = singleValue;
  } else if (valueType === "multi_select") {
    const multiValues = optionIds.length > 0 ? optionIds : optionId ? [optionId] : [];
    if (multiValues.length === 0) {
      throw new Error("multi_select custom fields require option id.");
    }
    value = Array.from(new Set(multiValues));
  }

  const body = {
    custom_fields: [
      {
        custom_field_id: customFieldId,
        value
      }
    ]
  };

  const candidate = await gemRequest(`/v0/candidates/${candidateId}`, { method: "PUT", body }, audit);
  rememberGemCustomFieldCandidateContextFromCandidate(candidate);
  return { candidate };
}

async function addCandidateNote(payload, audit) {
  const candidateId = String(payload.candidateId || "").trim();
  if (!candidateId) {
    throw new Error("candidateId is required.");
  }

  const rawNote = payload.note === undefined || payload.note === null ? "" : String(payload.note);
  const note = rawNote.trim();
  if (!note) {
    throw new Error("note is required.");
  }
  if (note.length > 10000) {
    throw new Error("Candidate note must be 10000 characters or less.");
  }

  const userId = await resolveUserIdWithCandidateFallback({
    explicitUserId: payload.userId,
    explicitUserEmail: payload.userEmail,
    candidateId,
    audit,
    purpose: "note.user_id"
  });
  if (!userId) {
    throw new Error(
      "Gem requires note.user_id. Set createdByUserEmail or createdByUserId in extension options, or set GEM_DEFAULT_USER_ID/GEM_DEFAULT_USER_EMAIL in backend env. Also verify the extension backend URL points to the backend where these env vars are configured."
    );
  }

  const noteRecord = await gemRequest(
    "/v0/notes",
    {
      method: "POST",
      body: {
        candidate_id: candidateId,
        user_id: userId,
        content: note
      }
    },
    audit
  );

  return {
    note: noteRecord,
    candidateId,
    userId
  };
}

async function setCandidateDueDate(payload, audit) {
  const candidateId = String(payload.candidateId || "").trim();
  if (!candidateId) {
    throw new Error("candidateId is required.");
  }

  const dueDate = normalizeIsoDate(payload.date || payload.dueDate);
  if (!dueDate) {
    throw new Error("date is required in YYYY-MM-DD format.");
  }

  const userId = await resolveUserIdWithCandidateFallback({
    explicitUserId: payload.userId,
    explicitUserEmail: payload.userEmail,
    candidateId,
    audit,
    purpose: "due_date.user_id"
  });
  if (!userId) {
    throw new Error(
      "Gem requires due_date.user_id. Set createdByUserEmail or createdByUserId in extension options, or set GEM_DEFAULT_USER_ID/GEM_DEFAULT_USER_EMAIL in backend env. Also verify the extension backend URL points to the backend where these env vars are configured."
    );
  }

  const rawNote = payload.note === undefined || payload.note === null ? "" : String(payload.note);
  const note = rawNote.trim();
  if (note.length > 2000) {
    throw new Error("Reminder note must be 2000 characters or less.");
  }

  const body = {
    due_date: {
      date: dueDate,
      user_id: userId,
      note: note || null
    }
  };

  const candidate = await gemRequest(`/v0/candidates/${candidateId}`, { method: "PUT", body }, audit);
  return { candidate, dueDate, userId };
}

function normalizeCandidateEmailAddress(raw) {
  return String(raw || "").trim();
}

function isValidEmailAddress(raw) {
  const value = normalizeCandidateEmailAddress(raw);
  if (!value || value.length > 255) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function ensureSinglePrimaryEmail(entries, preferredLower = "") {
  const list = Array.isArray(entries) ? entries : [];
  let primaryIndex = -1;
  if (preferredLower) {
    primaryIndex = list.findIndex((entry) => String(entry?.emailAddress || "").toLowerCase() === preferredLower);
  }
  if (primaryIndex < 0) {
    primaryIndex = list.findIndex((entry) => entry?.isPrimary);
  }
  if (primaryIndex < 0 && list.length > 0) {
    primaryIndex = 0;
  }
  return list.map((entry, index) => ({
    emailAddress: String(entry?.emailAddress || "").trim(),
    isPrimary: index === primaryIndex
  }));
}

function extractCandidateEmailsForUpdate(candidate) {
  const deduped = [];
  const byLower = new Map();

  function pushEmail(rawEmail, isPrimary = false) {
    const emailAddress = normalizeCandidateEmailAddress(rawEmail);
    if (!emailAddress || !isValidEmailAddress(emailAddress)) {
      return;
    }
    const lower = emailAddress.toLowerCase();
    const existingIndex = byLower.get(lower);
    if (existingIndex !== undefined) {
      if (isPrimary) {
        deduped[existingIndex].isPrimary = true;
      }
      return;
    }
    byLower.set(lower, deduped.length);
    deduped.push({ emailAddress, isPrimary: Boolean(isPrimary) });
  }

  const rawEmails = Array.isArray(candidate?.emails) ? candidate.emails : [];
  for (const item of rawEmails) {
    if (typeof item === "string") {
      pushEmail(item, false);
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    pushEmail(
      firstNonEmpty(item.email_address, item.emailAddress, item.email, item.value, item.address),
      item.is_primary === true || item.isPrimary === true
    );
  }

  const emailAddresses = Array.isArray(candidate?.email_addresses) ? candidate.email_addresses : [];
  for (const item of emailAddresses) {
    if (typeof item === "string") {
      pushEmail(item, false);
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    pushEmail(
      firstNonEmpty(item.email_address, item.emailAddress, item.email, item.value, item.address),
      item.is_primary === true || item.isPrimary === true
    );
  }

  const directPrimary = firstNonEmpty(candidate?.primary_email, candidate?.email, candidate?.email_address);
  if (directPrimary) {
    pushEmail(directPrimary, true);
  }

  return ensureSinglePrimaryEmail(deduped);
}

function toGemEmailPayload(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    email_address: String(entry?.emailAddress || "").trim(),
    is_primary: Boolean(entry?.isPrimary)
  }));
}

function buildCandidateEmailResponse(candidateId, emails) {
  const normalized = ensureSinglePrimaryEmail(
    (Array.isArray(emails) ? emails : [])
      .map((entry) => ({
        emailAddress: normalizeCandidateEmailAddress(entry?.emailAddress),
        isPrimary: Boolean(entry?.isPrimary)
      }))
      .filter((entry) => entry.emailAddress && isValidEmailAddress(entry.emailAddress))
  );
  const primary = normalized.find((entry) => entry.isPrimary) || null;
  return {
    candidateId: String(candidateId || ""),
    emails: normalized,
    primaryEmail: primary ? primary.emailAddress : ""
  };
}

async function listCandidateEmails(payload, audit) {
  const candidateId = String(payload.candidateId || "").trim();
  if (!candidateId) {
    throw new Error("candidateId is required.");
  }
  const candidate = await gemRequest(`/v0/candidates/${candidateId}`, {}, audit);
  const emails = extractCandidateEmailsForUpdate(candidate);
  return buildCandidateEmailResponse(candidateId, emails);
}

async function addCandidateEmail(payload, audit) {
  const candidateId = String(payload.candidateId || "").trim();
  if (!candidateId) {
    throw new Error("candidateId is required.");
  }
  const emailAddress = normalizeCandidateEmailAddress(payload.email || payload.emailAddress);
  if (!isValidEmailAddress(emailAddress)) {
    throw new Error("A valid email address is required.");
  }

  const candidate = await gemRequest(`/v0/candidates/${candidateId}`, {}, audit);
  const current = extractCandidateEmailsForUpdate(candidate);
  const lower = emailAddress.toLowerCase();
  const existing = current.find((entry) => entry.emailAddress.toLowerCase() === lower);
  const next = existing
    ? current.slice()
    : current.concat({
        emailAddress,
        isPrimary: false
      });

  if (next.length > 20) {
    throw new Error("Gem supports up to 20 email addresses per candidate.");
  }

  const updatedEntries = ensureSinglePrimaryEmail(next, lower);
  const updatedCandidate = await gemRequest(
    `/v0/candidates/${candidateId}`,
    {
      method: "PUT",
      body: {
        emails: toGemEmailPayload(updatedEntries)
      }
    },
    audit
  );
  const updatedEmails = extractCandidateEmailsForUpdate(updatedCandidate);
  return buildCandidateEmailResponse(candidateId, ensureSinglePrimaryEmail(updatedEmails, lower));
}

async function setCandidatePrimaryEmail(payload, audit) {
  const candidateId = String(payload.candidateId || "").trim();
  if (!candidateId) {
    throw new Error("candidateId is required.");
  }
  const emailAddress = normalizeCandidateEmailAddress(payload.email || payload.emailAddress);
  if (!isValidEmailAddress(emailAddress)) {
    throw new Error("A valid email address is required.");
  }

  const candidate = await gemRequest(`/v0/candidates/${candidateId}`, {}, audit);
  const current = extractCandidateEmailsForUpdate(candidate);
  if (current.length === 0) {
    throw new Error("Candidate has no stored emails.");
  }
  const lower = emailAddress.toLowerCase();
  const existing = current.find((entry) => entry.emailAddress.toLowerCase() === lower);
  if (!existing) {
    throw new Error("Email is not stored on this candidate.");
  }
  const alreadyPrimary = current.find((entry) => entry.isPrimary)?.emailAddress?.toLowerCase() === lower;
  if (alreadyPrimary) {
    return buildCandidateEmailResponse(candidateId, current);
  }

  const updatedEntries = ensureSinglePrimaryEmail(current, lower);
  const updatedCandidate = await gemRequest(
    `/v0/candidates/${candidateId}`,
    {
      method: "PUT",
      body: {
        emails: toGemEmailPayload(updatedEntries)
      }
    },
    audit
  );
  const updatedEmails = extractCandidateEmailsForUpdate(updatedCandidate);
  return buildCandidateEmailResponse(candidateId, ensureSinglePrimaryEmail(updatedEmails, lower));
}

async function getCandidate(payload, audit) {
  const candidateId = String(payload.candidateId || "").trim();
  if (!candidateId) {
    throw new Error("candidateId is required.");
  }
  const candidate = await gemRequest(`/v0/candidates/${candidateId}`, {}, audit);
  return { candidate };
}

async function getSequence(payload, audit) {
  const sequenceId = String(payload.sequenceId || "").trim();
  if (!sequenceId) {
    throw new Error("sequenceId is required.");
  }
  const sequence = await gemRequest(`/v0/sequences/${sequenceId}`, {}, audit);
  return { sequence };
}

function normalizeSequenceListItem(sequence) {
  return {
    id: String(sequence?.id || ""),
    name: String(sequence?.name || ""),
    userId: String(sequence?.user_id || sequence?.userId || ""),
    createdAt: String(sequence?.created_at || sequence?.createdAt || sequence?.created || "")
  };
}

function parseSequenceDate(value) {
  if (!value) {
    return 0;
  }
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function stripLikelySequenceVariantSuffix(name) {
  const raw = String(name || "").trim();
  if (!raw) {
    return "";
  }
  const stripped = raw.replace(
    /\s+\d{1,2}:\d{2}\s*(?:am|pm)\s+[A-Za-z]{3},\s+[A-Za-z]{3}\s+\d{1,2}(?:,\s*\d{4})?$/i,
    ""
  );
  return stripped.trim();
}

function choosePreferredSequenceRepresentative(group) {
  if (!Array.isArray(group) || group.length === 0) {
    return null;
  }
  const sortedNewestFirst = group
    .slice()
    .sort((left, right) => parseSequenceDate(right?.createdAt) - parseSequenceDate(left?.createdAt));
  const canonical = sortedNewestFirst.find((item) => {
    const base = stripLikelySequenceVariantSuffix(item?.name);
    return base && base.toLowerCase() === String(item?.name || "").trim().toLowerCase();
  });
  return canonical || sortedNewestFirst[0] || null;
}

function collapseLikelySequenceVariants(sequences) {
  const grouped = new Map();
  for (const item of Array.isArray(sequences) ? sequences : []) {
    const sequence = normalizeSequenceListItem(item);
    if (!sequence.id) {
      continue;
    }
    const base = stripLikelySequenceVariantSuffix(sequence.name) || sequence.name;
    const key = base.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(sequence);
  }

  const out = [];
  for (const items of grouped.values()) {
    const hasVariant = items.some((item) => {
      const base = stripLikelySequenceVariantSuffix(item?.name);
      return base && base.toLowerCase() !== String(item?.name || "").trim().toLowerCase();
    });
    if (!hasVariant) {
      out.push(...items);
      continue;
    }
    const representative = choosePreferredSequenceRepresentative(items);
    if (representative?.id) {
      out.push(representative);
    }
  }
  return out;
}

async function listSequences(payload, audit) {
  const requestedLimitRaw = Number(payload.limit);
  const requestedLimit =
    Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
      ? Math.max(1, Math.min(requestedLimitRaw, SEQUENCES_SCAN_MAX))
      : 0;
  const scanTarget = requestedLimit || SEQUENCES_SCAN_MAX;
  const query = String(payload.query || "").trim();
  const sequenceOwnerUserId = await resolveCreatedByUserId(payload.userId, payload.userEmail, audit);
  const pageSize = 100;
  const maxPages = Math.max(1, Math.ceil(scanTarget / pageSize));
  let aggregated = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const pageData = await gemRequest(
      "/v0/sequences",
      {
        query: {
          page_size: pageSize,
          page,
          user_id: sequenceOwnerUserId || undefined
        }
      },
      audit
    );
    const sequences = Array.isArray(pageData) ? pageData : [];
    aggregated = aggregated.concat(sequences);
    if (sequences.length < pageSize || aggregated.length >= scanTarget) {
      break;
    }
  }

  const seen = new Set();
  let normalized = aggregated
    .map((sequence) => normalizeSequenceListItem(sequence))
    .filter((sequence) => {
      if (!sequence.id || seen.has(sequence.id)) {
        return false;
      }
      seen.add(sequence.id);
      return true;
    });

  if (query) {
    const lower = query.toLowerCase();
    normalized = normalized.filter((sequence) => sequence.name.toLowerCase().includes(lower));
  }

  const rawCount = normalized.length;
  normalized = collapseLikelySequenceVariants(normalized);

  if (requestedLimit > 0) {
    normalized = normalized.slice(0, requestedLimit);
  }

  return {
    sequences: normalized,
    rawCount,
    variantCollapseApplied: true
  };
}

async function listUsers(payload, audit) {
  const pageSizeRaw = Number(payload.pageSize);
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
      ? Math.max(1, Math.min(Math.trunc(pageSizeRaw), 100))
      : 20;
  const query = omitUndefined({
    email: payload.email,
    page_size: pageSize
  });
  const users = await gemRequest("/v0/users", { query }, audit);
  return { users };
}

function getGemCandidateSearchAgeMs(cache = gemCandidateSearchCache) {
  if (!cache?.builtAtMs) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Date.now() - Number(cache.builtAtMs));
}

function isGemCandidateSearchFresh(cache = gemCandidateSearchCache) {
  return getGemCandidateSearchAgeMs(cache) <= GEM_CANDIDATE_SEARCH_TTL_MS;
}

function extractGemCandidateSchool(candidate) {
  const direct = firstNonEmpty(candidate?.school);
  if (direct) {
    return direct;
  }
  const education = Array.isArray(candidate?.education_info) ? candidate.education_info : [];
  for (const item of education) {
    const school = firstNonEmpty(item?.school, item?.parsed_school, item?.university, item?.parsed_university);
    if (school) {
      return school;
    }
  }
  return "";
}

function buildGemCandidateSearchSummary(candidate) {
  const id = String(candidate?.id || "").trim();
  if (!id) {
    return null;
  }
  const structuredName = `${String(candidate?.first_name || "").trim()} ${String(candidate?.last_name || "").trim()}`.trim();
  const fullName = firstNonEmpty(candidate?.name, structuredName);
  const alternateName = normalizeTextToken(structuredName) === normalizeTextToken(fullName) ? "" : structuredName;
  const primaryEmail = extractGemCandidateEmail(candidate);
  const company = firstNonEmpty(candidate?.company);
  const title = firstNonEmpty(candidate?.title);
  const school = extractGemCandidateSchool(candidate);
  const gemProfileUrl = firstNonEmpty(candidate?.weblink, candidate?.profile_url);
  const linkedInUrl = extractGemCandidateLinkedInUrl(candidate);
  const updatedAtRaw = firstNonEmpty(candidate?.last_updated_at, candidate?.updated_at, candidate?.created_at);
  const updatedAtMs = toEpochMs(updatedAtRaw);
  const updatedAt = updatedAtMs > 0 ? new Date(updatedAtMs).toISOString() : "";
  const normalizedFullName = normalizeTextToken(fullName);
  const normalizedEmail = normalizeTextToken(primaryEmail);
  const normalizedEmailLocal = normalizeTextToken(String(primaryEmail || "").split("@")[0] || "");
  const normalizedCompany = normalizeTextToken(company);
  const normalizedTitle = normalizeTextToken(title);
  const normalizedSchool = normalizeTextToken(school);
  const normalizedLinkedInUrl = normalizeTextToken(linkedInUrl);
  const normalizedAlternateName = normalizeTextToken(alternateName);
  const searchText = normalizeTextToken(
    [
      normalizedFullName,
      normalizedAlternateName,
      normalizedEmail,
      normalizedCompany,
      normalizedTitle,
      normalizedSchool,
      normalizedLinkedInUrl
    ].join(" ")
  );
  const nameTokens = tokenizeNameText(`${normalizedFullName} ${normalizedAlternateName}`);
  const emailTokens = tokenizeNameText(`${normalizedEmail} ${normalizedEmailLocal}`);
  const profileTokens = tokenizeNameText(`${normalizedCompany} ${normalizedTitle} ${normalizedSchool} ${normalizedLinkedInUrl}`);

  return {
    id,
    fullName,
    primaryEmail,
    company,
    title,
    school,
    gemProfileUrl,
    linkedInUrl,
    updatedAt,
    updatedAtMs,
    searchText,
    normalizedFullName,
    normalizedEmail,
    normalizedEmailLocal,
    normalizedCompany,
    normalizedTitle,
    normalizedSchool,
    normalizedLinkedInUrl,
    nameTokens,
    emailTokens,
    profileTokens
  };
}

async function refreshGemCandidateSearchIndex(audit) {
  const configuredScanLimit = Number.isFinite(Number(GEM_CANDIDATE_SEARCH_SCAN_MAX))
    ? Number(GEM_CANDIDATE_SEARCH_SCAN_MAX)
    : 0;
  const scanLimit = configuredScanLimit > 0 ? Math.min(configuredScanLimit, 50000) : 0;
  if (scanLimit <= 0) {
    return gemCandidateSearchCache;
  }
  const pageSize = 100;
  const maxPages = Math.max(1, Math.ceil(scanLimit / pageSize));
  const parallelRaw = Number(GEM_CANDIDATE_SEARCH_REFRESH_PARALLEL);
  const parallel = Number.isFinite(parallelRaw) ? Math.max(1, Math.min(Math.trunc(parallelRaw), 12)) : 6;
  const candidates = [];
  let nextPage = 1;
  let reachedLastPage = false;

  while (nextPage <= maxPages && !reachedLastPage && candidates.length < scanLimit) {
    const pages = [];
    for (let i = 0; i < parallel && nextPage <= maxPages; i += 1) {
      pages.push(nextPage);
      nextPage += 1;
    }
    if (pages.length === 0) {
      break;
    }

    const batch = await Promise.all(pages.map((page) => fetchGemCandidateSearchPage(page, pageSize, audit)));
    for (const result of batch) {
      if (result.error) {
        throw result.error;
      }
      const rows = Array.isArray(result.rows) ? result.rows : [];
      if (result.notFound || rows.length < pageSize) {
        reachedLastPage = true;
      }
      for (const row of rows) {
        candidates.push(row);
        if (candidates.length >= scanLimit) {
          break;
        }
      }
      if (candidates.length >= scanLimit) {
        break;
      }
    }
  }

  const seen = new Set();
  const normalized = [];
  for (const candidate of candidates) {
    const summary = buildGemCandidateSearchSummary(candidate);
    if (!summary || seen.has(summary.id)) {
      continue;
    }
    seen.add(summary.id);
    normalized.push(summary);
  }

  gemCandidateSearchCache = {
    builtAtMs: Date.now(),
    builtAt: new Date().toISOString(),
    scannedCount: Array.isArray(candidates) ? candidates.length : 0,
    isComplete: Array.isArray(candidates) ? candidates.length < scanLimit : false,
    candidates: normalized
  };

  logEvent({
    source: "backend",
    event: "gem.candidate_search_index.refreshed",
    message: "Refreshed Gem candidate search index.",
    requestId: audit.requestId,
    route: audit.route,
    runId: audit.runId,
    actionId: audit.actionId,
    details: {
      scanLimit,
      scannedCount: gemCandidateSearchCache.scannedCount,
      candidateCount: normalized.length,
      isComplete: gemCandidateSearchCache.isComplete
    }
  });

  return gemCandidateSearchCache;
}

function ensureGemCandidateSearchIndex(audit, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  if (!forceRefresh && isGemCandidateSearchFresh(gemCandidateSearchCache) && Array.isArray(gemCandidateSearchCache.candidates)) {
    return Promise.resolve(gemCandidateSearchCache);
  }
  if (gemCandidateSearchRefreshPromise) {
    return gemCandidateSearchRefreshPromise;
  }
  gemCandidateSearchRefreshPromise = refreshGemCandidateSearchIndex(audit).finally(() => {
    gemCandidateSearchRefreshPromise = null;
  });
  return gemCandidateSearchRefreshPromise;
}

function tokenMatchStrength(token, tokens, options = {}) {
  const normalizedToken = normalizeTextToken(token);
  if (!normalizedToken || !Array.isArray(tokens) || tokens.length === 0) {
    return 0;
  }
  const allowContains = Boolean(options.allowContains);
  let best = 0;
  for (const raw of tokens) {
    const current = normalizeTextToken(raw);
    if (!current) {
      continue;
    }
    if (current === normalizedToken) {
      return 3;
    }
    if (current.startsWith(normalizedToken)) {
      best = Math.max(best, 2);
      continue;
    }
    if (allowContains && current.includes(normalizedToken)) {
      best = Math.max(best, 1);
    }
  }
  return best;
}

function isLikelyPersonNameQuery(tokens) {
  const normalizedTokens = Array.isArray(tokens)
    ? tokens.map((token) => normalizeTextToken(token)).filter(Boolean)
    : [];
  if (normalizedTokens.length === 0 || normalizedTokens.length > 4) {
    return false;
  }
  return normalizedTokens.every((token) => /^[a-z][a-z'-]{1,}$/i.test(token));
}

function sortGemCandidateSearchRows(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  const leftUpdatedAt = Number(left.candidate?.updatedAtMs) || 0;
  const rightUpdatedAt = Number(right.candidate?.updatedAtMs) || 0;
  if (rightUpdatedAt !== leftUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }
  const leftName = String(left.candidate?.fullName || "");
  const rightName = String(right.candidate?.fullName || "");
  return leftName.localeCompare(rightName);
}

function mapGemCandidateSearchResponse(candidate) {
  return {
    id: String(candidate?.id || ""),
    fullName: String(candidate?.fullName || ""),
    primaryEmail: String(candidate?.primaryEmail || ""),
    company: String(candidate?.company || ""),
    title: String(candidate?.title || ""),
    school: String(candidate?.school || ""),
    gemProfileUrl: String(candidate?.gemProfileUrl || ""),
    linkedInUrl: String(candidate?.linkedInUrl || ""),
    updatedAt: String(candidate?.updatedAt || "")
  };
}

function evaluateGemCandidateSearchMatch(candidate, normalizedQuery, queryTokens) {
  if (!normalizedQuery) {
    return {
      score: 1,
      strongMatch: true
    };
  }

  const fullName = normalizeTextToken(candidate?.normalizedFullName || candidate?.fullName);
  const email = normalizeTextToken(candidate?.normalizedEmail || candidate?.primaryEmail);
  const emailLocal = normalizeTextToken(
    candidate?.normalizedEmailLocal || String(candidate?.primaryEmail || "").split("@")[0] || ""
  );
  const company = normalizeTextToken(candidate?.normalizedCompany || candidate?.company);
  const title = normalizeTextToken(candidate?.normalizedTitle || candidate?.title);
  const school = normalizeTextToken(candidate?.normalizedSchool || candidate?.school);
  const linkedInUrl = normalizeTextToken(candidate?.normalizedLinkedInUrl || candidate?.linkedInUrl);
  const nameTokens = Array.isArray(candidate?.nameTokens) ? candidate.nameTokens : tokenizeNameText(fullName);
  const emailTokens = Array.isArray(candidate?.emailTokens)
    ? candidate.emailTokens
    : tokenizeNameText(`${email} ${emailLocal}`);
  const profileTokens = Array.isArray(candidate?.profileTokens)
    ? candidate.profileTokens
    : tokenizeNameText(`${company} ${title} ${school} ${linkedInUrl}`);
  const isNameQuery = isLikelyPersonNameQuery(queryTokens);

  let score = 0;
  let strongMatch = false;
  let allTokensMatched = true;

  if (fullName === normalizedQuery) {
    score += 520;
    strongMatch = true;
  } else if (fullName.startsWith(normalizedQuery)) {
    score += 420;
    strongMatch = true;
  } else if (fullName.includes(` ${normalizedQuery}`)) {
    score += 280;
    strongMatch = true;
  }

  if (emailLocal === normalizedQuery || email === normalizedQuery) {
    score += 340;
    strongMatch = true;
  } else if (emailLocal.startsWith(normalizedQuery)) {
    score += 260;
    strongMatch = true;
  } else if (email.startsWith(normalizedQuery)) {
    score += 220;
    strongMatch = true;
  }

  for (const token of queryTokens) {
    const normalizedToken = normalizeTextToken(token);
    if (!normalizedToken) {
      continue;
    }
    let tokenMatched = false;
    let tokenMatchedByIdentity = false;

    const nameStrength = tokenMatchStrength(normalizedToken, nameTokens, {
      allowContains: normalizedToken.length >= 4
    });
    if (nameStrength === 3) {
      score += 210;
      strongMatch = true;
      tokenMatched = true;
      tokenMatchedByIdentity = true;
    } else if (nameStrength === 2) {
      score += 165;
      strongMatch = true;
      tokenMatched = true;
      tokenMatchedByIdentity = true;
    } else if (nameStrength === 1) {
      score += 80;
      tokenMatched = true;
      tokenMatchedByIdentity = true;
    }

    const emailStrength = tokenMatchStrength(normalizedToken, emailTokens, {
      allowContains: normalizedToken.length >= 4
    });
    if (emailStrength === 3) {
      score += 170;
      strongMatch = true;
      tokenMatched = true;
      tokenMatchedByIdentity = true;
    } else if (emailStrength === 2) {
      score += 130;
      strongMatch = true;
      tokenMatched = true;
      tokenMatchedByIdentity = true;
    } else if (emailStrength === 1) {
      score += 65;
      tokenMatched = true;
      tokenMatchedByIdentity = true;
    }

    const profileStrength = tokenMatchStrength(normalizedToken, profileTokens, {
      allowContains: normalizedToken.length >= 5
    });
    if (!isNameQuery) {
      if (profileStrength === 3) {
        score += 70;
        tokenMatched = true;
      } else if (profileStrength === 2) {
        score += 45;
        tokenMatched = true;
      } else if (profileStrength === 1) {
        score += 20;
        tokenMatched = true;
      }
    } else if (tokenMatchedByIdentity && profileStrength > 0) {
      // For person-name queries, profile text should influence ranking but not satisfy missing identity tokens.
      score += profileStrength === 3 ? 18 : profileStrength === 2 ? 10 : 4;
    }

    if (!tokenMatched) {
      allTokensMatched = false;
      break;
    }
  }

  if (!allTokensMatched) {
    return null;
  }

  if (isNameQuery && queryTokens.length >= 2) {
    const identityTokenMatches = queryTokens.filter((token) => {
      const normalizedToken = normalizeTextToken(token);
      if (!normalizedToken) {
        return false;
      }
      const nameStrength = tokenMatchStrength(normalizedToken, nameTokens, {
        allowContains: normalizedToken.length >= 4
      });
      if (nameStrength >= 2) {
        return true;
      }
      const emailStrength = tokenMatchStrength(normalizedToken, emailTokens, {
        allowContains: normalizedToken.length >= 4
      });
      return emailStrength >= 2;
    }).length;
    if (identityTokenMatches < queryTokens.length) {
      return null;
    }
  }

  if (isNameQuery && queryTokens.length === 1) {
    const token = normalizeTextToken(queryTokens[0]);
    if (token.length >= 3 && !strongMatch) {
      const likelyNameOrEmail =
        nameTokens.some((value) => normalizeTextToken(value).startsWith(token)) ||
        emailTokens.some((value) => normalizeTextToken(value).startsWith(token));
      if (!likelyNameOrEmail) {
        return null;
      }
      score = Math.max(1, score - 40);
    }
  }

  const updatedAtMs = Number(candidate?.updatedAtMs) || 0;
  if (updatedAtMs > 0) {
    const ageDays = (Date.now() - updatedAtMs) / (24 * 60 * 60 * 1000);
    if (ageDays <= 30) {
      score += 12;
    } else if (ageDays <= 180) {
      score += 6;
    }
  }

  if (score <= 0) {
    return null;
  }

  return {
    score,
    strongMatch
  };
}

function searchGemCandidateIndexRowsDetailed(rows, query, limit) {
  const normalizedQuery = normalizeTextToken(query);
  const queryTokens = normalizedQuery
    .split(/\s+/g)
    .map((token) => token.trim())
    .filter(Boolean);
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const strongMatches = [];
  const weakMatches = [];

  for (const candidate of normalizedRows) {
    if (!candidate || typeof candidate !== "object" || !candidate.id) {
      continue;
    }
    const evaluated = evaluateGemCandidateSearchMatch(candidate, normalizedQuery, queryTokens);
    if (!evaluated) {
      continue;
    }
    const entry = {
      score: Number(evaluated.score) || 0,
      candidate
    };
    if (evaluated.strongMatch) {
      strongMatches.push(entry);
    } else {
      weakMatches.push(entry);
    }
  }

  strongMatches.sort(sortGemCandidateSearchRows);
  weakMatches.sort(sortGemCandidateSearchRows);
  const merged = strongMatches.concat(weakMatches);
  const sliced = merged.slice(0, limit);

  return {
    candidates: sliced.map((entry) => mapGemCandidateSearchResponse(entry.candidate)),
    strongCount: strongMatches.length
  };
}

function searchGemCandidateIndexRows(rows, query, limit) {
  return searchGemCandidateIndexRowsDetailed(rows, query, limit).candidates;
}

function shouldSkipGemCandidateQueryProbe(query, maxPages) {
  const normalizedQuery = normalizeTextToken(query);
  if (!normalizedQuery) {
    return false;
  }
  const entry = gemCandidateSearchProbeHistory.get(normalizedQuery);
  if (!entry) {
    return false;
  }
  const ageMs = Date.now() - Number(entry.atMs || 0);
  if (ageMs > GEM_CANDIDATE_SEARCH_QUERY_PROBE_TTL_MS) {
    return false;
  }
  return Number(entry.maxPages || 0) >= Number(maxPages || 0);
}

function markGemCandidateQueryProbe(query, maxPages) {
  const normalizedQuery = normalizeTextToken(query);
  if (!normalizedQuery) {
    return;
  }
  gemCandidateSearchProbeHistory.set(normalizedQuery, {
    atMs: Date.now(),
    maxPages: Number(maxPages) || 0
  });
  const maxEntriesRaw = Number(GEM_CANDIDATE_SEARCH_QUERY_PROBE_CACHE_MAX);
  const maxEntries = Number.isFinite(maxEntriesRaw) ? Math.max(20, Math.min(Math.trunc(maxEntriesRaw), 1000)) : 150;
  if (gemCandidateSearchProbeHistory.size <= maxEntries) {
    return;
  }
  const removable = gemCandidateSearchProbeHistory.size - maxEntries;
  let removed = 0;
  for (const key of gemCandidateSearchProbeHistory.keys()) {
    gemCandidateSearchProbeHistory.delete(key);
    removed += 1;
    if (removed >= removable) {
      break;
    }
  }
}

function startGemCandidateSearchRefreshInBackground(audit) {
  ensureGemCandidateSearchIndex(audit, { forceRefresh: true }).catch((error) => {
    logEvent({
      level: "warn",
      source: "backend",
      event: "gem.candidate_search_index.refresh_failed",
      message: error?.message || "Gem candidate search index refresh failed.",
      requestId: audit.requestId,
      route: audit.route,
      runId: audit.runId,
      actionId: audit.actionId
    });
  });
}

async function fetchGemCandidateSearchPage(page, pageSize, audit) {
  try {
    const response = await gemRequest(
      "/v0/candidates",
      {
        query: {
          sort: "desc",
          page,
          page_size: pageSize
        }
      },
      audit
    );
    return {
      page,
      rows: Array.isArray(response) ? response : [],
      notFound: false
    };
  } catch (error) {
    if (Number(error?.status) === 404 && page > 1) {
      return {
        page,
        rows: [],
        notFound: true
      };
    }
    return {
      page,
      rows: [],
      notFound: false,
      error
    };
  }
}

async function probeGemCandidateSearch(query, limit, audit, options = {}) {
  const normalizedQuery = normalizeTextToken(query);
  const queryTokens = normalizedQuery
    .split(/\s+/g)
    .map((token) => token.trim())
    .filter(Boolean);
  const isNameQuery = isLikelyPersonNameQuery(queryTokens);
  const requestedMaxPagesRaw = Number(options.maxPages);
  const defaultMaxPages = normalizedQuery
    ? isNameQuery
      ? GEM_CANDIDATE_SEARCH_NAME_QUERY_MAX_PAGES
      : GEM_CANDIDATE_SEARCH_PROBE_MAX_PAGES
    : GEM_CANDIDATE_SEARCH_PROBE_EMPTY_QUERY_MAX_PAGES;
  const maxPagesSource = Number.isFinite(requestedMaxPagesRaw) && requestedMaxPagesRaw > 0 ? requestedMaxPagesRaw : defaultMaxPages;
  const maxPages = Number.isFinite(Number(maxPagesSource)) ? Math.max(1, Math.min(Math.trunc(Number(maxPagesSource)), 500)) : 1;
  const parallelPagesRaw = Number(GEM_CANDIDATE_SEARCH_PROBE_PARALLEL);
  const parallelPages = Number.isFinite(parallelPagesRaw)
    ? Math.max(1, Math.min(Math.trunc(parallelPagesRaw), 8))
    : 2;
  const minStrongRaw = Number(options.minStrongMatches || GEM_CANDIDATE_SEARCH_PROBE_MIN_STRONG_MATCHES);
  const minStrongMatches = Number.isFinite(minStrongRaw)
    ? Math.max(1, Math.min(Math.trunc(minStrongRaw), limit))
    : Math.max(1, Math.min(limit, 8));
  const pageSize = 100;
  const summaries = [];
  const seenCandidateIds = new Set();
  let nextPage = 1;
  let reachedLastPage = false;

  while (nextPage <= maxPages && !reachedLastPage) {
    const pages = [];
    for (let i = 0; i < parallelPages && nextPage <= maxPages; i += 1) {
      pages.push(nextPage);
      nextPage += 1;
    }
    if (pages.length === 0) {
      break;
    }

    const batch = await Promise.all(pages.map((page) => fetchGemCandidateSearchPage(page, pageSize, audit)));
    for (const result of batch) {
      if (result.error) {
        throw result.error;
      }
      const rows = Array.isArray(result.rows) ? result.rows : [];
      if (result.notFound || rows.length < pageSize) {
        reachedLastPage = true;
      }
      for (const row of rows) {
        const summary = buildGemCandidateSearchSummary(row);
        if (!summary || seenCandidateIds.has(summary.id)) {
          continue;
        }
        seenCandidateIds.add(summary.id);
        summaries.push(summary);
      }
    }
    const currentMatches = searchGemCandidateIndexRowsDetailed(summaries, normalizedQuery, limit);
    if (!normalizedQuery) {
      if (currentMatches.candidates.length >= limit) {
        break;
      }
      continue;
    }
    if (currentMatches.strongCount >= minStrongMatches || currentMatches.candidates.length >= limit) {
      break;
    }
  }

  const finalMatches = searchGemCandidateIndexRowsDetailed(summaries, normalizedQuery, limit);
  if (summaries.length > 0) {
    gemCandidateSearchCache = {
      builtAtMs: Date.now(),
      builtAt: new Date().toISOString(),
      scannedCount: summaries.length,
      isComplete: false,
      candidates: summaries
    };
  }
  logEvent({
    source: "backend",
    event: "gem.candidate_search.probe_completed",
    message: "Served Gem candidate search from recent candidate probe.",
    requestId: audit.requestId,
    route: audit.route,
    runId: audit.runId,
    actionId: audit.actionId,
    details: {
      query: normalizedQuery,
      scannedCandidates: summaries.length,
      returnedCandidates: finalMatches.candidates.length,
      strongCount: finalMatches.strongCount,
      maxPages,
      parallelPages,
      nameQuery: isNameQuery
    }
  });
  return finalMatches.candidates;
}

async function searchCandidates(payload, audit) {
  const query = String(payload?.query || "").trim();
  const requestedLimitRaw = Number(payload?.limit);
  const limit =
    Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
      ? Math.max(1, Math.min(Math.trunc(requestedLimitRaw), 200))
      : 25;
  const forceRefresh = Boolean(payload?.forceRefresh);
  const normalizedQuery = normalizeTextToken(query);
  const queryTokens = normalizedQuery
    .split(/\s+/g)
    .map((token) => token.trim())
    .filter(Boolean);
  const isNameQuery = isLikelyPersonNameQuery(queryTokens);
  const nameQueryMaxPages = isNameQuery
    ? queryTokens.length >= 2
      ? GEM_CANDIDATE_SEARCH_NAME_QUERY_MAX_PAGES
      : Math.max(8, Math.ceil(GEM_CANDIDATE_SEARCH_NAME_QUERY_MAX_PAGES / 2))
    : GEM_CANDIDATE_SEARCH_PROBE_MAX_PAGES;
  const nameQueryMinStrongMatches = isNameQuery
    ? Math.max(3, Math.min(limit, Math.ceil(limit * 0.6)))
    : Math.max(1, Math.min(limit, GEM_CANDIDATE_SEARCH_PROBE_MIN_STRONG_MATCHES));
  const nameQueryProbeOptions = isNameQuery
    ? {
        maxPages: nameQueryMaxPages,
        minStrongMatches: nameQueryMinStrongMatches
      }
    : {};

  if (forceRefresh) {
    const refreshed = await ensureGemCandidateSearchIndex(audit, { forceRefresh: true });
    return {
      candidates: searchGemCandidateIndexRows(refreshed?.candidates, query, limit)
    };
  }

  const cache = gemCandidateSearchCache;
  const cachedRows = Array.isArray(cache?.candidates) ? cache.candidates : [];
  const hasCachedRows = cachedRows.length > 0;
  if (hasCachedRows && isGemCandidateSearchFresh(cache)) {
    const cachedMatches = searchGemCandidateIndexRowsDetailed(cachedRows, query, limit);
    if (!cache?.isComplete) {
      startGemCandidateSearchRefreshInBackground(audit);
    }
    const scannedCount = Number(cache?.scannedCount || 0);
    const probeCoverageCap = nameQueryMaxPages * 100;
    const alreadyProbedRecently = shouldSkipGemCandidateQueryProbe(query, nameQueryMaxPages);
    const shouldProbeForAccuracy =
      normalizedQuery &&
      scannedCount < probeCoverageCap &&
      !alreadyProbedRecently &&
      (cachedMatches.strongCount === 0 || (isNameQuery && cachedMatches.candidates.length < Math.max(4, Math.min(limit, 8))));
    if (shouldProbeForAccuracy) {
      try {
        const probeMatches = await probeGemCandidateSearch(query, limit, audit, nameQueryProbeOptions);
        markGemCandidateQueryProbe(query, nameQueryMaxPages);
        if (probeMatches.length > 0) {
          return {
            candidates: probeMatches
          };
        }
      } catch (_error) {
        markGemCandidateQueryProbe(query, nameQueryMaxPages);
        // Fall back to current cache when probe fails.
      }
    }
    return {
      candidates: cachedMatches.candidates
    };
  }

  if (hasCachedRows) {
    const cachedMatches = searchGemCandidateIndexRowsDetailed(cachedRows, query, limit);
    startGemCandidateSearchRefreshInBackground(audit);
    const scannedCount = Number(cache?.scannedCount || 0);
    const probeCoverageCap = nameQueryMaxPages * 100;
    const alreadyProbedRecently = shouldSkipGemCandidateQueryProbe(query, nameQueryMaxPages);

    const shouldProbeForAccuracy =
      normalizedQuery &&
      scannedCount < probeCoverageCap &&
      !alreadyProbedRecently &&
      (cachedMatches.strongCount === 0 || (isNameQuery && cachedMatches.candidates.length < Math.max(4, Math.min(limit, 8))));
    if (shouldProbeForAccuracy) {
      try {
        const probeMatches = await probeGemCandidateSearch(query, limit, audit, nameQueryProbeOptions);
        markGemCandidateQueryProbe(query, nameQueryMaxPages);
        if (probeMatches.length > 0) {
          return {
            candidates: probeMatches
          };
        }
      } catch (_error) {
        markGemCandidateQueryProbe(query, nameQueryMaxPages);
        // Fall back to stale cache if probe fails.
      }
    }

    return {
      candidates: cachedMatches.candidates
    };
  }

  const candidates = await probeGemCandidateSearch(query, limit, audit, nameQueryProbeOptions);
  markGemCandidateQueryProbe(query, nameQueryMaxPages);
  startGemCandidateSearchRefreshInBackground(audit);

  return {
    candidates
  };
}

function toEpochMs(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function listPaged(pathname, audit, options = {}) {
  const pageSizeRaw = Number(options.pageSize);
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(pageSizeRaw, 100) : 100;
  const maxPagesRaw = Number(options.maxPages);
  const maxPages = Number.isFinite(maxPagesRaw) && maxPagesRaw > 0 ? maxPagesRaw : 10;
  const limitRaw = Number(options.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 0;
  const baseQuery = options.query && typeof options.query === "object" ? options.query : {};
  const rows = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const pageData = await gemRequest(
      pathname,
      {
        query: {
          ...baseQuery,
          page,
          page_size: pageSize
        }
      },
      audit
    );
    const entries = Array.isArray(pageData) ? pageData : [];
    rows.push(...entries);
    if (entries.length < pageSize) {
      break;
    }
    if (limit > 0 && rows.length >= limit) {
      break;
    }
  }

  return limit > 0 ? rows.slice(0, limit) : rows;
}

async function ingestClientLog(payload, audit) {
  const entry = logEvent({
    source: payload.source || "extension",
    level: payload.level || "info",
    event: payload.event || "client.event",
    message: payload.message || "",
    link: payload.link || "",
    requestId: payload.requestId || audit.requestId,
    route: payload.route || audit.route,
    runId: payload.runId || "",
    actionId: payload.actionId || "",
    durationMs: Number(payload.durationMs) || 0,
    details: payload.details || {}
  });
  return { logged: true, id: entry.id };
}

async function recentLogs(payload) {
  const limit = Math.max(1, Math.min(Number(payload.limit) || 200, 1000));
  return { logs: readRecentLogs(limit) };
}

function normalizeTextToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeProfileUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch (_error) {
    return raw.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  }
}

function normalizeLinkedInUrl(value) {
  const normalized = normalizeProfileUrl(value);
  if (!normalized) {
    return "";
  }
  return normalized
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/^linkedin\.com\/in\//, "linkedin.com/in/")
    .replace(/^linkedin\.com\/pub\//, "linkedin.com/pub/");
}

function buildLinkedInUrlFromHandle(handle) {
  const clean = String(handle || "")
    .trim()
    .replace(/^@/, "");
  if (!clean) {
    return "";
  }
  return `https://www.linkedin.com/in/${encodeURIComponent(clean)}`;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function tokenizeNameText(value) {
  return normalizeTextToken(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function extractGemCandidateEmail(candidate) {
  const direct = firstNonEmpty(candidate?.email, candidate?.primary_email, candidate?.email_address);
  if (direct) {
    return direct;
  }
  const emails = Array.isArray(candidate?.emails) ? candidate.emails : [];
  const readEmail = (item) => {
    if (!item) {
      return "";
    }
    if (typeof item === "string") {
      return item.trim();
    }
    if (typeof item !== "object") {
      return "";
    }
    return firstNonEmpty(
      item.email_address,
      item.emailAddress,
      item.email,
      item.value,
      item.address,
      item?.email?.address,
      item?.contact?.email_address,
      item?.contact?.email
    );
  };

  const primary = emails.find((item) => item && typeof item === "object" && item.is_primary === true);
  const primaryValue = readEmail(primary);
  if (primaryValue) {
    return primaryValue;
  }

  for (const item of emails) {
    const value = readEmail(item);
    if (value) {
      return value;
    }
  }

  const emailAddresses = Array.isArray(candidate?.email_addresses) ? candidate.email_addresses : [];
  for (const item of emailAddresses) {
    const value = readEmail(item);
    if (value) {
      return value;
    }
  }

  return "";
}

function extractGemCandidatePhone(candidate) {
  const direct = firstNonEmpty(candidate?.phone, candidate?.phone_number, candidate?.primary_phone);
  if (direct) {
    return direct;
  }
  const phones = Array.isArray(candidate?.phones) ? candidate.phones : [];
  for (const item of phones) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
    if (item && typeof item === "object") {
      const fromObject = firstNonEmpty(item.number, item.value, item.phone, item.phoneNumber);
      if (fromObject) {
        return fromObject;
      }
    }
  }
  return "";
}

function extractGemCandidateLinkedInUrl(candidate) {
  const profileUrls = Array.isArray(candidate?.profile_urls) ? candidate.profile_urls : [];
  let recruiterUrlFallback = "";
  for (const url of profileUrls) {
    const normalized = normalizeLinkedInUrl(url);
    if (normalized.includes("linkedin.com/in/") || normalized.includes("linkedin.com/pub/")) {
      return String(url || "").trim();
    }
    if (!recruiterUrlFallback && normalized.includes("linkedin.com/")) {
      recruiterUrlFallback = String(url || "").trim();
    }
  }

  const profiles = Array.isArray(candidate?.profiles) ? candidate.profiles : [];
  for (const profile of profiles) {
    if (!profile || typeof profile !== "object") {
      continue;
    }
    const profileUrl = firstNonEmpty(profile.url, profile.link, profile.href, profile.value);
    const normalized = normalizeLinkedInUrl(profileUrl);
    if (normalized.includes("linkedin.com/in/") || normalized.includes("linkedin.com/pub/")) {
      return String(profileUrl || "").trim();
    }
    if (!recruiterUrlFallback && normalized.includes("linkedin.com/")) {
      recruiterUrlFallback = String(profileUrl || "").trim();
    }
    const network = normalizeTextToken(profile.network || profile.type || profile.site || "");
    if (!recruiterUrlFallback && network === "linkedin") {
      const usernameUrl = buildLinkedInUrlFromHandle(firstNonEmpty(profile.username, profile.handle));
      if (usernameUrl) {
        recruiterUrlFallback = usernameUrl;
      }
    }
  }
  const handleUrl = buildLinkedInUrlFromHandle(candidate?.linked_in_handle || candidate?.linkedInHandle || "");
  if (handleUrl) {
    return handleUrl;
  }
  return recruiterUrlFallback;
}

function buildAshbyProfileUrl(rawUrl, candidateId = "") {
  const clean = String(rawUrl || "").trim();
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }
  if (clean.startsWith("/")) {
    return `https://app.ashbyhq.com${clean}`;
  }
  if (clean) {
    return `https://app.ashbyhq.com/${clean}`;
  }
  if (candidateId) {
    return `https://app.ashbyhq.com/candidates/${encodeURIComponent(candidateId)}`;
  }
  return "";
}

function summarizeGemCandidateForAshby(candidate, fallbackName = "") {
  const name = firstNonEmpty(
    `${String(candidate?.first_name || "").trim()} ${String(candidate?.last_name || "").trim()}`.trim(),
    candidate?.name,
    fallbackName
  );
  return {
    gemCandidateId: String(candidate?.id || ""),
    name,
    email: extractGemCandidateEmail(candidate),
    phoneNumber: extractGemCandidatePhone(candidate),
    linkedInUrl: extractGemCandidateLinkedInUrl(candidate),
    gemProfileUrl: firstNonEmpty(candidate?.weblink, candidate?.profile_url)
  };
}

function getAshbyCandidateLinkedInUrls(candidate) {
  const values = [];
  const direct = firstNonEmpty(candidate?.linkedInUrl, candidate?.linkedinUrl);
  if (direct) {
    values.push(direct);
  }
  const links = Array.isArray(candidate?.socialLinks) ? candidate.socialLinks : [];
  for (const link of links) {
    if (!link || typeof link !== "object") {
      continue;
    }
    const type = normalizeTextToken(link.type);
    const url = String(link.url || "").trim();
    if (!url) {
      continue;
    }
    if (type === "linkedin" || normalizeLinkedInUrl(url).includes("linkedin.com/")) {
      values.push(url);
    }
  }
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function getAshbyCandidateLinkedInUrl(candidate) {
  const urls = getAshbyCandidateLinkedInUrls(candidate);
  for (const url of urls) {
    if (normalizeLinkedInUrl(url).includes("linkedin.com/")) {
      return url;
    }
  }
  return "";
}

function getAshbyCandidateEmails(candidate) {
  const emails = [];
  const primary = firstNonEmpty(candidate?.primaryEmailAddress?.value);
  if (primary) {
    emails.push(primary);
  }
  const all = Array.isArray(candidate?.emailAddresses) ? candidate.emailAddresses : [];
  for (const item of all) {
    const value = firstNonEmpty(item?.value);
    if (value) {
      emails.push(value);
    }
  }
  return Array.from(new Set(emails.map((email) => email.toLowerCase())));
}

function parseTimestampMs(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return 0;
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarizeAshbyCandidateForIndex(candidate) {
  const id = String(candidate?.id || "").trim();
  if (!id) {
    return null;
  }
  const profileUrl = buildAshbyProfileUrl(candidate?.profileUrl, id);
  const linkedInUrls = getAshbyCandidateLinkedInUrls(candidate);
  const linkedInKeys = Array.from(
    new Set(
      linkedInUrls
        .map((url) => normalizeLinkedInUrl(url))
        .filter((url) => url.includes("linkedin.com/"))
    )
  );
  return {
    id,
    name: firstNonEmpty(candidate?.name, ""),
    profileUrl,
    linkedInUrls,
    linkedInKeys,
    updatedAt: firstNonEmpty(candidate?.updatedAt, candidate?.createdAt),
    updatedAtMs: parseTimestampMs(firstNonEmpty(candidate?.updatedAt, candidate?.createdAt)),
    createdAt: firstNonEmpty(candidate?.createdAt),
    email: firstNonEmpty(candidate?.primaryEmailAddress?.value)
  };
}

function sortCandidateIdsForLookup(candidatesById, ids) {
  return Array.from(new Set(Array.isArray(ids) ? ids : []))
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .sort((a, b) => {
      const left = candidatesById[a];
      const right = candidatesById[b];
      const leftMs = Number(left?.updatedAtMs) || 0;
      const rightMs = Number(right?.updatedAtMs) || 0;
      if (rightMs !== leftMs) {
        return rightMs - leftMs;
      }
      const leftName = String(left?.name || "");
      const rightName = String(right?.name || "");
      return leftName.localeCompare(rightName);
    });
}

function rebuildAshbyLinkedInLookup(candidatesById) {
  const lookup = {};
  for (const candidate of Object.values(candidatesById || {})) {
    const id = String(candidate?.id || "").trim();
    if (!id) {
      continue;
    }
    const keys = Array.isArray(candidate?.linkedInKeys) ? candidate.linkedInKeys : [];
    for (const key of keys) {
      const normalized = normalizeLinkedInUrl(key);
      if (!normalized || !normalized.includes("linkedin.com/")) {
        continue;
      }
      if (!lookup[normalized]) {
        lookup[normalized] = [];
      }
      lookup[normalized].push(id);
    }
  }
  for (const [key, ids] of Object.entries(lookup)) {
    lookup[key] = sortCandidateIdsForLookup(candidatesById, ids);
  }
  return lookup;
}

function ashbyCandidateIndexSize(cache) {
  return Object.keys(cache?.candidatesById || {}).length;
}

function getAshbyCandidateIndexAgeMs(cache = ashbyCandidateIndexCache) {
  if (!cache?.builtAtMs) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Date.now() - cache.builtAtMs);
}

function isAshbyCandidateIndexFresh(cache = ashbyCandidateIndexCache) {
  return getAshbyCandidateIndexAgeMs(cache) <= ASHBY_CANDIDATE_INDEX_TTL_MS;
}

function isLikelySyncTokenError(error) {
  const message = String(error?.message || "");
  const details = typeof error?.data === "string" ? error.data : JSON.stringify(error?.data || {});
  return /sync\s*token/i.test(`${message} ${details}`);
}

function getAshbyCandidateIndexMetadata(cache = ashbyCandidateIndexCache) {
  return {
    builtAt: cache?.builtAt || "",
    ageMs: Number.isFinite(getAshbyCandidateIndexAgeMs(cache))
      ? getAshbyCandidateIndexAgeMs(cache)
      : Number.MAX_SAFE_INTEGER,
    fresh: isAshbyCandidateIndexFresh(cache),
    isComplete: Boolean(cache?.isComplete),
    scannedCount: Number(cache?.scannedCount) || 0,
    candidateCount: ashbyCandidateIndexSize(cache),
    refreshInFlight: Boolean(ashbyCandidateIndexRefreshPromise)
  };
}

async function refreshAshbyCandidateIndexFromApi(audit, options = {}) {
  const forceFull = Boolean(options.forceFull);
  const hasExisting = ashbyCandidateIndexSize(ashbyCandidateIndexCache) > 0;
  const canUseSyncToken = hasExisting && !forceFull && String(ashbyCandidateIndexCache.syncToken || "").trim();
  const syncToken = canUseSyncToken ? String(ashbyCandidateIndexCache.syncToken || "").trim() : "";

  const candidatesById = canUseSyncToken
    ? { ...(ashbyCandidateIndexCache.candidatesById || {}) }
    : {};

  let cursor = "";
  let moreData = true;
  let iterations = 0;
  let scannedCount = 0;
  let newestSyncToken = syncToken;

  while (moreData && scannedCount < ASHBY_CANDIDATES_SCAN_MAX && iterations < 2000) {
    const remaining = ASHBY_CANDIDATES_SCAN_MAX - scannedCount;
    const payload = { limit: Math.max(1, Math.min(100, remaining)) };
    if (cursor) {
      payload.cursor = cursor;
    }
    if (syncToken) {
      payload.syncToken = syncToken;
    }

    const response = await ashbyRequest("candidate.list", payload, audit);
    const rows = Array.isArray(response?.results) ? response.results : [];
    for (const row of rows) {
      const summary = summarizeAshbyCandidateForIndex(row);
      if (!summary) {
        continue;
      }
      candidatesById[summary.id] = summary;
    }

    scannedCount += rows.length;
    moreData = Boolean(response?.moreDataAvailable);
    cursor = String(response?.nextCursor || "");
    if (response?.syncToken) {
      newestSyncToken = String(response.syncToken);
    }
    iterations += 1;
    if (!cursor && moreData) {
      break;
    }
  }

  const isComplete = !moreData && scannedCount < ASHBY_CANDIDATES_SCAN_MAX;
  const builtAtMs = Date.now();
  ashbyCandidateIndexCache = {
    builtAtMs,
    builtAt: new Date(builtAtMs).toISOString(),
    scannedCount,
    isComplete,
    syncToken: newestSyncToken || "",
    candidatesById,
    linkedInToCandidateIds: rebuildAshbyLinkedInLookup(candidatesById)
  };

  logEvent({
    source: "backend",
    event: "ashby.candidate_index.refreshed",
    message: canUseSyncToken
      ? "Refreshed Ashby LinkedIn index incrementally."
      : "Refreshed Ashby LinkedIn index from full scan.",
    requestId: audit.requestId,
    route: audit.route,
    runId: audit.runId,
    actionId: audit.actionId,
    details: {
      candidateCount: ashbyCandidateIndexSize(ashbyCandidateIndexCache),
      scannedCount,
      isComplete,
      usedSyncToken: Boolean(syncToken),
      hasSyncToken: Boolean(ashbyCandidateIndexCache.syncToken)
    }
  });

  return ashbyCandidateIndexCache;
}

function ensureAshbyCandidateIndexRefresh(audit, options = {}) {
  const forceFull = Boolean(options.forceFull);
  if (!ashbyCandidateIndexRefreshPromise) {
    ashbyCandidateIndexRefreshPromise = (async () => {
      try {
        try {
          return await refreshAshbyCandidateIndexFromApi(audit, { forceFull });
        } catch (error) {
          if (!forceFull && isLikelySyncTokenError(error)) {
            return await refreshAshbyCandidateIndexFromApi(audit, { forceFull: true });
          }
          throw error;
        }
      } finally {
        ashbyCandidateIndexRefreshPromise = null;
      }
    })();
  }
  return ashbyCandidateIndexRefreshPromise;
}

function scheduleAshbyCandidateIndexRefresh(audit, options = {}) {
  ensureAshbyCandidateIndexRefresh(audit, options).catch((error) => {
    logEvent({
      level: "warn",
      source: "backend",
      event: "ashby.candidate_index.refresh_failed",
      message: error?.message || "Ashby candidate index refresh failed.",
      requestId: audit.requestId,
      route: audit.route,
      runId: audit.runId,
      actionId: audit.actionId
    });
  });
}

async function ensureAshbyCandidateIndex(audit, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const preferStale = options.preferStale !== false;
  const cache = ashbyCandidateIndexCache;
  const hasData = ashbyCandidateIndexSize(cache) > 0;
  const fresh = isAshbyCandidateIndexFresh(cache);

  if (forceRefresh) {
    return ensureAshbyCandidateIndexRefresh(audit, { forceFull: false });
  }
  if (fresh) {
    return cache;
  }
  if (hasData && preferStale) {
    scheduleAshbyCandidateIndexRefresh(audit, { forceFull: false });
    return cache;
  }
  return ensureAshbyCandidateIndexRefresh(audit, { forceFull: false });
}

function findCandidatesByLinkedInKeys(index, linkedInKeys) {
  const cache = index && typeof index === "object" ? index : ashbyCandidateIndexCache;
  const keys = Array.from(new Set((Array.isArray(linkedInKeys) ? linkedInKeys : []).map((item) => normalizeLinkedInUrl(item)).filter(Boolean)));
  if (keys.length === 0) {
    return [];
  }

  const ids = [];
  for (const key of keys) {
    const rowIds = Array.isArray(cache?.linkedInToCandidateIds?.[key]) ? cache.linkedInToCandidateIds[key] : [];
    ids.push(...rowIds);
  }

  const orderedIds = sortCandidateIdsForLookup(cache.candidatesById || {}, ids);
  return orderedIds
    .map((id) => cache?.candidatesById?.[id] || null)
    .filter((candidate) => candidate && candidate.profileUrl);
}

function buildLinkedInLookupKeys(payload) {
  const explicitUrl = firstNonEmpty(payload?.linkedInUrl, payload?.linkedinUrl, payload?.profileUrl);
  const handle = sanitizeLinkedInHandle(payload?.linkedInHandle || payload?.linkedinHandle);
  const keys = [];
  const normalizedUrl = normalizeLinkedInUrl(explicitUrl);
  if (normalizedUrl) {
    keys.push(normalizedUrl);
  }
  if (handle) {
    const fromHandle = normalizeLinkedInUrl(buildLinkedInUrlFromHandle(handle));
    if (fromHandle) {
      keys.push(fromHandle);
    }
  }
  return {
    handle,
    keys: Array.from(new Set(keys))
  };
}

function findCandidateRowsByLinkedInKeys(candidates, linkedInKeys) {
  const keys = Array.from(new Set((Array.isArray(linkedInKeys) ? linkedInKeys : []).map((item) => normalizeLinkedInUrl(item)).filter(Boolean)));
  if (keys.length === 0) {
    return [];
  }

  const keySet = new Set(keys);
  const rows = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const row = summarizeAshbyCandidateForIndex(candidate);
    if (!row?.profileUrl) {
      continue;
    }
    if (Array.isArray(row.linkedInKeys) && row.linkedInKeys.some((key) => keySet.has(key))) {
      rows.push(row);
    }
  }

  return rows.sort((left, right) => {
    const leftMs = Number(left?.updatedAtMs) || 0;
    const rightMs = Number(right?.updatedAtMs) || 0;
    if (rightMs !== leftMs) {
      return rightMs - leftMs;
    }
    return String(left?.name || "").localeCompare(String(right?.name || ""));
  });
}

async function findAshbyCandidatesByNameAndLinkedIn(profileName, linkedInKeys, audit) {
  const name = String(profileName || "").trim();
  if (!name) {
    return [];
  }
  const response = await ashbyRequest("candidate.search", { name }, audit);
  return findCandidateRowsByLinkedInKeys(response?.results, linkedInKeys);
}

async function findAshbyCandidateByLinkedIn(payload, audit) {
  const forceRefresh = Boolean(payload?.forceRefresh);
  const { handle, keys } = buildLinkedInLookupKeys(payload || {});
  const profileName = firstNonEmpty(payload?.profileName, payload?.name, payload?.fullName);
  const canUseNameFallback = Boolean(profileName);
  if (keys.length === 0) {
    throw new Error("linkedInUrl or linkedInHandle is required.");
  }

  let index = ashbyCandidateIndexCache;
  const hasCachedIndex = ashbyCandidateIndexSize(index) > 0;
  if (forceRefresh || hasCachedIndex || !canUseNameFallback) {
    index = await ensureAshbyCandidateIndex(audit, {
      forceRefresh,
      preferStale: true
    });
  } else {
    scheduleAshbyCandidateIndexRefresh(audit, { forceFull: false });
  }

  let matches = findCandidatesByLinkedInKeys(index, keys);
  let lookupStrategy = "index";

  if (matches.length === 0 && canUseNameFallback) {
    try {
      const byNameMatches = await findAshbyCandidatesByNameAndLinkedIn(profileName, keys, audit);
      if (byNameMatches.length > 0) {
        matches = byNameMatches;
        lookupStrategy = "name_search";
      }
    } catch (error) {
      logEvent({
        level: "warn",
        source: "backend",
        event: "ashby.candidate_lookup.name_fallback_failed",
        message: error?.message || "Ashby name fallback lookup failed.",
        requestId: audit.requestId,
        route: audit.route,
        runId: audit.runId,
        actionId: audit.actionId,
        details: {
          profileName: String(profileName || "")
        }
      });
    }
  }

  const shouldRefreshIndex =
    matches.length === 0 &&
    (forceRefresh || (ashbyCandidateIndexSize(index) > 0 && (!isAshbyCandidateIndexFresh(index) || !index.isComplete)));
  if (shouldRefreshIndex) {
    index = await ensureAshbyCandidateIndexRefresh(audit, { forceFull: forceRefresh });
    matches = findCandidatesByLinkedInKeys(index, keys);
    if (matches.length > 0) {
      lookupStrategy = "index_refresh";
    }
  }

  if (matches.length === 0) {
    return {
      found: false,
      message: "No Ashby candidate matched this LinkedIn profile.",
      link: "",
      candidate: null,
      index: getAshbyCandidateIndexMetadata(index),
      query: {
        linkedInHandle: handle,
        linkedInKeys: keys,
        profileName: String(profileName || ""),
        strategy: lookupStrategy
      }
    };
  }

  const candidate = matches[0];
  return {
    found: true,
    message: `Opened Ashby profile for ${candidate.name || "candidate"}.`,
    link: candidate.profileUrl,
    candidate: {
      id: candidate.id,
      name: candidate.name,
      profileUrl: candidate.profileUrl,
      linkedInUrl: candidate.linkedInUrls?.[0] || "",
      updatedAt: candidate.updatedAt
    },
    collisions: matches.slice(1, 10).map((row) => ({
      id: row.id,
      name: row.name,
      profileUrl: row.profileUrl,
      updatedAt: row.updatedAt
    })),
    index: getAshbyCandidateIndexMetadata(index),
    query: {
      linkedInHandle: handle,
      linkedInKeys: keys,
      profileName: String(profileName || ""),
      strategy: lookupStrategy
    }
  };
}

function pickBestAshbyCandidateMatch(candidates, seed) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) {
    return null;
  }
  const linkedInUrl = normalizeLinkedInUrl(seed?.linkedInUrl || "");
  const email = normalizeTextToken(seed?.email || "");
  const name = normalizeTextToken(seed?.name || "");

  if (linkedInUrl) {
    const byLinkedIn = list.find((candidate) => normalizeLinkedInUrl(getAshbyCandidateLinkedInUrl(candidate)) === linkedInUrl);
    if (byLinkedIn) {
      return byLinkedIn;
    }
  }

  if (email) {
    const byEmail = list.find((candidate) => getAshbyCandidateEmails(candidate).includes(email));
    if (byEmail) {
      return byEmail;
    }
  }

  if (name) {
    const byName = list.find((candidate) => normalizeTextToken(candidate?.name || "") === name);
    if (byName) {
      return byName;
    }
  }

  return list[0];
}

function pickPreferredAshbyStage(stages) {
  const normalizedStages = Array.isArray(stages) ? stages : [];
  if (normalizedStages.length === 0) {
    return { stage: null, strategy: "none" };
  }

  const stageTitle = (stage) => normalizeTextToken(stage?.title);

  const byRecruitingScreenExact = normalizedStages.find((stage) => stageTitle(stage) === "recruiting screen");
  if (byRecruitingScreenExact) {
    return { stage: byRecruitingScreenExact, strategy: "recruiting_screen_exact" };
  }

  const byRecruiterScreenExact = normalizedStages.find((stage) => stageTitle(stage) === "recruiter screen");
  if (byRecruiterScreenExact) {
    return { stage: byRecruiterScreenExact, strategy: "recruiter_screen_exact" };
  }

  const byRecruitingScreenContains = normalizedStages.find((stage) => stageTitle(stage).includes("recruiting screen"));
  if (byRecruitingScreenContains) {
    return { stage: byRecruitingScreenContains, strategy: "recruiting_screen_contains" };
  }

  const byRecruiterScreenContains = normalizedStages.find((stage) => stageTitle(stage).includes("recruiter screen"));
  if (byRecruiterScreenContains) {
    return { stage: byRecruiterScreenContains, strategy: "recruiter_screen_contains" };
  }

  const byRecruitAndScreenTokens = normalizedStages.find((stage) => {
    const title = stageTitle(stage);
    return title.includes("recruit") && title.includes("screen");
  });
  if (byRecruitAndScreenTokens) {
    return { stage: byRecruitAndScreenTokens, strategy: "recruit_screen_token_match" };
  }

  const byLead = normalizedStages.find((stage) => normalizeTextToken(stage?.title) === "lead");
  if (byLead) {
    return { stage: byLead, strategy: "lead_exact" };
  }

  const byLeadContains = normalizedStages.find((stage) => normalizeTextToken(stage?.title).includes("lead"));
  if (byLeadContains) {
    return { stage: byLeadContains, strategy: "lead_contains" };
  }

  const earliest = normalizedStages
    .slice()
    .sort((a, b) => (Number(a?.orderInInterviewPlan) || 0) - (Number(b?.orderInInterviewPlan) || 0))[0];
  return { stage: earliest || null, strategy: "earliest_by_order" };
}

function normalizeAshbyJobOpenStatus(statusRaw, isArchived) {
  const normalized = normalizeTextToken(statusRaw);
  if (normalized.includes("open")) {
    return true;
  }
  if (normalized.includes("closed") || normalized.includes("archived") || normalized.includes("draft")) {
    return false;
  }
  return !Boolean(isArchived);
}

async function listAshbyJobs(payload, audit) {
  const query = String(payload?.query || "").trim().toLowerCase();
  const requestedLimitRaw = Number(payload?.limit);
  const requestedLimit =
    Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
      ? Math.max(1, Math.min(requestedLimitRaw, ASHBY_JOBS_SCAN_MAX))
      : 0;
  const scanTarget = requestedLimit || ASHBY_JOBS_SCAN_MAX;
  const pageSize = Math.min(100, scanTarget);

  let cursor = "";
  let moreData = true;
  let iterations = 0;
  const aggregated = [];

  while (moreData && aggregated.length < scanTarget && iterations < 200) {
    const body = {
      limit: pageSize
    };
    if (cursor) {
      body.cursor = cursor;
    }
    const response = await ashbyRequest("job.list", body, audit);
    const rows = Array.isArray(response?.results) ? response.results : [];
    aggregated.push(...rows);
    moreData = Boolean(response?.moreDataAvailable);
    cursor = String(response?.nextCursor || "");
    iterations += 1;
    if (!cursor && moreData) {
      break;
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const raw of aggregated) {
    const id = String(raw?.id || "").trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const title = firstNonEmpty(raw?.title, raw?.name, id);
    const statusRaw = firstNonEmpty(raw?.status, raw?.state, raw?.jobState, "");
    const archived = Boolean(raw?.isArchived || normalizeTextToken(statusRaw).includes("archived"));
    const isOpen = normalizeAshbyJobOpenStatus(statusRaw, archived);
    const item = {
      id,
      name: title,
      title,
      status: statusRaw || (isOpen ? "Open" : "Closed"),
      isOpen,
      isArchived: archived,
      updatedAt: firstNonEmpty(raw?.updatedAt, raw?.createdAt, "")
    };
    deduped.push(item);
  }

  let filtered = deduped.filter((job) => job.isOpen && !job.isArchived);
  if (query) {
    filtered = filtered.filter((job) => normalizeTextToken(job.name).includes(query));
  }

  filtered.sort((a, b) => a.name.localeCompare(b.name));

  if (requestedLimit > 0) {
    filtered = filtered.slice(0, requestedLimit);
  }

  return { jobs: filtered };
}

function normalizeSourceTitle(title) {
  return normalizeTextToken(title).replace(/[^a-z0-9]+/g, " ").trim();
}

async function findAshbyGemSourceId(audit) {
  const response = await ashbyRequest("source.list", { includeArchived: false }, audit);
  const list = (Array.isArray(response?.results) ? response.results : [])
    .map((source) => ({
      id: String(source?.id || "").trim(),
      title: String(source?.title || "").trim(),
      normalizedTitle: normalizeSourceTitle(source?.title),
      isArchived: Boolean(source?.isArchived)
    }))
    .filter((source) => source.id && !source.isArchived);

  if (list.length === 0) {
    return "";
  }

  const exactSourcedGem = list.find(
    (source) => source.normalizedTitle === "sourced gem" || source.normalizedTitle === "sourced: gem"
  );
  if (exactSourcedGem) {
    return exactSourcedGem.id;
  }

  const exactGem = list.find((source) => source.normalizedTitle === "gem");
  if (exactGem) {
    return exactGem.id;
  }

  const sourcedAndGem = list.find(
    (source) => source.normalizedTitle.includes("sourced") && source.normalizedTitle.includes("gem")
  );
  if (sourcedAndGem) {
    return sourcedAndGem.id;
  }

  const containsGem = list.find((source) => source.normalizedTitle.includes("gem"));
  if (containsGem) {
    return containsGem.id;
  }

  return "";
}

async function listAshbyUsers(audit) {
  const users = [];
  let cursor = "";
  let moreData = true;
  let iterations = 0;

  while (moreData && iterations < 50) {
    const payload = { limit: 100 };
    if (cursor) {
      payload.cursor = cursor;
    }
    const response = await ashbyRequest("user.list", payload, audit);
    const rows = Array.isArray(response?.results) ? response.results : [];
    users.push(...rows);
    moreData = Boolean(response?.moreDataAvailable);
    cursor = String(response?.nextCursor || "");
    iterations += 1;
    if (!cursor && moreData) {
      break;
    }
  }

  const deduped = new Map();
  for (const user of users) {
    const id = String(user?.id || "").trim();
    if (!id || deduped.has(id)) {
      continue;
    }
    deduped.set(id, user);
  }
  return Array.from(deduped.values());
}

function findAshbyUserByEmail(users, email) {
  const target = normalizeTextToken(email);
  if (!target) {
    return null;
  }
  return (Array.isArray(users) ? users : []).find(
    (user) => normalizeTextToken(user?.email) === target && user?.isEnabled !== false
  );
}

function scoreAshbyUserByApiKeyTitle(user, apiKeyTitleTokens) {
  if (!user || !Array.isArray(apiKeyTitleTokens) || apiKeyTitleTokens.length === 0) {
    return 0;
  }
  const fullNameTokens = tokenizeNameText(`${firstNonEmpty(user?.firstName)} ${firstNonEmpty(user?.lastName)}`);
  const emailLocalPartTokens = tokenizeNameText(String(user?.email || "").split("@")[0] || "");
  const userTokens = new Set([...fullNameTokens, ...emailLocalPartTokens]);
  if (userTokens.size === 0) {
    return 0;
  }
  let score = 0;
  for (const token of apiKeyTitleTokens) {
    if (token.length < 2) {
      continue;
    }
    if (userTokens.has(token)) {
      score += token.length >= 4 ? 3 : 2;
      continue;
    }
    for (const userToken of userTokens) {
      if (userToken.startsWith(token) || token.startsWith(userToken)) {
        score += 1;
        break;
      }
    }
  }
  return score;
}

async function resolveAshbyCreditedToUserId(audit) {
  if (ASHBY_CREDITED_TO_USER_ID) {
    return ASHBY_CREDITED_TO_USER_ID;
  }

  const now = Date.now();
  if (ashbyCreditedToUserCache.userId && now - ashbyCreditedToUserCache.resolvedAtMs < 5 * 60 * 1000) {
    return ashbyCreditedToUserCache.userId;
  }

  const users = await listAshbyUsers(audit);
  const activeUsers = users.filter((user) => user?.isEnabled !== false);
  if (activeUsers.length === 0) {
    return "";
  }

  const preferredByEmail = findAshbyUserByEmail(activeUsers, ASHBY_CREDITED_TO_USER_EMAIL);
  if (preferredByEmail?.id) {
    ashbyCreditedToUserCache = {
      keyTitle: ashbyCreditedToUserCache.keyTitle || "",
      userId: String(preferredByEmail.id),
      resolvedAtMs: now
    };
    return String(preferredByEmail.id);
  }

  let apiKeyTitle = ashbyCreditedToUserCache.keyTitle || "";
  if (!apiKeyTitle) {
    const keyInfo = await ashbyRequest("apiKey.info", {}, audit);
    apiKeyTitle = firstNonEmpty(keyInfo?.results?.title);
  }
  ashbyCreditedToUserCache.keyTitle = apiKeyTitle;

  const keyTitleTokens = tokenizeNameText(apiKeyTitle);
  let best = null;
  let bestScore = 0;
  let tiedBestCount = 0;
  for (const user of activeUsers) {
    const score = scoreAshbyUserByApiKeyTitle(user, keyTitleTokens);
    if (score > bestScore) {
      best = user;
      bestScore = score;
      tiedBestCount = 1;
    } else if (score > 0 && score === bestScore) {
      tiedBestCount += 1;
    }
  }

  if (best?.id && bestScore > 0 && tiedBestCount === 1) {
    ashbyCreditedToUserCache = {
      keyTitle: apiKeyTitle,
      userId: String(best.id),
      resolvedAtMs: now
    };
    return String(best.id);
  }

  return "";
}

async function findOrCreateAshbyCandidateFromGemCandidate(seed, sourceId, creditedToUserId, audit) {
  const searchCandidates = [];
  const email = String(seed?.email || "").trim();
  const name = String(seed?.name || "").trim();
  if (email) {
    const byEmail = await ashbyRequest("candidate.search", { email }, audit);
    searchCandidates.push(...(Array.isArray(byEmail?.results) ? byEmail.results : []));
  }
  if (name) {
    const byName = await ashbyRequest("candidate.search", { name }, audit);
    searchCandidates.push(...(Array.isArray(byName?.results) ? byName.results : []));
  }

  const existing = pickBestAshbyCandidateMatch(searchCandidates, seed);
  if (existing?.id) {
    return { candidate: existing, created: false };
  }

  const createPayload = {
    name: name || "Unknown Candidate"
  };
  if (email) {
    createPayload.email = email;
  }
  if (seed?.phoneNumber) {
    createPayload.phoneNumber = String(seed.phoneNumber);
  }
  if (seed?.linkedInUrl) {
    createPayload.linkedInUrl = String(seed.linkedInUrl);
  }
  if (sourceId) {
    createPayload.sourceId = sourceId;
  }
  if (creditedToUserId) {
    createPayload.creditedToUserId = creditedToUserId;
  }
  const created = await ashbyRequest("candidate.create", createPayload, audit, getAshbyWriteOptions());
  return { candidate: created?.results || {}, created: true };
}

async function findExistingApplicationForJob(candidateId, jobId, audit) {
  const candidateInfo = await ashbyRequest("candidate.info", { id: candidateId }, audit);
  const applicationIds = Array.isArray(candidateInfo?.results?.applicationIds) ? candidateInfo.results.applicationIds : [];
  for (const idRaw of applicationIds.slice(0, 200)) {
    const applicationId = String(idRaw || "").trim();
    if (!applicationId) {
      continue;
    }
    try {
      const applicationInfo = await ashbyRequest("application.info", { applicationId }, audit);
      const application = applicationInfo?.results;
      if (String(application?.job?.id || "") === String(jobId)) {
        return application;
      }
    } catch (_error) {
      // Ignore bad application ids and continue scanning existing applications.
    }
  }
  return null;
}

async function resolvePreferredStageForJob(jobId, audit) {
  const plan = await ashbyRequest("jobInterviewPlan.info", { jobId }, audit);
  const interviewPlanId = String(plan?.results?.interviewPlanId || "");
  const stages = Array.isArray(plan?.results?.stages) ? plan.results.stages : [];
  const picked = pickPreferredAshbyStage(stages);
  return {
    interviewPlanId,
    stageId: String(picked?.stage?.id || ""),
    stageTitle: String(picked?.stage?.title || ""),
    strategy: String(picked?.strategy || "")
  };
}

async function uploadGemCandidateToAshby(payload, audit) {
  const gemCandidateId = String(payload?.gemCandidateId || "").trim();
  const jobId = String(payload?.jobId || "").trim();
  const jobName = String(payload?.jobName || "").trim();
  if (!gemCandidateId) {
    throw new Error("gemCandidateId is required.");
  }
  if (!jobId) {
    throw new Error("jobId is required.");
  }

  const gemCandidate = await gemRequest(`/v0/candidates/${gemCandidateId}`, {}, audit);
  if (!gemCandidate?.id) {
    throw new Error("Could not load candidate details from Gem.");
  }
  const seed = summarizeGemCandidateForAshby(gemCandidate, String(payload?.profileName || ""));
  const sourceId = await findAshbyGemSourceId(audit);
  const creditedToUserId = await resolveAshbyCreditedToUserId(audit);
  const preferredStage = await resolvePreferredStageForJob(jobId, audit);
  const { candidate: ashbyCandidate, created } = await findOrCreateAshbyCandidateFromGemCandidate(
    seed,
    sourceId,
    creditedToUserId,
    audit
  );
  const ashbyCandidateId = String(ashbyCandidate?.id || "").trim();
  if (!ashbyCandidateId) {
    throw new Error("Ashby candidate resolution failed.");
  }

  let application = await findExistingApplicationForJob(ashbyCandidateId, jobId, audit);
  let applicationCreated = false;

  if (!application) {
    const createApplicationPayload = {
      candidateId: ashbyCandidateId,
      jobId
    };
    if (sourceId) {
      createApplicationPayload.sourceId = sourceId;
    }
    if (creditedToUserId) {
      createApplicationPayload.creditedToUserId = creditedToUserId;
    }
    if (preferredStage.stageId) {
      createApplicationPayload.interviewStageId = preferredStage.stageId;
      if (preferredStage.interviewPlanId) {
        createApplicationPayload.interviewPlanId = preferredStage.interviewPlanId;
      }
    }
    const createdApplication = await ashbyRequest(
      "application.create",
      createApplicationPayload,
      audit,
      getAshbyWriteOptions()
    );
    application = createdApplication?.results || null;
    applicationCreated = true;
  }

  const applicationId = String(application?.id || "").trim();
  if (applicationId && sourceId && String(application?.source?.id || "") !== sourceId) {
    await ashbyRequest(
      "application.changeSource",
      { applicationId, sourceId },
      audit,
      getAshbyWriteOptions()
    );
  }
  if (
    applicationId &&
    creditedToUserId &&
    String(application?.creditedToUser?.id || "") !== creditedToUserId &&
    ASHBY_WRITE_ALLOWED_METHODS.has("application.update")
  ) {
    await ashbyRequest(
      "application.update",
      { applicationId, creditedToUserId },
      audit,
      getAshbyWriteOptions()
    );
  }
  if (applicationId && preferredStage.stageId && String(application?.currentInterviewStage?.id || "") !== preferredStage.stageId) {
    await ashbyRequest(
      "application.changeStage",
      { applicationId, interviewStageId: preferredStage.stageId },
      audit,
      getAshbyWriteOptions()
    );
  }
  if (applicationId) {
    const refreshed = await ashbyRequest("application.info", { applicationId }, audit);
    application = refreshed?.results || application;
  }

  let candidateProfileUrl = buildAshbyProfileUrl(ashbyCandidate?.profileUrl, ashbyCandidateId);
  if (!candidateProfileUrl) {
    const refreshedCandidate = await ashbyRequest("candidate.info", { id: ashbyCandidateId }, audit);
    candidateProfileUrl = buildAshbyProfileUrl(refreshedCandidate?.results?.profileUrl, ashbyCandidateId);
  }

  const stageTitle = firstNonEmpty(application?.currentInterviewStage?.title, preferredStage.stageTitle);
  const uploadMessage = `Uploaded candidate to Ashby${jobName ? ` (${jobName})` : ""}${
    stageTitle ? ` in stage ${stageTitle}` : ""
  }.`;

  return {
    message: uploadMessage,
    link: candidateProfileUrl,
    sourceApplied: Boolean(sourceId),
    creditedToApplied: Boolean(creditedToUserId),
    stageId: preferredStage.stageId,
    stageTitle,
    stageSelectionStrategy: preferredStage.strategy,
    ashbyCandidateId,
    ashbyApplicationId: String(application?.id || ""),
    gemCandidateId: String(gemCandidate.id || gemCandidateId),
    candidateCreatedInAshby: Boolean(created),
    applicationCreatedInAshby: Boolean(applicationCreated)
  };
}

const routes = {
  "/api/candidates/resolve-context": (payload, audit) => resolveCandidateByContext(payload, audit),
  "/api/candidates/find-by-linkedin": (payload, audit) => findCandidateByLinkedIn(payload, audit),
  "/api/candidates/find-by-email": (payload, audit) => findCandidateByEmail(payload, audit),
  "/api/candidates/find-by-profile-url": (payload, audit) => findCandidateByProfileUrl(payload, audit),
  "/api/candidates/create-from-linkedin": createCandidateFromLinkedIn,
  "/api/candidates/create-from-context": createCandidateFromContext,
  "/api/candidates/search": searchCandidates,
  "/api/projects/add-candidate": addCandidateToProject,
  "/api/projects/create": createProject,
  "/api/projects/list": listProjects,
  "/api/ashby/jobs/list": listAshbyJobs,
  "/api/ashby/candidates/find-by-linkedin": findAshbyCandidateByLinkedIn,
  "/api/ashby/upload-candidate": uploadGemCandidateToAshby,
  "/api/custom-fields/list": listCustomFields,
  "/api/candidates/set-custom-field": setCandidateCustomField,
  "/api/candidates/add-note": addCandidateNote,
  "/api/candidates/add_note": addCandidateNote,
  "/api/candidates/set-due-date": setCandidateDueDate,
  "/api/candidates/emails/list": listCandidateEmails,
  "/api/candidates/emails/add": addCandidateEmail,
  "/api/candidates/emails/set-primary": setCandidatePrimaryEmail,
  "/api/candidates/get": getCandidate,
  "/api/sequences/list": listSequences,
  "/api/sequences/get": getSequence,
  "/api/users/list": listUsers,
  "/api/logs/client": ingestClientLog,
  "/api/logs/recent": recentLogs
};

function normalizeRoute(route) {
  const value = String(route || "").trim();
  if (!value || value === "/") {
    return "/";
  }
  return value.startsWith("/") ? value.replace(/\/+$/, "") : `/${value.replace(/\/+$/, "")}`;
}

function getRouteFromRequest(req, options = {}) {
  if (options && typeof options === "object" && options.routeOverride) {
    return normalizeRoute(options.routeOverride);
  }
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = String(parsed.pathname || "");
  return normalizeRoute(pathname);
}

async function handleNodeRequest(req, res, options = {}) {
  const route = getRouteFromRequest(req, options);
  const requestId = req.headers["x-request-id"] || generateId();
  const startedAt = Date.now();
  const audit = {
    requestId,
    route,
    runId: "",
    actionId: ""
  };

  if (req.method === "OPTIONS") {
    writeJson(req, res, 204, {});
    return;
  }

  if (route === "/health" && req.method === "GET") {
    writeJson(req, res, 200, getHealthPayload());
    return;
  }

  if (route === "/privacy" && req.method === "GET") {
    writeHtml(res, 200, PRIVACY_POLICY_HTML);
    return;
  }

  if (req.method !== "POST") {
    writeJson(req, res, 404, { ok: false, error: "Not found" });
    return;
  }

  const incomingToken = String(req.headers["x-backend-token"] || "");
  const requestOrigin = getRequestOrigin(req);
  const tokenAuthorized = Boolean(BACKEND_SHARED_TOKEN) && incomingToken === BACKEND_SHARED_TOKEN;
  const originAuthorized =
    ALLOWED_EXTENSION_ORIGINS.size > 0 && isAllowedExtensionOrigin(requestOrigin);
  if ((BACKEND_SHARED_TOKEN || ALLOWED_EXTENSION_ORIGINS.size > 0) && !tokenAuthorized && !originAuthorized) {
    logEvent({
      level: "warn",
      source: "backend",
      event: "request.unauthorized",
      message: "Rejected backend request without valid token or allowed extension origin.",
      requestId,
      route,
      details: {
        ip: req.socket.remoteAddress,
        userAgent: req.headers["user-agent"] || "",
        origin: requestOrigin,
        hasToken: Boolean(incomingToken),
        allowedOriginsConfigured: ALLOWED_EXTENSION_ORIGINS.size > 0
      }
    });
    writeJson(req, res, 401, { ok: false, error: "Unauthorized" });
    return;
  }

  const handler = routes[route];
  if (!handler) {
    logEvent({
      level: "warn",
      source: "backend",
      event: "request.unknown_route",
      message: "Unknown route",
      requestId,
      route
    });
    writeJson(req, res, 404, { ok: false, error: "Unknown route" });
    return;
  }

  try {
    const body = await readJson(req);
    audit.runId = String(body.runId || "");
    audit.actionId = String(body.actionId || "");

    logEvent({
      source: "backend",
      event: "request.received",
      message: `Incoming ${route}`,
      requestId,
      route,
      runId: audit.runId,
      actionId: audit.actionId,
      details: {
        ip: req.socket.remoteAddress,
        userAgent: req.headers["user-agent"] || "",
        body
      }
    });

    const result = await handler(body, audit);
    const durationMs = Date.now() - startedAt;
    logEvent({
      source: "backend",
      event: "request.completed",
      message: `${route} completed`,
      requestId,
      route,
      runId: audit.runId,
      actionId: audit.actionId,
      durationMs,
      details: {
        summary: summarizeForLog(result)
      }
    });

    writeJson(req, res, 200, { ok: true, data: result, requestId });
  } catch (error) {
    const status = Number(error.status) >= 400 ? Number(error.status) : 400;
    const durationMs = Date.now() - startedAt;
    logEvent({
      level: "error",
      source: "backend",
      event: "request.failed",
      message: error.message || "Request failed",
      requestId,
      route,
      runId: audit.runId,
      actionId: audit.actionId,
      durationMs,
      details: {
        status,
        error: error.data || ""
      }
    });

    writeJson(req, res, status, {
      ok: false,
      error: error.message || "Request failed",
      details: error.data,
      requestId
    });
  }
}

function createServer(options = {}) {
  return http.createServer((req, res) => handleNodeRequest(req, res, options));
}

function startLocalServer(options = {}) {
  const port = Number(options.port || process.env.PORT || PORT || 8787);
  ensureLogFile();
  const server = createServer();
  server.listen(port, () => {
    console.log(`Gem backend listening on http://localhost:${port}`);
    console.log(
      `Backend request gates: sharedToken=${Boolean(BACKEND_SHARED_TOKEN)} allowedExtensionOrigins=${
        ALLOWED_EXTENSION_ORIGINS.size > 0 ? Array.from(ALLOWED_EXTENSION_ORIGINS).join(",") : "(not set)"
      }`
    );
    console.log(
      `Ashby write safety: enabled=${ASHBY_WRITE_ENABLED} requireConfirmation=${ASHBY_WRITE_REQUIRE_CONFIRMATION} allowlistedMethods=${Array.from(
        ASHBY_WRITE_ALLOWED_METHODS
      ).join(",")}`
    );
    if (IS_VERCEL_RUNTIME) {
      console.log("Running in a Vercel runtime; backend logs are written best-effort to /tmp.");
    }
  });
  return server;
}

module.exports = {
  createServer,
  getHealthPayload,
  handleNodeRequest,
  PRIVACY_POLICY_HTML,
  startLocalServer
};
