const contentCollections = ["research", "events", "news", "team", "gallery"];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setText(selector, value, parent = document) {
  const node = parent.querySelector(selector);
  if (node && value) node.textContent = value;
}

function toLocalDate(dateValue) {
  return new Date(`${dateValue}T12:00:00`);
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatEventDate(dateValue) {
  const date = toLocalDate(dateValue);
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: date.toLocaleString("en", { month: "short" }).toUpperCase(),
    year: date.getFullYear(),
  };
}

function updateProfile(profile) {
  const heroBackdrop = document.querySelector("#hero-backdrop");
  if (heroBackdrop && profile.heroImage) {
    heroBackdrop.style.backgroundImage =
      `linear-gradient(90deg, #092b28e8 0%, #123e39c0 42%, #123e391c 100%), url(${JSON.stringify(profile.heroImage)})`;
  }
  document.querySelectorAll(".brand-logo, .admin-brand img").forEach((image) => {
    image.src = profile.logo;
    image.alt = `${profile.name} logo`;
  });
  document.querySelectorAll(".brand strong").forEach((name) => {
    name.textContent = profile.shortName;
  });
  setText(".utility-bar .container span", profile.campus);
  setText("#hero-eyebrow", profile.heroEyebrow);
  setText("#hero-title", profile.heroTitle);
  setText("#hero-copy", profile.heroCopy);
  setText("#about h2", profile.aboutTitle);
  setText("#about .lead", profile.aboutCopy);
  setText(".footer-top > p", `${profile.shortName}. ${profile.tagline}`);
  document.querySelectorAll(".contact-email").forEach((link) => {
    link.href = `mailto:${profile.contactEmail}`;
  });
  document.title = `${profile.shortName} Research Team | ${profile.campus}`;
}

function renderResearch(research) {
  document.querySelectorAll(".publication-grid").forEach((grid) => {
    grid.replaceChildren();
    for (const item of research) {
      const card = element("article", "publication-card");
      const category = (item.category || "").toLowerCase();
      card.dataset.category = category.includes("agric")
        ? "agriculture"
        : category.includes("environment")
          ? "environment"
          : category.includes("development")
            ? "development"
            : category;
      card.dataset.search = `${item.title} ${item.category} ${item.summary}`.toLowerCase();

      const top = element("div", "card-top");
      top.append(element("span", "tag muted", item.status || "Research"));
      const saveButton = element("button", "", "♡");
      saveButton.type = "button";
      saveButton.setAttribute("aria-label", `Save ${item.title}`);
      top.append(saveButton);

      const heading = element("h3", "", item.title);
      const summary = element("p", "", item.summary);
      const footer = element("footer");
      footer.append(element("span", "", item.category));
      const more = element("a", "", "→");
      more.href = "index.html#contact";
      more.setAttribute("aria-label", `Enquire about ${item.title}`);
      footer.append(more);

      card.append(top, heading, summary, footer);
      grid.append(card);
    }
  });

  const spotlight = document.querySelector(".spotlight-card");
  const featured = research[0];
  if (spotlight) spotlight.hidden = !featured;
  if (spotlight && featured) {
    setText(".tag", featured.status || "Research project", spotlight);
    setText("h3", featured.title, spotlight);
    setText(".spotlight-content > p", featured.summary, spotlight);
    setText(".meta span:first-child", featured.category, spotlight);
    setText(".meta span:last-child", featured.year, spotlight);
  }
}

function renderEvents(events) {
  const calendar = document.querySelector(".calendar-list");
  if (calendar) {
    calendar.replaceChildren();
    for (const item of events) {
      const date = formatEventDate(item.date);
      const article = element("article");
      const time = element("time");
      time.dateTime = item.date;
      time.append(element("b", "", date.day));
      const dateLabel = element("span");
      dateLabel.innerHTML = `${date.month}<br>${date.year}`;
      time.append(dateLabel);

      const description = element("div");
      description.append(element("span", "tag", `${item.category} event`));
      description.append(element("h2", "", item.title));
      description.append(element("p", "", item.summary));

      const details = element("a", "button button-small", "Details");
      details.href = "index.html#contact";
      article.append(time, description, details);
      calendar.append(article);
    }
  }

  const homeList = document.querySelector(".program-layout .event-list");
  if (homeList) {
    const today = localDateString();
    const upcoming = events.filter((event) => event.date >= today);
    homeList.replaceChildren();
    for (const item of upcoming.slice(0, 4)) {
      const date = formatEventDate(item.date);
      const row = element("article");
      const time = element("time");
      time.dateTime = item.date;
      time.append(element("b", "", date.day));
      const dateLabel = element("span");
      dateLabel.innerHTML = `${date.month}<br>${date.year}`;
      time.append(dateLabel);
      const info = element("div");
      info.append(element("span", "tag muted", item.category));
      info.append(element("h3", "", item.title));
      info.append(element("p", "", item.summary));
      const link = element("a", "", "→");
      link.href = "events.html";
      row.append(time, info, link);
      homeList.append(row);
    }

    const next = upcoming[0];
    const featured = document.querySelector(".next-event");
    if (featured) featured.hidden = !next;
    if (next && featured) {
      const date = formatEventDate(next.date);
      setText(".event-date span", date.month, featured);
      setText(".event-date strong", date.day, featured);
      setText(".event-date small", date.year, featured);
      setText(".tag", next.category, featured);
      setText("h3", next.title, featured);
      setText("p:not(.eyebrow)", next.summary, featured);
    }
  }
}

function createNewsCard(item, featured = false) {
  const article = element(
    "article",
    featured ? "news-card featured-news" : "news-list-card",
  );
  if (featured && item.image) {
    const image = element("img");
    image.src = item.image;
    image.alt = item.title;
    article.append(image);
  }

  const body = featured ? element("div") : article;
  body.append(element("span", featured ? "tag" : "tag muted", item.category));
  body.append(element("h3", "", item.title));
  body.append(element("p", "", item.summary));

  if (featured) {
    const link = element("a", "text-link", "Read story →");
    link.href = "index.html#contact";
    body.append(link);
    article.append(body);
  }
  return article;
}

function renderNews(news) {
  document.querySelectorAll(".news-grid").forEach((grid) => {
    grid.replaceChildren();
    news.forEach((item, index) => {
      grid.append(createNewsCard(item, index === 0));
    });
  });
}

function renderTeam(team) {
  const homeRoles = document.querySelector(".role-list");
  if (homeRoles) {
    homeRoles.replaceChildren();
    team.forEach((item, index) => {
      const role = element("div");
      role.append(element("span", "", String(index + 1).padStart(2, "0")));
      role.append(element("h3", "", item.title));
      role.append(element("p", "", item.category || item.summary));
      homeRoles.append(role);
    });
  }

  const teamGrid = document.querySelector(".team-grid");
  if (teamGrid) {
    teamGrid.replaceChildren();
    team.forEach((item, index) => {
      const role = element("article");
      role.append(element("span", "", String(index + 1).padStart(2, "0")));
      role.append(element("h2", "", item.title));
      role.append(element("p", "", item.summary));
      teamGrid.append(role);
    });
  }
}

function renderGallery(gallery) {
  document.querySelectorAll(".gallery-grid").forEach((grid) => {
    grid.replaceChildren();
    gallery.forEach((item, index) => {
      const button = element("button", "gallery-item");
      button.type = "button";
      button.dataset.caption = item.title;
      if (grid.classList.contains("expanded-gallery")) {
        if (index === 0) button.classList.add("tall");
        if (index === gallery.length - 1) button.classList.add("wide");
      } else if (index === 0) {
        button.classList.add("tall");
      } else if (index === gallery.length - 1) {
        button.classList.add("wide");
      }
      const image = element("img");
      image.src = item.image;
      image.alt = item.title;
      image.loading = "lazy";
      button.append(image);
      grid.append(button);
    });
  });
}

async function loadPublicContent() {
  try {
    const response = await fetch("/api/site", { cache: "no-store" });
    if (!response.ok) return;
    const site = await response.json();
    if (!site.profile || !contentCollections.every((name) => Array.isArray(site[name]))) return;

    updateProfile(site.profile);
    renderResearch(site.research);
    renderEvents(site.events);
    renderNews(site.news);
    renderTeam(site.team);
    renderGallery(site.gallery);
    document.dispatchEvent(new CustomEvent("bea:content-loaded"));
  } catch {
    // Keep the bundled page content visible if the API is unavailable.
  }
}

loadPublicContent();
