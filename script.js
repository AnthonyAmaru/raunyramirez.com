const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const KEYS = { theme: "rauny_theme", dentistry: "rauny_dentistry_notes", diet: "rauny_diet_log", goals: "rauny_goal_board" };
let toastTimer;
let tracks = [];
let currentTrackId = null;
let trackUrl = null;

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}

function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]); }
function formatBytes(bytes) { return bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1e6).toFixed(1)} MB`; }
function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("visible"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("visible"), 2600); }

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
  $("#theme-toggle").textContent = theme === "dark" ? "☀" : "☾";
  localStorage.setItem(KEYS.theme, theme);
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
  const notes = read(KEYS.dentistry);
  $("#dentistry-notes").innerHTML = notes.length ? notes.map((note) => `<article class="note-card"><span>${escapeHtml(note.date)}</span><button class="delete-button" data-delete-note="${note.id}" aria-label="Delete ${escapeHtml(note.topic)}">×</button><h3>${escapeHtml(note.topic)}</h3><p>${escapeHtml(note.note)}</p></article>`).join("") : '<div class="empty-state">Add a subject, reflection, or milestone to begin.</div>';
}

function renderDiet() {
  const entries = read(KEYS.diet).sort((a, b) => b.id - a.id);
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = entries.filter((entry) => entry.date === today);
  const water = todayEntries.reduce((sum, entry) => sum + Number(entry.water || 0), 0);
  $("#diet-summary").innerHTML = `<span>${todayEntries.length} ${todayEntries.length === 1 ? "entry" : "entries"} today</span><span>${water} cups of water logged today</span>`;
  $("#diet-entries").innerHTML = entries.length ? entries.map((entry) => `<article class="diet-entry"><small>${escapeHtml(entry.date)}</small><strong>${escapeHtml(entry.meal)}</strong><span>${Number(entry.water)} cups · ${escapeHtml(entry.energy)} energy</span><button class="delete-button" data-delete-diet="${entry.id}" aria-label="Delete diet entry">×</button></article>`).join("") : '<div class="empty-state">Your daily entries will appear here.</div>';
}

function renderGoals() {
  const goals = read(KEYS.goals);
  $("#goal-board").innerHTML = goals.length ? goals.map((goal) => `<article class="goal-card ${goal.done ? "done" : ""}"><span>${escapeHtml(goal.area)}</span><button class="delete-button" data-delete-goal="${goal.id}" aria-label="Delete ${escapeHtml(goal.title)}">×</button><h3>${escapeHtml(goal.title)}</h3><footer><small>${goal.done ? "Completed" : "In progress"}</small><button class="button ghost" type="button" data-toggle-goal="${goal.id}">${goal.done ? "Reopen" : "Done"}</button></footer></article>`).join("") : '<div class="empty-state">Add the first goal to your board.</div>';
}

async function addArtFiles(files) {
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (!images.length) return toast("Choose image files for the gallery.");
  for (const file of images) await dbAdd("art", { name: file.name.replace(/\.[^.]+$/, ""), size: file.size, createdAt: Date.now(), blob: file });
  toast(`${images.length} artwork ${images.length === 1 ? "image" : "images"} added.`);
  renderArt();
}

async function renderArt() {
  const items = (await dbAll("art").catch(() => [])).sort((a, b) => b.createdAt - a.createdAt);
  const gallery = $("#art-gallery");
  gallery.querySelectorAll("img[data-object-url]").forEach((image) => URL.revokeObjectURL(image.dataset.objectUrl));
  gallery.innerHTML = items.length ? items.map((item) => { const url = URL.createObjectURL(item.blob); return `<article class="art-card"><img src="${url}" data-object-url="${url}" alt="${escapeHtml(item.name)}" /><footer><strong>${escapeHtml(item.name)}</strong><button class="delete-button" data-delete-art="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button></footer></article>`; }).join("") : '<div class="empty-state">Your gallery is ready for its first piece.</div>';
}

async function addMusicFiles(files) {
  const audio = files.filter((file) => file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus|webm)$/i.test(file.name));
  if (!audio.length) return toast("Choose one or more audio files.");
  for (const file of audio) await dbAdd("tracks", { name: file.name.replace(/\.[^.]+$/, ""), size: file.size, createdAt: Date.now(), blob: file });
  toast(`${audio.length} ${audio.length === 1 ? "song" : "songs"} added.`);
  renderMusic();
}

async function renderMusic() {
  tracks = (await dbAll("tracks").catch(() => [])).sort((a, b) => b.createdAt - a.createdAt);
  $("#track-count").textContent = `${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`;
  $("#track-list").innerHTML = tracks.length ? tracks.map((track) => `<article class="track-row"><button class="track-play" data-play-track="${track.id}" aria-label="Play ${escapeHtml(track.name)}">▶</button><div><strong>${escapeHtml(track.name)}</strong><small>${formatBytes(track.size)}</small></div><button class="delete-button" data-delete-track="${track.id}" aria-label="Delete ${escapeHtml(track.name)}">×</button></article>`).join("") : '<div class="empty-state">Add music to begin listening.</div>';
}

async function playTrack(id) {
  const track = tracks.find((item) => item.id === Number(id));
  if (!track) return;
  if (trackUrl) URL.revokeObjectURL(trackUrl);
  trackUrl = URL.createObjectURL(track.blob);
  currentTrackId = track.id;
  const player = $("#audio-player");
  player.src = trackUrl;
  $("#now-playing").textContent = track.name;
  try { await player.play(); } catch { toast("Tap play to start this song."); }
}

function stepTrack(direction) {
  if (!tracks.length) return;
  const index = Math.max(0, tracks.findIndex((track) => track.id === currentTrackId));
  playTrack(tracks[(index + direction + tracks.length) % tracks.length].id);
}

function bindDropZone(zoneSelector, inputSelector, chooseSelector, handler) {
  const zone = $(zoneSelector); const input = $(inputSelector); const open = () => input.click();
  zone.addEventListener("click", (event) => { if (!event.target.closest("button")) open(); });
  $(chooseSelector).addEventListener("click", (event) => { event.stopPropagation(); open(); });
  zone.addEventListener("keydown", (event) => { if (!["Enter", " "].includes(event.key)) return; event.preventDefault(); open(); });
  ["dragenter", "dragover"].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; zone.classList.add("is-dragging"); }));
  ["dragleave", "dragend"].forEach((name) => zone.addEventListener(name, (event) => { event.preventDefault(); if (name === "dragleave" && zone.contains(event.relatedTarget)) return; zone.classList.remove("is-dragging"); }));
  zone.addEventListener("drop", (event) => { event.preventDefault(); zone.classList.remove("is-dragging"); handler([...event.dataTransfer.files]); });
  input.addEventListener("change", (event) => { handler([...event.target.files]); event.target.value = ""; });
}

$("#menu-toggle").addEventListener("click", () => { const nav = $("#primary-nav"); nav.classList.toggle("open"); $("#menu-toggle").setAttribute("aria-expanded", String(nav.classList.contains("open"))); });
$$('#primary-nav a').forEach((link) => link.addEventListener("click", () => $("#primary-nav").classList.remove("open")));
$("#theme-toggle").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

$("#dentistry-form").addEventListener("submit", (event) => { event.preventDefault(); const notes = read(KEYS.dentistry); notes.unshift({ id: Date.now(), topic: $("#dentistry-topic").value.trim(), note: $("#dentistry-note").value.trim(), date: new Date().toLocaleDateString() }); write(KEYS.dentistry, notes); event.target.reset(); renderDentistry(); toast("Dentistry note saved."); });
$("#dentistry-notes").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-note]"); if (!button) return; write(KEYS.dentistry, read(KEYS.dentistry).filter((item) => item.id !== Number(button.dataset.deleteNote))); renderDentistry(); });

$("#diet-form").addEventListener("submit", (event) => { event.preventDefault(); const entries = read(KEYS.diet); entries.push({ id: Date.now(), date: $("#diet-date").value, meal: $("#diet-meal").value.trim(), water: Number($("#diet-water").value || 0), energy: $("#diet-energy").value }); write(KEYS.diet, entries); $("#diet-meal").value = ""; $("#diet-water").value = 0; renderDiet(); toast("Diet entry added."); });
$("#diet-entries").addEventListener("click", (event) => { const button = event.target.closest("[data-delete-diet]"); if (!button) return; write(KEYS.diet, read(KEYS.diet).filter((item) => item.id !== Number(button.dataset.deleteDiet))); renderDiet(); });

$("#goal-form").addEventListener("submit", (event) => { event.preventDefault(); const goals = read(KEYS.goals); goals.unshift({ id: Date.now(), title: $("#goal-title").value.trim(), area: $("#goal-area").value, done: false }); write(KEYS.goals, goals); event.target.reset(); renderGoals(); toast("Goal added to the board."); });
$("#goal-board").addEventListener("click", (event) => { const toggle = event.target.closest("[data-toggle-goal]"); const remove = event.target.closest("[data-delete-goal]"); const goals = read(KEYS.goals); if (toggle) { const goal = goals.find((item) => item.id === Number(toggle.dataset.toggleGoal)); if (goal) goal.done = !goal.done; } if (remove) goals.splice(goals.findIndex((item) => item.id === Number(remove.dataset.deleteGoal)), 1); if (toggle || remove) { write(KEYS.goals, goals); renderGoals(); } });

$("#art-gallery").addEventListener("click", async (event) => { const button = event.target.closest("[data-delete-art]"); if (!button) return; await dbDelete("art", Number(button.dataset.deleteArt)); renderArt(); });
$("#track-list").addEventListener("click", async (event) => { const play = event.target.closest("[data-play-track]"); const remove = event.target.closest("[data-delete-track]"); if (play) playTrack(play.dataset.playTrack); if (remove) { await dbDelete("tracks", Number(remove.dataset.deleteTrack)); renderMusic(); } });
$("#toggle-track").addEventListener("click", () => { const player = $("#audio-player"); if (!player.src && tracks.length) return playTrack(tracks[0].id); if (player.paused) player.play(); else player.pause(); });
$("#previous-track").addEventListener("click", () => stepTrack(-1));
$("#next-track").addEventListener("click", () => stepTrack(1));
$("#audio-player").addEventListener("play", () => $("#toggle-track").textContent = "❚❚");
$("#audio-player").addEventListener("pause", () => $("#toggle-track").textContent = "▶");
$("#audio-player").addEventListener("ended", () => stepTrack(1));

bindDropZone("#art-drop-zone", "#art-file-input", "#choose-art", addArtFiles);
bindDropZone("#music-drop-zone", "#music-file-input", "#choose-music", addMusicFiles);
applyTheme(localStorage.getItem(KEYS.theme) || "light");
$("#diet-date").value = new Date().toISOString().slice(0, 10);
renderDentistry(); renderDiet(); renderGoals(); renderArt(); renderMusic();
