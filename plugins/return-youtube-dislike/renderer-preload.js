// Return YouTube Dislike - injected into YouTube pages
// Injects a compact dislike counter into YouTube watch/shorts pages.
try { console.info('[RYD] script injected into', location.hostname, 'url=', location.href); } catch {}

// Minimal CSS injected once
function injectStyles() {
  if (document.getElementById('ryd-styles')) return;
  const style = document.createElement('style');
  style.id = 'ryd-styles';
  style.textContent = `
    .ryd-badge { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; font: 12px/1.2 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#e8e8f0; background: rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); }
    .ryd-badge .icon { width:14px; height:14px; display:inline-block; }
    .ryd-badge .count { font-weight:600; }
    .ryd-muted { opacity: .65 }
  .ryd-floating-wrap { pointer-events: none; }
  .ryd-floating-wrap .ryd-badge { pointer-events: auto; backdrop-filter: blur(6px); background: rgba(0,0,0,0.45); border-color: rgba(255,255,255,0.18); }
  .ryd-fixed-wrap { position: fixed; left: 12px; bottom: 12px; z-index: 2147483647; pointer-events: none; }
  .ryd-fixed-wrap .ryd-badge { pointer-events: auto; backdrop-filter: blur(6px); background: rgba(0,0,0,0.45); border-color: rgba(255,255,255,0.18); }
  `;
  if (document.head) document.head.appendChild(style); else document.documentElement.appendChild(style);
}

function nfmt(n) {
  try { return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(n); } catch { return String(n); }
}

function invokeIPC(channel, args) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).substr(2, 9);
    const message = { type: 'message', data: { channel, args: [args], id } };
    const handler = (event) => {
      if (event.data && event.data.type === 'message' && event.data.data && event.data.data.id === id) {
        window.removeEventListener('message', handler);
        const response = event.data.data.args[0];
        if (response && response.ok) {
          resolve(response);
        } else {
          reject(new Error(response ? response.error : 'IPC failed'));
        }
      }
    };
    window.addEventListener('message', handler);
    window.postMessage(message, '*');
    // Timeout after 10 seconds
    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('IPC timeout'));
    }, 10000);
  });
}

async function fetchRyd(videoId) {
  // Try IPC first to bypass CSP
  try {
    const res = await invokeIPC('return-youtube-dislike:get', { videoId });
    if (res && res.ok) return res.data;
  } catch (e) {
    console.debug('[RYD] IPC failed, falling back to fetch:', e.message);
  }
  // Fallback to direct fetch
  try {
    const url = `https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.debug('[RYD] Fetch failed:', e);
    return null;
  }
}

function getVideoIdFromUrl(u) {
  try {
    const url = new URL(u);
    if (url.hostname.includes('youtube.com') || url.hostname === 'youtu.be') {
      // watch?v=ID
      if (url.pathname === '/watch') return url.searchParams.get('v');
      // shorts/ID
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || null;
      // youtu.be/ID
      if (url.hostname === 'youtu.be') return url.pathname.slice(1) || null;
    }
  } catch {}
  return null;
}

function findBadgeHost() {
  // Primary: watch page actions container that holds the like/share buttons
  const primarySelectors = [
    'ytd-watch-metadata ytd-menu-renderer #top-level-buttons-computed',
    'ytd-video-primary-info-renderer #top-level-buttons-computed',
    'ytd-watch-metadata #top-row #actions',
    'ytd-watch-metadata #actions',
    '#actions-inner'
  ];
  for (const sel of primarySelectors) {
    const n = document.querySelector(sel);
    if (n) return n;
  }
  // Fallback: if we can find the segmented like/dislike component, place next to it
  const seg = document.querySelector('ytd-segmented-like-dislike-button-renderer');
  if (seg && seg.parentElement) return seg.parentElement;
  // Shorts: different overlay structure
  const shortsSelectors = [
    'ytd-reel-player-overlay-renderer #actions',
    'ytd-reel-video-renderer #actions'
  ];
  for (const sel of shortsSelectors) {
    const n = document.querySelector(sel);
    if (n) return n;
  }
  // Shadow DOM targeted probes (open shadow roots only)
  const probeShadow = (tag, innerSel) => {
    try {
      const nodes = document.querySelectorAll(tag);
      for (const el of nodes) {
        if (el && el.shadowRoot) {
          const found = el.shadowRoot.querySelector(innerSel);
          if (found) return found;
        }
      }
    } catch {}
    return null;
  };
  // Actions under menu renderer
  let deep = probeShadow('ytd-menu-renderer', '#top-level-buttons-computed');
  if (deep) return deep;
  // Watch metadata containers
  deep = probeShadow('ytd-watch-metadata', '#top-row #actions');
  if (deep) return deep;
  deep = probeShadow('ytd-watch-metadata', '#actions');
  if (deep) return deep;
  // Shorts overlay
  deep = probeShadow('ytd-reel-player-overlay-renderer', '#actions');
  if (deep) return deep;
  return null;
}

function ensureBadge(host) {
  if (!host) return null;
  let slot = host.querySelector('.ryd-badge');
  if (!slot) {
    slot = document.createElement('span');
    slot.className = 'ryd-badge ryd-muted';
    slot.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15l-3.5 3.5a2 2 0 0 1-3.5-1.5V13a2 2 0 0 1 2-2h5V5a3 3 0 0 1 3-3l3 9h3a2 2 0 0 1 2 2v1a8 8 0 0 1-8 8h-3"/></svg><span class="count">—</span>`;
    try { host.appendChild(slot); } catch {}
  }
  return slot;
}

function findPlayerOverlayHost() {
  // As a fallback, attach to the player container and absolutely position the badge.
  const containers = [
    '#player',
    '#movie_player',
    'ytd-player',
    'ytd-watch-flexy #player-container',
    'ytd-watch-flexy #player'
  ];
  for (const sel of containers) {
    const n = document.querySelector(sel);
    if (n) return n;
  }
  return null;
}

let lastVideoId = null;
let pending = 0;
let hostRetryTimer = null;

async function updateForCurrentUrl() {
  const vid = getVideoIdFromUrl(location.href);
  if (!vid) return;
  if (vid !== lastVideoId) {
    lastVideoId = vid;
    pending++; // invalidate prior fetches
  }
  injectStyles();

  const tryAttach = async () => {
    let host = findBadgeHost();
    if (!host) {
      // Fallback: player overlay attachment
      const player = findPlayerOverlayHost();
      if (player) {
        // Ensure the player can position children over video
        try {
          const st = player.style;
          if (getComputedStyle(player).position === 'static') st.position = 'relative';
        } catch {}
        // Create a container to hold the floating badge in the player
        let wrap = player.querySelector('.ryd-floating-wrap');
        if (!wrap) {
          wrap = document.createElement('div');
          wrap.className = 'ryd-floating-wrap';
          wrap.style.position = 'absolute';
          wrap.style.left = '12px';
          wrap.style.bottom = '12px';
      wrap.style.zIndex = '2147483647';
          player.appendChild(wrap);
        }
        host = wrap;
      }
    }
    if (!host) { return false; }
    try { console.debug('[RYD] attaching badge to', host.tagName || host.className || host.id || host); } catch {}
    const badge = ensureBadge(host);
    if (!badge) return false;
    badge.classList.add('ryd-muted');
    const ticket = ++pending;
    const data = await fetchRyd(vid);
    if (ticket !== pending || lastVideoId !== vid) return true; // outdated
  if (!data) { const cnt = badge.querySelector('.count'); if (cnt) cnt.textContent = 'n/a'; return true; }
    const dislikes = Number(data.dislikes || data.dislikeCount || 0);
    const likes = Number(data.likes || data.likeCount || 0);
    const ratio = likes + dislikes > 0 ? Math.round((dislikes / (likes + dislikes)) * 100) : 0;
  const cnt = badge.querySelector('.count');
  if (cnt) cnt.textContent = `${nfmt(dislikes)} 👎 (${ratio}%)`;
    badge.title = `${dislikes.toLocaleString()} dislikes\n${likes.toLocaleString()} likes`;
    badge.classList.remove('ryd-muted');
    return true;
  };

  // Immediate attempt, then retry a few seconds while YouTube lays out
  const okNow = await tryAttach();
  if (okNow) return;
  let tries = 0;
  clearInterval(hostRetryTimer);
  hostRetryTimer = setInterval(async () => {
    tries++;
    const done = await tryAttach();
    if (done || tries > 60) { // up to ~30s for very slow layouts
      clearInterval(hostRetryTimer);
      hostRetryTimer = null;
      if (!done) {
        // Final fallback: fixed overlay attached to body
        try {
          let fixed = document.querySelector('.ryd-fixed-wrap');
          if (!fixed) {
            fixed = document.createElement('div');
            fixed.className = 'ryd-fixed-wrap';
            document.body.appendChild(fixed);
          }
          const badge = ensureBadge(fixed);
          if (badge) {
            badge.classList.add('ryd-muted');
            const ticket = ++pending;
            const data = await fetchRyd(vid);
            if (ticket === pending && lastVideoId === vid) {
              const dislikes = Number((data && (data.dislikes || data.dislikeCount)) || 0);
              const likes = Number((data && (data.likes || data.likeCount)) || 0);
              const ratio = likes + dislikes > 0 ? Math.round((dislikes / (likes + dislikes)) * 100) : 0;
              const cnt = badge.querySelector('.count');
              if (cnt) cnt.textContent = `${nfmt(dislikes)} 👎 (${ratio}%)`;
              badge.title = `${dislikes.toLocaleString()} dislikes\n${likes.toLocaleString()} likes`;
              badge.classList.remove('ryd-muted');
            }
          }
        } catch {}
      }
    }
  }, 500);
}

function observeUrlChanges() {
  // Single-page app navigations
  let last = location.href;
  const mo = new MutationObserver(() => {
    if (location.href !== last) { last = location.href; updateForCurrentUrl(); }
  });
  mo.observe(document, { subtree: true, childList: true });
  window.addEventListener('yt-navigate-finish', updateForCurrentUrl, true);
  window.addEventListener('popstate', updateForCurrentUrl, true);
  window.addEventListener('yt-page-data-updated', updateForCurrentUrl, true);
}

document.addEventListener('readystatechange', () => { if (document.readyState === 'interactive') updateForCurrentUrl(); });
document.addEventListener('DOMContentLoaded', () => {
  // Only act on YouTube
  if (!/^(?:.*\.)?youtube\.com$/.test(location.hostname) && location.hostname !== 'youtu.be') return;
  updateForCurrentUrl();
  observeUrlChanges();
  // Also schedule a couple of follow-up attempts after page scripts settle
  setTimeout(updateForCurrentUrl, 1500);
  setTimeout(updateForCurrentUrl, 3500);
});
