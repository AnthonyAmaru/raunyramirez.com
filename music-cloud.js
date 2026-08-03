(function () {
  "use strict";

  const PROJECT_URL = "https://hujugtioxkzyazjcrpmy.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_rPh2L2dOsB2Gw_VKX2fkbw_shVgQTZ4";
  const BUCKET = "site-music";
  const ART_BUCKET = "site-art";
  const SESSION_KEY = "rauny_supabase_session";

  function encodeStoragePath(path) { return path.split("/").map(encodeURIComponent).join("/"); }
  async function readResponse(response) {
    if (response.ok) {
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }
    let message = `Cloud request failed (${response.status}).`;
    try { const body = await response.json(); message = body.message || body.error_description || body.error || body.msg || message; } catch { /* Keep fallback. */ }
    throw new Error(message);
  }

  class MusicCloud {
    constructor() {
      let session = null;
      try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { /* Start signed out. */ }
      this.accessToken = session?.accessToken || null;
      this.user = session?.user || null;
    }
    headers(extra = {}, authenticated = false) { return { apikey: PUBLISHABLE_KEY, ...(authenticated && this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}), ...extra }; }
    isSignedIn() { return Boolean(this.accessToken && this.user?.id); }
    async signIn(email, password) {
      const session = await readResponse(await fetch(`${PROJECT_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: this.headers({ "Content-Type": "application/json" }), body: JSON.stringify({ email, password }) }));
      this.accessToken = session.access_token; this.user = session.user;
      const membership = await readResponse(await fetch(`${PROJECT_URL}/rest/v1/site_admins?select=user_id&user_id=eq.${encodeURIComponent(this.user.id)}`, { headers: this.headers({}, true) }));
      if (!membership?.length) { await this.signOut(); throw new Error("This account is not approved as a site administrator."); }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: this.accessToken, user: this.user }));
      return this.user;
    }
    async signOut() { if (this.accessToken) await fetch(`${PROJECT_URL}/auth/v1/logout`, { method: "POST", headers: this.headers({}, true) }).catch(() => {}); this.accessToken = null; this.user = null; sessionStorage.removeItem(SESSION_KEY); }
    requireAdmin() { if (!this.isSignedIn()) throw new Error("Administrator sign-in is required."); }
    publicUrl(path) { return `${PROJECT_URL}/storage/v1/object/public/${BUCKET}/${encodeStoragePath(path)}`; }
    async list(site) {
      const tracks = await readResponse(await fetch(`${PROJECT_URL}/rest/v1/music_tracks?select=id,title,file_name,storage_path,mime_type,size_bytes,created_at&site=eq.${encodeURIComponent(site)}&order=created_at.desc`, { headers: this.headers() }));
      return (tracks || []).map((track) => ({ ...track, url: this.publicUrl(track.storage_path) }));
    }
    async upload(site, file) {
      this.requireAdmin();
      if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} is larger than the 50 MB file limit.`);
      const extension = (file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "audio").toLowerCase();
      const storagePath = `${site}/${this.user.id}/${crypto.randomUUID()}.${extension}`;
      await readResponse(await fetch(`${PROJECT_URL}/storage/v1/object/${BUCKET}/${encodeStoragePath(storagePath)}`, { method: "POST", headers: this.headers({ "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }, true), body: file }));
      try {
        const rows = await readResponse(await fetch(`${PROJECT_URL}/rest/v1/music_tracks`, { method: "POST", headers: this.headers({ "Content-Type": "application/json", Prefer: "return=representation" }, true), body: JSON.stringify({ site, title: file.name.replace(/\.[^.]+$/, ""), file_name: file.name, storage_path: storagePath, mime_type: file.type || null, size_bytes: file.size }) }));
        return rows?.[0];
      } catch (error) {
        await fetch(`${PROJECT_URL}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: this.headers({ "Content-Type": "application/json" }, true), body: JSON.stringify({ prefixes: [storagePath] }) }).catch(() => {});
        throw error;
      }
    }
    async deleteTrack(track) {
      this.requireAdmin();
      await readResponse(await fetch(`${PROJECT_URL}/rest/v1/music_tracks?id=eq.${encodeURIComponent(track.id)}`, { method: "DELETE", headers: this.headers({ Prefer: "return=minimal" }, true) }));
      await readResponse(await fetch(`${PROJECT_URL}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: this.headers({ "Content-Type": "application/json" }, true), body: JSON.stringify({ prefixes: [track.storage_path] }) }));
    }

    async getContent(site, contentKey) {
      this.requireAdmin();
      const url = `${PROJECT_URL}/rest/v1/site_content?select=value,updated_at&site=eq.${encodeURIComponent(site)}&content_key=eq.${encodeURIComponent(contentKey)}&limit=1`;
      const rows = await readResponse(await fetch(url, { headers: this.headers({}, true) }));
      return rows?.[0] || null;
    }

    async saveContent(site, contentKey, value) {
      this.requireAdmin();
      const rows = await readResponse(await fetch(`${PROJECT_URL}/rest/v1/site_content?on_conflict=user_id,site,content_key`, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, true),
        body: JSON.stringify({ user_id: this.user.id, site, content_key: contentKey, value, updated_at: new Date().toISOString() }),
      }));
      return rows?.[0];
    }

    async signedArtUrl(storagePath) {
      const signed = await readResponse(await fetch(`${PROJECT_URL}/storage/v1/object/sign/${ART_BUCKET}/${encodeStoragePath(storagePath)}`, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }, true),
        body: JSON.stringify({ expiresIn: 3600 }),
      }));
      const path = signed?.signedURL || signed?.signedUrl;
      if (!path) throw new Error("Could not create a private artwork link.");
      return path.startsWith("http") ? path : `${PROJECT_URL}/storage/v1${path.startsWith("/") ? path : `/${path}`}`;
    }

    async listArt(site) {
      this.requireAdmin();
      const rows = await readResponse(await fetch(`${PROJECT_URL}/rest/v1/art_items?select=id,name,storage_path,mime_type,size_bytes,created_at&site=eq.${encodeURIComponent(site)}&order=created_at.desc`, { headers: this.headers({}, true) }));
      return Promise.all((rows || []).map(async (item) => ({ ...item, url: await this.signedArtUrl(item.storage_path) })));
    }

    async uploadArt(site, file, name = file.name.replace(/\.[^.]+$/, "")) {
      this.requireAdmin();
      if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} is larger than the 50 MB file limit.`);
      const extension = (file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || (file.type === "image/png" ? "png" : "jpg")).toLowerCase();
      const storagePath = `${site}/${this.user.id}/${crypto.randomUUID()}.${extension}`;
      await readResponse(await fetch(`${PROJECT_URL}/storage/v1/object/${ART_BUCKET}/${encodeStoragePath(storagePath)}`, { method: "POST", headers: this.headers({ "Content-Type": file.type || "image/png", "x-upsert": "false" }, true), body: file }));
      try {
        const rows = await readResponse(await fetch(`${PROJECT_URL}/rest/v1/art_items`, {
          method: "POST",
          headers: this.headers({ "Content-Type": "application/json", Prefer: "return=representation" }, true),
          body: JSON.stringify({ user_id: this.user.id, site, name, storage_path: storagePath, mime_type: file.type || null, size_bytes: file.size }),
        }));
        return rows?.[0];
      } catch (error) {
        await fetch(`${PROJECT_URL}/storage/v1/object/${ART_BUCKET}`, { method: "DELETE", headers: this.headers({ "Content-Type": "application/json" }, true), body: JSON.stringify({ prefixes: [storagePath] }) }).catch(() => {});
        throw error;
      }
    }

    async deleteArt(item) {
      this.requireAdmin();
      await readResponse(await fetch(`${PROJECT_URL}/rest/v1/art_items?id=eq.${encodeURIComponent(item.id)}`, { method: "DELETE", headers: this.headers({ Prefer: "return=minimal" }, true) }));
      await readResponse(await fetch(`${PROJECT_URL}/storage/v1/object/${ART_BUCKET}`, { method: "DELETE", headers: this.headers({ "Content-Type": "application/json" }, true), body: JSON.stringify({ prefixes: [item.storage_path] }) }));
    }
  }

  window.musicCloud = new MusicCloud();
})();
