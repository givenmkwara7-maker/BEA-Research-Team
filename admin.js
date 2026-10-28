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

const profileForm = document.querySelector("#profile-form");
const itemDialog = document.querySelector("#item-dialog");
const itemForm = document.querySelector("#item-form");
const toast = document.querySelector("#toast");
const itemImagePreview = document.querySelector("#item-image-preview");
const savedIndicator = document.querySelector("#saved-indicator");
let siteData;
let toastTimer;
let activeCollection;
let uploadedLogoData = "";

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
    renderAll();
  } catch (error) {
    showToast(error.message, true);
  }
}

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
