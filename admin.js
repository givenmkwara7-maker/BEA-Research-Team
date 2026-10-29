const COLLECTIONS = {
  research: {
    singular: "research project",
    fields: ["category", "status", "summary", "details", "year"],
  },
  events: {
    singular: "event",
    fields: ["category", "date", "summary", "details"],
  },
  news: {
    singular: "news story",
    fields: ["category", "date", "summary", "details", "image"],
  },
  team: {
    singular: "team role",
    fields: ["category", "summary", "image"],
  },
  gallery: {
    singular: "gallery image",
    fields: ["category", "image"],
  },
};

const FIELD_LABELS = {
  category: "Category / label",
  status: "Project status",
  date: "Date",
  year: "Year",
  summary: "Description",
  details: "Full report / story details",
  image: "Image URL",
};

const BACKGROUND_PAGES = ["research", "events", "news", "team", "gallery"];

const profileForm = document.querySelector("#profile-form");
const itemDialog = document.querySelector("#item-dialog");
const itemForm = document.querySelector("#item-form");
const toast = document.querySelector("#toast");
const itemImagePreview = document.querySelector("#item-image-preview");
const backgroundsForm = document.querySelector("#backgrounds-form");
const inquiryList = document.querySelector("#inquiry-list");
const inquiryDialog = document.querySelector("#inquiry-dialog");
const inquiryReplyForm = document.querySelector("#inquiry-reply-form");
const savedIndicator = document.querySelector("#saved-indicator");
let siteData;
let inquiries = [];
let toastTimer;
let activeCollection;
let uploadedLogoData = "";
let electionAdminData = { members: [], elections: [] };
let pendingMemberCredentials = [];

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("toast-error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function setSaveState(state, message) {
  savedIndicator.classList.toggle("saving", state === "saving");
  savedIndicator.classList.toggle("error", state === "error");
  savedIndicator.lastChild.textContent = ` ${message}`;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    location.replace("admin-login.html");
    throw new Error("Your session has ended. Please sign in again.");
  }

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "The request could not be completed.");
  }
  return result;
}

function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value || "").replace(/[&<>"']/g, (character) => entities[character]);
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function populateProfile() {
  for (const [name, value] of Object.entries(siteData.profile)) {
    const field = profileForm.elements.namedItem(name);
    if (field && field.type !== "file") field.value = value || "";
  }
}

function updateBackgroundPreview(page, source) {
  const editor = document.querySelector(`[data-background-editor="${page}"]`);
  const preview = editor.querySelector(".background-preview");
  const image = preview.querySelector("img");
  const placeholder = preview.querySelector("span");
  image.hidden = !source;
  placeholder.hidden = Boolean(source);
  if (source) image.src = source;
  else image.removeAttribute("src");
}

function populateBackgrounds() {
  siteData.pageBackgrounds ||= {};
  for (const page of BACKGROUND_PAGES) {
    const source = siteData.pageBackgrounds[page] || "";
    const urlField = backgroundsForm.querySelector(`[data-background-url="${page}"]`);
    urlField.value = source.startsWith("data:image/") ? "" : source;
    updateBackgroundPreview(page, source);
  }
}

function renderCount() {
  for (const collection of Object.keys(COLLECTIONS)) {
    const count = document.querySelector(`#count-${collection}`);
    if (count) count.textContent = siteData[collection].length;
  }
}

function renderCollection(collection) {
  const target = document.querySelector(`#list-${collection}`);
  const records = siteData[collection];
  target.classList.toggle("gallery-managed", collection === "gallery");

  if (!records.length) {
    target.innerHTML = '<p class="empty-list">No items yet. Use the button above to add one.</p>';
    return;
  }

  target.replaceChildren();
  for (const item of records) {
    const row = document.createElement("article");
    row.className = "managed-item";

    const main = document.createElement("div");
    main.className = "managed-item-main";
    if (item.image) {
      const image = document.createElement("img");
      image.className = "managed-thumb";
      image.src = item.image;
      image.alt = "";
      image.loading = "lazy";
      main.append(image);
    }

    const copy = document.createElement("div");
    copy.className = "managed-item-copy";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const detail = document.createElement("small");
    detail.textContent = [item.category, item.status, item.date, item.year]
      .filter(Boolean)
      .join(" · ");
    copy.append(title, detail);
    main.append(copy);

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.action = "edit";
    edit.dataset.collection = collection;
    edit.dataset.id = item.id;
    edit.textContent = "Edit";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-item";
    remove.dataset.action = "delete";
    remove.dataset.collection = collection;
    remove.dataset.id = item.id;
    remove.textContent = "Delete";
    actions.append(edit, remove);
    row.append(main, actions);
    target.append(row);
  }
}

function renderAll() {
  siteData.trash ||= [];
  populateProfile();
  populateBackgrounds();
  renderCount();
  for (const collection of Object.keys(COLLECTIONS)) {
    renderCollection(collection);
  }
  renderTrash();
}

function renderTrash() {
  const target = document.querySelector("#list-trash");
  const entries = siteData.trash || [];
  target.replaceChildren();

  if (!entries.length) {
    target.innerHTML = '<p class="empty-list">Trash is empty. Deleted items will appear here so you can restore them.</p>';
    return;
  }

  for (const entry of [...entries].reverse()) {
    const row = document.createElement("article");
    row.className = "managed-item";

    const main = document.createElement("div");
    main.className = "managed-item-main";
    if (entry.item.image) {
      const image = document.createElement("img");
      image.className = "managed-thumb";
      image.src = entry.item.image;
      image.alt = "";
      image.loading = "lazy";
      main.append(image);
    }

    const copy = document.createElement("div");
    copy.className = "managed-item-copy";
    const title = document.createElement("strong");
    title.textContent = entry.item.title;
    const detail = document.createElement("small");
    const deleted = entry.deletedAt ? new Date(entry.deletedAt).toLocaleString() : "Date unavailable";
    detail.textContent = `${COLLECTIONS[entry.collection]?.singular || entry.collection} · Deleted ${deleted}`;
    copy.append(title, detail);
    main.append(copy);

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.dataset.action = "restore";
    restore.dataset.trashId = entry.trashId;
    restore.textContent = "Restore";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-item";
    remove.dataset.action = "permanent-delete";
    remove.dataset.trashId = entry.trashId;
    remove.textContent = "Delete forever";
    actions.append(restore, remove);
    row.append(main, actions);
    target.append(row);
  }
}

function renderInquiries() {
  inquiryList.replaceChildren();
  if (!inquiries.length) {
    inquiryList.innerHTML = '<p class="empty-list">No inquiries yet. Messages sent through the public form will appear here.</p>';
    return;
  }

  for (const inquiry of inquiries) {
    const card = document.createElement("article");
    card.className = "inquiry-card";

    const header = document.createElement("div");
    header.className = "inquiry-card-header";
    const identity = document.createElement("div");
    const subject = document.createElement("h3");
    subject.textContent = inquiry.subject;
    const sender = document.createElement("a");
    sender.className = "inquiry-sender";
    sender.href = `mailto:${inquiry.email}`;
    sender.textContent = `${inquiry.name} · ${inquiry.email}`;
    identity.append(subject, sender);
    const status = document.createElement("span");
    status.className = `inquiry-status ${inquiry.status === "replied" ? "replied" : "new"}`;
    status.textContent = inquiry.status === "replied" ? "Replied" : "New";
    header.append(identity, status);

    const message = document.createElement("p");
    message.className = "inquiry-message";
    message.textContent = inquiry.message;
    const actions = document.createElement("div");
    actions.className = "inquiry-actions";
    const date = document.createElement("span");
    date.className = "inquiry-date";
    date.textContent = inquiry.submittedAt
      ? new Date(inquiry.submittedAt).toLocaleString()
      : "Date unavailable";
    const reply = document.createElement("button");
    reply.type = "button";
    reply.className = "primary-button";
    reply.dataset.inquiryReply = inquiry.id;
    reply.textContent = inquiry.status === "replied" ? "Reply again" : "Reply";
    actions.append(date, reply);
    card.append(header, message, actions);

    for (const sentReply of inquiry.replies || []) {
      const history = document.createElement("p");
      history.className = "inquiry-reply-history";
      history.textContent = `Your reply · ${new Date(sentReply.sentAt).toLocaleString()}\n${sentReply.message}`;
      card.append(history);
    }
    inquiryList.append(card);
  }
}

async function refreshInquiries(showConfirmation = false) {
  const result = await request("/api/admin/inquiries");
  inquiries = result.inquiries;
  renderInquiries();
  if (showConfirmation) showToast("Inquiries refreshed.");
}

function openInquiryReply(inquiry) {
  inquiryReplyForm.elements.id.value = inquiry.id;
  inquiryReplyForm.elements.subject.value = /^re:/i.test(inquiry.subject)
    ? inquiry.subject
    : `Re: ${inquiry.subject}`;
  inquiryReplyForm.elements.message.value = "";
  document.querySelector("#inquiry-reply-title").textContent = inquiry.subject;
  document.querySelector("#inquiry-recipient").textContent = `To: ${inquiry.name} <${inquiry.email}>`;
  document.querySelector("#inquiry-original").textContent = inquiry.message;
  inquiryDialog.showModal();
}

async function saveSite(successMessage) {
  setSaveState("saving", "Saving changes…");
  try {
    await request("/api/admin/site", {
      method: "PUT",
      body: JSON.stringify(siteData),
    });
    setSaveState("saved", "All changes saved");
    if (successMessage) showToast(successMessage);
  } catch (error) {
    setSaveState("error", "Save failed");
    showToast(error.message, true);
  }
}

function setItemFormFields(collection) {
  const visibleFields = COLLECTIONS[collection].fields;
  for (const field of Object.keys(FIELD_LABELS)) {
    const wrap = document.querySelector(`#${field}-wrap`);
    const visible = visibleFields.includes(field);
    wrap.hidden = !visible;
    const input = itemForm.elements.namedItem(field);
    input.required =
      visible &&
      (["category", "date"].includes(field) ||
        (collection === "gallery" && field === "image"));
  }
}

function openItemEditor(collection, item = null) {
  activeCollection = collection;
  itemForm.reset();
  itemForm.elements.date.min = localDateString();
  setItemFormFields(collection);
  itemForm.elements.id.value = item?.id || "";
  itemForm.elements.title.value = item?.title || "";
  for (const field of Object.keys(FIELD_LABELS)) {
    itemForm.elements[field].value = item?.[field] || "";
  }
  updateItemImagePreview(item?.image || "");
  const config = COLLECTIONS[collection];
  document.querySelector("#item-kicker").textContent = collection.toUpperCase();
  document.querySelector("#item-dialog-title").textContent = item
    ? `Edit ${config.singular}`
    : `Add ${config.singular}`;
  itemDialog.showModal();
}

function updateItemImagePreview(source) {
  itemImagePreview.hidden = !source;
  if (source) itemImagePreview.src = source;
  else itemImagePreview.removeAttribute("src");
}

itemForm.elements.image.addEventListener("input", () => {
  itemForm.elements.imageFile.value = "";
  updateItemImagePreview(itemForm.elements.image.value.trim());
});

itemForm.elements.imageFile.addEventListener("change", async (event) => {
  const file = event.currentTarget.files[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showToast("Choose a JPG, PNG, or WebP photo.", true);
    event.currentTarget.value = "";
    return;
  }
  if (file.size > 700_000) {
    showToast("Please choose a photo smaller than 700 KB.", true);
    event.currentTarget.value = "";
    return;
  }
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("This photo could not be read."));
      reader.readAsDataURL(file);
    });
    itemForm.elements.image.value = dataUrl;
    updateItemImagePreview(dataUrl);
    showToast("Photo loaded. Click Save item to publish it.");
  } catch (error) {
    showToast(error.message, true);
    event.currentTarget.value = "";
  }
});

async function initialise() {
  try {
    const session = await request("/api/session");
    if (!session.authenticated) {
      location.replace("admin-login.html");
      return;
    }
    siteData = await request("/api/admin/site");
    siteData.trash ||= [];
    siteData.pageBackgrounds ||= {};
    renderAll();
    await refreshInquiries();
    await refreshElectionAdmin();
  } catch (error) {
    showToast(error.message, true);
  }
}

backgroundsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSite("Page backgrounds saved.");
});

document.querySelectorAll("[data-background-url]").forEach((input) => {
  input.addEventListener("input", () => {
    const page = input.dataset.backgroundUrl;
    const source = input.value.trim();
    siteData.pageBackgrounds[page] = source;
    document.querySelector(`[data-background-file="${page}"]`).value = "";
    updateBackgroundPreview(page, source);
  });
});

document.querySelectorAll("[data-background-file]").forEach((input) => {
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const page = input.dataset.backgroundFile;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast("Choose a JPG, PNG, or WebP background photo.", true);
      input.value = "";
      return;
    }
    if (file.size > 700_000) {
      showToast("Please choose a background photo smaller than 700 KB.", true);
      input.value = "";
      return;
    }
    try {
      const source = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("This background photo could not be read."));
        reader.readAsDataURL(file);
      });
      siteData.pageBackgrounds[page] = source;
      backgroundsForm.querySelector(`[data-background-url="${page}"]`).value = "";
      updateBackgroundPreview(page, source);
      showToast("Background photo loaded. Save page backgrounds to publish it.");
    } catch (error) {
      showToast(error.message, true);
      input.value = "";
    }
  });
});

document.querySelectorAll("[data-background-clear]").forEach((button) => {
  button.addEventListener("click", () => {
    const page = button.dataset.backgroundClear;
    siteData.pageBackgrounds[page] = "";
    backgroundsForm.querySelector(`[data-background-url="${page}"]`).value = "";
    backgroundsForm.querySelector(`[data-background-file="${page}"]`).value = "";
    updateBackgroundPreview(page, "");
  });
});

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(value.trim());
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error("The CSV has an unfinished quoted field.");
  if (rows.length < 2) throw new Error("The CSV needs a heading row and at least one member.");
  const rawHeaders = rows.shift().map((header) => header.replace(/^\uFEFF/, "").trim());
  const headers = rawHeaders.map((header) => header.toLowerCase().replace(/[\s_-]+/g, ""));
  const indexFor = (...names) => headers.findIndex((header) => names.includes(header));
  const memberIndex = indexFor("memberid", "id", "membershipid", "membernumber");
  const nameIndex = indexFor("name", "fullname", "membername");
  if (memberIndex < 0 || nameIndex < 0) throw new Error("The CSV must include memberId and name columns.");
  const optionalIndex = (...names) => indexFor(...names);
  return rows.map((columns) => {
    const knownHeaders = new Set([memberIndex, nameIndex,
      optionalIndex("email", "emailaddress"), optionalIndex("phone", "phonenumber", "mobile"),
      optionalIndex("programme", "program", "course"), optionalIndex("yearjoined", "joined", "year")]);
    const details = {};
    rawHeaders.forEach((header, index) => {
      if (knownHeaders.has(index) || !header || /password|passcode|secret/i.test(header)) return;
      const detail = (columns[index] || "").trim();
      if (detail) details[header.slice(0, 50)] = detail.slice(0, 500);
    });
    return {
      memberId: columns[memberIndex] || "",
      name: columns[nameIndex] || "",
      email: columns[optionalIndex("email", "emailaddress")] || "",
      phone: columns[optionalIndex("phone", "phonenumber", "mobile")] || "",
      programme: columns[optionalIndex("programme", "program", "course")] || "",
      yearJoined: columns[optionalIndex("yearjoined", "joined", "year")] || "",
      details,
    };
  }).filter((member) => member.memberId || member.name);
}

function downloadMemberCredentials(members) {
  if (!members.length) return;
  const headers = ["memberId", "name", "email", "temporaryPassword"];
  const csv = [headers, ...members.map((member) => headers.map((header) => member[header] || ""))]
    .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = element("a");
  link.href = url;
  link.download = `bea-voter-temporary-passwords-${localDateString()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function offerMemberCredentials(members) {
  pendingMemberCredentials = members;
  document.querySelector("#member-credential-message").textContent = `${members.length} temporary password${members.length === 1 ? " was" : "s were"} generated. Download now and share privately; the passwords cannot be viewed again here.`;
  document.querySelector("#member-credential-download").hidden = !members.length;
}

document.querySelector("#download-member-credentials").addEventListener("click", () => {
  downloadMemberCredentials(pendingMemberCredentials);
  pendingMemberCredentials = [];
  document.querySelector("#member-credential-download").hidden = true;
  showToast("Credential file downloaded. Store it securely and share it privately.");
});

document.querySelector("#download-roster-template").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob(["memberId,name,email,phone,programme,yearJoined\r\n"], { type: "text/csv;charset=utf-8" }));
  const link = element("a");
  link.href = url;
  link.download = "bea-member-roster-template.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

function renderElectionAdmin() {
  const count = electionAdminData.members.filter((member) => member.active).length;
  const countNode = document.querySelector("#election-roster-count");
  countNode.textContent = `${count} active eligible member${count === 1 ? "" : "s"} (${electionAdminData.members.length} total on record).`;
  const memberList = document.querySelector("#election-member-list");
  const visibleMembers = [...electionAdminData.members].sort((a, b) => a.name.localeCompare(b.name));
  memberList.innerHTML = visibleMembers.length ? visibleMembers.map((member) => `
    <div class="election-member-row ${member.active ? "" : "inactive"}">
      <div><strong>${escapeHtml(member.name)} · ${escapeHtml(member.memberId)}</strong><small>${escapeHtml([member.email, member.phone, member.programme, member.yearJoined && `Joined ${member.yearJoined}`, member.active ? "Eligible" : "Inactive"].filter(Boolean).join(" · "))}</small>${Object.keys(member.details || {}).length ? `<details><summary>Other member details</summary><small>${Object.entries(member.details).map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(value)}`).join(" · ")}</small></details>` : ""}</div>
      <div class="election-row-actions"><button type="button" data-member-reset="${escapeHtml(member.id)}">Reset password</button><button type="button" data-member-active="${member.active ? "false" : "true"}" data-member-id="${escapeHtml(member.id)}">${member.active ? "Deactivate" : "Reinstate"}</button><button type="button" data-member-delete="${escapeHtml(member.id)}">Delete details</button></div>
    </div>`).join("") : '<p class="empty-list">Import or add the eligible members to create voter accounts.</p>';

  const electionList = document.querySelector("#election-admin-list");
  electionList.innerHTML = electionAdminData.elections.length ? electionAdminData.elections.map((election) => {
    const turnoutPercent = election.eligibleCount ? Math.round((election.participationCount / election.eligibleCount) * 100) : 0;
    const resultsReady = election.status === "closed" || Date.parse(election.endsAt) <= Date.now();
    const results = resultsReady ? election.positions.map((position) => {
      const sorted = [...position.results].sort((a, b) => b.votes - a.votes);
      const tied = sorted.length > 1 && sorted[0].votes > 0 && sorted[0].votes === sorted[1].votes;
      return `<div><p>${escapeHtml(position.title)}</p>${sorted.map((candidate) => `<small>${escapeHtml(candidate.name)} — ${candidate.votes} vote${candidate.votes === 1 ? "" : "s"}</small>`).join("")}${tied ? '<small class="tie-warning">Tie recorded. Create a runoff ballot if required by the election rules.</small>' : ""}</div>`;
    }).join("") : "";
    const quorumWarning = resultsReady && election.quorumPercent > 0 && turnoutPercent < election.quorumPercent
      ? '<small class="quorum-warning">Quorum not reached. Check the constitution before confirming these results.</small>' : "";
    return `<article class="election-card">
      <div class="election-card-main"><strong>${escapeHtml(election.title)}</strong><small>${election.positions.map((position) => escapeHtml(position.title)).join(" · ")}</small><small>${new Date(election.startsAt).toLocaleString()} – ${new Date(election.endsAt).toLocaleString()}</small><small>Turnout: ${election.participationCount}/${election.eligibleCount} (${turnoutPercent}%) · Quorum: ${election.quorumPercent || 0}%</small><span class="election-status ${escapeHtml(election.status)}">${escapeHtml(election.status)}</span>${results ? `<div class="election-results">${quorumWarning}${results}</div>` : ""}</div>
      <div class="election-actions">${election.status === "draft" ? `<button type="button" data-election-status="open" data-election-id="${escapeHtml(election.id)}">Open voting</button>` : ""}${election.status === "open" ? `<button type="button" data-election-status="closed" data-election-id="${escapeHtml(election.id)}">Close voting</button>` : ""}</div>
    </article>`;
  }).join("") : '<p class="empty-list">No elections yet. Create a draft after importing the voter roster.</p>';
}

async function refreshElectionAdmin() {
  electionAdminData = await request("/api/admin/elections");
  renderElectionAdmin();
}

function addElectionPosition() {
  const position = element("article", "election-position-editor");
  position.innerHTML = '<label>Position title<input data-position-title required maxlength="100" placeholder="Treasurer" /></label><label>Candidates, one per line: Name | Member ID | optional statement<textarea data-position-candidates required rows="4" placeholder="Full Name | BEA003 | Candidate statement\nOther Name | BEA004 | Candidate statement"></textarea></label><button class="text-button" data-remove-position type="button">Remove position</button>';
  document.querySelector("#election-position-list").append(position);
}

function setElectionPositionRemoveButtons() {
  const editors = [...document.querySelectorAll(".election-position-editor")];
  editors.forEach((editor) => { editor.querySelector("[data-remove-position]").hidden = editors.length === 1; });
}

document.querySelector("#add-election-position").addEventListener("click", addElectionPosition);
document.querySelector("#election-position-list").addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove-position]");
  if (remove) {
    remove.closest(".election-position-editor").remove();
    setElectionPositionRemoveButtons();
  }
});

document.querySelector("#member-import-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = event.currentTarget.elements.roster.files[0];
  if (!file) return;
  try {
    const rows = parseCsv(await file.text());
    const result = await request("/api/admin/elections/members/import", { method: "POST", body: JSON.stringify({ members: rows }) });
    if (result.imported.length) offerMemberCredentials(result.imported);
    await refreshElectionAdmin();
    event.currentTarget.reset();
    showToast(`${result.imported.length} member${result.imported.length === 1 ? "" : "s"} added; ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped. Download the temporary passwords below.`);
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector("#member-add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const member = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await request("/api/admin/elections/members/import", { method: "POST", body: JSON.stringify({ members: [member] }) });
    if (!result.imported.length) throw new Error("That member ID is already on the roster.");
    offerMemberCredentials(result.imported);
    form.reset();
    await refreshElectionAdmin();
    showToast("Member added. Download the temporary password below and share it privately.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector("#election-create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const positions = [...document.querySelectorAll(".election-position-editor")].map((editor) => {
      const candidates = editor.querySelector("[data-position-candidates]").value.split(/\r?\n/).map((line) => {
        const [name = "", memberId = "", ...statement] = line.split("|").map((part) => part.trim());
        return { name, memberId, statement: statement.join(" | ") };
      }).filter((candidate) => candidate.name || candidate.memberId);
      return { title: editor.querySelector("[data-position-title]").value.trim(), candidates };
    });
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.startsAt = new Date(payload.startsAt).toISOString();
    payload.endsAt = new Date(payload.endsAt).toISOString();
    payload.quorumPercent = Number(payload.quorumPercent);
    payload.positions = positions;
    await request("/api/admin/elections", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    const positionsList = document.querySelector("#election-position-list");
    positionsList.innerHTML = `<article class="election-position-editor"><label>Position title<input data-position-title required maxlength="100" placeholder="Director" /></label><label>Candidates, one per line: Name | Member ID | optional statement<textarea data-position-candidates required rows="4" placeholder="Jane Banda | BEA001 | Candidate statement\nJohn Phiri | BEA002 | Candidate statement"></textarea></label><button class="text-button" data-remove-position type="button" hidden>Remove position</button></article>`;
    form.elements.quorumPercent.value = "0";
    await refreshElectionAdmin();
    showToast("Election saved as a draft. Review it, then open voting when ready.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.querySelector("#election-member-list").addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-member-delete]");
  if (deleteButton) {
    const member = electionAdminData.members.find((item) => item.id === deleteButton.dataset.memberDelete);
    if (!member || !confirm(`Permanently delete ${member.name}'s member details and sign-in account? This cannot be undone. Anonymous participation records are kept to prevent another ballot in completed elections.`)) return;
    try {
      await request(`/api/admin/elections/members/${encodeURIComponent(member.id)}`, { method: "DELETE" });
      await refreshElectionAdmin();
      showToast("Member details deleted. Anonymous election records were preserved.");
    } catch (error) { showToast(error.message, true); }
    return;
  }
  const resetButton = event.target.closest("[data-member-reset]");
  if (resetButton) {
    const member = electionAdminData.members.find((item) => item.id === resetButton.dataset.memberReset);
    if (!member || !confirm(`Create a new temporary password for ${member.name}? Their existing password will stop working.`)) return;
    try {
      const result = await request(`/api/admin/elections/members/${encodeURIComponent(member.id)}/reset-password`, { method: "POST", body: JSON.stringify({}) });
      offerMemberCredentials([result.credential]);
      showToast("Password reset. Download the new temporary password below and share it privately.");
    } catch (error) { showToast(error.message, true); }
    return;
  }
  const button = event.target.closest("[data-member-active]");
  if (!button) return;
  const active = button.dataset.memberActive === "true";
  const member = electionAdminData.members.find((item) => item.id === button.dataset.memberId);
  if (!member || !confirm(`${active ? "Reinstate" : "Remove"} ${member.name} ${active ? "as an eligible voter" : "from the eligible voter list"}? Historical ballots and participation counts will be kept.`)) return;
  try {
    await request(`/api/admin/elections/members/${encodeURIComponent(member.id)}/active`, { method: "POST", body: JSON.stringify({ active }) });
    await refreshElectionAdmin();
    showToast(active ? "Member reinstated." : "Member removed from the active roster.");
  } catch (error) { showToast(error.message, true); }
});

document.querySelector("#election-admin-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-election-status]");
  if (!button) return;
  const status = button.dataset.electionStatus;
  const election = electionAdminData.elections.find((item) => item.id === button.dataset.electionId);
  if (!election || !confirm(`${status === "open" ? "Open voting for" : "Close voting for"} “${election.title}”?`)) return;
  try {
    await request(`/api/admin/elections/${encodeURIComponent(election.id)}/status`, { method: "POST", body: JSON.stringify({ status }) });
    await refreshElectionAdmin();
    showToast(status === "open" ? "Election opened. Members can vote during the scheduled voting window." : "Voting closed. Admin can now review results.");
  } catch (error) { showToast(error.message, true); }
});

document.querySelector("#refresh-inquiries").addEventListener("click", async () => {
  try {
    await refreshInquiries(true);
  } catch (error) {
    showToast(error.message, true);
  }
});

inquiryList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-inquiry-reply]");
  if (!button) return;
  const inquiry = inquiries.find((item) => item.id === button.dataset.inquiryReply);
  if (inquiry) openInquiryReply(inquiry);
});

inquiryReplyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = inquiryReplyForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Sending…";
  try {
    const id = inquiryReplyForm.elements.id.value;
    const result = await request(`/api/admin/inquiries/${encodeURIComponent(id)}/reply`, {
      method: "POST",
      body: JSON.stringify({
        subject: inquiryReplyForm.elements.subject.value,
        message: inquiryReplyForm.elements.message.value,
      }),
    });
    const index = inquiries.findIndex((item) => item.id === result.inquiry.id);
    if (index >= 0) inquiries[index] = result.inquiry;
    renderInquiries();
    inquiryDialog.close();
    showToast("Reply sent through Brevo.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send reply";
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(profileForm);
  for (const [name, value] of formData.entries()) {
    if (!['logoFile', 'logo'].includes(name)) {
      siteData.profile[name] = String(value).trim();
    }
  }
  const logoUrl = profileForm.elements.logo.value.trim();
  if (uploadedLogoData) siteData.profile.logo = uploadedLogoData;
  else if (logoUrl) siteData.profile.logo = logoUrl;
  await saveSite("Main profile updated. The public site now uses your changes.");
});

profileForm.elements.logo.addEventListener("input", () => {
  uploadedLogoData = "";
  profileForm.elements.logoFile.value = "";
});

profileForm.elements.logoFile.addEventListener("change", async (event) => {
  const file = event.currentTarget.files[0];
  if (!file) return;
  if (file.size > 700_000) {
    showToast("Please choose a logo image smaller than 700 KB.", true);
    event.currentTarget.value = "";
    return;
  }
  try {
    uploadedLogoData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("This image could not be read."));
      reader.readAsDataURL(file);
    });
  } catch (error) {
    showToast(error.message, true);
    return;
  }
  profileForm.elements.logo.value = "";
  showToast("Logo loaded. Save the main profile to publish it.");
});

document.querySelectorAll("[data-add]").forEach((button) => {
  button.addEventListener("click", () => openItemEditor(button.dataset.add));
});

document.querySelectorAll(".managed-list").forEach((list) => {
  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, collection, id } = button.dataset;
    const item = siteData[collection].find((entry) => entry.id === id);

    if (action === "edit") {
      openItemEditor(collection, item);
      return;
    }

    if (!confirm(`Move “${item.title}” to Trash? You can restore it later.`)) return;
    siteData.trash ||= [];
    siteData.trash.push({
      trashId: crypto.randomUUID(),
      collection,
      deletedAt: new Date().toISOString(),
      item,
    });
    siteData[collection] = siteData[collection].filter((entry) => entry.id !== id);
    renderCollection(collection);
    renderCount();
    renderTrash();
    await saveSite("Item moved to Trash. You can restore it at any time.");
  });
});

document.querySelector("#list-trash").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const entry = siteData.trash.find((item) => item.trashId === button.dataset.trashId);
  if (!entry) return;

  if (button.dataset.action === "restore") {
    const restored = { ...entry.item };
    if (siteData[entry.collection].some((item) => item.id === restored.id)) {
      restored.id = `${entry.collection}-${crypto.randomUUID()}`;
    }
    siteData[entry.collection].unshift(restored);
    siteData.trash = siteData.trash.filter((item) => item.trashId !== entry.trashId);
    renderCollection(entry.collection);
    renderCount();
    renderTrash();
    await saveSite("Item restored to the public website.");
    return;
  }

  if (!confirm(`Permanently delete “${entry.item.title}”? This cannot be undone.`)) return;
  siteData.trash = siteData.trash.filter((item) => item.trashId !== entry.trashId);
  renderTrash();
  await saveSite("Item permanently deleted.");
});

itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(itemForm);
  const id = formData.get("id");
  const record = {
    id: id || `${activeCollection}-${crypto.randomUUID()}`,
    title: String(formData.get("title")).trim(),
  };
  for (const field of COLLECTIONS[activeCollection].fields) {
    record[field] = String(formData.get(field) || "").trim();
  }

  const records = siteData[activeCollection];
  const index = records.findIndex((item) => item.id === id);
  if (index < 0) records.unshift(record);
  else records[index] = record;

  itemDialog.close();
  renderCollection(activeCollection);
  renderCount();
  await saveSite(`${COLLECTIONS[activeCollection].singular} saved.`);
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  try {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    location.assign("admin-login.html");
  }
});

document.querySelector("#mobile-menu").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("open");
});

document.querySelectorAll(".side-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelector("#sidebar").classList.remove("open");
    document.querySelectorAll(".side-nav a").forEach((item) => {
      item.classList.toggle("active", item === link);
    });
  });
});

initialise();
