const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "site-content.json");
const INQUIRIES_FILE = path.join(ROOT, "inquiries.json");
const ELECTIONS_FILE = path.join(ROOT, "elections.json");
const PORT = Number(process.env.PORT || 3000);
const USERNAME = process.env.ADMIN_USERNAME;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_COOKIE = "bea_admin_session";
const VOTER_COOKIE = "bea_voter_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 12_000_000;
const sessions = new Map();
const voterSessions = new Map();
const loginAttempts = new Map();
const voterLoginAttempts = new Map();
const inquiryAttempts = new Map();
let electionWriteQueue = Promise.resolve();
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
  "vote.html",
  "vote.css",
  "vote.js",
  "login.css",
  "login.js",
  "news.html",
  "pages.css",
  "elections-admin.css",
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

function readJson(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
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

async function loadInquiries() {
  try {
    const inquiries = JSON.parse(await fs.readFile(INQUIRIES_FILE, "utf8"));
    if (!Array.isArray(inquiries)) throw new Error("Inquiry data is invalid.");
    return inquiries;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveInquiries(inquiries) {
  const temporaryFile = `${INQUIRIES_FILE}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(inquiries, null, 2)}\n`, "utf8");
  await fs.rename(temporaryFile, INQUIRIES_FILE);
}

async function loadElectionStore() {
  try {
    const data = JSON.parse(await fs.readFile(ELECTIONS_FILE, "utf8"));
    if (!Array.isArray(data.members) || !Array.isArray(data.elections) ||
        !Array.isArray(data.participation) || !Array.isArray(data.ballots)) {
      throw new Error("Election data is invalid.");
    }
    return data;
  } catch (error) {
    if (error.code === "ENOENT") return { members: [], elections: [], participation: [], ballots: [] };
    throw error;
  }
}

async function updateElectionStore(update) {
  const operation = electionWriteQueue.then(async () => {
    const data = await loadElectionStore();
    const result = await update(data);
    const temporaryFile = `${ELECTIONS_FILE}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await fs.rename(temporaryFile, ELECTIONS_FILE);
    return result;
  });
  electionWriteQueue = operation.catch(() => {});
  return operation;
}

function getVoterSession(request) {
  const sessionId = getCookie(request, VOTER_COOKIE);
  const session = voterSessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    voterSessions.delete(sessionId);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function clearVoterCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${VOTER_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function isElectionOpen(election) {
  const now = Date.now();
  return election.status === "open" && Date.parse(election.startsAt) <= now &&
    now < Date.parse(election.endsAt);
}

function voterKey(memberId) {
  return crypto.createHash("sha256").update(String(memberId).trim().toLowerCase()).digest("hex");
}

function publicElection(election, hasVoted, eligible) {
  return {
    id: election.id,
    title: election.title,
    instructions: election.instructions || "",
    startsAt: election.startsAt,
    endsAt: election.endsAt,
    positions: election.positions.map((position) => ({
      id: position.id,
      title: position.title,
      candidates: position.candidates.map(({ id, name, statement }) => ({ id, name, statement })),
    })),
    hasVoted,
    eligible,
  };
}

function sanitizedMember(member) {
  return {
    id: member.id, memberId: member.memberId, name: member.name, email: member.email || "",
    phone: member.phone || "", programme: member.programme || "", yearJoined: member.yearJoined || "",
    details: member.details || {},
    active: member.active !== false,
  };
}

function allowInquiryFrom(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const recentAttempts = (inquiryAttempts.get(ip) || []).filter(
    (timestamp) => now - timestamp < windowMs,
  );
  if (recentAttempts.length >= 5) {
    inquiryAttempts.set(ip, recentAttempts);
    return false;
  }
  recentAttempts.push(now);
  inquiryAttempts.set(ip, recentAttempts);
  return true;
}

function sendBrevoEmail({ email, name, subject, message }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "BEA Research Team";
  if (!apiKey || !senderEmail) {
    throw new Error("Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL in the server environment.");
  }

  const payload = JSON.stringify({
    sender: { name: senderName, email: senderEmail },
    to: [{ email, name }],
    subject,
    textContent: message,
  });

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "api.brevo.com",
        path: "/v3/smtp/email",
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          if (responseBody.length < 4000) responseBody += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Brevo returned HTTP ${response.statusCode}. Check the API key and verified sender.`));
            return;
          }
          try {
            resolve(JSON.parse(responseBody));
          } catch {
            resolve({});
          }
        });
      },
    );
    request.setTimeout(15000, () => request.destroy(new Error("Brevo request timed out.")));
    request.on("error", reject);
    request.end(payload);
  });
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/inquiries" && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    if (!allowInquiryFrom(request.socket.remoteAddress || "unknown")) {
      sendJson(response, 429, { error: "Please wait before sending another enquiry." });
      return;
    }

    let submission;
    try {
      submission = await readJson(request, 12_000);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    if (typeof submission.website === "string" && submission.website.trim()) {
      sendJson(response, 201, { received: true });
      return;
    }

    const name = typeof submission.name === "string" ? submission.name.trim() : "";
    const email = typeof submission.email === "string" ? submission.email.trim() : "";
    const subject = typeof submission.subject === "string" ? submission.subject.trim() : "";
    const message = typeof submission.message === "string" ? submission.message.trim() : "";
    if (
      !name || name.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      !subject || subject.length > 180 ||
      !message || message.length > 5000
    ) {
      sendJson(response, 400, { error: "Please check your name, email address, subject, and message." });
      return;
    }

    const inquiry = {
      id: crypto.randomUUID(),
      name,
      email,
      subject,
      message,
      submittedAt: new Date().toISOString(),
      status: "new",
      replies: [],
    };
    try {
      const inquiries = await loadInquiries();
      inquiries.unshift(inquiry);
      await saveInquiries(inquiries);
      sendJson(response, 201, { received: true });
    } catch {
      sendJson(response, 500, { error: "We could not save your enquiry. Please try again later." });
    }
    return;
  }

  if (url.pathname === "/api/admin/inquiries" && request.method === "GET") {
    if (!requireSession(request, response)) return;
    try {
      const inquiries = await loadInquiries();
      inquiries.sort((first, second) => second.submittedAt.localeCompare(first.submittedAt));
      sendJson(response, 200, { inquiries });
    } catch {
      sendJson(response, 500, { error: "Inquiries could not be loaded." });
    }
    return;
  }

  const inquiryReplyRoute = url.pathname.match(/^\/api\/admin\/inquiries\/([^/]+)\/reply$/);
  if (inquiryReplyRoute && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    if (!requireSession(request, response)) return;
    let replyData;
    try {
      replyData = await readJson(request, 16_000);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    const subject = typeof replyData.subject === "string" ? replyData.subject.trim() : "";
    const message = typeof replyData.message === "string" ? replyData.message.trim() : "";
    if (!subject || subject.length > 180 || !message || message.length > 8000) {
      sendJson(response, 400, { error: "Enter a subject and a reply of up to 8,000 characters." });
      return;
    }

    try {
      const inquiries = await loadInquiries();
      const inquiry = inquiries.find((item) => item.id === inquiryReplyRoute[1]);
      if (!inquiry) {
        sendJson(response, 404, { error: "This inquiry could not be found." });
        return;
      }
      const sent = await sendBrevoEmail({
        email: inquiry.email,
        name: inquiry.name,
        subject,
        message,
      });
      const reply = {
        id: crypto.randomUUID(),
        subject,
        message,
        sentAt: new Date().toISOString(),
        brevoMessageId: sent.messageId || "",
      };
      inquiry.replies ||= [];
      inquiry.replies.push(reply);
      inquiry.status = "replied";
      await saveInquiries(inquiries);
      sendJson(response, 200, { inquiry });
    } catch (error) {
      const needsConfiguration = error.message.includes("not configured");
      sendJson(response, needsConfiguration ? 503 : 502, {
        error: error.message || "The reply could not be sent through Brevo.",
      });
    }
    return;
  }

  if (url.pathname === "/api/admin/elections" && request.method === "GET") {
    if (!requireSession(request, response)) return;
    try {
      const data = await loadElectionStore();
      const members = data.members.map(sanitizedMember);
      const elections = data.elections.map((election) => {
        const ballotSet = data.ballots.filter((ballot) => ballot.electionId === election.id);
        const participationCount = data.participation.filter((entry) => entry.electionId === election.id).length;
        const resultsVisible = election.status === "closed" || Date.parse(election.endsAt) <= Date.now();
        const positions = election.positions.map((position) => ({
          ...position,
          results: (resultsVisible ? position.candidates : []).map((candidate) => ({
            candidateId: candidate.id,
            name: candidate.name,
            votes: ballotSet.filter((ballot) => ballot.choices.some((choice) => choice.positionId === position.id && choice.candidateId === candidate.id)).length,
          })),
        }));
        return { ...election, positions, participationCount, eligibleCount: election.eligibleCountAtOpening ?? members.filter((member) => member.active).length };
      });
      sendJson(response, 200, { members, elections });
    } catch {
      sendJson(response, 500, { error: "Election information could not be loaded." });
    }
    return;
  }

  const memberActiveMatch = url.pathname.match(/^\/api\/admin\/elections\/members\/([\w-]+)\/active$/);
  if (memberActiveMatch && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    if (!requireSession(request, response)) return;
    try {
      const body = await readJson(request, 10_000);
      const member = await updateElectionStore((data) => {
        const record = data.members.find((item) => item.id === memberActiveMatch[1]);
        if (!record) throw new Error("Member not found.");
        record.active = Boolean(body.active);
        return sanitizedMember(record);
      });
      sendJson(response, 200, { member });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Member status could not be changed." });
    }
    return;
  }

  const memberResetMatch = url.pathname.match(/^\/api\/admin\/elections\/members\/([\w-]+)\/reset-password$/);
  if (memberResetMatch && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    if (!requireSession(request, response)) return;
    try {
      const result = await updateElectionStore((data) => {
        const member = data.members.find((item) => item.id === memberResetMatch[1]);
        if (!member) throw new Error("Member not found.");
        const password = crypto.randomBytes(9).toString("base64url");
        const salt = crypto.randomBytes(16);
        member.passwordSalt = salt.toString("hex");
        member.passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
        return { memberId: member.memberId, name: member.name, temporaryPassword: password };
      });
      for (const [sessionId, session] of voterSessions) {
        if (session.memberId === result.memberId) voterSessions.delete(sessionId);
      }
      sendJson(response, 200, { credential: result });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "The password could not be reset." });
    }
    return;
  }

  const memberDeleteMatch = url.pathname.match(/^\/api\/admin\/elections\/members\/([\w-]+)$/);
  if (memberDeleteMatch && request.method === "DELETE") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    if (!requireSession(request, response)) return;
    try {
      const deletedMemberId = await updateElectionStore((data) => {
        const index = data.members.findIndex((item) => item.id === memberDeleteMatch[1]);
        if (index < 0) throw new Error("Member not found.");
        const [member] = data.members.splice(index, 1);
        return member.memberId;
      });
      for (const [sessionId, session] of voterSessions) {
        if (session.memberId === deletedMemberId) voterSessions.delete(sessionId);
      }
      sendJson(response, 200, { deleted: true });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Member details could not be deleted." });
    }
    return;
  }

  if (url.pathname === "/api/admin/elections/members/import" && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    if (!requireSession(request, response)) return;
    try {
      const body = await readJson(request, 1_000_000);
      if (!Array.isArray(body.members) || body.members.length < 1 || body.members.length > 200) {
        sendJson(response, 400, { error: "Upload a roster with between 1 and 200 members." });
        return;
      }
      const credentials = await updateElectionStore((data) => {
        const knownIds = new Set(data.members.map((member) => member.memberId.toLowerCase()));
        const imported = [];
        for (const row of body.members) {
          const memberId = String(row.memberId || "").trim();
          const name = String(row.name || "").trim();
          const email = String(row.email || "").trim();
          const phone = String(row.phone || "").trim();
          const programme = String(row.programme || "").trim();
          const yearJoined = String(row.yearJoined || "").trim();
          const details = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {};
          if (!/^[\w.@+\/-]{2,80}$/.test(memberId) || name.length < 2 || name.length > 120 || email.length > 160 || phone.length > 40 || programme.length > 120 || yearJoined.length > 12 ||
              Object.entries(details).length > 40 || Object.entries(details).some(([key, value]) => !key || key.length > 50 || typeof value !== "string" || value.length > 500) ||
              (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
            throw new Error("Each roster row needs a valid member ID and name; email is optional.");
          }
          const key = memberId.toLowerCase();
          if (knownIds.has(key)) continue;
          knownIds.add(key);
          const password = crypto.randomBytes(9).toString("base64url");
          const salt = crypto.randomBytes(16);
          data.members.push({
            id: crypto.randomUUID(), memberId, name, email, phone, programme, yearJoined, details, active: true,
            passwordSalt: salt.toString("hex"),
            passwordHash: crypto.scryptSync(password, salt, 64).toString("hex"),
          });
          imported.push({ memberId, name, email, phone, programme, yearJoined, temporaryPassword: password });
        }
        return imported;
      });
      sendJson(response, 200, { imported: credentials, skipped: body.members.length - credentials.length });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "The roster could not be imported." });
    }
    return;
  }

  if (url.pathname === "/api/admin/elections" && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    if (!requireSession(request, response)) return;
    try {
      const body = await readJson(request, 1_000_000);
      const title = String(body.title || "").trim();
      const instructions = String(body.instructions || "").trim();
      const startsAt = new Date(body.startsAt).toISOString();
      const endsAt = new Date(body.endsAt).toISOString();
      const quorumPercent = Number(body.quorumPercent);
      if (title.length < 3 || title.length > 140 || instructions.length > 1000 || Date.parse(startsAt) >= Date.parse(endsAt) || !Number.isInteger(quorumPercent) || quorumPercent < 0 || quorumPercent > 100) {
        throw new Error("Enter a title and a valid voting window.");
      }
      if (!Array.isArray(body.positions) || body.positions.length < 1 || body.positions.length > 30) {
        throw new Error("Add at least one position to the election.");
      }
      const election = await updateElectionStore((data) => {
        const activeMemberIds = new Set(data.members.filter((member) => member.active !== false).map((member) => member.memberId.toLowerCase()));
        const positions = body.positions.map((position) => {
          const positionTitle = String(position.title || "").trim();
          if (!positionTitle || positionTitle.length > 100 || !Array.isArray(position.candidates) || position.candidates.length < 2 || position.candidates.length > 40) {
            throw new Error("Each position needs a title and at least two candidates.");
          }
          const candidateIds = new Set();
          const candidates = position.candidates.map((candidate) => {
            const name = String(candidate.name || "").trim();
            const memberId = String(candidate.memberId || "").trim();
            const statement = String(candidate.statement || "").trim();
            if (name.length < 2 || name.length > 120 || !activeMemberIds.has(memberId.toLowerCase()) || statement.length > 1000) {
              throw new Error(`Candidate ${name || "entry"} must match an active member in the roster.`);
            }
            const key = memberId.toLowerCase();
            if (candidateIds.has(key)) throw new Error("A candidate cannot be listed twice for the same position.");
            candidateIds.add(key);
            return { id: crypto.randomUUID(), name, memberId, statement };
          });
          return { id: crypto.randomUUID(), title: positionTitle, candidates };
        });
        const created = { id: crypto.randomUUID(), title, instructions, startsAt, endsAt, quorumPercent, status: "draft", positions, createdAt: new Date().toISOString() };
        data.elections.unshift(created);
        return created;
      });
      sendJson(response, 201, { election });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "The election could not be created." });
    }
    return;
  }

  const electionStatusMatch = url.pathname.match(/^\/api\/admin\/elections\/([\w-]+)\/status$/);
  if (electionStatusMatch && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    if (!requireSession(request, response)) return;
    try {
      const body = await readJson(request, 10_000);
      const election = await updateElectionStore((data) => {
        const record = data.elections.find((item) => item.id === electionStatusMatch[1]);
        if (!record) throw new Error("Election not found.");
        if (!["open", "closed"].includes(body.status)) throw new Error("Choose open or closed status.");
        if (body.status === "open") {
          if (!data.members.some((member) => member.active !== false)) throw new Error("Import the eligible member roster first.");
          if (Date.parse(record.endsAt) <= Date.now()) throw new Error("The closing time has passed. Create a new election with a future voting window.");
          if (record.status === "closed") throw new Error("A closed election cannot be reopened. Create a runoff election if needed.");
          if (record.positions.some((position) => position.candidates.some((candidate) => !data.members.some((member) => member.active !== false && member.memberId.toLowerCase() === candidate.memberId.toLowerCase())))) {
            throw new Error("Every candidate must be an active member.");
          }
          record.eligibleVoterKeysAtOpening ??= data.members.filter((member) => member.active !== false).map((member) => voterKey(member.memberId));
          record.eligibleCountAtOpening ??= record.eligibleVoterKeysAtOpening.length;
        }
        record.status = body.status;
        record.statusChangedAt = new Date().toISOString();
        return record;
      });
      sendJson(response, 200, { election });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Election status could not be changed." });
    }
    return;
  }

  if (url.pathname === "/api/vote/session" && request.method === "GET") {
    const session = getVoterSession(request);
    if (!session) {
      sendJson(response, 200, { authenticated: false, member: null });
      return;
    }
    try {
      const data = await loadElectionStore();
      const member = data.members.find((item) => item.memberId === session.memberId && item.active !== false);
      if (!member) {
        voterSessions.delete(getCookie(request, VOTER_COOKIE));
        sendJson(response, 200, { authenticated: false, member: null }, { "Set-Cookie": clearVoterCookie() });
        return;
      }
      sendJson(response, 200, { authenticated: true, member: { memberId: member.memberId, name: member.name } });
    } catch {
      sendJson(response, 500, { error: "Member account could not be checked." });
    }
    return;
  }

  if (url.pathname === "/api/vote/password" && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    const session = getVoterSession(request);
    if (!session) {
      sendJson(response, 401, { error: "Please sign in again." });
      return;
    }
    try {
      const body = await readJson(request, 10_000);
      const password = String(body.password || "");
      if (password.length < 12 || password.length > 256) throw new Error("Use a password between 12 and 256 characters.");
      await updateElectionStore((data) => {
        const member = data.members.find((item) => item.memberId === session.memberId && item.active !== false);
        if (!member) throw new Error("This member account is no longer active.");
        const salt = crypto.randomBytes(16);
        member.passwordSalt = salt.toString("hex");
        member.passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
      });
      const currentSessionId = getCookie(request, VOTER_COOKIE);
      for (const [sessionId, voterSession] of voterSessions) {
        if (sessionId !== currentSessionId && voterSession.memberId === session.memberId) voterSessions.delete(sessionId);
      }
      sendJson(response, 200, { updated: true });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "The password could not be changed." });
    }
    return;
  }

  if (url.pathname === "/api/vote/login" && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    const ip = request.socket.remoteAddress || "unknown";
    const attempt = voterLoginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
    if (attempt.blockedUntil > Date.now()) {
      sendJson(response, 429, { error: "Too many attempts. Try again in 15 minutes." });
      return;
    }
    try {
      const credentials = await readJson(request, 10_000);
      const memberId = String(credentials.memberId || "").trim();
      const password = String(credentials.password || "");
      const data = await loadElectionStore();
      const member = data.members.find((item) => item.memberId.toLowerCase() === memberId.toLowerCase() && item.active !== false);
      const salt = Buffer.from(member?.passwordSalt || "", "hex");
      const storedHash = Buffer.from(member?.passwordHash || "", "hex");
      const suppliedHash = crypto.scryptSync(password.slice(0, 256), salt.length ? salt : Buffer.alloc(16), 64);
      if (!member || password.length > 256 || storedHash.length !== suppliedHash.length || !crypto.timingSafeEqual(suppliedHash, storedHash)) {
        attempt.count += 1;
        if (attempt.count >= 5) {
          attempt.count = 0;
          attempt.blockedUntil = Date.now() + 15 * 60 * 1000;
        }
        voterLoginAttempts.set(ip, attempt);
        sendJson(response, 401, { error: "That member ID or password is not correct." });
        return;
      }
      voterLoginAttempts.delete(ip);
      const sessionId = crypto.randomBytes(32).toString("base64url");
      voterSessions.set(sessionId, { memberId: member.memberId, name: member.name, expiresAt: Date.now() + SESSION_TTL_MS });
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      sendJson(response, 200, { authenticated: true, member: { memberId: member.memberId, name: member.name } }, {
        "Set-Cookie": `${VOTER_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${secure}`,
      });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Could not sign in." });
    }
    return;
  }

  if (url.pathname === "/api/vote/elections" && request.method === "GET") {
    const session = getVoterSession(request);
    if (!session) {
      sendJson(response, 401, { error: "Sign in with your member account to view ballots." });
      return;
    }
    try {
      const data = await loadElectionStore();
      const member = data.members.find((item) => item.memberId === session.memberId && item.active !== false);
      if (!member) {
        voterSessions.delete(getCookie(request, VOTER_COOKIE));
        sendJson(response, 401, { error: "This member account is no longer active." }, { "Set-Cookie": clearVoterCookie() });
        return;
      }
      const elections = data.elections.filter((election) =>
        (election.status === "open" || election.status === "closed") &&
        Array.isArray(election.eligibleVoterKeysAtOpening) && election.eligibleVoterKeysAtOpening.includes(voterKey(session.memberId)),
      ).map((election) => {
        const hasVoted = data.participation.some((entry) => entry.electionId === election.id && entry.voterKey === voterKey(session.memberId));
        return { ...publicElection(election, hasVoted, true), openNow: isElectionOpen(election) };
      });
      sendJson(response, 200, { elections });
    } catch {
      sendJson(response, 500, { error: "Ballots could not be loaded." });
    }
    return;
  }

  const ballotMatch = url.pathname.match(/^\/api\/vote\/elections\/([\w-]+)\/ballot$/);
  if (ballotMatch && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    const session = getVoterSession(request);
    if (!session) {
      sendJson(response, 401, { error: "Please sign in again." });
      return;
    }
    try {
      const body = await readJson(request, 30_000);
      const receipt = await updateElectionStore((data) => {
        if (!data.members.some((member) => member.memberId === session.memberId && member.active !== false)) {
          throw new Error("This member account is no longer active.");
        }
        const election = data.elections.find((item) => item.id === ballotMatch[1]);
        if (!election || !isElectionOpen(election)) throw new Error("This election is not currently open for voting.");
        const anonymousVoterKey = voterKey(session.memberId);
        if (!Array.isArray(election.eligibleVoterKeysAtOpening) || !election.eligibleVoterKeysAtOpening.includes(anonymousVoterKey)) {
          throw new Error("Your member account was not on the eligible voter list when this election opened.");
        }
        if (data.participation.some((entry) => entry.electionId === election.id && entry.voterKey === anonymousVoterKey)) {
          throw new Error("Your ballot has already been recorded for this election.");
        }
        if (!body.choices || typeof body.choices !== "object" || Array.isArray(body.choices) || Object.keys(body.choices).length !== election.positions.length) {
          throw new Error("Choose one candidate for every position before submitting.");
        }
        const choices = election.positions.map((position) => {
          const candidateId = body.choices[position.id];
          if (!position.candidates.some((candidate) => candidate.id === candidateId)) throw new Error(`Choose one valid candidate for ${position.title}.`);
          return { positionId: position.id, candidateId };
        });
        // Keep the participation record separate from the anonymous ballot.
        data.participation.push({ electionId: election.id, voterKey: anonymousVoterKey, votedAt: new Date().toISOString() });
        const ballot = { electionId: election.id, choices };
        data.ballots.splice(crypto.randomInt(data.ballots.length + 1), 0, ballot);
        return crypto.randomBytes(12).toString("hex");
      });
      sendJson(response, 201, { recorded: true, receipt });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Your vote could not be recorded." });
    }
    return;
  }

  if (url.pathname === "/api/vote/logout" && request.method === "POST") {
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin was rejected." });
      return;
    }
    voterSessions.delete(getCookie(request, VOTER_COOKIE));
    sendJson(response, 200, { authenticated: false }, { "Set-Cookie": clearVoterCookie() });
    return;
  }

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
