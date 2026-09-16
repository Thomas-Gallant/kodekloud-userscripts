// ==UserScript==
// @name         KodeKloud Course Overview
// @namespace    https://learn.kodekloud.com/
// @version      1.0.1
// @description  Browse, filter, favorite, and prioritize the full KodeKloud course catalog.
// @match        https://learn.kodekloud.com/learn/dashboard
// @run-at       document-idle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        unsafeWindow
// ==/UserScript==

(async function () {
  "use strict";

  const DASHBOARD_PATH = "/learn/dashboard";
  const STORAGE_KEY = "kodekloud-course-overview-v1";
  const API_BASE = "https://learn-api.kodekloud.com/api";
  const AUTH_WAIT_MS = 15000;

  let favorites = normalizeFavorites(await GM.getValue(STORAGE_KEY, []));
  let catalog = [];
  let myCourseIds = new Set();
  let enrollmentById = new Map();
  let loadingPromise = null;
  let overviewActive = false;
  let syncScheduled = false;
  let searchText = "";
  let scopeFilter = "all";
  let categoryFilter = "";
  let difficultyFilter = "";
  let planFilter = "";
  let sortOrder = "title";

  addStyles();
  document.addEventListener("click", handleDocumentClick, true);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });
  window.setInterval(syncDashboard, 500);
  syncDashboard();

  function isDashboard() {
    return window.location.origin === "https://learn.kodekloud.com" &&
      window.location.pathname.replace(/\/+$/, "") === DASHBOARD_PATH;
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    window.requestAnimationFrame(() => {
      syncScheduled = false;
      syncDashboard();
    });
  }

  function syncDashboard() {
    if (!isDashboard()) {
      deactivateOverview();
      document.getElementById("kk-course-overview-tab")?.remove();
      document.getElementById("kk-course-overview-panel")?.remove();
      return;
    }

    const allTab = document.querySelector(
      '#learn-root button[role="tab"][id$="-trigger-all"]'
    );
    const tabList = allTab?.closest('[role="tablist"][aria-orientation="horizontal"]');
    const headerWrapper = allTab?.closest("header")?.parentElement;
    const enrolledSection = headerWrapper?.closest("section");
    if (!allTab || !tabList || !headerWrapper || !enrolledSection) return;

    let tab = document.getElementById("kk-course-overview-tab");
    if (!tab) {
      tab = createOverviewTab();
      tabList.insertBefore(tab, allTab);
    }

    let panel = document.getElementById("kk-course-overview-panel");
    if (!panel) {
      panel = createOverviewPanel();
      enrolledSection.insertBefore(panel, headerWrapper.nextSibling);
      if (catalog.length) {
        renderFilterOptions();
        renderCourses();
      }
    }

    if (overviewActive) applyOverviewVisibility(enrolledSection, headerWrapper, panel);
  }

  function createOverviewTab() {
    const tab = document.createElement("button");
    tab.id = "kk-course-overview-tab";
    tab.type = "button";
    tab.role = "tab";
    tab.textContent = `Course Overview (${favorites.length})`;
    tab.setAttribute("aria-controls", "kk-course-overview-panel");
    tab.setAttribute("aria-selected", "false");
    tab.dataset.state = "inactive";
    tab.addEventListener("click", () => void activateOverview());
    return tab;
  }

  function createOverviewPanel() {
    const panel = document.createElement("section");
    panel.id = "kk-course-overview-panel";
    panel.role = "tabpanel";
    panel.hidden = true;
    panel.setAttribute("aria-labelledby", "kk-course-overview-tab");

    const heading = document.createElement("div");
    heading.className = "kk-course-heading";
    const headingText = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = "Course Overview";
    const description = document.createElement("p");
    description.textContent = "Browse the full catalog or narrow it to courses connected to your account.";
    headingText.append(title, description);
    const refresh = makeButton("Refresh catalog", () => loadCourses(true));
    refresh.id = "kk-course-refresh";
    heading.append(headingText, refresh);

    const controls = document.createElement("div");
    controls.className = "kk-course-controls";
    controls.append(
      makeSearchInput(),
      makeSelect("kk-course-scope", "Course scope", [
        ["All courses", "all"],
        ["My courses", "mine"],
        ["Favorites / next up", "favorites"],
      ], (value) => {
        scopeFilter = value;
        renderCourses();
      }),
      makeSelect("kk-course-category", "Category", [["All categories", ""]], (value) => {
        categoryFilter = value;
        renderCourses();
      }),
      makeSelect("kk-course-difficulty", "Difficulty", [["All levels", ""]], (value) => {
        difficultyFilter = value;
        renderCourses();
      }),
      makeSelect("kk-course-plan", "Plan", [["All plans", ""]], (value) => {
        planFilter = value;
        renderCourses();
      }),
      makeSelect("kk-course-sort", "Sort courses", [
        ["Title", "title"],
        ["Most popular", "popularity"],
        ["Recently updated", "updated"],
      ], (value) => {
        sortOrder = value;
        renderCourses();
      })
    );

    const status = document.createElement("div");
    status.id = "kk-course-status";
    status.setAttribute("aria-live", "polite");
    const content = document.createElement("div");
    content.id = "kk-course-content";
    panel.append(heading, controls, status, content);
    return panel;
  }

  function makeSearchInput() {
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Search courses, tutors, or categories...";
    input.setAttribute("aria-label", "Search courses");
    input.addEventListener("input", () => {
      searchText = input.value;
      renderCourses();
    });
    return input;
  }

  function makeSelect(id, label, options, onChange) {
    const select = document.createElement("select");
    select.id = id;
    select.setAttribute("aria-label", label);
    for (const [text, value] of options) select.appendChild(new Option(text, value));
    select.addEventListener("change", () => onChange(select.value));
    return select;
  }

  async function activateOverview() {
    overviewActive = true;
    syncDashboard();
    const tab = document.getElementById("kk-course-overview-tab");
    if (tab) {
      tab.setAttribute("aria-selected", "true");
      tab.dataset.state = "active";
    }
    for (const nativeTab of getNativeTabs()) {
      nativeTab.setAttribute("aria-selected", "false");
      nativeTab.dataset.state = "inactive";
    }
    if (!catalog.length) await loadCourses(false);
    else renderCourses();
  }

  function deactivateOverview() {
    overviewActive = false;
    const tab = document.getElementById("kk-course-overview-tab");
    if (tab) {
      tab.setAttribute("aria-selected", "false");
      tab.dataset.state = "inactive";
    }
    const panel = document.getElementById("kk-course-overview-panel");
    if (panel) panel.hidden = true;
    for (const element of document.querySelectorAll("[data-kk-native-course-card]")) {
      element.hidden = false;
      delete element.dataset.kkNativeCourseCard;
    }
  }

  function applyOverviewVisibility(section, headerWrapper, panel) {
    panel.hidden = false;
    for (const child of section.children) {
      if (child !== headerWrapper && child !== panel) {
        child.dataset.kkNativeCourseCard = "true";
        child.hidden = true;
      }
    }
  }

  function handleDocumentClick(event) {
    const tab = event.target.closest?.('button[role="tab"]');
    if (tab && tab.id !== "kk-course-overview-tab" && getNativeTabs().includes(tab)) {
      deactivateOverview();
    }
  }

  function getNativeTabs() {
    const customTab = document.getElementById("kk-course-overview-tab");
    return customTab
      ? [...customTab.parentElement.querySelectorAll('button[role="tab"]')].filter(
          (tab) => tab !== customTab
        )
      : [];
  }

  async function loadCourses(force) {
    if (loadingPromise && !force) return loadingPromise;
    loadingPromise = performCourseLoad();
    try {
      await loadingPromise;
    } finally {
      loadingPromise = null;
    }
  }

  async function performCourseLoad() {
    setRefreshDisabled(true);
    setStatus("Loading the complete KodeKloud catalog...");
    try {
      const catalogPromise = fetchFullCatalog();
      const accountPromise = fetchAccountCourses().catch((error) => ({
        myCourseIds: new Set(),
        enrollmentById: new Map(),
        extraCourses: [],
        warning: error.message,
      }));
      const [allCourses, accountState] = await Promise.all([catalogPromise, accountPromise]);

      catalog = dedupeCourses([...allCourses, ...accountState.extraCourses]);
      myCourseIds = accountState.myCourseIds;
      enrollmentById = accountState.enrollmentById;
      enrichFavorites();
      renderFilterOptions();
      renderCourses();
      if (accountState.warning) {
        setStatus(
          `${catalog.length} catalog courses loaded, but account courses could not be identified: ${accountState.warning}`,
          "warning"
        );
      } else {
        setStatus(
          `${catalog.length} catalog courses loaded. ${myCourseIds.size} are enrolled or assigned to you.`,
          "success"
        );
      }
    } catch (error) {
      setStatus(`Could not load courses: ${error.message}`, "error");
    } finally {
      setRefreshDisabled(false);
    }
  }

  async function fetchFullCatalog() {
    const result = [];
    const visitedPages = new Set();
    let page = 1;
    while (page && !visitedPages.has(page)) {
      visitedPages.add(page);
      const response = await apiGet(`/courses?limit=1000&page=${page}`);
      result.push(...(response.courses || []));
      page = response.metadata?.next_page || null;
    }
    return result;
  }

  async function fetchAccountCourses() {
    const auth = await waitForAuthModule();
    await auth.waitForAuthReady?.();
    const [enrolledResponse, assignedResponse, progressResponse] = await Promise.all([
      apiGet("/courses/enrolled", auth),
      apiGet("/courses/assigned?expand=course", auth).catch(() => ({ assigned: [] })),
      apiGet("/users_progresses/courses", auth).catch(() => ({ course_progresses: [] })),
    ]);
    const enrolled = enrolledResponse.courses || [];
    const assigned = (assignedResponse.assigned || []).map((item) => item.course || item);
    const progresses = progressResponse.course_progresses || [];
    const ids = new Set([...enrolled, ...assigned].map((course) => String(course.id)));
    const state = new Map();
    for (const course of [...enrolled, ...assigned, ...progresses]) {
      if (!course?.id) continue;
      state.set(String(course.id), { ...state.get(String(course.id)), ...course });
    }
    return { myCourseIds: ids, enrollmentById: state, extraCourses: [...enrolled, ...assigned] };
  }

  async function waitForAuthModule() {
    const deadline = Date.now() + AUTH_WAIT_MS;
    while (Date.now() < deadline) {
      const auth = unsafeWindow.__mf_module_cache__?.remote?.["hostApp/Auth"];
      if (auth?.getIdToken) return auth;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error("KodeKloud authentication was unavailable. Reload the dashboard and try again.");
  }

  async function apiGet(path, auth = null, refreshToken = false) {
    const headers = { Accept: "application/json" };
    if (auth) {
      const token = await auth.getIdToken(refreshToken ? { forceRefresh: true } : undefined);
      if (!token) throw new Error("KodeKloud did not provide an authentication token.");
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await unsafeWindow.fetch(`${API_BASE}${path}`, {
      method: "GET",
      credentials: "omit",
      headers,
    });
    if (response.status === 401 && auth && !refreshToken) return apiGet(path, auth, true);
    if (!response.ok) throw new Error(`KodeKloud API returned ${response.status} for ${path}`);
    return response.json();
  }

  function dedupeCourses(input) {
    const unique = new Map();
    for (const course of input) {
      if (!course?.id || !course?.slug) continue;
      const id = String(course.id);
      unique.set(id, { ...unique.get(id), ...course, id });
    }
    return [...unique.values()];
  }

  function normalizeFavorites(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.filter((course) => {
      const key = String(course?.id || course?.slug || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function enrichFavorites() {
    favorites = favorites.map((favorite) => {
      const current = catalog.find(
        (course) => course.id === String(favorite.id) || course.slug === favorite.slug
      );
      return current ? { ...current, addedAt: favorite.addedAt || Date.now() } : favorite;
    });
    void persistFavorites();
  }

  function renderFilterOptions() {
    replaceSelectOptions("kk-course-category", "All categories", [
      ...new Set(catalog.flatMap((course) => (course.categories || []).map((item) => item.name))),
    ].sort(), categoryFilter);
    replaceSelectOptions("kk-course-difficulty", "All levels", [
      ...new Set(catalog.map((course) => course.difficulty_level).filter(Boolean)),
    ].sort(), difficultyFilter, formatLabel);
    replaceSelectOptions("kk-course-plan", "All plans", [
      ...new Set(catalog.map((course) => course.plan).filter(Boolean)),
    ].sort(), planFilter);
  }

  function replaceSelectOptions(id, allLabel, values, selected, formatter = (value) => value) {
    const select = document.getElementById(id);
    if (!select) return;
    select.replaceChildren(new Option(allLabel, ""));
    for (const value of values) select.appendChild(new Option(formatter(value), value));
    select.value = selected;
  }

  function renderCourses() {
    updateTabCount();
    const content = document.getElementById("kk-course-content");
    if (!content) return;
    content.replaceChildren();

    let source = catalog;
    if (scopeFilter === "mine") source = catalog.filter((course) => myCourseIds.has(course.id));
    if (scopeFilter === "favorites") {
      source = favorites.map((favorite) =>
        catalog.find((course) => course.id === String(favorite.id)) || favorite
      );
    }
    let filtered = source.filter(matchesFilters);
    if (scopeFilter !== "favorites") filtered = sortCourses(filtered);

    setResultCount(filtered.length);
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "kk-course-empty";
      empty.textContent = scopeFilter === "favorites" && !favorites.length
        ? "No favorites yet. Choose All courses and favorite anything you want to take later."
        : "No courses match the selected filters.";
      content.appendChild(empty);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "kk-course-grid";
    for (const course of filtered) grid.appendChild(createCourseCard(course));
    content.appendChild(grid);
  }

  function matchesFilters(course) {
    const categories = (course.categories || []).map((item) => item.name);
    const tutors = (course.tutors || []).map((item) => item.name).join(" ");
    const query = searchText.trim().toLocaleLowerCase();
    const haystack = `${course.title} ${tutors} ${categories.join(" ")}`.toLocaleLowerCase();
    return (!categoryFilter || categories.includes(categoryFilter)) &&
      (!difficultyFilter || course.difficulty_level === difficultyFilter) &&
      (!planFilter || course.plan === planFilter) &&
      (!query || haystack.includes(query));
  }

  function sortCourses(input) {
    const result = [...input];
    if (sortOrder === "popularity") {
      return result.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    }
    if (sortOrder === "updated") {
      return result.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    }
    return result.sort((a, b) => a.title.localeCompare(b.title));
  }

  function createCourseCard(course) {
    const card = document.createElement("article");
    card.className = "kk-course-card";

    const imageLink = document.createElement("a");
    imageLink.href = `/learn/courses/${course.slug}`;
    imageLink.className = "kk-course-image";
    if (course.thumbnail_url) {
      const image = document.createElement("img");
      image.src = course.thumbnail_url;
      image.alt = "";
      image.loading = "lazy";
      imageLink.appendChild(image);
    }

    const body = document.createElement("div");
    body.className = "kk-course-card-body";
    const badges = document.createElement("div");
    badges.className = "kk-course-badges";
    badges.append(makeBadge(course.plan || "Course"));
    if (myCourseIds.has(course.id)) badges.append(makeBadge("My course", "mine"));
    const title = document.createElement("a");
    title.href = `/learn/courses/${course.slug}`;
    title.className = "kk-course-title";
    title.textContent = course.title;
    const metadata = document.createElement("p");
    metadata.textContent = [
      formatLabel(course.difficulty_level),
      (course.categories || []).slice(0, 3).map((item) => item.name).join(" / "),
    ].filter(Boolean).join(" | ");
    body.append(badges, title, metadata);

    const account = enrollmentById.get(course.id);
    if (myCourseIds.has(course.id) && Number.isFinite(Number(account?.progress))) {
      const progress = document.createElement("div");
      progress.className = "kk-course-progress";
      const bar = document.createElement("span");
      bar.style.width = `${Math.max(0, Math.min(100, Number(account.progress)))}%`;
      progress.appendChild(bar);
      progress.title = `${account.progress}% complete`;
      body.appendChild(progress);
    }

    const footer = document.createElement("div");
    footer.className = "kk-course-card-footer";
    const tutor = document.createElement("span");
    tutor.textContent = (course.tutors || []).map((item) => item.name).join(", ") || "KodeKloud";
    const favorite = makeButton(isFavorite(course.id) ? "Favorited" : "Favorite", () => toggleFavorite(course));
    favorite.className = "kk-course-favorite";
    favorite.classList.toggle("is-favorite", isFavorite(course.id));
    footer.append(tutor, favorite);
    body.appendChild(footer);

    if (scopeFilter === "favorites") {
      const index = favorites.findIndex((item) => String(item.id) === course.id);
      const order = document.createElement("div");
      order.className = "kk-course-order";
      const position = document.createElement("strong");
      position.textContent = index === 0 ? "NEXT" : `#${index + 1}`;
      const up = makeButton("Up", () => moveFavorite(course.id, -1));
      up.disabled = index === 0;
      const down = makeButton("Down", () => moveFavorite(course.id, 1));
      down.disabled = index === favorites.length - 1;
      order.append(position, up, down);
      card.appendChild(order);
    }

    card.append(imageLink, body);
    return card;
  }

  function makeBadge(text, modifier = "") {
    const badge = document.createElement("span");
    badge.className = `kk-course-badge ${modifier ? `is-${modifier}` : ""}`;
    badge.textContent = text;
    return badge;
  }

  async function toggleFavorite(course) {
    const index = favorites.findIndex((item) => String(item.id) === course.id);
    if (index === -1) favorites.push({ ...course, addedAt: Date.now() });
    else favorites.splice(index, 1);
    await persistFavorites();
    renderCourses();
  }

  async function moveFavorite(id, direction) {
    const index = favorites.findIndex((item) => String(item.id) === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= favorites.length) return;
    [favorites[index], favorites[destination]] = [favorites[destination], favorites[index]];
    await persistFavorites();
    renderCourses();
  }

  function isFavorite(id) {
    return favorites.some((item) => String(item.id) === id);
  }

  async function persistFavorites() {
    await GM.setValue(STORAGE_KEY, favorites);
    updateTabCount();
  }

  function updateTabCount() {
    const tab = document.getElementById("kk-course-overview-tab");
    if (tab) tab.textContent = `Course Overview (${favorites.length})`;
  }

  function setResultCount(count) {
    const status = document.getElementById("kk-course-status");
    if (status && status.dataset.state !== "loading") {
      status.textContent = `${count} course${count === 1 ? "" : "s"} shown.`;
      status.dataset.state = "result";
    }
  }

  function setStatus(message, state = "loading") {
    const status = document.getElementById("kk-course-status");
    if (status) {
      status.textContent = message;
      status.dataset.state = state;
    }
  }

  function setRefreshDisabled(disabled) {
    const button = document.getElementById("kk-course-refresh");
    if (button) button.disabled = disabled;
  }

  function makeButton(text, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () => void handler());
    return button;
  }

  function formatLabel(value) {
    if (!value) return "";
    return String(value).replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #kk-course-overview-tab { border: 0; border-radius: 6px; padding: 9px 13px; color: inherit; background: transparent; font: inherit; font-weight: 600; white-space: nowrap; cursor: pointer; }
      #kk-course-overview-tab:hover { background: rgb(14 165 233 / 0.09); }
      #kk-course-overview-tab[data-state="active"] { color: #0284c7; background: rgb(14 165 233 / 0.14); }
      #kk-course-overview-panel { grid-column: 1 / -1; width: 100%; padding: 26px 0 60px; color: inherit; }
      #kk-course-overview-panel[hidden] { display: none !important; }
      .kk-course-heading { display: flex; align-items: start; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
      .kk-course-heading h2 { margin: 0; font-size: 26px; font-weight: 750; }
      .kk-course-heading p { margin: 5px 0 0; color: #64748b; font-size: 14px; }
      #kk-course-refresh, .kk-course-favorite, .kk-course-order button { border: 1px solid rgb(148 163 184 / 0.55); border-radius: 7px; padding: 8px 10px; color: inherit; background: transparent; font: 600 12px/1 system-ui, sans-serif; cursor: pointer; }
      #kk-course-refresh:hover, .kk-course-favorite:hover, .kk-course-order button:hover:not(:disabled) { border-color: #0ea5e9; color: #0284c7; background: rgb(14 165 233 / 0.09); }
      #kk-course-refresh:disabled, .kk-course-order button:disabled { opacity: 0.4; cursor: default; }
      .kk-course-controls { display: grid; grid-template-columns: minmax(260px, 1fr) repeat(5, minmax(125px, auto)); gap: 9px; }
      .kk-course-controls input, .kk-course-controls select { min-width: 0; border: 1px solid rgb(148 163 184 / 0.55); border-radius: 8px; padding: 10px 11px; color: #0f172a; background-color: #fff; color-scheme: light; font: 14px/1.2 system-ui, sans-serif; }
      .kk-course-controls select option { color: #0f172a; background-color: #fff; }
      .kk-course-controls input:focus, .kk-course-controls select:focus { outline: 2px solid #0ea5e9; outline-offset: 1px; }
      #kk-course-status { min-height: 21px; margin: 14px 2px; color: #64748b; font-size: 13px; }
      #kk-course-status[data-state="error"] { color: #e11d48; }
      #kk-course-status[data-state="warning"] { color: #d97706; }
      #kk-course-status[data-state="success"] { color: #059669; }
      .kk-course-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
      .kk-course-card { position: relative; display: flex; min-width: 0; flex-direction: column; overflow: hidden; border: 1px solid rgb(148 163 184 / 0.35); border-radius: 11px; background: rgb(255 255 255 / 0.025); }
      .kk-course-image { display: block; aspect-ratio: 16 / 9; overflow: hidden; background: #0f172a; }
      .kk-course-image img { width: 100%; height: 100%; object-fit: cover; transition: transform 180ms ease; }
      .kk-course-card:hover .kk-course-image img { transform: scale(1.025); }
      .kk-course-card-body { display: flex; min-height: 180px; flex: 1; flex-direction: column; gap: 10px; padding: 15px; }
      .kk-course-badges { display: flex; flex-wrap: wrap; gap: 6px; }
      .kk-course-badge { border-radius: 999px; padding: 4px 7px; color: #475569; background: rgb(148 163 184 / 0.16); font: 700 10px/1 system-ui, sans-serif; text-transform: uppercase; }
      .kk-course-badge.is-mine { color: #0369a1; background: rgb(14 165 233 / 0.15); }
      .kk-course-title { color: inherit; font-size: 16px; font-weight: 720; line-height: 1.35; text-decoration: none; }
      .kk-course-title:hover { color: #0284c7; }
      .kk-course-card-body > p { min-height: 30px; margin: 0; color: #64748b; font-size: 12px; line-height: 1.4; }
      .kk-course-progress { height: 5px; overflow: hidden; border-radius: 999px; background: rgb(148 163 184 / 0.22); }
      .kk-course-progress span { display: block; height: 100%; border-radius: inherit; background: #0ea5e9; }
      .kk-course-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; }
      .kk-course-card-footer > span { overflow: hidden; color: #64748b; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .kk-course-favorite.is-favorite { border-color: #0ea5e9; color: #0284c7; background: rgb(14 165 233 / 0.12); }
      .kk-course-order { position: absolute; z-index: 2; top: 9px; left: 9px; display: flex; align-items: center; gap: 5px; padding: 5px; border-radius: 8px; color: #fff; background: rgb(2 6 23 / 0.82); backdrop-filter: blur(5px); }
      .kk-course-order strong { min-width: 34px; color: #7dd3fc; font: 750 11px/1 system-ui, sans-serif; text-align: center; }
      .kk-course-order button { border-color: #475569; padding: 6px 7px; color: #e2e8f0; background: #1e293b; }
      .kk-course-empty { padding: 60px 20px; border: 1px dashed rgb(148 163 184 / 0.5); border-radius: 10px; color: #64748b; text-align: center; }
      @media (prefers-color-scheme: dark) { .kk-course-heading p, .kk-course-card-body > p, .kk-course-card-footer > span, #kk-course-status, .kk-course-empty { color: #94a3b8; } .kk-course-badge { color: #cbd5e1; } .kk-course-controls input, .kk-course-controls select { color: #e2e8f0; background-color: #0f172a; border-color: rgb(148 163 184 / 0.55); color-scheme: dark; } .kk-course-controls select option { color: #e2e8f0; background-color: #0f172a; } }
      @media (max-width: 1100px) { .kk-course-controls { grid-template-columns: repeat(3, minmax(0, 1fr)); } .kk-course-controls input { grid-column: span 2; } }
      @media (max-width: 640px) { #kk-course-overview-tab { padding-inline: 9px; } #kk-course-overview-panel { padding-top: 18px; } .kk-course-heading h2 { font-size: 22px; } .kk-course-controls { grid-template-columns: 1fr; } .kk-course-controls input { grid-column: auto; } .kk-course-grid { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }
})();
