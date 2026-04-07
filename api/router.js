import backendApp from "../backend/app.cjs";

export const config = {
  maxDuration: 300
};

function getRouteOverride(query) {
  const rawSegments = query?.route;
  const segments = Array.isArray(rawSegments) ? rawSegments : rawSegments ? [rawSegments] : [];
  const normalized = segments
    .map((segment) => String(segment || "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return normalized.length > 0 ? `/api/${normalized.join("/")}` : "/api";
}

export default async function handler(req, res) {
  return backendApp.handleNodeRequest(req, res, {
    routeOverride: getRouteOverride(req.query)
  });
}
