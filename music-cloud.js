(function () {
  "use strict";

  const PROJECT_URL = "https://hujugtioxkzyazjcrpmy.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_rPh2L2dOsB2Gw_VKX2fkbw_shVgQTZ4";
  const BUCKET = "site-music";
  const ART_BUCKET = "site-art";
  const SESSION_KEY = "rauny_supabase_session";

  function encodeStoragePath(path) { return path.split("/").map(encodeURIComponent).join("/"); }
  async function sha256Hex(value) {
    const bytes = value instanceof ArrayBuffer ? value : new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async function identifyFile(file) {
    const relativePath = file.webkitRelativePath || "";
    const folder = relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "";
    const contentHash = await sha256Hex(await file.arrayBuffer());
    const folderFingerprint = folder ? await sha256Hex(folder.toLocaleLowerCase()) : null;
    const fileFingerprint = await sha256Hex(JSON.stringify({ name: file.name.toLocaleLowerCase(), size: file.size, lastModified: Number(file.lastModified || 0), folder }));
    return {
      contentHash,
      fileFingerprint,
      sourceMetadata: {
        fingerprint_version: 1,
        hash_algorithm: "SHA-256",
        source_name: file.name,
        source_last_modified: Number(file.lastModified || 0),
        size_bytes: file.size,
        mime_type: file.type || null,
        folder_fingerprint: folderFingerprint,
      },
    };
  }
  async function readResponse(response) {
    if (response.ok) {
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }
    let message = `Cloud request failed (${response.status}).`;
    try { const body = await response.json(); message = body.message || body.error_description || body.error || body.msg || message; } catch { /* Keep fallback. */ }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  class MusicCloud {
    constructor() {
      let session = null;
      try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { /* Start signed out. */ }
      this.accessToken = session?.accessToken || null;
      this.user = session?.user || null;
      this.expiresAt = Number(session?.expiresAt || 0);
    }
    headers(extra = {}, authenticated = false) { return { apikey: PUBLISHABLE_KEY, ...(authenticated && this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}), ...extra }; }
    isSignedIn() { return Boolean(this.accessToken && this.user?.id && this.expiresAt > Date.now() + 30_000); }
    async signIn(email, password) {
      const session = await readResponse(await fetch(`${PROJECT_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: this.headers({ "Content-Type": "application/json" }), body: JSON.stringify({ email, password }) }));
      this.accessToken = session.access_token; this.user = session.user;
      this.expiresAt = Number(session.expires_at || 0) * 1000 || Date.now() + Number(session.expires_in || 3600) * 1000;
      const membership = await readResponse(await fetch(`${PROJECT_URL}/rest/v1/site_admins?select=user_id&user_id=eq.${encodeURIComponent(this.user.id)}`, { headers: this.headers({}, true) }));
      if (!membership?.length) { await this.signOut(); throw new Error("This account is not approved as a site administrator."); }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: this.accessToken, user: this.user, expiresAt: this.expiresAt }));
      return this.user;
    }
    async signOut() { if (this.accessToken) await fetch(`${PROJECT_URL}/auth/v1/logout`, { method: "POST", headers: this.headers({}, true) }).catch(() => {}); this.accessToken = null; this.user = null; this.expiresAt = 0; sessionStorage.removeItem(SESSION_KEY); }
    requireAdmin() { if (!this.isSignedIn()) throw new Error("Administrator sign-in is required."); }
    publicUrl(path) { return `${PROJECT_URL}/storage/v1/object/public/${BUCKET}/${encodeStoragePath(path)}`; }
    async list(site) {
      const tracks = await readResponse(await fetch(`${PROJECT_URL}/rest/v1/music_tracks?select=id,title,file_name,storage_path,mime_type,size_bytes,content_hash,file_fingerprint,source_metadata,created_at&site=eq.${encodeURIComponent(site)}&order=created_at.desc`, { headers: this.headers() }));
      return (tracks || []).map((track) => ({ ...track, url: this.publicUrl(track.storage_path) }));
    }
    async upload(site, file) {
      this.requireAdmin();
      if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} is larger than the 50 MB file limit.`);
      const identity = await identifyFile(file);
      const duplicate = await this.findDuplicate(site, file, identity);
      if (duplicate) return { duplicate: true, track: duplicate };
      const extension = (file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "audio").toLowerCase();
      const storagePath = `${site}/${this.user.id}/${crypto.randomUUID()}.${extension}`;
      await readResponse(await fetch(`${PROJECT_URL}/storage/v1/object/${BUCKET}/${encodeStoragePath(storagePath)}`, { method: "POST", headers: this.headers({ "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }, true), body: file }));
      try {
        const rows = await readResponse(await fetch(`${PROJECT_URL}/rest/v1/music_tracks`, { method: "POST", headers: this.headers({ "Content-Type": "application/json", Prefer: "return=representation" }, true), body: JSON.stringify({ site, title: file.name.replace(/\.[^.]+$/, ""), file_name: file.name, storage_path: storagePath, mime_type: file.type || null, size_bytes: file.size, content_hash: identity.contentHash, file_fingerprint: identity.fileFingerprint, source_metadata: identity.sourceMetadata }) }));
        return rows?.[0];
      } catch (error) {
        await fetch(`${PROJECT_URL}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: this.headers({ "Content-Type": "application/json" }, true), body: JSON.stringify({ prefixes: [storagePath] }) }).catch(() => {});
        throw error;
      }
    }
    async findDuplicate(site, file, identity) {
      this.requireAdmin();
      const base = new URL(`${PROJECT_URL}/rest/v1/music_tracks`);
      base.searchParams.set("select", "id,title,file_name,size_bytes,content_hash,file_fingerprint");
      base.searchParams.set("site", `eq.${site}`);
      base.searchParams.set("user_id", `eq.${this.user.id}`);
      base.searchParams.set("or", `(content_hash.eq.${identity.contentHash},file_fingerprint.eq.${identity.fileFingerprint})`);
      base.searchParams.set("limit", "1");
      const exact = await readResponse(await fetch(base, { headers: this.headers({}, true) }));
      if (exact?.length) return exact[0];
      const legacy = new URL(`${PROJECT_URL}/rest/v1/music_tracks`);
      legacy.searchParams.set("select", "id,title,file_name,size_bytes");
      legacy.searchParams.set("site", `eq.${site}`);
      legacy.searchParams.set("user_id", `eq.${this.user.id}`);
      legacy.searchParams.set("file_name", `eq.${file.name}`);
      legacy.searchParams.set("size_bytes", `eq.${file.size}`);
      legacy.searchParams.set("limit", "1");
      return (await readResponse(await fetch(legacy, { headers: this.headers({}, true) })))?.[0] || null;
    }
    async deleteTrack(track) {
      return this.deleteTracks([track]);
    }
    async deleteTracks(trackList) {
      this.requireAdmin();
      const uniqueTracks = [...new Map(trackList.map((track) => [String(track.id), track])).values()];
      if (!uniqueTracks.length) return;
      for (let start = 0; start < uniqueTracks.length; start += 1000) {
        const batch = uniqueTracks.slice(start, start + 1000);
        await readResponse(await fetch(`${PROJECT_URL}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: this.headers({ "Content-Type": "application/json" }, true), body: JSON.stringify({ prefixes: batch.map((track) => track.storage_path) }) }));
      }
      for (let start = 0; start < uniqueTracks.length; start += 200) {
        const ids = uniqueTracks.slice(start, start + 200).map((track) => track.id).join(",");
        await readResponse(await fetch(`${PROJECT_URL}/rest/v1/music_tracks?id=${encodeURIComponent(`in.(${ids})`)}`, { method: "DELETE", headers: this.headers({ Prefer: "return=minimal" }, true) }));
      }
    }

    async listShoppingProducts() {
      const fields = "id,store_slug,external_id,title,description,category,brand,image_url,product_url,affiliate_url,price,compare_at_price,currency,availability,source_updated_at,updated_at";
      const url = `${PROJECT_URL}/rest/v1/shopping_products?select=${fields}&active=eq.true&order=source_updated_at.desc.nullslast,title.asc`;
      return (await readResponse(await fetch(url, { headers: this.headers() }))) || [];
    }

    async invokeFunction(name, body) {
      this.requireAdmin();
      return readResponse(await fetch(`${PROJECT_URL}/functions/v1/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }, true),
        body: JSON.stringify(body),
      }));
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
