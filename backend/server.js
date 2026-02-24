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
const GEM_API_KEY = process.env.GEM_API_KEY || "";
const GEM_API_BASE_URL = (process.env.GEM_API_BASE_URL || "https://api.gem.com").replace(/\/$/, "");
const ASHBY_API_KEY = process.env.ASHBY_API_KEY || "";
const ASHBY_API_BASE_URL = (process.env.ASHBY_API_BASE_URL || "https://api.ashbyhq.com").replace(/\/$/, "");
const BACKEND_SHARED_TOKEN = process.env.BACKEND_SHARED_TOKEN || "";
const GEM_DEFAULT_USER_ID = process.env.GEM_DEFAULT_USER_ID || "";
const GEM_DEFAULT_USER_EMAIL = process.env.GEM_DEFAULT_USER_EMAIL || "";
const ASHBY_CREDITED_TO_USER_ID = String(process.env.ASHBY_CREDITED_TO_USER_ID || "").trim();
const ASHBY_CREDITED_TO_USER_EMAIL = String(
  process.env.ASHBY_CREDITED_TO_USER_EMAIL || GEM_DEFAULT_USER_EMAIL || ""
).trim();
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "events.jsonl");
const LOG_MAX_BYTES = Number(process.env.LOG_MAX_BYTES || 5 * 1024 * 1024);
const PROJECTS_SCAN_MAX = Number(process.env.PROJECTS_SCAN_MAX || 20000);
const SEQUENCES_SCAN_MAX = Number(process.env.SEQUENCES_SCAN_MAX || 20000);
const ASHBY_JOBS_SCAN_MAX = Number(process.env.ASHBY_JOBS_SCAN_MAX || 5000);
const ASHBY_CANDIDATES_SCAN_MAX = Number(process.env.ASHBY_CANDIDATES_SCAN_MAX || 100000);
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

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Backend-Token"
  });
  res.end(JSON.stringify(payload));
}

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
      "Ashby writes require confirmation token. Set ASHBY_WRITE_CONFIRMATION_TOKEN in backend env."
    );
  }
  return {
    writeConfirmation: ASHBY_WRITE_CONFIRMATION_TOKEN
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

async function findCandidateByLinkedIn(linkedInHandle, audit) {
  const handle = sanitizeLinkedInHandle(linkedInHandle);
  if (!handle) {
    throw new Error("linkedInHandle is required.");
  }
  const list = await gemRequest(
    "/v0/candidates",
    {
      query: { linked_in_handle: handle, page_size: 1 }
    },
    audit
  );
  const candidate = Array.isArray(list) && list.length > 0 ? list[0] : null;
  return { candidate };
}

async function resolveCreatedByUserId(explicitUserId, audit) {
  if (explicitUserId) {
    return explicitUserId;
  }
  if (GEM_DEFAULT_USER_ID) {
    return GEM_DEFAULT_USER_ID;
  }
  if (!GEM_DEFAULT_USER_EMAIL) {
    return "";
  }
  const users = await gemRequest(
    "/v0/users",
    {
      query: { email: GEM_DEFAULT_USER_EMAIL, page_size: 1 }
    },
    audit
  );
  const user = Array.isArray(users) ? users[0] : null;
  return user?.id || "";
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
  const linkedInHandle = sanitizeLinkedInHandle(payload.linkedInHandle);
  if (!linkedInHandle) {
    throw new Error("linkedInHandle is required.");
  }

  const createdBy = await resolveCreatedByUserId(payload.createdByUserId, audit);
  if (!createdBy) {
    throw new Error(
      "Gem requires created_by. Set createdByUserId in extension options or GEM_DEFAULT_USER_ID/GEM_DEFAULT_USER_EMAIL in backend env."
    );
  }

  const body = omitUndefined({
    created_by: createdBy,
    first_name: payload.firstName,
    last_name: payload.lastName,
    linked_in_handle: linkedInHandle,
    profile_urls: payload.profileUrl ? [payload.profileUrl] : undefined,
    autofill: true
  });

  try {
    const candidate = await gemRequest("/v0/candidates", { method: "POST", body }, audit);
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
  const userId = String(payload.userId || "").trim();

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
    return { projectId, candidateId, userId: "" };
  }
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
    const pageData = await gemRequest(
      "/v0/projects",
      {
        query: {
          page_size: pageSize,
          page
        }
      },
      audit
    );
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

async function listCustomFields(payload, audit) {
  const requestedLimitRaw = Number(payload.limit);
  const requestedLimit =
    Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
      ? Math.max(1, Math.min(requestedLimitRaw, PROJECTS_SCAN_MAX))
      : 0;
  const scanTarget = requestedLimit || PROJECTS_SCAN_MAX;
  const pageSize = 100;
  const maxPages = Math.max(1, Math.ceil(scanTarget / pageSize));
  let aggregated = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const pageData = await gemRequest(
      "/v0/custom_fields",
      {
        query: {
          page_size: pageSize,
          page
        }
      },
      audit
    );
    const fields = Array.isArray(pageData) ? pageData : [];
    aggregated = aggregated.concat(fields);
    if (fields.length < pageSize || aggregated.length >= scanTarget) {
      break;
    }
  }

  let candidateProjectIds = [];
  const candidateId = String(payload.candidateId || "").trim();
  if (candidateId) {
    const candidate = await gemRequest(`/v0/candidates/${candidateId}`, {}, audit);
    candidateProjectIds = Array.isArray(candidate?.project_ids) ? candidate.project_ids.map((id) => String(id || "")) : [];
  }

  const seen = new Set();
  let customFields = aggregated
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
      if (field.scope === "project") {
        return Boolean(field.projectId) && candidateProjectIds.includes(field.projectId);
      }
      if (field.scope === "team") {
        return true;
      }
      return false;
    })
    .map((field) => ({
      ...field,
      options: field.options.sort((a, b) => a.value.localeCompare(b.value))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (requestedLimit > 0) {
    customFields = customFields.slice(0, requestedLimit);
  }

  return {
    candidateId,
    customFields
  };
}

async function setCandidateCustomField(payload, audit) {
  const candidateId = String(payload.candidateId || "").trim();
  const customFieldId = String(payload.customFieldId || "").trim();
  if (!candidateId || !customFieldId) {
    throw new Error("candidateId and customFieldId are required.");
  }

  const valueType = String(payload.customFieldValueType || payload.valueType || "").trim();
  const optionId = String(payload.customFieldOptionId || payload.optionId || "").trim();
  let value = payload.value === undefined ? null : payload.value;
  if (valueType === "single_select") {
    if (!optionId) {
      throw new Error("single_select custom fields require option id.");
    }
    value = optionId;
  } else if (valueType === "multi_select") {
    if (!optionId) {
      throw new Error("multi_select custom fields require option id.");
    }
    value = [optionId];
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
  return { candidate };
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

  const userId = await resolveCreatedByUserId(payload.userId, audit);
  if (!userId) {
    throw new Error(
      "Gem requires due_date.user_id. Set createdByUserId in extension options or GEM_DEFAULT_USER_ID/GEM_DEFAULT_USER_EMAIL in backend env."
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

async function listSequences(payload, audit) {
  const requestedLimitRaw = Number(payload.limit);
  const requestedLimit =
    Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
      ? Math.max(1, Math.min(requestedLimitRaw, SEQUENCES_SCAN_MAX))
      : 0;
  const scanTarget = requestedLimit || SEQUENCES_SCAN_MAX;
  const query = String(payload.query || "").trim();
  const sequenceOwnerUserId = await resolveCreatedByUserId(payload.userId, audit);
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
    .map((sequence) => ({
      id: String(sequence.id || ""),
      name: String(sequence.name || ""),
      userId: String(sequence.user_id || sequence.userId || ""),
      createdAt: String(sequence.created_at || sequence.createdAt || sequence.created || "")
    }))
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

  if (requestedLimit > 0) {
    normalized = normalized.slice(0, requestedLimit);
  }

  return { sequences: normalized };
}

async function listUsers(payload, audit) {
  const query = omitUndefined({
    email: payload.email,
    page_size: payload.pageSize || 20
  });
  const users = await gemRequest("/v0/users", { query }, audit);
  return { users };
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

function formatContactMedium(value) {
  const token = String(value || "").trim();
  if (!token) {
    return "touchpoint";
  }
  return token.replace(/_/g, " ");
}

function trimText(value, max = 600) {
  const raw = String(value || "");
  if (raw.length <= max) {
    return raw;
  }
  return `${raw.slice(0, max)}...`;
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

async function fetchByIdMap(ids, fetchById) {
  const map = {};
  const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "")).filter(Boolean)));
  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const value = await fetchById(id);
        if (value) {
          map[id] = value;
        }
      } catch (_error) {
        // Ignore lookup failures and keep rendering feed.
      }
    })
  );
  return map;
}

async function listCandidateActivityFeed(payload, audit) {
  const candidateId = String(payload.candidateId || "").trim();
  if (!candidateId) {
    throw new Error("candidateId is required.");
  }

  const requestedLimitRaw = Number(payload.limit);
  const requestedLimit =
    Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
      ? Math.max(1, Math.min(requestedLimitRaw, 500))
      : 120;

  const candidate = await gemRequest(`/v0/candidates/${candidateId}`, {}, audit);
  const [notesResult, eventsResult] = await Promise.allSettled([
    listPaged(`/v0/candidates/${candidateId}/notes`, audit, {
      query: { sort: "desc" },
      limit: requestedLimit,
      maxPages: 20
    }),
    listPaged(`/v0/candidates/${candidateId}/events`, audit, {
      query: { sort: "desc" },
      limit: requestedLimit,
      maxPages: 20
    })
  ]);
  const notes = notesResult.status === "fulfilled" ? notesResult.value : [];
  const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
  if (notesResult.status === "rejected") {
    logEvent({
      level: "warn",
      source: "backend",
      event: "candidate.activity_feed.notes_unavailable",
      message: notesResult.reason?.message || "Could not load candidate notes.",
      requestId: audit.requestId,
      route: audit.route,
      runId: audit.runId,
      actionId: audit.actionId,
      details: {
        candidateId
      }
    });
  }
  if (eventsResult.status === "rejected") {
    logEvent({
      level: "warn",
      source: "backend",
      event: "candidate.activity_feed.events_unavailable",
      message: eventsResult.reason?.message || "Could not load candidate events.",
      requestId: audit.requestId,
      route: audit.route,
      runId: audit.runId,
      actionId: audit.actionId,
      details: {
        candidateId
      }
    });
  }

  const userIds = new Set();
  const projectIds = new Set();
  const sequenceIds = new Set();
  const createdById = String(candidate?.created_by || "");
  if (createdById) {
    userIds.add(createdById);
  }

  for (const note of notes) {
    const userId = String(note?.user_id || "");
    if (userId) {
      userIds.add(userId);
    }
  }

  for (const event of events) {
    const userId = String(event?.user_id || "");
    const onBehalfOfUserId = String(event?.on_behalf_of_user_id || "");
    const projectId = String(event?.project_id || "");
    const sequenceId = String(event?.sequence_id || "");
    if (userId) {
      userIds.add(userId);
    }
    if (onBehalfOfUserId) {
      userIds.add(onBehalfOfUserId);
    }
    if (projectId) {
      projectIds.add(projectId);
    }
    if (sequenceId) {
      sequenceIds.add(sequenceId);
    }
  }

  let users = [];
  try {
    users = await listPaged("/v0/users", audit, { pageSize: 100, maxPages: 20 });
  } catch (_error) {
    users = [];
  }
  const userMap = {};
  for (const user of users) {
    const id = String(user?.id || "");
    if (!id || !userIds.has(id)) {
      continue;
    }
    userMap[id] = {
      id,
      name: String(user?.name || "").trim(),
      email: String(user?.email || "").trim()
    };
  }

  const projectMap = await fetchByIdMap(Array.from(projectIds), async (projectId) => {
    const project = await gemRequest(`/v0/projects/${projectId}`, {}, audit);
    const name = String(project?.name || "").trim();
    return name ? { id: projectId, name } : null;
  });

  const sequenceMap = await fetchByIdMap(Array.from(sequenceIds), async (sequenceId) => {
    const sequence = await gemRequest(`/v0/sequences/${sequenceId}`, {}, audit);
    const name = String(sequence?.name || "").trim();
    return name ? { id: sequenceId, name } : null;
  });

  const activities = [];
  if (toEpochMs(candidate?.created_at) > 0) {
    const createdBy = userMap[createdById];
    activities.push({
      id: `candidate:${candidateId}:created`,
      kind: "candidate_created",
      timestampMs: toEpochMs(candidate.created_at),
      timestamp: new Date(toEpochMs(candidate.created_at)).toISOString(),
      title: "Candidate added to Gem",
      subtitle: createdBy ? `by ${createdBy.name || createdBy.email || createdBy.id}` : "",
      content: "",
      source: "candidate",
      link: String(candidate?.weblink || ""),
      details: {
        candidateId,
        createdBy: createdById
      }
    });
  }

  for (const note of notes) {
    const timestampMs = toEpochMs(note?.timestamp);
    if (!timestampMs) {
      continue;
    }
    const user = userMap[String(note?.user_id || "")];
    activities.push({
      id: `note:${String(note?.id || "") || `${candidateId}:${timestampMs}`}`,
      kind: "note",
      timestampMs,
      timestamp: new Date(timestampMs).toISOString(),
      title: user ? `Note added by ${user.name || user.email || user.id}` : "Note added",
      subtitle: note?.is_private ? "Private note" : "",
      content: trimText(note?.content || "", 5000),
      source: "note",
      link: String(candidate?.weblink || ""),
      details: {
        noteId: String(note?.id || ""),
        candidateId,
        userId: String(note?.user_id || ""),
        isPrivate: Boolean(note?.is_private)
      }
    });
  }

  for (const event of events) {
    const timestampMs = toEpochMs(event?.timestamp);
    if (!timestampMs) {
      continue;
    }
    const eventType = String(event?.type || "");
    const subtype = String(event?.subtype || "");
    const medium = formatContactMedium(event?.contact_medium);
    const user = userMap[String(event?.user_id || "")];
    const project = projectMap[String(event?.project_id || "")];
    const sequence = sequenceMap[String(event?.sequence_id || "")];
    const actor = user ? user.name || user.email || user.id : "";

    let title = "Candidate event";
    if (eventType === "sequence_replies") {
      title = "Sequence reply received";
    } else if (eventType === "sequences") {
      if (subtype === "reply") {
        title = "Sequence reply sent";
      } else {
        title = `Sequence ${medium} ${subtype || "activity"}`;
      }
    } else if (eventType === "manual_touchpoints") {
      title = `Manual ${medium} ${subtype || "touchpoint"}`;
    }

    const subtitleParts = [];
    if (actor) {
      subtitleParts.push(`by ${actor}`);
    }
    if (project?.name) {
      subtitleParts.push(`project: ${project.name}`);
    }
    if (sequence?.name) {
      subtitleParts.push(`sequence: ${sequence.name}`);
    }
    if (event?.reply_status) {
      subtitleParts.push(`reply: ${String(event.reply_status).replace(/_/g, " ")}`);
    }

    activities.push({
      id: `event:${String(event?.id || "") || `${candidateId}:${timestampMs}`}`,
      kind: "event",
      timestampMs,
      timestamp: new Date(timestampMs).toISOString(),
      title,
      subtitle: subtitleParts.join(" · "),
      content: "",
      source: "event",
      link: String(candidate?.weblink || ""),
      details: {
        eventId: String(event?.id || ""),
        candidateId,
        type: eventType,
        subtype,
        contactMedium: String(event?.contact_medium || ""),
        projectId: String(event?.project_id || ""),
        sequenceId: String(event?.sequence_id || ""),
        userId: String(event?.user_id || ""),
        onBehalfOfUserId: String(event?.on_behalf_of_user_id || "")
      }
    });
  }

  activities.sort((a, b) => b.timestampMs - a.timestampMs);
  const trimmed = activities.slice(0, requestedLimit).map((item) => {
    const { timestampMs, ...rest } = item;
    return rest;
  });

  return {
    candidate: {
      id: String(candidate?.id || candidateId),
      name: `${String(candidate?.first_name || "").trim()} ${String(candidate?.last_name || "").trim()}`.trim(),
      title: String(candidate?.title || ""),
      company: String(candidate?.company || ""),
      location: String(candidate?.location || ""),
      linkedInHandle: String(candidate?.linked_in_handle || ""),
      weblink: String(candidate?.weblink || "")
    },
    activities: trimmed
  };
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
    .trim()
    .toLowerCase();
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
  for (const url of profileUrls) {
    const normalized = normalizeLinkedInUrl(url);
    if (normalized.includes("linkedin.com/in/") || normalized.includes("linkedin.com/pub/")) {
      return String(url || "").trim();
    }
  }
  const handleUrl = buildLinkedInUrlFromHandle(candidate?.linked_in_handle || candidate?.linkedInHandle || "");
  if (handleUrl) {
    return handleUrl;
  }
  return "";
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
  "/api/candidates/find-by-linkedin": (payload, audit) => findCandidateByLinkedIn(payload.linkedInHandle, audit),
  "/api/candidates/create-from-linkedin": createCandidateFromLinkedIn,
  "/api/projects/add-candidate": addCandidateToProject,
  "/api/projects/list": listProjects,
  "/api/ashby/jobs/list": listAshbyJobs,
  "/api/ashby/candidates/find-by-linkedin": findAshbyCandidateByLinkedIn,
  "/api/ashby/upload-candidate": uploadGemCandidateToAshby,
  "/api/custom-fields/list": listCustomFields,
  "/api/candidates/set-custom-field": setCandidateCustomField,
  "/api/candidates/set-due-date": setCandidateDueDate,
  "/api/candidates/get": getCandidate,
  "/api/sequences/list": listSequences,
  // Retired for now:
  // "/api/candidates/activity-feed": listCandidateActivityFeed,
  "/api/sequences/get": getSequence,
  "/api/users/list": listUsers,
  "/api/logs/client": ingestClientLog,
  "/api/logs/recent": recentLogs
};

function getRouteFromRequest(req) {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  return parsed.pathname;
}

const server = http.createServer(async (req, res) => {
  const route = getRouteFromRequest(req);
  const requestId = req.headers["x-request-id"] || generateId();
  const startedAt = Date.now();
  const audit = {
    requestId,
    route,
    runId: "",
    actionId: ""
  };

  if (req.method === "OPTIONS") {
    writeJson(res, 204, {});
    return;
  }

  if (route === "/health" && req.method === "GET") {
    writeJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST") {
    writeJson(res, 404, { ok: false, error: "Not found" });
    return;
  }

  if (BACKEND_SHARED_TOKEN) {
    const incomingToken = req.headers["x-backend-token"];
    if (incomingToken !== BACKEND_SHARED_TOKEN) {
      logEvent({
        level: "warn",
        source: "backend",
        event: "request.unauthorized",
        message: "Backend shared token mismatch.",
        requestId,
        route,
        details: {
          ip: req.socket.remoteAddress,
          userAgent: req.headers["user-agent"] || ""
        }
      });
      writeJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }
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
    writeJson(res, 404, { ok: false, error: "Unknown route" });
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

    writeJson(res, 200, { ok: true, data: result, requestId });
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

    writeJson(res, status, {
      ok: false,
      error: error.message || "Request failed",
      details: error.data,
      requestId
    });
  }
});

ensureLogFile();
server.listen(PORT, () => {
  console.log(`Gem backend listening on http://localhost:${PORT}`);
  console.log(
    `Ashby write safety: enabled=${ASHBY_WRITE_ENABLED} requireConfirmation=${ASHBY_WRITE_REQUIRE_CONFIRMATION} allowlistedMethods=${Array.from(
      ASHBY_WRITE_ALLOWED_METHODS
    ).join(",")}`
  );
  scheduleAshbyCandidateIndexRefresh(
    {
      requestId: "startup",
      route: "startup",
      runId: "",
      actionId: "openAshbyProfile"
    },
    { forceFull: false }
  );
});
