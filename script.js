const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const KEYS = { theme: "rauny_theme", dentistry: "rauny_dentistry_notes", dentistryAttempts: "rauny_dentistry_attempts", goals: "rauny_goal_board" };
const CLOUD_ADMIN_EMAIL = "anthonyamaru93@gmail.com";
const MUSIC_PLAYER_STATE_KEY = "rauny_music_player_state_v1";
const CLOUD_CONTENT_KEYS = { [KEYS.dentistry]: "dentistry", [KEYS.goals]: "goals" };
const PRIMARY_NAV_ITEMS = [
  ["resume.html", "Resume"],
  ["interests.html", "Interests"],
  ["music.html", "Music"],
  ["goals.html", "Goals"],
];
const INTEREST_DETAIL_PAGES = ["art.html", "dentistry.html", "travel.html", "books.html", "shopping.html"];
const SHOPPING_STORES = [
  { slug: "prettylittlething", name: "PrettyLittleThing", mark: "PLT", url: "https://www.prettylittlething.us/" },
  { slug: "nasty-gal", name: "Nasty Gal", mark: "NASTY GAL", url: "https://www.nastygal.com/" },
  { slug: "princess-polly", name: "Princess Polly", mark: "Princess Polly", url: "https://us.princesspolly.com/" },
  { slug: "revolve", name: "REVOLVE", mark: "REVOLVE", url: "https://www.revolve.com/" },
  { slug: "hot-topic", name: "Hot Topic", mark: "HOT TOPIC", url: "https://www.hottopic.com/" },
  { slug: "jane", name: "Jane", mark: "jane", url: "https://jane.com/" },
  { slug: "yoox", name: "YOOX", mark: "YOOX", url: "https://www.yoox.com/us/women" },
];
const SHOPPING_CATEGORIES = [
  ["all", "All"], ["tops", "Shirts & tops"], ["bottoms", "Bottoms"], ["dresses", "Dresses"],
  ["shoes", "Shoes"], ["bags", "Bags"], ["accessories", "Accessories"], ["outerwear", "Outerwear"], ["beauty", "Beauty"],
];
let toastTimer;
let tracks = [];
let playlists = [];
let visibleTracks = [];
let currentPlaylist = "all";
let musicLibraryOpen = false;
const currentArtists = new Set();
let currentSongQuery = "";
let musicSortColumn = "song";
let musicSortDirection = "asc";
let editingTrackId = null;
let musicCloudError = "";
let playerPlaylist = "all";
let currentTrackId = null;
let playerStateRestored = false;
let shuffleEnabled = false;
let shuffledTrackIds = [];
const selectedTrackIds = new Set();
let cloudAdminPassword = null;
let artItems = [];
let drawingTool = "pen";
let drawingStrokes = [];
let drawingRedoStack = [];
let activeDrawingStroke = null;
let activeDrawingPointer = null;
let lastPencilTap = null;
let shoppingProducts = [];
let shoppingStore = "all";
let shoppingCategory = "all";
let activeDentistryQuestions = [];
let activeDentistryTestMode = "quiz";

function ensureMusicPlayerMenu() {
  const bar = $("#music-bar");
  if (!bar || $("#music-queue-toggle")) return;
  const toggle = document.createElement("button");
  const shuffleToggle = document.createElement("button");
  toggle.id = "music-queue-toggle";
  toggle.className = "music-queue-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Choose a playlist or song");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "music-queue-menu");
  toggle.textContent = "♫";
  shuffleToggle.id = "music-shuffle-toggle";
  shuffleToggle.className = "music-shuffle-toggle";
  shuffleToggle.type = "button";
  shuffleToggle.setAttribute("aria-label", "Shuffle songs");
  shuffleToggle.setAttribute("aria-pressed", "false");
  shuffleToggle.textContent = "⇄";
  const menu = document.createElement("div");
  menu.id = "music-queue-menu";
  menu.className = "music-player-menu";
  menu.hidden = true;
  menu.innerHTML = '<label for="player-playlist-select">Play a playlist</label><select id="player-playlist-select"><option value="all">All songs</option></select><label for="player-track-select">Choose a song</label><select id="player-track-select"><option value="">No music added yet</option></select>';
  bar.append(toggle, shuffleToggle, menu);
}

ensureMusicPlayerMenu();

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}

function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]); }
function formatBytes(bytes) { return bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1e6).toFixed(1)} MB`; }
function trackArtist(track) {
  const stored = String(track?.source_metadata?.artist || "").trim();
  if (stored) return stored;
  const base = String(track?.file_name || track?.title || "").replace(/\.[^.]+$/, "").replace(/\s*\[[\w-]{6,}\]\s*$/, "").trim();
  return base.match(/^(.+?)\s[-–—]\s.+$/)?.[1]?.trim() || "Unknown artist";
}
function trackPlaylistName(track) { return playlists.find((playlist) => String(playlist.id) === String(track.playlist_id))?.name || "No playlist"; }
function updateMusicSortControls() {
  $$('[data-sort-column]').forEach((button) => {
    const active = button.dataset.sortColumn === musicSortColumn;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    const indicator = $("[data-sort-indicator]", button);
    if (indicator) indicator.textContent = active ? (musicSortDirection === "asc" ? "A→Z" : "Z→A") : "↕";
  });
}
function setMusicSort(column) {
  if (!["song", "artist", "playlist"].includes(column)) return;
  if (musicSortColumn === column) musicSortDirection = musicSortDirection === "asc" ? "desc" : "asc";
  else { musicSortColumn = column; musicSortDirection = "asc"; }
  renderMusicRows();
}
function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("visible"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("visible"), 2600); }
function safeExternalUrl(value) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  const toggle = $("#theme-toggle");
  if (toggle) toggle.textContent = theme === "dark" ? "☀" : "☾";
  localStorage.setItem(KEYS.theme, theme);
}

function normalizePrimaryNavigation() {
  const nav = $("#primary-nav");
  if (!nav) return;
  let currentPage = location.pathname.split("/").pop() || "index.html";
  if (INTEREST_DETAIL_PAGES.includes(currentPage)) currentPage = "interests.html";
  nav.innerHTML = PRIMARY_NAV_ITEMS.map(([href, label]) => `<a href="${href}"${currentPage === href ? ' aria-current="page"' : ""}>${label}</a>`).join("");
}

function updateCloudStatus() {
  const status = $("#cloud-status");
  if (!status) return;
  const connected = Boolean(window.musicCloud?.isSignedIn());
  status.classList.toggle("connected", connected);
  status.lastChild.textContent = connected ? "Cloud synced" : "Cloud locked";
}

async function syncCloudList(localKey) {
  const row = await musicCloud.getContent("rauny", CLOUD_CONTENT_KEYS[localKey]);
  if (row && Array.isArray(row.value)) write(localKey, row.value);
  else {
    const localValue = read(localKey);
    if (localValue.length) await musicCloud.saveContent("rauny", CLOUD_CONTENT_KEYS[localKey], localValue);
  }
}

async function saveCloudList(localKey, value) {
  write(localKey, value);
  if (musicCloud.isSignedIn()) await musicCloud.saveContent("rauny", CLOUD_CONTENT_KEYS[localKey], value);
}

async function migrateLocalArtwork() {
  const localItems = await dbAll("art").catch(() => []);
  for (const item of localItems) {
    try {
      const file = new File([item.blob], `${item.name || "Artwork"}.png`, { type: item.blob?.type || "image/png" });
      await musicCloud.uploadArt("rauny", file, item.name || "Artwork");
      await dbDelete("art", item.id);
    } catch (error) { console.warn("Local artwork migration failed", error); }
  }
}

async function syncRaunyWorkspace() {
  if (!musicCloud.isSignedIn()) return updateCloudStatus();
  try {
    await Promise.all(Object.keys(CLOUD_CONTENT_KEYS).map(syncCloudList));
    if ($("#dentistry-study-cards")) await syncDentistryHistory();
    await migrateLocalArtwork();
    renderDentistry(); renderGoals();
    await renderArt();
    updateCloudStatus();
    toast("Private workspace synced across devices.");
  } catch (error) { toast(`Cloud sync needs attention: ${error.message}`); }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("rauny_studio", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("art")) request.result.createObjectStore("art", { keyPath: "id", autoIncrement: true });
      if (!request.result.objectStoreNames.contains("tracks")) request.result.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbAction(storeName, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}
const dbAll = (store) => dbAction(store, "readonly", (objectStore) => objectStore.getAll());
const dbAdd = (store, value) => dbAction(store, "readwrite", (objectStore) => objectStore.add(value));
const dbDelete = (store, id) => dbAction(store, "readwrite", (objectStore) => objectStore.delete(id));

function renderDentistry() {
  if (!$("#dentistry-notes")) return;
  const notes = read(KEYS.dentistry);
  $("#dentistry-notes").innerHTML = notes.length ? notes.map((note) => `<article class="note-card"><span>${escapeHtml(note.date)}</span><button class="delete-button" data-delete-note="${note.id}" aria-label="Delete ${escapeHtml(note.topic)}">×</button><h3>${escapeHtml(note.topic)}</h3><p>${escapeHtml(note.note)}</p></article>`).join("") : '<div class="empty-state">No notes yet</div>';
}

function dentistryQuestions() { return Array.isArray(window.DENTISTRY_QUESTIONS) ? window.DENTISTRY_QUESTIONS : []; }
function dentistryStudyItems() { return Array.isArray(window.DENTISTRY_STUDY_ITEMS) ? window.DENTISTRY_STUDY_ITEMS : []; }
function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function openDentistryPdf(page = 1) {
  const drawer = $("#dentistry-pdf-drawer");
  const backdrop = $("#dentistry-pdf-backdrop");
  const frame = $("#dentistry-pdf-frame");
  if (!drawer || !backdrop || !frame) return;
  frame.src = `output/pdf/Dentistry_Study_Reference.pdf#page=${Math.max(1, Number(page) || 1)}&view=FitH`;
  drawer.hidden = false;
  backdrop.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("pdf-drawer-open");
  $("#dentistry-pdf-close").focus();
}

function closeDentistryPdf() {
  const drawer = $("#dentistry-pdf-drawer");
  const backdrop = $("#dentistry-pdf-backdrop");
  if (!drawer || !backdrop) return;
  drawer.hidden = true;
  backdrop.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("pdf-drawer-open");
}

function renderDentistryStudy() {
  const grid = $("#dentistry-study-cards");
  if (!grid) return;
  const topic = $("#dentistry-topic-filter")?.value || "all";
  const query = $("#dentistry-study-search")?.value.trim().toLocaleLowerCase() || "";
  const items = dentistryStudyItems().filter((item) => {
    const matchesTopic = topic === "all" || item.topic === topic;
    const haystack = `${item.term} ${item.definition} ${item.source}`.toLocaleLowerCase();
    return matchesTopic && (!query || haystack.includes(query));
  });
  grid.innerHTML = items.length ? items.map((item) => `<article class="dentistry-study-card"><span>${escapeHtml(item.topic)}</span><h2>${escapeHtml(item.term)}</h2><p>${escapeHtml(item.definition)}</p><button class="source-button" type="button" data-open-dentistry-pdf="${item.refPage}">${escapeHtml(item.source)} · PDF ${item.refPage}</button></article>`).join("") : '<div class="empty-state">No matches</div>';
}

function dentistryAttempts() { return read(KEYS.dentistryAttempts); }

function renderDentistryHistory() {
  const history = $("#dentistry-history");
  if (!history) return;
  const attempts = dentistryAttempts();
  $("#dentistry-attempt-count").textContent = String(attempts.length);
  $("#dentistry-last-score").textContent = attempts.length ? `${Math.round(Number(attempts[0].percent))}%` : "—";
  history.innerHTML = attempts.length ? attempts.slice(0, 20).map((attempt) => {
    const wrong = Array.isArray(attempt.wrong_answers) ? attempt.wrong_answers : [];
    const date = new Date(attempt.completed_at || Date.now());
    const details = wrong.length ? `<details><summary>${wrong.length} wrong</summary><ol>${wrong.map((item) => `<li><strong>${escapeHtml(item.q)}</strong><span>Your answer: ${escapeHtml(item.selected || "No answer")}</span><span>Correct: ${escapeHtml(item.correct)}</span><button type="button" data-open-dentistry-pdf="${Number(item.refPage) || 1}">${escapeHtml(item.source || "Open PDF")}</button></li>`).join("")}</ol></details>` : '<span class="dentistry-perfect">Perfect</span>';
    return `<article class="dentistry-history-row"><div><strong>${Math.round(Number(attempt.percent))}%</strong><span>${escapeHtml(attempt.mode === "test" ? "Test" : "Quiz")} · ${Number(attempt.correct)}/${Number(attempt.total)} · ${escapeHtml(date.toLocaleDateString())}</span></div>${details}</article>`;
  }).join("") : '<div class="empty-state">No attempts yet</div>';
}

async function syncDentistryHistory() {
  if (!musicCloud.isSignedIn()) return renderDentistryHistory();
  const attempts = await musicCloud.listTestAttempts("dentistry", 30);
  write(KEYS.dentistryAttempts, attempts);
  renderDentistryHistory();
}

function showDentistryStudy() {
  const studyPanel = $("#dentistry-study-panel");
  const testPanel = $("#dentistry-test-panel");
  if (!studyPanel || !testPanel) return;
  studyPanel.hidden = false;
  testPanel.hidden = true;
  $$('[data-dentistry-mode="study"]').forEach((button) => button.setAttribute("aria-pressed", "true"));
  $$('[data-dentistry-test]').forEach((button) => button.setAttribute("aria-pressed", "false"));
}

function renderDentistryTest() {
  const container = $("#dentistry-test-questions");
  if (!container) return;
  container.innerHTML = activeDentistryQuestions.map((question, questionIndex) => `<fieldset class="dentistry-question" data-question-id="${question.id}"><legend><span>${questionIndex + 1}</span>${escapeHtml(question.q)}</legend><div class="dentistry-options">${question.opts.map((option, optionIndex) => `<label><input type="radio" name="${question.id}" value="${optionIndex}" /><span>${escapeHtml(option)}</span></label>`).join("")}</div><div class="dentistry-feedback" hidden></div></fieldset>`).join("");
  $("#dentistry-test-result").hidden = true;
  $("#dentistry-check-test").hidden = false;
  $("#dentistry-test-progress").textContent = `${activeDentistryQuestions.length} questions`;
  $("#dentistry-test-title").textContent = activeDentistryTestMode === "test" ? "Test 25" : "Quiz 10";
}

async function startDentistryTest(count) {
  if (!(await ensureCloudAdmin())) return;
  activeDentistryQuestions = shuffle(dentistryQuestions()).slice(0, Math.min(count, dentistryQuestions().length));
  activeDentistryTestMode = count > 10 ? "test" : "quiz";
  $("#dentistry-study-panel").hidden = true;
  $("#dentistry-test-panel").hidden = false;
  $$('[data-dentistry-mode="study"]').forEach((button) => button.setAttribute("aria-pressed", "false"));
  $$('[data-dentistry-test]').forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.dentistryTest) === count)));
  renderDentistryTest();
  $("#dentistry-test-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function gradeDentistryTest(event) {
  event.preventDefault();
  if (!activeDentistryQuestions.length) return;
  const form = new FormData(event.currentTarget);
  let correct = 0;
  const wrongAnswers = [];
  activeDentistryQuestions.forEach((question) => {
    const selectedIndex = form.has(question.id) ? Number(form.get(question.id)) : -1;
    const fieldset = $(`[data-question-id="${question.id}"]`);
    const optionLabels = $$(`.dentistry-options label`, fieldset);
    optionLabels.forEach((label, index) => {
      label.classList.toggle("correct", index === question.ans);
      label.classList.toggle("incorrect", index === selectedIndex && selectedIndex !== question.ans);
      $("input", label).disabled = true;
    });
    const feedback = $(".dentistry-feedback", fieldset);
    feedback.hidden = false;
    feedback.innerHTML = `<strong>${selectedIndex === question.ans ? "Correct" : "Review"}</strong><p>${escapeHtml(question.exp)}</p><button type="button" data-open-dentistry-pdf="${question.refPage}">${escapeHtml(question.source)} · PDF ${question.refPage}</button>`;
    if (selectedIndex === question.ans) correct += 1;
    else wrongAnswers.push({ id: question.id, q: question.q, selected: selectedIndex >= 0 ? question.opts[selectedIndex] : "No answer", correct: question.opts[question.ans], source: question.source, refPage: question.refPage });
  });
  const total = activeDentistryQuestions.length;
  const percent = Math.round((correct / total) * 100);
  const completedAt = new Date().toISOString();
  const attempt = { subject: "dentistry", mode: activeDentistryTestMode, section: "mixed", correct, total, percent, wrong_answers: wrongAnswers, completed_at: completedAt };
  const attempts = dentistryAttempts();
  attempts.unshift(attempt);
  write(KEYS.dentistryAttempts, attempts.slice(0, 30));
  renderDentistryHistory();
  const result = $("#dentistry-test-result");
  result.hidden = false;
  result.innerHTML = `<strong>${percent}%</strong><span>${correct}/${total}</span><button class="button ghost" type="button" data-dentistry-retry="${total}">Again</button>`;
  $("#dentistry-check-test").hidden = true;
  try {
    const saved = await musicCloud.saveTestAttempt(attempt);
    if (saved?.id) {
      const local = dentistryAttempts();
      local[0] = saved;
      write(KEYS.dentistryAttempts, local);
      renderDentistryHistory();
    }
    toast("Dentistry result synced.");
  } catch (error) { toast(`Result saved on this device; cloud sync failed: ${error.message}`); }
  result.scrollIntoView({ behavior: "smooth", block: "center" });
}

function initializeDentistryStudy() {
  if (!$("#dentistry-study-cards")) return;
  const questions = dentistryQuestions();
  $("#dentistry-question-count").textContent = String(questions.length);
  const topics = [...new Set(dentistryStudyItems().map((item) => item.topic))];
  $("#dentistry-topic-filter").insertAdjacentHTML("beforeend", topics.map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`).join(""));
  renderDentistryStudy();
  renderDentistryHistory();
}

function renderGoals() {
  if (!$("#goal-board")) return;
  const goals = read(KEYS.goals);
  $("#goal-board").innerHTML = goals.length ? goals.map((goal) => `<article class="goal-card ${goal.done ? "done" : ""}"><span>${escapeHtml(goal.area)}</span><button class="delete-button" data-delete-goal="${goal.id}" aria-label="Delete ${escapeHtml(goal.title)}">×</button><h3>${escapeHtml(goal.title)}</h3><footer><small>${goal.done ? "Completed" : "In progress"}</small><button class="button ghost" type="button" data-toggle-goal="${goal.id}">${goal.done ? "Reopen" : "Done"}</button></footer></article>`).join("") : '<div class="empty-state">No goals yet</div>';
}

function shoppingStoreBySlug(slug) {
  return SHOPPING_STORES.find((store) => store.slug === slug);
}

function shoppingFilteredProducts() {
  const query = $("#shopping-search")?.value.trim().toLocaleLowerCase() || "";
  const sort = $("#shopping-sort")?.value || "featured";
  const filtered = shoppingProducts.filter((product) => {
    const matchesStore = shoppingStore === "all" || product.store_slug === shoppingStore;
    const matchesCategory = shoppingCategory === "all" || product.category === shoppingCategory;
    const haystack = `${product.title || ""} ${product.brand || ""} ${product.description || ""}`.toLocaleLowerCase();
    return matchesStore && matchesCategory && (!query || haystack.includes(query));
  });
  return filtered.sort((a, b) => {
    if (sort === "price-low") return Number(a.price ?? Number.MAX_SAFE_INTEGER) - Number(b.price ?? Number.MAX_SAFE_INTEGER);
    if (sort === "price-high") return Number(b.price ?? -1) - Number(a.price ?? -1);
    if (sort === "newest") return new Date(b.source_updated_at || b.updated_at || 0) - new Date(a.source_updated_at || a.updated_at || 0);
    return SHOPPING_STORES.findIndex((store) => store.slug === a.store_slug) - SHOPPING_STORES.findIndex((store) => store.slug === b.store_slug);
  });
}

function formatProductPrice(product) {
  if (product.price === null || product.price === undefined || product.price === "") return "";
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: product.currency || "USD" }).format(Number(product.price)); }
  catch { return `$${Number(product.price).toFixed(2)}`; }
}

function renderShoppingStoreFilters() {
  const filters = $("#shopping-store-filters");
  if (!filters) return;
  const storeButtons = [{ slug: "all", name: "All stores", mark: "ALL" }, ...SHOPPING_STORES];
  filters.innerHTML = storeButtons.map((store) => {
    const count = store.slug === "all" ? shoppingProducts.length : shoppingProducts.filter((product) => product.store_slug === store.slug).length;
    return `<button type="button" data-shopping-store="${store.slug}" aria-pressed="${shoppingStore === store.slug}"><span class="store-wordmark wordmark-${store.slug}">${escapeHtml(store.mark)}</span><small>${count || "Pending"}</small></button>`;
  }).join("");
}

function renderShoppingCategoryFilters() {
  const filters = $("#shopping-category-filters");
  if (!filters) return;
  filters.innerHTML = SHOPPING_CATEGORIES.map(([slug, label]) => {
    const count = slug === "all" ? shoppingProducts.length : shoppingProducts.filter((product) => product.category === slug).length;
    return `<button type="button" data-shopping-category="${slug}" aria-pressed="${shoppingCategory === slug}"><span>${escapeHtml(label)}</span><small>${count}</small></button>`;
  }).join("");
}

function renderShoppingStoreStrip() {
  const strip = $("#shopping-store-strip");
  if (!strip) return;
  strip.innerHTML = SHOPPING_STORES.map((store) => `<article class="shopping-store-card ${shoppingStore === store.slug ? "selected" : ""}"><button type="button" data-shopping-store="${store.slug}" aria-label="Show ${escapeHtml(store.name)} products"><span class="store-wordmark wordmark-${store.slug}">${escapeHtml(store.mark)}</span></button><a href="${store.url}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${escapeHtml(store.name)}">Visit ↗</a></article>`).join("");
}

function renderShoppingProducts(errorMessage = "") {
  const grid = $("#shopping-product-grid");
  if (!grid) return;
  const products = shoppingFilteredProducts();
  $("#shopping-count").textContent = `${products.length} ${products.length === 1 ? "product" : "products"}`;
  renderShoppingStoreFilters();
  renderShoppingCategoryFilters();
  renderShoppingStoreStrip();
  if (errorMessage) {
    grid.innerHTML = `<div class="empty-state shopping-empty"><strong>Catalog unavailable</strong><span>${escapeHtml(errorMessage)}</span></div>`;
    return;
  }
  if (!products.length) {
    const hasFeeds = shoppingProducts.length > 0;
    grid.innerHTML = `<div class="empty-state shopping-empty"><strong>${hasFeeds ? "No matches" : "Product feeds pending"}</strong><span>${hasFeeds ? "Try another filter." : "Browse the stores above."}</span></div>`;
    return;
  }
  grid.innerHTML = products.map((product) => {
    const store = shoppingStoreBySlug(product.store_slug);
    const destination = safeExternalUrl(product.affiliate_url || product.product_url);
    const image = safeExternalUrl(product.image_url);
    const currentPrice = formatProductPrice(product);
    const comparePrice = product.compare_at_price && Number(product.compare_at_price) > Number(product.price) ? formatProductPrice({ ...product, price: product.compare_at_price }) : "";
    return `<article class="shopping-product-card"><a class="product-image" href="${destination || store?.url || "#"}" target="_blank" rel="noopener noreferrer">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}" loading="lazy" />` : '<span aria-hidden="true">Image pending</span>'}</a><div class="product-card-body"><span class="product-store">${escapeHtml(store?.name || product.brand || product.store_slug)}</span><h2>${escapeHtml(product.title)}</h2><p class="product-price"><strong>${escapeHtml(currentPrice)}</strong>${comparePrice ? `<del>${escapeHtml(comparePrice)}</del>` : ""}</p><a class="button ghost" href="${destination || store?.url || "#"}" target="_blank" rel="noopener noreferrer">View</a></div></article>`;
  }).join("");
}

async function initializeShopping() {
  if (!$("#shopping-product-grid")) return;
  let errorMessage = "";
  try { shoppingProducts = await musicCloud.listShoppingProducts(); }
  catch (error) { shoppingProducts = []; errorMessage = error.message; }
  renderShoppingProducts(errorMessage);
  $("#shopping-store-filters").addEventListener("click", (event) => { const button = event.target.closest("[data-shopping-store]"); if (!button) return; shoppingStore = button.dataset.shoppingStore; renderShoppingProducts(); });
  $("#shopping-store-strip").addEventListener("click", (event) => { const button = event.target.closest("[data-shopping-store]"); if (!button) return; shoppingStore = button.dataset.shoppingStore; renderShoppingProducts(); });
  $("#shopping-category-filters").addEventListener("click", (event) => { const button = event.target.closest("[data-shopping-category]"); if (!button) return; shoppingCategory = button.dataset.shoppingCategory; renderShoppingProducts(); });
  $("#shopping-search").addEventListener("input", () => renderShoppingProducts());
  $("#shopping-sort").addEventListener("change", () => renderShoppingProducts());
}

function installQuickAi() {
  const bar = $("#music-bar");
  if (!bar || $("#quick-ai-toggle")) return;
  bar.insertAdjacentHTML("beforeend", `
    <button id="quick-ai-toggle" class="quick-ai-toggle" type="button" aria-label="Ask AI" aria-expanded="false" aria-controls="quick-ai-popover">AI</button>
    <div id="quick-ai-popover" class="quick-ai-popover" hidden>
      <form id="quick-ai-form">
        <div class="quick-ai-heading"><strong>Ask AI</strong><button id="quick-ai-close" type="button" aria-label="Close AI">×</button></div>
        <select id="quick-ai-topic" aria-label="AI topic"><option>General</option><option>Art</option><option>Dentistry</option><option>Travel</option><option>Books</option><option>Shopping</option><option>Music</option><option>Goals</option></select>
        <textarea id="quick-ai-input" rows="2" maxlength="8000" placeholder="Ask one question" aria-label="Question for AI" required></textarea>
        <button id="quick-ai-send" class="button primary" type="submit">Ask</button>
      </form>
      <div id="quick-ai-answer" class="quick-ai-answer" role="status" aria-live="polite" hidden></div>
    </div>`);
}

function installMusicLayoutParity() {
  const artistSelect = $("#artist-filter");
  if (artistSelect?.tagName === "SELECT") {
    artistSelect.outerHTML = `<details id="artist-filter" class="artist-filter"><summary><span id="artist-filter-label">All artists</span><span aria-hidden="true">⌄</span></summary><div id="artist-filter-options" class="artist-filter-options" role="group" aria-label="Filter by artists"></div></details>`;
  }
  const library = $(".music-workspace .music-library");
  const heading = library?.querySelector(".library-title");
  const fileInput = $("#music-file-input");
  const dropZone = $("#music-drop-zone");
  if (library && heading && fileInput && dropZone) {
    heading.after(fileInput, dropZone);
    const dropTitle = $("strong", dropZone);
    if (dropTitle) dropTitle.textContent = "Drop files";
  }
}

function toggleQuickAi(force) {
  const popover = $("#quick-ai-popover");
  const toggle = $("#quick-ai-toggle");
  const open = typeof force === "boolean" ? force : popover.hidden;
  popover.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  if (open) requestAnimationFrame(() => $("#quick-ai-input").focus());
}

async function invokeRaunyAi(body) {
  try {
    return await musicCloud.invokeFunction("big-pickle", body);
  } catch (error) {
    if (error.status !== 401) throw error;
    await musicCloud.signOut();
    cloudAdminPassword = null;
    updateCloudStatus();
    if (!(await ensureCloudAdmin())) throw new Error("Administrator sign-in is required.");
    return musicCloud.invokeFunction("big-pickle", body);
  }
}

async function askQuickAi(event) {
  event.preventDefault();
  const input = $("#quick-ai-input");
  const question = input.value.trim();
  if (!question || !(await ensureCloudAdmin())) return;
  const topic = $("#quick-ai-topic").value;
  const answer = $("#quick-ai-answer");
  const send = $("#quick-ai-send");
  answer.hidden = false;
  answer.textContent = "Thinking…";
  send.disabled = true;
  try {
    const result = await invokeRaunyAi({ scope: "rauny", topic, message: question });
    if (typeof result.content !== "string") throw new Error("The AI response was empty.");
    answer.textContent = result.content.trim();
  } catch (error) {
    answer.textContent = `I couldn't answer that: ${error.message}`;
  } finally {
    send.disabled = false;
    input.focus();
  }
}

async function addArtFiles(files) {
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (!images.length) return toast("Choose image files for the gallery.");
  if (!(await ensureCloudAdmin())) return;
  let added = 0;
  for (const file of images) {
    try { await musicCloud.uploadArt("rauny", file); added += 1; }
    catch (error) { toast(`Could not upload ${file.name}: ${error.message}`); }
  }
  toast(`${added} artwork ${added === 1 ? "image" : "images"} uploaded to the private cloud.`);
  await renderArt();
}

async function renderArt() {
  const gallery = $("#art-gallery");
  if (!gallery) return;
  gallery.querySelectorAll("img[data-object-url]").forEach((image) => URL.revokeObjectURL(image.dataset.objectUrl));
  if (musicCloud.isSignedIn()) {
    try { artItems = await musicCloud.listArt("rauny"); }
    catch (error) { artItems = []; return void (gallery.innerHTML = `<div class="empty-state">Cloud gallery unavailable: ${escapeHtml(error.message)}</div>`); }
    gallery.innerHTML = artItems.length ? artItems.map((item) => `<article class="art-card"><img src="${item.url}" alt="${escapeHtml(item.name)}" /><footer><strong>${escapeHtml(item.name)}</strong><button class="delete-button" data-delete-art="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button></footer></article>`).join("") : '<div class="empty-state">No artwork yet</div>';
  } else {
    const items = (await dbAll("art").catch(() => [])).sort((a, b) => b.createdAt - a.createdAt);
    gallery.innerHTML = items.length ? items.map((item) => { const url = URL.createObjectURL(item.blob); return `<article class="art-card"><img src="${url}" data-object-url="${url}" alt="${escapeHtml(item.name)}" /><footer><strong>${escapeHtml(item.name)}</strong><button class="delete-button" data-delete-art="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button></footer></article>`; }).join("") : '<div class="empty-state">Unlock cloud</div>';
  }
}

function drawingPoint(event) {
  const canvas = $("#drawing-canvas");
  const bounds = canvas.getBoundingClientRect();
  const pressure = event.pointerType === "mouse" ? (event.buttons ? 0.5 : 0) : Number(event.pressure || 0);
  return {
    x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    pressure,
    tiltX: Number(event.tiltX || 0),
    tiltY: Number(event.tiltY || 0),
    twist: Number(event.twist || 0),
    altitude: Number(event.altitudeAngle || 0),
    azimuth: Number(event.azimuthAngle || 0),
  };
}

function pointAngle(point) {
  if (point.twist) return point.twist * Math.PI / 180;
  if (point.azimuth) return point.azimuth;
  return Math.atan2(point.tiltY, point.tiltX || 0.0001);
}

function brushWidth(stroke, point) {
  const pressure = point.pressure > 0 ? point.pressure : 0.35;
  return Math.max(1, stroke.size * (0.32 + pressure * 1.18));
}

function drawStrokeSegment(stroke, start, end) {
  const context = $("#drawing-canvas").getContext("2d");
  context.save();
  context.globalCompositeOperation = "source-over";
  if (stroke.tool === "marker") {
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(2, stroke.size * 0.28)));
    context.fillStyle = stroke.color;
    context.globalAlpha = 0.22;
    for (let index = 1; index <= steps; index += 1) {
      const amount = index / steps;
      const point = {
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
        pressure: start.pressure + (end.pressure - start.pressure) * amount,
        twist: end.twist,
        azimuth: end.azimuth,
        tiltX: end.tiltX,
        tiltY: end.tiltY,
      };
      const radius = brushWidth(stroke, point) * 1.2;
      context.save();
      context.translate(point.x, point.y);
      context.rotate(pointAngle(point));
      context.scale(1, 0.28);
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  } else {
    context.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = stroke.tool === "eraser" ? stroke.size * 1.8 : brushWidth(stroke, end);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  context.restore();
}

function drawStroke(stroke) {
  if (!stroke.points.length) return;
  if (stroke.points.length === 1) drawStrokeSegment(stroke, stroke.points[0], { ...stroke.points[0], x: stroke.points[0].x + 0.01 });
  for (let index = 1; index < stroke.points.length; index += 1) drawStrokeSegment(stroke, stroke.points[index - 1], stroke.points[index]);
}

function redrawCanvas() {
  const canvas = $("#drawing-canvas");
  const context = canvas.getContext("2d");
  context.save();
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
  drawingStrokes.forEach(drawStroke);
}

function updateDrawingActions() {
  const hasDrawing = drawingStrokes.length > 0;
  $("#drawing-undo").disabled = !hasDrawing;
  $("#drawing-redo").disabled = drawingRedoStack.length === 0;
  $("#drawing-clear").disabled = !hasDrawing;
  $("#drawing-save").disabled = !hasDrawing;
  $("#drawing-download").disabled = !hasDrawing;
}

function selectDrawingTool(tool) {
  drawingTool = tool;
  $$("[data-draw-tool]").forEach((button) => {
    const active = button.dataset.drawTool === tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function undoDrawing() {
  if (!drawingStrokes.length) return;
  drawingRedoStack.push(drawingStrokes.pop());
  redrawCanvas();
  updateDrawingActions();
}

function cycleDrawingTool() {
  const tools = ["pen", "marker", "eraser"];
  selectDrawingTool(tools[(tools.indexOf(drawingTool) + 1) % tools.length]);
  toast(`${drawingTool[0].toUpperCase()}${drawingTool.slice(1)} selected.`);
}

function updatePencilTelemetry(event, point) {
  const isPen = event.pointerType === "pen";
  $("#pencil-input-type").textContent = isPen ? "Apple Pencil / stylus" : event.pointerType === "touch" ? "Touch" : "Mouse";
  $("#pencil-pressure").textContent = `Pressure ${Math.round(point.pressure * 100)}%`;
  const angle = Math.round(pointAngle(point) * 180 / Math.PI);
  $("#pencil-angle").textContent = `${point.twist ? "Barrel" : "Brush"} ${angle}°`;
  const preview = $("#pencil-preview");
  const canvasBounds = $("#drawing-canvas").getBoundingClientRect();
  preview.style.left = `${event.clientX - canvasBounds.left}px`;
  preview.style.top = `${event.clientY - canvasBounds.top}px`;
  preview.style.width = `${Math.max(5, Number($("#drawing-size").value) * (0.5 + point.pressure))}px`;
  preview.style.transform = `translate(-50%,-50%) rotate(${angle}deg)`;
  preview.classList.add("visible");
}

function finishDrawingStroke(event) {
  if (activeDrawingPointer !== event.pointerId) return;
  activeDrawingStroke = null;
  activeDrawingPointer = null;
  updateDrawingActions();
}

function canvasBlob() {
  return new Promise((resolve, reject) => $("#drawing-canvas").toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the drawing image.")), "image/png"));
}

async function saveDrawingToGallery() {
  if (!drawingStrokes.length) return;
  const name = prompt("Name this drawing:", `Drawing ${new Date().toLocaleDateString()}`)?.trim();
  if (!name) return;
  if (!(await ensureCloudAdmin())) return;
  try {
    const blob = await canvasBlob();
    const safeName = name.replace(/[^a-z0-9 _-]+/gi, "").trim() || "Drawing";
    await musicCloud.uploadArt("rauny", new File([blob], `${safeName}.png`, { type: "image/png" }), name);
    await renderArt();
    toast("Drawing saved to the private cloud gallery.");
  } catch (error) { toast(error.message); }
}

async function downloadDrawing() {
  try {
    const blob = await canvasBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rauny-drawing-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { toast(error.message); }
}

function initializeDrawingStudio() {
  if (!$("#drawing-canvas")) return;
  redrawCanvas();
  const supportsPointer = "PointerEvent" in window;
  const supportsCoalesced = supportsPointer && "getCoalescedEvents" in PointerEvent.prototype;
  const supportsAngles = supportsPointer && "altitudeAngle" in PointerEvent.prototype && "azimuthAngle" in PointerEvent.prototype;
  const supportsTwist = supportsPointer && "twist" in PointerEvent.prototype;
  const supported = [supportsPointer && "pressure", supportsCoalesced && "high-resolution points", supportsAngles && "Pencil angles", supportsTwist && "barrel angle when reported"].filter(Boolean);
  $("#pencil-capabilities").textContent = supported.length ? `${supported.join(" · ")} ready in this browser.` : "Basic touch and mouse drawing ready.";

  $("#drawing-canvas").addEventListener("pointerdown", (event) => {
    if ($("#pencil-only").checked && event.pointerType !== "pen") return toast("Pencil-only mode is on.");
    const startPoint = drawingPoint(event);
    if (event.pointerType === "pen") {
      const now = performance.now();
      const isDoubleTap = lastPencilTap && now - lastPencilTap.time < 360 && Math.hypot(startPoint.x - lastPencilTap.x, startPoint.y - lastPencilTap.y) < 85;
      if (isDoubleTap) {
        event.preventDefault();
        lastPencilTap = null;
        undoDrawing();
        toast("Pencil-tip double tap · undo");
        return;
      }
      lastPencilTap = { time: now, x: startPoint.x, y: startPoint.y };
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeDrawingPointer = event.pointerId;
    activeDrawingStroke = { tool: drawingTool, color: $("#drawing-color").value, size: Number($("#drawing-size").value), points: [startPoint] };
    drawingStrokes.push(activeDrawingStroke);
    drawingRedoStack = [];
    drawStroke(activeDrawingStroke);
    updatePencilTelemetry(event, activeDrawingStroke.points[0]);
    updateDrawingActions();
  });

  $("#drawing-canvas").addEventListener("pointermove", (event) => {
    const hoverPoint = drawingPoint(event);
    updatePencilTelemetry(event, hoverPoint);
    if (activeDrawingPointer !== event.pointerId || !activeDrawingStroke) return;
    event.preventDefault();
    const samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [event];
    for (const sample of samples.length ? samples : [event]) {
      const point = drawingPoint(sample);
      const previous = activeDrawingStroke.points.at(-1);
      activeDrawingStroke.points.push(point);
      drawStrokeSegment(activeDrawingStroke, previous, point);
    }
  });
  $("#drawing-canvas").addEventListener("pointerup", finishDrawingStroke);
  $("#drawing-canvas").addEventListener("pointercancel", finishDrawingStroke);
  $("#drawing-canvas").addEventListener("pointerleave", () => { if (activeDrawingPointer === null) $("#pencil-preview").classList.remove("visible"); });

  $$("[data-draw-tool]").forEach((button) => button.addEventListener("click", () => selectDrawingTool(button.dataset.drawTool)));
  $("#pencil-quick-action").addEventListener("click", cycleDrawingTool);
  $("#drawing-size").addEventListener("input", (event) => { $("#drawing-size-output").textContent = event.target.value; });
  $("#drawing-undo").addEventListener("click", undoDrawing);
  $("#drawing-redo").addEventListener("click", () => { if (drawingRedoStack.length) drawingStrokes.push(drawingRedoStack.pop()); redrawCanvas(); updateDrawingActions(); });
  $("#drawing-clear").addEventListener("click", () => { if (!drawingStrokes.length || !confirm("Clear the current drawing?")) return; drawingStrokes = []; drawingRedoStack = []; redrawCanvas(); updateDrawingActions(); });
  $("#drawing-save").addEventListener("click", saveDrawingToGallery);
  $("#drawing-download").addEventListener("click", downloadDrawing);
}

async function addMusicFiles(files) {
  const audio = files.filter((file) => file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus|webm)$/i.test(file.name));
  if (!audio.length) return toast("Choose one or more audio files.");
  if (!(await ensureCloudAdmin())) return;
  let added = 0;
  let duplicates = 0;
  for (const file of audio) {
    try {
      const result = await musicCloud.upload("rauny", file);
      if (result?.duplicate) duplicates += 1;
      else added += 1;
    } catch (error) { toast(`Could not upload ${file.name}: ${error.message}`); }
  }
  toast(`${added} ${added === 1 ? "song" : "songs"} uploaded.${duplicates ? ` ${duplicates} duplicate${duplicates === 1 ? " was" : "s were"} skipped.` : ""}`);
  renderMusic();
}

async function renderMusic() {
  const previousBulkPlaylist = $("#bulk-playlist-select")?.value || "";
  try {
    const library = await musicCloud.list("rauny");
    tracks = library.tracks;
    playlists = library.playlists;
    musicCloudError = "";
  } catch (error) {
    tracks = [];
    playlists = [];
    musicCloudError = error.message;
  }
  renderPlayerMenus();
  if (!$("#track-list")) return restoreMusicPlayerState();
  const artists = [...new Set(tracks.map(trackArtist))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  [...currentArtists].forEach((artist) => { if (!artists.includes(artist)) currentArtists.delete(artist); });
  if (currentPlaylist !== "all" && currentPlaylist !== "none" && !playlists.some((playlist) => String(playlist.id) === currentPlaylist)) currentPlaylist = "all";
  $("#artist-filter-options").innerHTML = `<button id="clear-artist-filter" class="artist-filter-all" type="button">All artists</button>${artists.map((artist) => `<label class="artist-filter-option"><input type="checkbox" data-artist-filter value="${escapeHtml(artist)}" ${currentArtists.has(artist) ? "checked" : ""} /><span>${escapeHtml(artist)}</span></label>`).join("")}`;
  syncArtistFilterUi();
  const playlistOptions = playlists.map((playlist) => `<option value="${playlist.id}">${escapeHtml(playlist.name)}</option>`).join("");
  $("#playlist-filter").innerHTML = `<option value="all">All playlists</option><option value="none">No playlist</option>${playlistOptions}`;
  if ($("#all-track-count")) $("#all-track-count").textContent = tracks.length;
  if ($("#playlist-list")) $("#playlist-list").innerHTML = playlists.map((playlist) => {
    const count = tracks.filter((track) => String(track.playlist_id) === String(playlist.id)).length;
    return `<button class="playlist-tile ${currentPlaylist === String(playlist.id) ? "active" : ""}" type="button" data-playlist="${playlist.id}"><span aria-hidden="true">♬</span><strong>${escapeHtml(playlist.name)}</strong><small><b>${count}</b> ${count === 1 ? "song" : "songs"}</small></button>`;
  }).join("");
  if ($("#bulk-playlist-select")) {
    $("#bulk-playlist-select").innerHTML = `<option value="">Playlist</option>${playlistOptions}`;
    if (playlists.some((playlist) => String(playlist.id) === previousBulkPlaylist)) $("#bulk-playlist-select").value = previousBulkPlaylist;
  }
  renderMusicRows();
  restoreMusicPlayerState();
}

function renderMusicRows() {
  const selectedPlaylist = playlists.find((playlist) => String(playlist.id) === currentPlaylist);
  const normalizedQuery = currentSongQuery.trim().toLocaleLowerCase();
  visibleTracks = tracks.filter((track) => {
    const matchesSong = !normalizedQuery || String(track.title || "").toLocaleLowerCase().includes(normalizedQuery);
    const matchesArtist = !currentArtists.size || currentArtists.has(trackArtist(track));
    const matchesPlaylist = currentPlaylist === "all" || (currentPlaylist === "none" ? !track.playlist_id : String(track.playlist_id) === currentPlaylist);
    return matchesSong && matchesArtist && matchesPlaylist;
  });
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const sortValue = (track) => musicSortColumn === "artist" ? trackArtist(track) : musicSortColumn === "playlist" ? trackPlaylistName(track) : String(track.title || "");
  visibleTracks.sort((left, right) => {
    const compared = collator.compare(sortValue(left), sortValue(right));
    return (compared || collator.compare(String(left.title || ""), String(right.title || ""))) * (musicSortDirection === "asc" ? 1 : -1);
  });
  const availableIds = new Set(tracks.map((track) => String(track.id)));
  [...selectedTrackIds].forEach((id) => { if (!availableIds.has(id)) selectedTrackIds.delete(id); });
  syncArtistFilterUi();
  $("#playlist-filter").value = currentPlaylist;
  $("#track-count").textContent = `${visibleTracks.length} ${visibleTracks.length === 1 ? "song" : "songs"}`;
  $("#library-title").textContent = currentPlaylist === "all" ? "All songs" : currentPlaylist === "none" ? "No playlist" : selectedPlaylist?.name || "Playlist";
  $$(".playlist-tile[data-playlist]").forEach((button) => button.classList.toggle("active", button.dataset.playlist === currentPlaylist));
  const playlistOptions = playlists.map((playlist) => `<option value="${playlist.id}">${escapeHtml(playlist.name)}</option>`).join("");
  $("#track-list").innerHTML = musicCloudError ? `<div class="empty-state">Cloud library unavailable: ${escapeHtml(musicCloudError)}</div>` : visibleTracks.length ? visibleTracks.map((track) => {
    const editing = editingTrackId === String(track.id);
    const songCell = editing ? `<input class="track-edit-input" data-edit-title type="text" maxlength="200" value="${escapeHtml(track.title)}" aria-label="Song title" />` : `<div class="track-song"><strong>${escapeHtml(track.title)}</strong><small>${formatBytes(track.size_bytes)}</small></div>`;
    const artistCell = editing ? `<input class="track-edit-input" data-edit-artist type="text" maxlength="200" value="${escapeHtml(trackArtist(track))}" aria-label="Artist name" />` : `<div class="track-artist" title="${escapeHtml(trackArtist(track))}">${escapeHtml(trackArtist(track))}</div>`;
    const actions = editing ? `<div class="track-row-actions"><button class="track-save" type="button" data-save-track="${track.id}">Save</button><button class="track-cancel" type="button" data-cancel-track="${track.id}" aria-label="Cancel editing">×</button></div>` : `<div class="track-row-actions"><button class="track-edit" type="button" data-edit-track="${track.id}" aria-label="Edit ${escapeHtml(track.title)}">✎</button><button class="delete-button" type="button" data-delete-track="${track.id}" aria-label="Delete ${escapeHtml(track.title)}">×</button></div>`;
    const playing = String(track.id) === String(currentTrackId);
    return `<article class="track-row${editing ? " editing" : ""}${playing ? " playing" : ""}" data-track-row="${track.id}"><input class="track-select" type="checkbox" data-select-track="${track.id}" aria-label="Select ${escapeHtml(track.title)}" ${selectedTrackIds.has(String(track.id)) ? "checked" : ""} /><button class="track-play" data-play-track="${track.id}" aria-label="Play ${escapeHtml(track.title)}">${playing && !$("#audio-player").paused ? "❚❚" : "▶"}</button>${songCell}${artistCell}<select class="track-playlist-select" data-assign-track="${track.id}" aria-label="Playlist for ${escapeHtml(track.title)}"><option value="">No playlist</option>${playlistOptions}</select>${actions}</article>`;
  }).join("") : `<div class="empty-state">${tracks.length ? "No songs match these filters" : "No music here yet"}</div>`;
  $$('[data-assign-track]').forEach((select) => { const track = tracks.find((item) => String(item.id) === String(select.dataset.assignTrack)); select.value = track?.playlist_id || ""; });
  updateMusicSortControls();
  updateTrackSelectionControls();
  syncMusicCollectionView();
}

function syncMusicCollectionView() {
  const browser = $("#playlist-browser");
  const library = $("#music-library-view");
  if (!browser || !library) return;
  browser.hidden = musicLibraryOpen;
  library.hidden = !musicLibraryOpen;
}

function closeMusicLibrary() {
  musicLibraryOpen = false;
  selectedTrackIds.clear();
  editingTrackId = null;
  syncMusicCollectionView();
  $("#playlist-browser")?.scrollIntoView({ block: "start", behavior: "auto" });
}

function syncArtistFilterUi() {
  const artists = [...currentArtists];
  const label = $("#artist-filter-label");
  if (label) {
    label.textContent = artists.length === 0 ? "All artists" : artists.length === 1 ? artists[0] : `${artists.length} artists`;
    label.closest("summary")?.setAttribute("title", artists.length ? artists.join(", ") : "All artists");
  }
  $$("[data-artist-filter]").forEach((checkbox) => { checkbox.checked = currentArtists.has(checkbox.value); });
  $("#clear-artist-filter")?.classList.toggle("active", artists.length === 0);
}

function readMusicPlayerState() {
  try { return JSON.parse(sessionStorage.getItem(MUSIC_PLAYER_STATE_KEY)) || null; } catch { return null; }
}

function basePlayerQueue() {
  return playerPlaylist === "all" ? tracks : tracks.filter((track) => String(track.playlist_id) === playerPlaylist);
}

function refreshShuffledQueue() {
  shuffledTrackIds = basePlayerQueue().map((track) => String(track.id));
  for (let index = shuffledTrackIds.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffledTrackIds[index], shuffledTrackIds[other]] = [shuffledTrackIds[other], shuffledTrackIds[index]];
  }
}

function playerQueue() {
  const base = basePlayerQueue();
  if (!shuffleEnabled) return base;
  const byId = new Map(base.map((track) => [String(track.id), track]));
  shuffledTrackIds = shuffledTrackIds.filter((id) => byId.has(id));
  base.forEach((track) => { if (!shuffledTrackIds.includes(String(track.id))) shuffledTrackIds.push(String(track.id)); });
  return shuffledTrackIds.map((id) => byId.get(id)).filter(Boolean);
}

function renderPlayerMenus() {
  const playlistSelect = $("#player-playlist-select");
  const songSelect = $("#player-track-select");
  if (!playlistSelect || !songSelect) return;
  if (playerPlaylist !== "all" && !playlists.some((playlist) => String(playlist.id) === playerPlaylist)) playerPlaylist = "all";
  playlistSelect.innerHTML = `<option value="all">All songs (${tracks.length})</option>${playlists.map((playlist) => {
    const count = tracks.filter((track) => String(track.playlist_id) === String(playlist.id)).length;
    return `<option value="${playlist.id}">${escapeHtml(playlist.name)} (${count})</option>`;
  }).join("")}`;
  playlistSelect.value = playerPlaylist;
  const queue = playerQueue();
  songSelect.innerHTML = queue.length ? '<option value="">Choose a song</option>' + queue.map((track) => `<option value="${track.id}">${escapeHtml(track.title)}</option>`).join("") : '<option value="">No songs in this playlist</option>';
  if (currentTrackId && queue.some((track) => String(track.id) === String(currentTrackId))) songSelect.value = String(currentTrackId);
  $("#music-shuffle-toggle")?.setAttribute("aria-pressed", String(shuffleEnabled));
}

function saveMusicPlayerState() {
  const track = tracks.find((item) => String(item.id) === String(currentTrackId));
  const player = $("#audio-player");
  sessionStorage.setItem(MUSIC_PLAYER_STATE_KEY, JSON.stringify({ playlistId: playerPlaylist, trackId: track ? String(track.id) : null, title: track?.title || $("#now-playing").textContent, currentTime: track ? Number(player.currentTime || 0) : 0, playing: Boolean(track && !player.paused), shuffle: shuffleEnabled }));
}

function restoreMusicPlayerState() {
  if (playerStateRestored) return;
  playerStateRestored = true;
  const saved = readMusicPlayerState();
  playerPlaylist = saved?.playlistId || "all";
  shuffleEnabled = Boolean(saved?.shuffle);
  if (playerPlaylist !== "all" && !playlists.some((playlist) => String(playlist.id) === playerPlaylist)) playerPlaylist = "all";
  if (shuffleEnabled) refreshShuffledQueue();
  const track = tracks.find((item) => String(item.id) === String(saved?.trackId));
  if (track && !playerQueue().some((item) => String(item.id) === String(track.id))) {
    playerPlaylist = "all";
    if (shuffleEnabled) refreshShuffledQueue();
  }
  renderPlayerMenus();
  if (!track) return;
  currentTrackId = String(track.id);
  const player = $("#audio-player");
  player.src = track.url;
  $("#now-playing").textContent = track.title;
  $("#player-track-select").value = String(track.id);
  if (Number(saved.currentTime) > 0) {
    const seek = () => { player.currentTime = Math.min(Number(saved.currentTime), Number.isFinite(player.duration) ? player.duration : Number(saved.currentTime)); };
    if (player.readyState >= 1) seek(); else player.addEventListener("loadedmetadata", seek, { once: true });
  }
  if (saved.playing) player.play().catch(() => {});
  updateMediaSession(track);
  updatePlayerPresentation();
}

function updateTrackSelectionControls() {
  const selectAll = $("#select-all-tracks");
  const deleteButton = $("#delete-selected-tracks");
  const bulkSelect = $("#bulk-playlist-select");
  const assignButton = $("#assign-selected-tracks");
  if (!selectAll || !deleteButton) return;
  const ids = visibleTracks.map((track) => String(track.id));
  const selectedCount = ids.filter((id) => selectedTrackIds.has(id)).length;
  selectAll.disabled = ids.length === 0;
  selectAll.checked = ids.length > 0 && selectedCount === ids.length;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < ids.length;
  deleteButton.disabled = selectedTrackIds.size === 0;
  deleteButton.textContent = selectedTrackIds.size ? `Delete ${selectedTrackIds.size}` : "Delete";
  if (bulkSelect) bulkSelect.disabled = bulkSelect.options.length <= 1;
  if (assignButton) {
    assignButton.disabled = selectedTrackIds.size === 0 || !bulkSelect?.value;
    assignButton.textContent = selectedTrackIds.size ? `Add ${selectedTrackIds.size}` : "Add selected";
  }
}

async function deleteSelectedTracks() {
  const selected = tracks.filter((track) => selectedTrackIds.has(String(track.id)));
  if (!selected.length || !(await ensureCloudAdmin())) return;
  if (!confirm(`Delete ${selected.length} selected song${selected.length === 1 ? "" : "s"} from the cloud library?`)) return;
  try { await musicCloud.deleteTracks(selected); }
  catch (error) { return toast(error.message); }
  if (selected.some((track) => String(track.id) === String(currentTrackId))) {
    $("#audio-player").pause();
    currentTrackId = null;
    sessionStorage.removeItem(MUSIC_PLAYER_STATE_KEY);
    $("#now-playing").textContent = "Nothing selected";
  }
  selectedTrackIds.clear();
  await renderMusic();
  toast(`${selected.length} song${selected.length === 1 ? "" : "s"} deleted.`);
}

function updatePlayerPresentation() {
  const player = $("#audio-player");
  $("#toggle-track").textContent = player.paused ? "▶" : "❚❚";
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = currentTrackId ? (player.paused ? "paused" : "playing") : "none";
  $$('[data-track-row]').forEach((row) => {
    const playing = String(row.dataset.trackRow) === String(currentTrackId);
    row.classList.toggle("playing", playing);
    const button = $("[data-play-track]", row);
    if (button) button.textContent = playing && !player.paused ? "❚❚" : "▶";
  });
}

function updateMediaSession(track) {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined" || !track) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: trackArtist(track),
    album: "Rauny Ramirez",
    artwork: [{ src: new URL("/icon-512.png", location.href).href, sizes: "512x512", type: "image/png" }],
  });
}

function updateMediaPosition() {
  const player = $("#audio-player");
  if (!("mediaSession" in navigator) || typeof navigator.mediaSession.setPositionState !== "function" || !Number.isFinite(player.duration) || player.duration <= 0) return;
  try { navigator.mediaSession.setPositionState({ duration: player.duration, playbackRate: player.playbackRate, position: Math.min(player.currentTime, player.duration) }); } catch {}
}

function installMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const player = $("#audio-player");
  const handlers = {
    play: () => player.play().catch(() => {}), pause: () => player.pause(),
    previoustrack: () => stepTrack(-1), nexttrack: () => stepTrack(1),
    seekbackward: (details) => { player.currentTime = Math.max(0, player.currentTime - (details.seekOffset || 10)); },
    seekforward: (details) => { player.currentTime = Math.min(player.duration || Infinity, player.currentTime + (details.seekOffset || 10)); },
    seekto: (details) => { if (Number.isFinite(details.seekTime)) player.currentTime = details.seekTime; },
  };
  Object.entries(handlers).forEach(([action, handler]) => { try { navigator.mediaSession.setActionHandler(action, handler); } catch {} });
}

async function playTrack(id, options = {}) {
  const track = tracks.find((item) => String(item.id) === String(id));
  if (!track) return;
  if (options.playlistId && (options.playlistId === "all" || playlists.some((playlist) => String(playlist.id) === String(options.playlistId)))) playerPlaylist = String(options.playlistId);
  if (!playerQueue().some((item) => String(item.id) === String(track.id))) {
    playerPlaylist = "all";
    if (shuffleEnabled) refreshShuffledQueue();
  }
  currentTrackId = track.id;
  const player = $("#audio-player");
  player.src = track.url;
  $("#now-playing").textContent = track.title;
  renderPlayerMenus();
  updateMediaSession(track);
  try { await player.play(); } catch { toast("Tap play to start this song."); }
  updatePlayerPresentation();
  saveMusicPlayerState();
}

async function playSelectedPlaylist(id) {
  playerPlaylist = id === "all" || playlists.some((playlist) => String(playlist.id) === String(id)) ? String(id) : "all";
  currentTrackId = null;
  if (shuffleEnabled) refreshShuffledQueue();
  renderPlayerMenus();
  const queue = playerQueue();
  if (queue.length) return playTrack(queue[0].id);
  const player = $("#audio-player");
  player.pause();
  player.removeAttribute("src");
  player.load();
  const playlist = playlists.find((item) => String(item.id) === playerPlaylist);
  $("#now-playing").textContent = playlist ? `${playlist.name} is empty` : "No music added yet";
  $("#toggle-track").textContent = "▶";
  saveMusicPlayerState();
}

async function createPlaylist() {
  if (!(await ensureCloudAdmin())) return;
  const name = prompt("Name this playlist:");
  if (!name?.trim()) return;
  try {
    const playlist = await musicCloud.createPlaylist("rauny", name.trim());
    currentPlaylist = String(playlist.id);
    musicLibraryOpen = true;
    await renderMusic();
    toast("Playlist created.");
  } catch (error) { toast(error.message); }
}

async function assignTrack(trackId, playlistId) {
  if (!(await ensureCloudAdmin())) return renderMusic();
  try {
    await musicCloud.assignTrack(trackId, playlistId || null);
    selectedTrackIds.delete(String(trackId));
    await renderMusic();
    toast(playlistId ? "Song moved to the selected playlist." : "Song removed from playlists.");
  } catch (error) { toast(error.message); renderMusic(); }
}

async function saveTrackEdits(button) {
  const row = button.closest("[data-track-row]");
  const track = tracks.find((item) => String(item.id) === String(row?.dataset.trackRow));
  if (!row || !track) return;
  const title = $("[data-edit-title]", row)?.value.trim() || "";
  const artist = $("[data-edit-artist]", row)?.value.trim() || "";
  if (!title || !artist) return toast("Song and artist names cannot be empty.");
  if (!(await ensureCloudAdmin())) return;
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await musicCloud.updateTrackMetadata(track, title, artist);
    editingTrackId = null;
    await renderMusic();
    if (String(currentTrackId) === String(track.id)) $("#now-playing").textContent = title;
    toast("Song details saved to the cloud.");
  } catch (error) {
    button.disabled = false;
    button.textContent = "Save";
    toast(error.message);
  }
}

async function assignSelectedTracks() {
  const selected = tracks.filter((track) => selectedTrackIds.has(String(track.id)));
  const playlistId = $("#bulk-playlist-select")?.value;
  if (!selected.length) return;
  if (!playlistId) return toast("Choose a playlist.");
  if (!(await ensureCloudAdmin())) return;
  const button = $("#assign-selected-tracks");
  button.disabled = true;
  button.textContent = "Adding…";
  try {
    await musicCloud.assignTracks(selected.map((track) => track.id), playlistId);
  } catch (error) {
    toast(error.message);
    return updateTrackSelectionControls();
  }
  selectedTrackIds.clear();
  await renderMusic();
  toast(`${selected.length} song${selected.length === 1 ? "" : "s"} added to the playlist.`);
}

async function ensureCloudAdmin() {
  if (musicCloud.isSignedIn()) return true;
  cloudAdminPassword ||= prompt("Enter the admin password for Rauny’s private cloud workspace:") || null;
  if (!cloudAdminPassword) return false;
  try {
    await musicCloud.signIn(CLOUD_ADMIN_EMAIL, cloudAdminPassword);
    await syncRaunyWorkspace();
    return true;
  } catch (error) {
    cloudAdminPassword = null;
    toast(error.message);
    return false;
  }
}

function stepTrack(direction) {
  const pool = playerQueue();
  if (!pool.length) return;
  const index = pool.findIndex((track) => String(track.id) === String(currentTrackId));
  playTrack(pool[index < 0 ? 0 : (index + direction + pool.length) % pool.length].id);
}

function bindDropZone(zoneSelector, inputSelector, chooseSelector, handler) {
  const zone = $(zoneSelector); const input = $(inputSelector);
  if (!zone || !input || !$(chooseSelector)) return;
  const open = () => input.click();
  zone.addEventListener("click", (event) => { if (!event.target.closest("button")) open(); });
  $(chooseSelector).addEventListener("click", (event) => { event.stopPropagation(); open(); });
  zone.addEventListener("keydown", (event) => { if (!["Enter", " "].includes(event.key)) return; event.preventDefault(); open(); });
  ["dragenter", "dragover"].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; zone.classList.add("is-dragging"); }));
  ["dragleave", "dragend"].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); if (name === "dragleave" && zone.contains(event.relatedTarget)) return; zone.classList.remove("is-dragging"); }));
  zone.addEventListener("drop", (event) => { event.preventDefault(); zone.classList.remove("is-dragging"); handler([...event.dataTransfer.files]); });
  input.addEventListener("change", (event) => { handler([...event.target.files]); event.target.value = ""; });
}

installQuickAi();
installMusicLayoutParity();
normalizePrimaryNavigation();
$("#menu-toggle").addEventListener("click", () => { const nav = $("#primary-nav"); nav.classList.toggle("open"); $("#menu-toggle").setAttribute("aria-expanded", String(nav.classList.contains("open"))); });
$$('#primary-nav a').forEach((link) => link.addEventListener("click", () => $("#primary-nav").classList.remove("open")));
$("#theme-toggle").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
$("#cloud-status").addEventListener("click", ensureCloudAdmin);

$("#dentistry-form")?.addEventListener("submit", async (event) => { event.preventDefault(); if (!(await ensureCloudAdmin())) return; const notes = read(KEYS.dentistry); notes.unshift({ id: Date.now(), topic: $("#dentistry-topic").value.trim(), note: $("#dentistry-note").value.trim(), date: new Date().toLocaleDateString() }); await saveCloudList(KEYS.dentistry, notes); event.target.reset(); renderDentistry(); toast("Dentistry note synced."); });
$("#dentistry-notes")?.addEventListener("click", async (event) => { const button = event.target.closest("[data-delete-note]"); if (!button || !(await ensureCloudAdmin())) return; await saveCloudList(KEYS.dentistry, read(KEYS.dentistry).filter((item) => item.id !== Number(button.dataset.deleteNote))); renderDentistry(); });

$("#goal-form")?.addEventListener("submit", async (event) => { event.preventDefault(); if (!(await ensureCloudAdmin())) return; const goals = read(KEYS.goals); goals.unshift({ id: Date.now(), title: $("#goal-title").value.trim(), area: $("#goal-area").value, done: false }); await saveCloudList(KEYS.goals, goals); event.target.reset(); renderGoals(); toast("Goal synced to the board."); });
$("#goal-board")?.addEventListener("click", async (event) => { const toggle = event.target.closest("[data-toggle-goal]"); const remove = event.target.closest("[data-delete-goal]"); if ((!toggle && !remove) || !(await ensureCloudAdmin())) return; const goals = read(KEYS.goals); if (toggle) { const goal = goals.find((item) => item.id === Number(toggle.dataset.toggleGoal)); if (goal) goal.done = !goal.done; } if (remove) { const index = goals.findIndex((item) => item.id === Number(remove.dataset.deleteGoal)); if (index >= 0) goals.splice(index, 1); } await saveCloudList(KEYS.goals, goals); renderGoals(); });

$("#art-gallery")?.addEventListener("click", async (event) => { const button = event.target.closest("[data-delete-art]"); if (!button) return; const alreadySignedIn = musicCloud.isSignedIn(); if (!(await ensureCloudAdmin())) return; if (!alreadySignedIn) return renderArt(); const item = artItems.find((candidate) => candidate.id === button.dataset.deleteArt); if (!item || !confirm(`Delete ${item.name} from the private cloud gallery?`)) return; await musicCloud.deleteArt(item); renderArt(); });
$("#track-list")?.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-track]");
  const save = event.target.closest("[data-save-track]");
  const cancel = event.target.closest("[data-cancel-track]");
  const play = event.target.closest("[data-play-track]");
  const remove = event.target.closest("[data-delete-track]");
  if (edit) {
    editingTrackId = String(edit.dataset.editTrack);
    renderMusicRows();
    return requestAnimationFrame(() => document.querySelector(`[data-track-row='${editingTrackId}'] [data-edit-title]`)?.focus());
  }
  if (save) return saveTrackEdits(save);
  if (cancel) { editingTrackId = null; return renderMusicRows(); }
  if (play) playTrack(play.dataset.playTrack, { playlistId: currentPlaylist === "none" ? "all" : currentPlaylist });
  if (remove && await ensureCloudAdmin() && confirm("Delete this song from the cloud library?")) {
    const track = tracks.find((item) => item.id === remove.dataset.deleteTrack);
    if (!track) return;
    try {
      await musicCloud.deleteTrack(track);
      selectedTrackIds.delete(String(track.id));
      if (String(currentTrackId) === String(track.id)) { $("#audio-player").pause(); currentTrackId = null; sessionStorage.removeItem(MUSIC_PLAYER_STATE_KEY); $("#now-playing").textContent = "Nothing selected"; }
      renderMusic();
    } catch (error) { toast(error.message); }
  }
});
$("#track-list")?.addEventListener("keydown", (event) => {
  if (!event.target.matches("[data-edit-title], [data-edit-artist]")) return;
  const row = event.target.closest("[data-track-row]");
  if (event.key === "Enter") { event.preventDefault(); $("[data-save-track]", row)?.click(); }
  if (event.key === "Escape") { event.preventDefault(); editingTrackId = null; renderMusicRows(); }
});
$("#track-list")?.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-select-track]");
  const playlistSelect = event.target.closest("[data-assign-track]");
  if (checkbox) {
    if (checkbox.checked) selectedTrackIds.add(String(checkbox.dataset.selectTrack));
    else selectedTrackIds.delete(String(checkbox.dataset.selectTrack));
    updateTrackSelectionControls();
  }
  if (playlistSelect) assignTrack(playlistSelect.dataset.assignTrack, playlistSelect.value);
});
$("#select-all-tracks")?.addEventListener("change", (event) => {
  visibleTracks.forEach((track) => event.target.checked ? selectedTrackIds.add(String(track.id)) : selectedTrackIds.delete(String(track.id)));
  $$('[data-select-track]').forEach((checkbox) => { checkbox.checked = event.target.checked; });
  updateTrackSelectionControls();
});
$("#new-playlist")?.addEventListener("click", createPlaylist);
$("#close-music-library")?.addEventListener("click", closeMusicLibrary);
$("#assign-selected-tracks")?.addEventListener("click", assignSelectedTracks);
$("#bulk-playlist-select")?.addEventListener("change", updateTrackSelectionControls);
$("#song-filter")?.addEventListener("input", (event) => { selectedTrackIds.clear(); currentSongQuery = event.target.value; renderMusicRows(); });
$("#artist-filter-options")?.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-artist-filter]");
  if (!checkbox) return;
  selectedTrackIds.clear();
  if (checkbox.checked) currentArtists.add(checkbox.value); else currentArtists.delete(checkbox.value);
  renderMusicRows();
});
$("#artist-filter-options")?.addEventListener("click", (event) => {
  if (!event.target.closest("#clear-artist-filter")) return;
  selectedTrackIds.clear();
  currentArtists.clear();
  renderMusicRows();
});
$("#playlist-filter")?.addEventListener("change", (event) => { selectedTrackIds.clear(); currentPlaylist = event.target.value; renderMusicRows(); });
$$('[data-sort-column]').forEach((button) => button.addEventListener("click", () => setMusicSort(button.dataset.sortColumn)));
$(".music-workspace")?.addEventListener("click", (event) => {
  const playlist = event.target.closest("[data-playlist]");
  if (!playlist) return;
  selectedTrackIds.clear();
  currentPlaylist = playlist.dataset.playlist;
  currentArtists.clear();
  currentSongQuery = "";
  if ($("#song-filter")) $("#song-filter").value = "";
  musicLibraryOpen = true;
  renderMusicRows();
});
$("#delete-selected-tracks")?.addEventListener("click", deleteSelectedTracks);
$("#quick-ai-toggle").addEventListener("click", () => toggleQuickAi());
$("#quick-ai-close").addEventListener("click", () => toggleQuickAi(false));
$("#quick-ai-form").addEventListener("submit", askQuickAi);
$("#quick-ai-input").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  event.currentTarget.form.requestSubmit();
});
document.addEventListener("click", (event) => {
  const pdfButton = event.target.closest("[data-open-dentistry-pdf]");
  const retryButton = event.target.closest("[data-dentistry-retry]");
  if (pdfButton) openDentistryPdf(pdfButton.dataset.openDentistryPdf);
  if (retryButton) startDentistryTest(Number(retryButton.dataset.dentistryRetry));
  if (!$("#quick-ai-popover").hidden && !event.target.closest("#quick-ai-popover") && !event.target.closest("#quick-ai-toggle")) toggleQuickAi(false);
  if (!$("#music-queue-menu").hidden && !event.target.closest("#music-queue-menu") && !event.target.closest("#music-queue-toggle")) {
    $("#music-queue-menu").hidden = true;
    $("#music-queue-toggle").setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!$("#quick-ai-popover").hidden) toggleQuickAi(false);
  else if (!$("#music-queue-menu").hidden) { $("#music-queue-menu").hidden = true; $("#music-queue-toggle").setAttribute("aria-expanded", "false"); }
  else if (musicLibraryOpen) closeMusicLibrary();
  if ($("#dentistry-pdf-drawer") && !$("#dentistry-pdf-drawer").hidden) closeDentistryPdf();
});
$("#music-queue-toggle").addEventListener("click", () => { const menu = $("#music-queue-menu"); menu.hidden = !menu.hidden; $("#music-queue-toggle").setAttribute("aria-expanded", String(!menu.hidden)); });
$("#music-shuffle-toggle").addEventListener("click", () => {
  shuffleEnabled = !shuffleEnabled;
  if (shuffleEnabled) refreshShuffledQueue();
  renderPlayerMenus();
  saveMusicPlayerState();
});
$("#player-playlist-select").addEventListener("change", (event) => playSelectedPlaylist(event.target.value));
$("#player-track-select").addEventListener("change", (event) => { if (event.target.value) playTrack(event.target.value); });
$("#toggle-track").addEventListener("click", () => { const player = $("#audio-player"); if (!player.src && playerQueue().length) return playTrack(playerQueue()[0].id); if (player.paused) player.play(); else player.pause(); });
$("#previous-track").addEventListener("click", () => stepTrack(-1));
$("#next-track").addEventListener("click", () => stepTrack(1));
$("#audio-player").addEventListener("play", () => { updatePlayerPresentation(); saveMusicPlayerState(); });
$("#audio-player").addEventListener("pause", () => { updatePlayerPresentation(); saveMusicPlayerState(); });
$("#audio-player").addEventListener("ended", () => stepTrack(1));
$("#audio-player").addEventListener("loadedmetadata", updateMediaPosition);
$("#audio-player").addEventListener("timeupdate", updateMediaPosition);
window.addEventListener("pagehide", saveMusicPlayerState);

bindDropZone("#art-drop-zone", "#art-file-input", "#choose-art", addArtFiles);
bindDropZone("#music-drop-zone", "#music-file-input", "#choose-music", addMusicFiles);
$("#dentistry-topic-filter")?.addEventListener("change", renderDentistryStudy);
$("#dentistry-study-search")?.addEventListener("input", renderDentistryStudy);
$$("[data-dentistry-mode='study']").forEach((button) => button.addEventListener("click", showDentistryStudy));
$$("[data-dentistry-test]").forEach((button) => button.addEventListener("click", () => startDentistryTest(Number(button.dataset.dentistryTest))));
$("#dentistry-test-form")?.addEventListener("submit", gradeDentistryTest);
$("#dentistry-pdf-close")?.addEventListener("click", closeDentistryPdf);
$("#dentistry-pdf-backdrop")?.addEventListener("click", closeDentistryPdf);
applyTheme(localStorage.getItem(KEYS.theme) || "light");
installMediaSession();
initializeDrawingStudio(); initializeDentistryStudy(); renderDentistry(); renderGoals(); renderArt(); renderMusic(); initializeShopping(); updateCloudStatus();
if (musicCloud.isSignedIn()) syncRaunyWorkspace();
