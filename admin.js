const CONTENT_KEY = 'bea-admin-content-v1';
const EVENTS_KEY = 'bea-admin-events-v1';
const initialContent = [
  { id: 'c1', title: 'LUANAR takes it home', type: 'News', status: 'Published', updated: 'Oct 24, 2026', summary: 'Celebrating a remarkable debate victory, powered by our community.' },
  { id: 'c2', title: 'Resilient value chains for smallholder agriculture', type: 'Research', status: 'Published', updated: 'Oct 21, 2026', summary: 'Examining pathways to more productive, inclusive agricultural markets.' },
  { id: 'c3', title: 'Trip to MRA', type: 'Event', status: 'Published', updated: 'Oct 18, 2026', summary: 'An institutional visit connecting students to Malawi’s economic landscape.' },
  { id: 'c4', title: 'AgrinoPact partnership opens new possibilities', type: 'News', status: 'Draft', updated: 'Oct 16, 2026', summary: 'A meaningful collaboration that expands our network and practical reach.' },
  { id: 'c5', title: 'Resource stewardship and rural resilience', type: 'Research', status: 'Draft', updated: 'Oct 12, 2026', summary: 'An investigation into economic incentives for sustainable practice.' },
  { id: 'c6', title: 'Learning by doing: our research tools approach', type: 'News', status: 'Published', updated: 'Oct 08, 2026', summary: 'Building confidence in Stata, R, data analysis and academic writing.' }
];
const initialEvents = [
  { id: 'e1', title: 'Trip to MRA', date: '2026-11-18', category: 'Field visit' },
  { id: 'e2', title: 'Alumni Day', date: '2026-11-07', category: 'Alumni' },
  { id: 'e3', title: 'Banner & Certificate Presentation', date: '2026-09-09', category: 'Academic' },
  { id: 'e4', title: 'First Year’s Orientation Week', date: '2026-08-27', category: 'Orientation' }
];
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
let content = load(CONTENT_KEY, initialContent);
let events = load(EVENTS_KEY, initialEvents);
const rows = document.querySelector('#content-rows');
const search = document.querySelector('#content-search');
const filter = document.querySelector('#content-filter');
const toast = document.querySelector('#toast');
let toastTimer;
function save() {
  localStorage.setItem(CONTENT_KEY, JSON.stringify(content));
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}
function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
function renderContent() {
  const term = search.value.trim().toLowerCase();
  const status = filter.value;
  const visible = content.filter(item => item.title.toLowerCase().includes(term) && (status === 'all' || item.status === status));
  rows.innerHTML = visible.map(item => `<tr><td><span class="type-icon">${item.type === 'News' ? '▤' : item.type === 'Research' ? '⌕' : item.type === 'Event' ? '◷' : '▧'}</span>${escapeHtml(item.title)}</td><td>${escapeHtml(item.type)}</td><td><span class="status-pill ${item.status === 'Draft' ? 'draft' : ''}">${item.status}</span></td><td>${escapeHtml(item.updated)}</td><td><button class="row-actions" data-action="edit" data-id="${item.id}" aria-label="Edit ${escapeHtml(item.title)}">···</button></td></tr>`).join('') || '<tr><td colspan="5">No content matches this search.</td></tr>';
  document.querySelector('#stat-content').textContent = String(content.length).padStart(2, '0');
  document.querySelector('#content-nav-count').textContent = content.length;
  document.querySelector('#content-summary').textContent = `Showing ${visible.length} of ${content.length} items`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function renderEvents() {
  const today = new Date().toLocaleDateString('en-CA');
  const sorted = events.filter(event => event.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  document.querySelector('#event-list').innerHTML = sorted.slice(0, 4).map(event => {
    const date = new Date(`${event.date}T12:00:00`);
    const month = date.toLocaleString('en', { month: 'short' }).toUpperCase();
    return `<article class="event-item"><div class="event-date"><b>${String(date.getDate()).padStart(2, '0')}</b><small>${month} ${date.getFullYear()}</small></div><div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.category || 'BEA event')}</p></div><button class="delete-event" data-event-delete="${event.id}" aria-label="Remove ${escapeHtml(event.title)}">×</button></article>`;
  }).join('') || '<p class="empty-events">No upcoming events yet.</p>';
  document.querySelector('#stat-events').textContent = String(sorted.length).padStart(2, '0');
}
renderContent();
renderEvents();
document.querySelector('#today-label').textContent = new Date().toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
search.addEventListener('input', renderContent);
filter.addEventListener('change', renderContent);
const contentDialog = document.querySelector('#content-dialog');
const contentForm = document.querySelector('#content-form');
function openContent(item) {
  contentForm.reset();
  contentForm.elements.id.value = item?.id || '';
  contentForm.elements.title.value = item?.title || '';
  contentForm.elements.type.value = item?.type || 'News';
  contentForm.elements.status.value = item?.status || 'Draft';
  contentForm.elements.summary.value = item?.summary || '';
  document.querySelector('#dialog-title').textContent = item ? 'Edit content' : 'Create content';
  contentDialog.showModal();
}
document.querySelector('#new-content').addEventListener('click', () => openContent());
document.querySelector('#add-content').addEventListener('click', () => openContent());
rows.addEventListener('click', event => {
  const button = event.target.closest('[data-action="edit"]');
  if (!button) return;
  const item = content.find(entry => entry.id === button.dataset.id);
  if (item) openContent(item);
});
contentForm.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(contentForm);
  const id = data.get('id');
  const item = { id: id || `c${Date.now()}`, title: data.get('title').trim(), type: data.get('type'), status: data.get('status'), summary: data.get('summary').trim(), updated: new Date().toLocaleDateString('en', { month: 'short', day: '2-digit', year: 'numeric' }) };
  const index = content.findIndex(entry => entry.id === id);
  if (index >= 0) content[index] = item; else content.unshift(item);
  save(); renderContent(); contentDialog.close(); notify(id ? 'Content updated.' : 'Content created.');
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
const eventDialog = document.querySelector('#event-dialog');
document.querySelector('#add-event').addEventListener('click', () => eventDialog.showModal());
document.querySelector('#event-form').elements.date.min = new Date().toLocaleDateString('en-CA');
document.querySelector('#event-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  events.push({ id: `e${Date.now()}`, title: data.get('title').trim(), date: data.get('date'), category: data.get('category').trim() || 'BEA event' });
  save(); renderEvents(); eventDialog.close(); event.currentTarget.reset(); notify('Event added to your calendar.');
});
document.querySelector('#event-list').addEventListener('click', event => {
  const button = event.target.closest('[data-event-delete]');
  if (!button) return;
  events = events.filter(item => item.id !== button.dataset.eventDelete);
  save(); renderEvents(); notify('Event removed.');
});
document.querySelector('#settings-button').addEventListener('click', () => notify('Site settings are ready to connect to your website configuration.'));
document.querySelector('#profile-menu').addEventListener('click', () => notify('Signed in as BEA Admin.'));
document.querySelector('#mobile-menu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
document.querySelectorAll('.side-nav a[href^="#"]').forEach(link => link.addEventListener('click', () => document.querySelector('.sidebar').classList.remove('open')));
