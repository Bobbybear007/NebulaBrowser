const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, session, Menu, ipcMain, BrowserWindow, dialog, shell } = require('electron');

class PluginManager {
  constructor() {
    this.plugins = []; // { id, dir, manifest, mod, enabled }
    this.rendererPreloads = []; // absolute file paths
  this.rendererPages = []; // { id, file, pluginId }
    this._listeners = {
      'app-ready': [],
      'window-created': [],
      'web-contents-created': [],
      'session-configured': [],
    };
    this._webRequestHandlers = []; // { filter, listener }
  this._contextMenuContribs = []; // [function(template, params, sender)]
  }

  getPluginDirs() {
    const appDir = path.join(app.getAppPath(), 'plugins');
    const userDir = path.join(app.getPath('userData'), 'plugins');
    return [appDir, userDir];
  }

  ensureUserPluginsDir() {
    try {
      const userDir = path.join(app.getPath('userData'), 'plugins');
      fs.mkdirSync(userDir, { recursive: true });
      return userDir;
    } catch (_) { return null; }
  }

  loadAll() {
    this.plugins = [];
    this.rendererPreloads = [];
  this.rendererPages = [];
    const dirs = this.getPluginDirs();
    for (const root of dirs) {
      let entries = [];
      try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const dir = path.join(root, ent.name);
        const manifestPath = path.join(dir, 'plugin.json');
        let manifest;
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          // Normalize optional fields
          const cats = manifest.categories;
          if (typeof cats === 'string') manifest.categories = [cats];
          else if (Array.isArray(cats)) manifest.categories = cats.filter(x => typeof x === 'string');
          else if (cats == null) manifest.categories = [];

          const au = manifest.authors;
          if (typeof au === 'string') manifest.authors = [au];
          else if (Array.isArray(au)) manifest.authors = au.filter(x => (typeof x === 'string') || (x && typeof x === 'object' && typeof x.name === 'string'));
          else if (au == null) manifest.authors = [];
        } catch { continue; }
        const enabled = manifest.enabled !== false; // default true
        const id = manifest.id || ent.name;
    const record = { id, dir, manifest, enabled, mod: null, mainPath: null };
        if (enabled) {
          // Load main module if provided
          if (manifest.main) {
            const mainPath = path.join(dir, manifest.main);
            try {
              // eslint-disable-next-line import/no-dynamic-require, global-require
              record.mod = require(mainPath);
      record.mainPath = mainPath;
            } catch (e) {
              console.error(`[Plugins] Failed to load main for ${id}:`, e);
            }
          }
          // Collect renderer preload if provided
          if (manifest.rendererPreload) {
            const rp = path.join(dir, manifest.rendererPreload);
            try {
              if (fs.existsSync(rp)) this.rendererPreloads.push(rp);
            } catch {}
          }
        }
        this.plugins.push(record);
      }
    }
    // Activate plugins with activate(ctx)
    for (const p of this.plugins) {
      if (!p.enabled || !p.mod) continue;
      try {
        const ctx = this._buildContext(p);
        if (typeof p.mod.activate === 'function') {
          p.mod.activate(ctx);
        } else if (typeof p.mod === 'function') {
          // support default export as function(ctx)
          p.mod(ctx);
        }
      } catch (e) {
        console.error(`[Plugins] Error activating ${p.id}:`, e);
      }
    }
  }

  _buildContext(plugin) {
    const manager = this;
    const logPrefix = `[Plugin:${plugin.id}]`;
    return {
      app,
      BrowserWindow,
      ipcMain,
      session,
      Menu,
      dialog,
      shell,
      paths: {
        appPath: app.getAppPath(),
        userData: app.getPath('userData'),
        pluginDir: plugin.dir,
      },
      log: (...args) => console.log(logPrefix, ...args),
      warn: (...args) => console.warn(logPrefix, ...args),
      error: (...args) => console.error(logPrefix, ...args),
      on: (evt, cb) => manager.on(evt, cb),
      registerIPC: (channel, handler) => {
        try { ipcMain.handle(channel, handler); } catch (e) { console.error(logPrefix, 'registerIPC failed', e); }
      },
      registerWebRequest: (filter, listener) => {
        try { manager._webRequestHandlers.push({ filter, listener }); } catch (e) { console.error(logPrefix, 'registerWebRequest failed', e); }
      },
      contributeContextMenu: (contribFn) => {
        try { manager._contextMenuContribs.push(contribFn); } catch (e) { console.error(logPrefix, 'contributeContextMenu failed', e); }
      },
      // Register a dedicated internal page (shown via browser://<id>)
    registerRendererPage: ({ id, html }) => {
        try {
          if (!id || !html) return;
      let fileUrl = null;
      try { fileUrl = pathToFileURL(html).href; } catch {}
      manager.rendererPages.push({ id, file: html, fileUrl, pluginId: plugin.id });
          console.log('[Plugins] Registered page:', id, '->', html, 'fileUrl:', fileUrl);
          manager.log('registered page:', id, '->', html);
        } catch (e) { manager.error('registerRendererPage failed', e); }
      }
    };
  }

  getRendererPreloads() {
    return Array.from(new Set(this.rendererPreloads));
  }

  getRendererPages() {
    // Return a shallow copy so callers can't mutate internal array
    return this.rendererPages.map(p => ({ ...p }));
  }

  on(evt, cb) {
    if (!this._listeners[evt]) this._listeners[evt] = [];
    this._listeners[evt].push(cb);
  }

  emit(evt, ...args) {
    const list = this._listeners[evt] || [];
    for (const cb of list) {
      try { cb(...args); } catch (e) { console.error('[Plugins] listener error for', evt, e); }
    }
  }

  applyWebRequestHandlers(ses) {
    try {
      if (!ses || !ses.webRequest) return;
      for (const { filter, listener } of this._webRequestHandlers) {
        try {
          ses.webRequest.onBeforeRequest(filter || {}, (details, callback) => {
            try {
              const res = listener(details);
              if (res && typeof res === 'object') callback(res); else callback({ cancel: false });
            } catch (e) {
              console.error('[Plugins] webRequest handler error:', e);
              callback({ cancel: false });
            }
          });
        } catch (e) {
          console.error('[Plugins] Failed to attach webRequest handler:', e);
        }
      }
    } catch (e) {
      console.error('[Plugins] applyWebRequestHandlers error:', e);
    }
  }

  applyContextMenuContrib(template, params, sender) {
    try {
      for (const fn of this._contextMenuContribs) {
        try { fn(template, params, sender); } catch (e) { console.error('[Plugins] context menu contrib error:', e); }
      }
    } catch (e) { console.error('[Plugins] applyContextMenuContrib error:', e); }
  }

  getPluginsInfo() {
    return this.plugins.map(p => ({
      id: p.id,
      name: p.manifest.name || p.id,
      version: p.manifest.version || '0.0.0',
      description: p.manifest.description || '',
  categories: Array.isArray(p.manifest.categories) ? p.manifest.categories : [],
      authors: Array.isArray(p.manifest.authors)
        ? p.manifest.authors.map(x => (typeof x === 'string' ? x : (x && x.name) || '')).filter(Boolean)
        : [],
      enabled: !!p.enabled,
      hasMain: !!p.manifest.main,
      hasRendererPreload: !!p.manifest.rendererPreload,
      dir: p.dir
    }));
  }

  // Fast discovery that does not activate plugins; always shows disabled items
  discoverPlugins() {
    const out = [];
    for (const root of this.getPluginDirs()) {
      let entries = [];
      try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const dir = path.join(root, ent.name);
        const manifestPath = path.join(dir, 'plugin.json');
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          const cats = manifest.categories;
          const categories = typeof cats === 'string' ? [cats] : Array.isArray(cats) ? cats.filter(x => typeof x === 'string') : [];
          const au = manifest.authors;
          const authors = typeof au === 'string'
            ? [au]
            : Array.isArray(au)
              ? au.map(x => (typeof x === 'string' ? x : (x && x.name) || null)).filter(Boolean)
              : [];
          out.push({
            id: manifest.id || ent.name,
            name: manifest.name || ent.name,
            version: manifest.version || '0.0.0',
            description: manifest.description || '',
            categories,
            authors,
            enabled: manifest.enabled !== false,
            hasMain: !!manifest.main,
            hasRendererPreload: !!manifest.rendererPreload,
            dir
          });
        } catch {}
      }
    }
    return out;
  }

  async setEnabled(id, enabled) {
    const p = this.plugins.find(x => x.id === id) || null;
    if (!p) throw new Error('Plugin not found: ' + id);
    const manifestPath = path.join(p.dir, 'plugin.json');
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { throw new Error('Manifest read failed: ' + e.message); }
    manifest.enabled = !!enabled;
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    return true;
  }

  _clearRequireCache(p) {
    try {
      if (p && p.mainPath) {
        const k = require.resolve(p.mainPath);
        if (require.cache[k]) delete require.cache[k];
      }
    } catch {}
  }

  reload(id) {
    if (id) {
      const p = this.plugins.find(x => x.id === id);
      if (p) this._clearRequireCache(p);
    } else {
      for (const p of this.plugins) this._clearRequireCache(p);
    }
    this.loadAll();
  }
}

module.exports = PluginManager;
