(() => {
  const STORAGE_KEY = "rauny_visitor_unlocked";
  const ANSWER_HASH = "c9349dabb6a092747a12efa704308b390dd3584b3efae0ee9751d3365969cbbf";

  function loadEntryFont() {
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&display=swap";
    document.head.append(font);
  }

  function isUnlocked() {
    try { return sessionStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  }

  function rememberUnlock() {
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch { /* Session storage may be unavailable. */ }
  }

  async function digest(value) {
    const bytes = new TextEncoder().encode(value.trim().toLowerCase());
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function setPageLocked(locked, gate) {
    document.documentElement.classList.toggle("visitor-locked", locked);
    document.documentElement.classList.toggle("visitor-unlocked", !locked);
    [...document.body.children].forEach((element) => {
      if (element !== gate) element.inert = locked;
    });
  }

  function installGate() {
    if (isUnlocked()) {
      document.documentElement.classList.remove("visitor-locked");
      document.documentElement.classList.add("visitor-unlocked");
      return;
    }

    const gate = document.createElement("section");
    gate.id = "entry-gate";
    gate.className = "entry-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "entry-riddle");
    gate.innerHTML = `
      <div class="entry-panel">
        <span class="entry-sigil" aria-hidden="true">✦</span>
        <h1 id="entry-riddle">I live in a dark cave, standing in two straight lines, guarded by a red wall. I crush everything that comes my way, but I cannot walk or run. What am I?</h1>
        <form id="entry-form" class="visitor-entry-form">
          <label class="sr-only" for="entry-answer">Answer</label>
          <div class="entry-answer-row">
            <input id="entry-answer" type="password" autocomplete="off" spellcheck="false" required placeholder="Your answer" />
            <button type="submit">Enter</button>
          </div>
          <p id="entry-error" class="entry-error" role="alert" aria-live="polite"></p>
        </form>
      </div>`;
    document.body.prepend(gate);
    setPageLocked(true, gate);

    const form = gate.querySelector("#entry-form");
    const answer = gate.querySelector("#entry-answer");
    const error = gate.querySelector("#entry-error");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (await digest(answer.value) !== ANSWER_HASH) {
        error.textContent = "That answer did not match.";
        answer.select();
        return;
      }

      rememberUnlock();
      error.textContent = "";
      answer.value = "";
      gate.classList.add("entry-gate-leaving");
      setPageLocked(false, gate);
      setTimeout(() => gate.remove(), 520);
    });
    requestAnimationFrame(() => answer.focus({ preventScroll: true }));
  }

  if (isUnlocked()) document.documentElement.classList.add("visitor-unlocked");
  else {
    document.documentElement.classList.add("visitor-locked");
    loadEntryFont();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installGate, { once: true });
  else installGate();
})();
