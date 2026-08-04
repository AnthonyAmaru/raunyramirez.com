const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const KEYS = { theme: "rauny_theme", dentistry: "rauny_dentistry_notes", goals: "rauny_goal_board" };
const CLOUD_ADMIN_EMAIL = "anthonyamaru93@gmail.com";
const CLOUD_CONTENT_KEYS = { [KEYS.dentistry]: "dentistry", [KEYS.goals]: "goals" };
const PRIMARY_NAV_ITEMS = [
  ["resume.html", "Resume"],
  ["interests.html", "Interests"],
  ["music.html", "Music"],
  ["goals.html", "Goals"],
];
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
let currentTrackId = null;
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

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}

function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]); }
function formatBytes(bytes) { return bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1e6).toFixed(1)} MB`; }
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
  if (["art.html", "travel.html", "books.html", "shopping.html"].includes(currentPage)) currentPage = "interests.html";
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
  let errorMessage = "";
  try { tracks = await musicCloud.list("rauny"); } catch (error) { tracks = []; errorMessage = error.message; }
  const availableIds = new Set(tracks.map((track) => String(track.id)));
  [...selectedTrackIds].forEach((id) => { if (!availableIds.has(id)) selectedTrackIds.delete(id); });
  if ($("#track-count")) $("#track-count").textContent = `${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`;
  if ($("#track-list")) $("#track-list").innerHTML = errorMessage ? `<div class="empty-state">Cloud library unavailable: ${escapeHtml(errorMessage)}</div>` : tracks.length ? tracks.map((track) => `<article class="track-row"><input class="track-select" type="checkbox" data-select-track="${track.id}" aria-label="Select ${escapeHtml(track.title)}" ${selectedTrackIds.has(String(track.id)) ? "checked" : ""} /><button class="track-play" data-play-track="${track.id}" aria-label="Play ${escapeHtml(track.title)}">▶</button><div><strong>${escapeHtml(track.title)}</strong><small>${formatBytes(track.size_bytes)}</small></div><button class="delete-button" data-delete-track="${track.id}" aria-label="Delete ${escapeHtml(track.title)}">×</button></article>`).join("") : '<div class="empty-state">No music yet</div>';
  updateTrackSelectionControls();
}

function updateTrackSelectionControls() {
  const selectAll = $("#select-all-tracks");
  const deleteButton = $("#delete-selected-tracks");
  if (!selectAll || !deleteButton) return;
  const ids = tracks.map((track) => String(track.id));
  const selectedCount = ids.filter((id) => selectedTrackIds.has(id)).length;
  selectAll.disabled = ids.length === 0;
  selectAll.checked = ids.length > 0 && selectedCount === ids.length;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < ids.length;
  deleteButton.disabled = selectedTrackIds.size === 0;
  deleteButton.textContent = selectedTrackIds.size ? `Delete ${selectedTrackIds.size}` : "Delete";
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
    $("#now-playing").textContent = "Nothing selected";
  }
  selectedTrackIds.clear();
  await renderMusic();
  toast(`${selected.length} song${selected.length === 1 ? "" : "s"} deleted.`);
}

async function playTrack(id) {
  const track = tracks.find((item) => item.id === String(id));
  if (!track) return;
  currentTrackId = track.id;
  const player = $("#audio-player");
  player.src = track.url;
  $("#now-playing").textContent = track.title;
  try { await player.play(); } catch { toast("Tap play to start this song."); }
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
  if (!tracks.length) return;
  const index = Math.max(0, tracks.findIndex((track) => track.id === currentTrackId));
  playTrack(tracks[(index + direction + tracks.length) % tracks.length].id);
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
  const play = event.target.closest("[data-play-track]");
  const remove = event.target.closest("[data-delete-track]");
  if (play) playTrack(play.dataset.playTrack);
  if (remove && await ensureCloudAdmin() && confirm("Delete this song from the cloud library?")) {
    const track = tracks.find((item) => item.id === remove.dataset.deleteTrack);
    if (!track) return;
    try {
      await musicCloud.deleteTrack(track);
      selectedTrackIds.delete(String(track.id));
      if (String(currentTrackId) === String(track.id)) { $("#audio-player").pause(); currentTrackId = null; $("#now-playing").textContent = "Nothing selected"; }
      renderMusic();
    } catch (error) { toast(error.message); }
  }
});
$("#track-list")?.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-select-track]");
  if (!checkbox) return;
  if (checkbox.checked) selectedTrackIds.add(String(checkbox.dataset.selectTrack));
  else selectedTrackIds.delete(String(checkbox.dataset.selectTrack));
  updateTrackSelectionControls();
});
$("#select-all-tracks")?.addEventListener("change", (event) => {
  tracks.forEach((track) => event.target.checked ? selectedTrackIds.add(String(track.id)) : selectedTrackIds.delete(String(track.id)));
  $$('[data-select-track]').forEach((checkbox) => { checkbox.checked = event.target.checked; });
  updateTrackSelectionControls();
});
$("#delete-selected-tracks")?.addEventListener("click", deleteSelectedTracks);
$("#toggle-track").addEventListener("click", () => { const player = $("#audio-player"); if (!player.src && tracks.length) return playTrack(tracks[0].id); if (player.paused) player.play(); else player.pause(); });
$("#previous-track").addEventListener("click", () => stepTrack(-1));
$("#next-track").addEventListener("click", () => stepTrack(1));
$("#audio-player").addEventListener("play", () => $("#toggle-track").textContent = "❚❚");
$("#audio-player").addEventListener("pause", () => $("#toggle-track").textContent = "▶");
$("#audio-player").addEventListener("ended", () => stepTrack(1));

bindDropZone("#art-drop-zone", "#art-file-input", "#choose-art", addArtFiles);
bindDropZone("#music-drop-zone", "#music-file-input", "#choose-music", addMusicFiles);
applyTheme(localStorage.getItem(KEYS.theme) || "light");
initializeDrawingStudio(); renderDentistry(); renderGoals(); renderArt(); renderMusic(); initializeShopping(); updateCloudStatus();
if (musicCloud.isSignedIn()) syncRaunyWorkspace();
