const header = document.querySelector('.site-header');
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');

addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 10));
menu.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', open);
  menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});

// The home-page previews lead to their dedicated content pages.
const pageLinks = {
  'View all publications': 'research.html',
  'View calendar': 'events.html',
  'Explore gallery': 'gallery.html',
  'All news': 'news.html',
  'Meet the executive': 'team.html',
  'Register your interest': 'events.html'
};
document.querySelectorAll('a').forEach(link => {
  const label = link.textContent.trim().replace(/[→↓]/g, '').trim();
  if (pageLinks[label]) link.href = pageLinks[label];
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => nav.classList.remove('open')));

const search = document.querySelector('#publication-search');
const filters = document.querySelectorAll('.filter');
const cards = document.querySelectorAll('.publication-card');
const emptyState = document.querySelector('.empty-state');
let activeFilter = 'all';
function filterPublications() {
  const term = search.value.toLowerCase().trim();
  let shown = 0;
  cards.forEach(card => {
    const visible = (activeFilter === 'all' || card.dataset.category === activeFilter) && card.dataset.search.includes(term);
    card.hidden = !visible;
    if (visible) shown++;
  });
  emptyState.hidden = shown > 0;
}
search.addEventListener('input', filterPublications);
filters.forEach(button => button.addEventListener('click', () => {
  filters.forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  activeFilter = button.dataset.filter;
  filterPublications();
}));

const lightbox = document.querySelector('.lightbox');
const lightboxImage = lightbox.querySelector('img');
const lightboxCaption = lightbox.querySelector('p');
document.querySelectorAll('.gallery-item').forEach(item => item.addEventListener('click', () => {
  const image = item.querySelector('img');
  lightboxImage.src = image.src;
  lightboxImage.alt = image.alt;
  lightboxCaption.textContent = item.dataset.caption;
  lightbox.showModal();
}));
document.querySelector('.close-lightbox').addEventListener('click', () => lightbox.close());
lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });

document.querySelector('#contact-form').addEventListener('submit', event => {
  event.preventDefault();
  const message = event.currentTarget.querySelector('.form-message');
  message.textContent = 'Thank you — your enquiry is ready to be sent to the BEA Research Team.';
  event.currentTarget.reset();
});
