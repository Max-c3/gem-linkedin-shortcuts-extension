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
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "events.jsonl");
const LOG_MAX_BYTES = Number(process.env.LOG_MAX_BYTES || 5 * 1024 * 1024);
const PROJECTS_SCAN_MAX = Number(process.env.PROJECTS_SCAN_MAX || 20000);
const SEQUENCES_SCAN_MAX = Number(process.env.SEQUENCES_SCAN_MAX || 20000);
const ASHBY_WRITE_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.ASHBY_WRITE_ENABLED || "false").trim());
const ASHBY_WRITE_REQUIRE_CONFIRMATION = !/^(0|false|no|off)$/i.test(
  String(process.env.ASHBY_WRITE_REQUIRE_CONFIRMATION || "true").trim()
);
const ASHBY_WRITE_CONFIRMATION_TOKEN = String(process.env.ASHBY_WRITE_CONFIRMATION_TOKEN || "").trim();
const ASHBY_WRITE_DEFAULT_CONFIRMATION = "I_UNDERSTAND_THIS_WRITES_TO_ASHBY";
const ASHBY_WRITE_ALLOWED_METHODS = new Set(
  String(
    process.env.ASHBY_WRITE_ALLOWED_METHODS ||
      "candidate.create,candidate.addProject,customField.setValue,customField.setValues,candidate.createNote"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

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
  const userId = await resolveCreatedByUserId(payload.userId, audit);
  if (!userId) {
    throw new Error(
      "Gem requires user_id for project attribution. Set createdByUserId in extension options or GEM_DEFAULT_USER_ID/GEM_DEFAULT_USER_EMAIL in backend env."
    );
  }

  await gemRequest(
    `/v0/projects/${projectId}/candidates`,
    {
      method: "PUT",
      body: omitUndefined({
        candidate_ids: [candidateId],
        user_id: userId
      })
    },
    audit
  );

  return { projectId, candidateId, userId };
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

const routes = {
  "/api/candidates/find-by-linkedin": (payload, audit) => findCandidateByLinkedIn(payload.linkedInHandle, audit),
  "/api/candidates/create-from-linkedin": createCandidateFromLinkedIn,
  "/api/projects/add-candidate": addCandidateToProject,
  "/api/projects/list": listProjects,
  "/api/custom-fields/list": listCustomFields,
  "/api/candidates/set-custom-field": setCandidateCustomField,
  "/api/candidates/set-due-date": setCandidateDueDate,
  "/api/candidates/get": getCandidate,
  "/api/sequences/list": listSequences,
  "/api/candidates/activity-feed": listCandidateActivityFeed,
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
});
