const loginCard = document.querySelector("#vote-login-card");
const loginForm = document.querySelector("#vote-login-form");
const memberArea = document.querySelector("#vote-member-area");
const electionList = document.querySelector("#vote-election-list");
const toastNode = document.querySelector("#vote-toast");
let toastTimeout;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function showToast(message, isError = false) {
  toastNode.textContent = message;
  toastNode.classList.toggle("error", isError);
  toastNode.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastNode.classList.remove("show"), 3600);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

function setLoginError(message) {
  const error = document.querySelector("#vote-login-error");
  error.textContent = message;
  error.hidden = !message;
}

async function loadElections() {
  const { elections } = await api("/api/vote/elections");
  if (!elections.length) {
    electionList.innerHTML = '<p class="vote-no-open">There are no elections available at the moment. Check again when the election administrator opens voting.</p>';
    return;
  }
  electionList.innerHTML = elections.map(renderElection).join("");
}

function renderElection(election) {
  const windowText = `Voting window: ${new Date(election.startsAt).toLocaleString()} to ${new Date(election.endsAt).toLocaleString()}.`;
  if (election.hasVoted) {
    return `<article class="vote-election-card"><p class="eyebrow">BALLOT RECEIVED</p><h2>${escapeHtml(election.title)}</h2><p class="vote-submitted">Your ballot has been recorded. You cannot submit another ballot for this election.</p><p class="vote-window">${escapeHtml(windowText)}</p></article>`;
  }
  if (!election.openNow) {
    const message = Date.now() < Date.parse(election.startsAt)
      ? `Voting has not opened yet. ${windowText}`
      : `Voting has closed. Contact the election administrator if you believe you are eligible to vote. ${windowText}`;
    return `<article class="vote-election-card"><p class="eyebrow">${Date.now() < Date.parse(election.startsAt) ? "SCHEDULED" : "CLOSED"}</p><h2>${escapeHtml(election.title)}</h2><p class="vote-closed">${escapeHtml(message)}</p></article>`;
  }
  const positions = election.positions.map((position) => `
    <fieldset class="vote-position">
      <legend class="visually-hidden">${escapeHtml(position.title)}</legend>
      <h3>${escapeHtml(position.title)}</h3>
      ${position.candidates.map((candidate) => `
        <label class="vote-candidate">
          <input type="radio" name="${escapeHtml(position.id)}" value="${escapeHtml(candidate.id)}" required />
          <span><strong>${escapeHtml(candidate.name)}</strong>${candidate.statement ? `<small>${escapeHtml(candidate.statement)}</small>` : ""}</span>
        </label>`).join("")}
    </fieldset>`).join("");
  return `<article class="vote-election-card" data-election-card="${escapeHtml(election.id)}">
    <p class="eyebrow">VOTING OPEN</p><h2>${escapeHtml(election.title)}</h2>
    ${election.instructions ? `<p>${escapeHtml(election.instructions)}</p>` : ""}
    <p class="vote-window">${escapeHtml(windowText)} Select one candidate for every position. Your choices cannot be changed after submission.</p>
    <form class="member-ballot-form" data-election-id="${escapeHtml(election.id)}">${positions}
      <button class="button" type="submit">Submit my secret ballot <span>→</span></button>
    </form>
  </article>`;
}

async function showMemberArea(member) {
  loginCard.hidden = true;
  memberArea.hidden = false;
  document.querySelector("#vote-member-name").textContent = `${member.name} (${member.memberId})`;
  await loadElections();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = loginForm.querySelector("button[type=submit]");
  submit.disabled = true;
  setLoginError("");
  try {
    const credentials = Object.fromEntries(new FormData(loginForm).entries());
    const result = await api("/api/vote/login", { method: "POST", body: JSON.stringify(credentials) });
    loginForm.reset();
    await showMemberArea(result.member);
  } catch (error) {
    setLoginError(error.message);
  } finally { submit.disabled = false; }
});

document.querySelector("#vote-election-list").addEventListener("submit", async (event) => {
  const form = event.target.closest(".member-ballot-form");
  if (!form) return;
  event.preventDefault();
  if (!confirm("Submit this ballot? Your choices are final, and you cannot vote again in this election.")) return;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const entries = [...new FormData(form).entries()];
    const choices = Object.fromEntries(entries);
    const electionId = form.dataset.electionId;
    await api(`/api/vote/elections/${encodeURIComponent(electionId)}/ballot`, { method: "POST", body: JSON.stringify({ choices }) });
    await loadElections();
    showToast("Your ballot was received.");
  } catch (error) {
    showToast(error.message, true);
    submit.disabled = false;
  }
});

document.querySelector("#vote-sign-out").addEventListener("click", async () => {
  try { await api("/api/vote/logout", { method: "POST", body: JSON.stringify({}) }); }
  catch { /* The local panel still signs out if the session already ended. */ }
  memberArea.hidden = true;
  loginCard.hidden = false;
  setLoginError("");
});

document.querySelector("#change-password-toggle").addEventListener("click", () => {
  const form = document.querySelector("#vote-password-form");
  form.hidden = !form.hidden;
  if (!form.hidden) form.elements.password.focus();
});

document.querySelector("#vote-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector("#vote-password-error");
  const button = form.querySelector("button[type=submit]");
  error.hidden = true;
  button.disabled = true;
  try {
    await api("/api/vote/password", { method: "POST", body: JSON.stringify({ password: form.elements.password.value }) });
    form.reset();
    form.hidden = true;
    showToast("Your password has been updated.");
  } catch (problem) {
    error.textContent = problem.message;
    error.hidden = false;
  } finally { button.disabled = false; }
});

async function restoreVoterSession() {
  try {
    const session = await api("/api/vote/session");
    if (session.authenticated) await showMemberArea(session.member);
  } catch (error) {
    setLoginError(error.message);
  }
}

restoreVoterSession();
