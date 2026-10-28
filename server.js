const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "site-content.json");
const PORT = Number(process.env.PORT || 3000);
const USERNAME = process.env.ADMIN_USERNAME;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_COOKIE = "bea_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 12_000_000;
const sessions = new Map();
const loginAttempts = new Map();
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const PUBLIC_FILES = new Set([
  "admin-login.html",
  "admin.html",
  "admin.css",
  "admin.js",
  "bea-logo.jpg",
  "events.html",
  "gallery.html",
  "index.html",
  "login.css",
  "login.js",
  "news.html",
  "pages.css",
  "research.html",
  "script.js",
  "site-content.js",
  "styles.css",
  "team.html",
]);

if (!USERNAME || !PASSWORD || PASSWORD.length < 12) {
  console.error(
    "Set ADMIN_USERNAME and an ADMIN_PASSWORD of at least 12 characters before starting the BEA site server.",
  );
  process.exit(1);
}

const passwordSalt = crypto.randomBytes(16);
const configuredPassword = crypto.scryptSync(PASSWORD, passwordSalt, 64);

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function hasSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function getCookie(request, name) {
  const cookies = request.headers.cookie || "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

function getSession(request) {
  const sessionId = getCookie(request, SESSION_COOKIE);
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function requireSession(request, response) {
  if (!getSession(request)) {
    sendJson(response, 401, { error: "Please sign in again." });
    return false;
  }
  return true;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Request must contain valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function validSiteData(data) {
  const collections = ["research", "events", "news", "team", "gallery"];
  if (!data || typeof data !== "object" || !data.profile) return false;
  if (typeof data.profile !== "object") return false;
  if (!data.profile.name || !data.profile.shortName || !data.profile.logo) return false;
  const validCollections = collections.every(
    (name) => Array.isArray(data[name]) && data[name].length <= 200,
  );
  if (!validCollections) return false;
  if (data.pageBackgrounds !== undefined) {
    const backgroundPages = ["research", "events", "news", "team", "gallery"];
    if (
      !data.pageBackgrounds ||
      typeof data.pageBackgrounds !== "object" ||
      Array.isArray(data.pageBackgrounds) ||
      Object.entries(data.pageBackgrounds).some(
        ([page, image]) => !backgroundPages.includes(page) || typeof image !== "string" || image.length > 1_000_000,
      )
    ) {
      return false;
    }
  }
  if (data.trash === undefined) return true;
  return (
    Array.isArray(data.trash) &&
    data.trash.length <= 500 &&
    data.trash.every(
      (entry) =>
        entry &&
        typeof entry.trashId === "string" &&
        collections.includes(entry.collection) &&
        entry.item &&
        typeof entry.item.id === "string" &&
        typeof entry.item.title === "string",
    )
  );
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/session" && request.method === "GET") {
    sendJson(response, 200, { authenticated: Boolean(getSession(request)) });
    return;
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    const ip = request.socket.remoteAddress || "unknown";
    const attempt = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
    if (attempt.blockedUntil > Date.now()) {
      sendJson(response, 429, { error: "Too many attempts. Try again in 15 minutes." });
      return;
    }

    let credentials;
    try {
      credentials = await readJson(request);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }

    if (!credentials || typeof credentials !== "object") {
      sendJson(response, 400, { error: "Enter a username and password." });
      return;
    }

    const password = typeof credentials.password === "string" ? credentials.password : "";
    if (password.length > 256) {
      sendJson(response, 400, { error: "Password is too long." });
      return;
    }
    const candidate = crypto.scryptSync(password, passwordSalt, 64);
    const usernameMatches = credentials.username === USERNAME;
    const passwordMatches = crypto.timingSafeEqual(candidate, configuredPassword);
    if (!usernameMatches || !passwordMatches) {
      attempt.count += 1;
      if (attempt.count >= 5) {
        attempt.count = 0;
        attempt.blockedUntil = Date.now() + 15 * 60 * 1000;
      }
      loginAttempts.set(ip, attempt);
      sendJson(response, 401, { error: "That username or password is not correct." });
      return;
    }

    loginAttempts.delete(ip);
    const sessionId = crypto.randomBytes(32).toString("base64url");
    sessions.set(sessionId, { expiresAt: Date.now() + SESSION_TTL_MS });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    sendJson(
      response,
      200,
      { authenticated: true },
      {
        "Set-Cookie": `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${secure}`,
      },
    );
    return;
  }

  if (url.pathname === "/api/logout" && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    sessions.delete(getCookie(request, SESSION_COOKIE));
    sendJson(response, 200, { authenticated: false }, { "Set-Cookie": clearSessionCookie() });
    return;
  }

  if (url.pathname === "/api/site" && request.method === "GET") {
    try {
      const site = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
      delete site.trash;
      sendJson(response, 200, site);
    } catch {
      sendJson(response, 500, { error: "Site content could not be loaded." });
    }
    return;
  }

  if (url.pathname === "/api/admin/site" && request.method === "GET") {
    if (!requireSession(request, response)) return;
    try {
      const site = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
      site.trash ||= [];
      sendJson(response, 200, site);
    } catch {
      sendJson(response, 500, { error: "Site content could not be loaded." });
    }
    return;
  }

  if (url.pathname === "/api/admin/site" && request.method === "PUT") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    if (!requireSession(request, response)) return;
    let site;
    try {
      site = await readJson(request);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    if (!validSiteData(site)) {
      sendJson(response, 400, { error: "The site content is incomplete or invalid." });
      return;
    }
    try {
      const temporaryFile = `${DATA_FILE}.${crypto.randomBytes(8).toString("hex")}.tmp`;
      await fs.writeFile(temporaryFile, `${JSON.stringify(site, null, 2)}\n`, "utf8");
      await fs.rename(temporaryFile, DATA_FILE);
      sendJson(response, 200, { saved: true });
    } catch {
      sendJson(response, 500, { error: "Site content could not be saved." });
    }
    return;
  }

  sendJson(response, 404, { error: "API endpoint not found." });
}

async function serveFile(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/admin.html" && !getSession(request)) {
    response.writeHead(303, {
      Location: "/admin-login.html",
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }
  const publicName = pathname.replace(/^\//, "");
  if (!PUBLIC_FILES.has(publicName)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("File not found");
    return;
  }
  const filename = path.resolve(ROOT, `.${pathname}`);
  if (!filename.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await fs.readFile(filename);
    response.writeHead(200, {
      "Cache-Control":
        /\.(html|css|js)$/i.test(filename) ? "no-cache" : "public, max-age=300",
      "Content-Type": MIME_TYPES[path.extname(filename).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("File not found");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
  } else if (request.method === "GET" || request.method === "HEAD") {
    await serveFile(request, response, url);
  } else {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
  }
});

server.listen(PORT, () => {
  console.log(`BEA Research Team is running at http://localhost:${PORT}`);
});
