// Return YouTube Dislike - main process side
// Provides an IPC endpoint to fetch dislike data, bypassing page CSP.
// Also injects the renderer script into YouTube pages in webviews.

const fs = require('fs');
const path = require('path');

module.exports.activate = function(ctx) {
  const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
  const cache = new Map(); // key: videoId -> { t, data }

  async function fetchVotes(videoId) {
    const url = `https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`;
    let resp;
    try {
      resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    } catch (e) {
      ctx.warn('[RYD] fetch failed', e);
      return null;
    }
    if (!resp.ok) return null;
    try { return await resp.json(); } catch { return null; }
  }

  ctx.registerIPC('return-youtube-dislike:get', async (_e, { videoId }) => {
    if (!videoId || typeof videoId !== 'string') return { ok: false, error: 'bad_args' };
    const now = Date.now();
    const ent = cache.get(videoId);
    if (ent && (now - ent.t) < CACHE_TTL_MS) {
      return { ok: true, data: ent.data, cached: true };
    }
    const data = await fetchVotes(videoId);
    if (!data) return { ok: false, error: 'fetch_failed' };
    cache.set(videoId, { t: now, data });
    return { ok: true, data };
  });

  // Load the renderer script
  const rendererScriptPath = path.join(ctx.paths.pluginDir, 'renderer-preload.js');
  let rendererScript = '';
  try {
    rendererScript = fs.readFileSync(rendererScriptPath, 'utf8');
  } catch (e) {
    ctx.error('[RYD] Failed to load renderer script:', e);
    return;
  }

  // Listen for web contents creation to inject into YouTube pages
  ctx.on('web-contents-created', (contents) => {
    // Only inject into webviews (guest pages), not the main window
    if (!contents.hostWebContents) return;

    // Handle IPC messages from the injected script
    contents.on('ipc-message', async (event, message) => {
      if (message && message.data && message.data.channel === 'return-youtube-dislike:get') {
        const { videoId, id } = message.data.args[0];
        try {
          const data = await fetchVotes(videoId);
          if (data) {
            event.reply('return-youtube-dislike:get', { ok: true, data, id });
          } else {
            event.reply('return-youtube-dislike:get', { ok: false, error: 'fetch_failed', id });
          }
        } catch (e) {
          event.reply('return-youtube-dislike:get', { ok: false, error: e.message, id });
        }
      }
    });

    contents.on('dom-ready', () => {
      const url = contents.getURL();
      if (!url || !/^(?:.*\.)?youtube\.com$/.test(new URL(url).hostname)) return;

      // Inject the script into the guest page
      try {
        contents.executeJavaScript(rendererScript);
        ctx.log('[RYD] Injected script into YouTube page');
      } catch (e) {
        ctx.warn('[RYD] Failed to inject script:', e);
      }
    });
  });

  ctx.log('Return YouTube Dislike plugin activated');
};
