const header = document.querySelector(".site-header");
const menu = document.querySelector(".menu-toggle");
const nav = document.querySelector(".main-nav");

if (header) {
  addEventListener("scroll", () => header.classList.toggle("scrolled", scrollY > 10));
}

if (menu && nav) {
  menu.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menu.setAttribute("aria-expanded", open);
    menu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => nav.classList.remove("open"));
  });
}

const pageLinks = {
  "View all publications": "research.html",
  "View calendar": "events.html",
  "Explore gallery": "gallery.html",
  "All news": "news.html",
  "Meet the executive": "team.html",
  "Register your interest": "events.html",
};

document.querySelectorAll("a").forEach((link) => {
  const label = link.textContent.trim().replace(/[→↓]/g, "").trim();
  if (pageLinks[label]) link.href = pageLinks[label];
});

function filterPublications() {
  const search = document.querySelector("#publication-search");
  const emptyState = document.querySelector(".empty-state");
  const term = search?.value.toLowerCase().trim() || "";
  const activeFilter = document.querySelector(".filter.active")?.dataset.filter || "all";
  const cards = document.querySelectorAll(".publication-card");
  let shown = 0;

  cards.forEach((card) => {
    const categoryMatches =
      activeFilter === "all" || card.dataset.category?.includes(activeFilter);
    const searchMatches = card.dataset.search?.includes(term) ?? true;
    card.hidden = !(categoryMatches && searchMatches);
    if (!card.hidden) shown += 1;
  });

  if (emptyState) emptyState.hidden = shown > 0;
}

const publicationSearch = document.querySelector("#publication-search");
if (publicationSearch) {
  publicationSearch.addEventListener("input", filterPublications);
  document.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      filterPublications();
    });
  });
  document.addEventListener("bea:content-loaded", filterPublications);
}

const lightbox = document.querySelector(".lightbox");
if (lightbox) {
  const lightboxImage = lightbox.querySelector("img");
  const lightboxCaption = lightbox.querySelector("p");

  document.addEventListener("click", (event) => {
    const item = event.target.closest(".gallery-item");
    if (!item) return;
    const image = item.querySelector("img");
    if (!image) return;

    lightboxImage.src = image.src;
    lightboxImage.alt = image.alt;
    lightboxCaption.textContent = item.dataset.caption || image.alt;
    lightbox.showModal();
  });

  lightbox.querySelector(".close-lightbox")?.addEventListener("click", () => {
    lightbox.close();
  });
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) lightbox.close();
  });
}

const contactForm = document.querySelector("#contact-form");
if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = contactForm.querySelector(".form-message");
    message.textContent =
      "Thank you — your enquiry is ready to be sent to the BEA Research Team.";
    contactForm.reset();
  });
}
