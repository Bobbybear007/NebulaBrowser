// Unified icon set loaders with graceful fallbacks.
// Each loader returns an array of string icon names (NOT SVG markup) suitable for name-based selection.
// Some libraries don't have an easy metadata endpoint; we attempt a fetch and fall back to a small curated subset.

import { fetchAllIcons as fetchMaterialIcons, icons as materialFallback } from './icons.js';

async function attemptJSON(url, transform) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const data = await res.json();
    return transform ? transform(data) : data;
  } catch (e) {
    console.warn('[IconSets] Failed to fetch', url, e);
    return null;
  }
}

// --- SVG helpers ---
async function attemptText(url) {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const txt = await res.text();
    if (!/^<svg[\s\S]*<\/svg>$/i.test(txt.trim())) throw new Error('Not SVG');
    return txt;
  } catch {
    return null;
  }
}
function svgToDataUrl(svg) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.replace(/<script[\s\S]*?<\/script>/gi, ''));
}

const staticFallbacks = {
  lucide: ['activity','airplay','alarm-clock','align-center','anchor','apple','archive','arrow-big-up','at-sign','award','battery','bell','bluetooth','book','bookmark','briefcase','calendar','camera','cast','check','chevron-down','chrome','cloud','code','command','compass','cpu','database','download','edit','external-link','eye','file','folder','gamepad','globe','heart','help-circle','home','image','info','keyboard','layers','link','list','lock','mail','map','menu','mic','moon','music','package','pie-chart','play','plus','pocket','power','refresh-ccw','rss','save','scissors','search','settings','share','shield','smartphone','speaker','star','sun','tablet','tag','terminal','thumbs-up','trash','tv','twitter','upload','user','video','wifi','x','zap'],
  tabler: ['activity','alarm','affiliate','anchor','api','app-window','apple','archive','armchair','arrow-down','at','award','backspace','ballon','battery','bell','bluetooth','bolt','book','bookmark','briefcase','browser','bug','building','calendar','camera','car','chart-area','chart-bar','chart-pie','chart-scatter','check','chevron-down','cloud','code','coffee','color-swatch','command','compass','cpu','credit-card','dashboard','database','device-desktop','device-mobile','dice','dna','download','drop','edit','file','filter','flag','flame','folder','gift','globe','grid','hash','headphones','heart','help','home','id','inbox','info-circle','key','keyboard','language','layers','layout','layout-grid','letter-a','link','lock','login','logout','mail','map','menu','message','microphone','mood-happy','moon','music','news','note','package','password','phone','photo','player-play','plug','plus','power','printer','puzzle','refresh','rocket','route','rss','school','search','server','settings','share','shield','smart-home','snowflake','sparkles','star','sun','switch','tag','thumb-up','tool','trash','trophy','typography','upload','user','video','wifi','world','x'],
  phosphor: ['activity','airplane','anchor','apple-logo','archive','arrow-down','arrow-up','at','bag','bell','book','bookmark','bounding-box','briefcase','browser','bug','calendar','camera','car','check','clipboard','cloud','code','command','compass','cpu','credit-card','database','device-mobile','device-tablet','door','download','drop','envelope','eye','eyedropper','file','film-strip','flag','flame','folder','funnel','game-controller','gear','globe','hand','hash','headphones','heart','house','image','info','key','keyboard','leaf','link','lock','magnet','magnifying-glass','map-pin','microphone','moon','music-note','note','nut','package','paper-plane','paperclip','path','pen','phone','plug','plus','power','printer','question','rocket','rss','scissors','share','shield','shopping-cart','sketch-logo','smiley','sparkle','speaker-high','star','sun','swatches','tag','terminal','thumbs-up','toolbox','trash','trophy','tv','user','users','video-camera','wifi-high','x','yarn','youtube-logo','zap'],
  remix: ['add','alarm','alert','anchor','apps','archive','arrow-down','arrow-right','arrow-up','at','award','bank','bar-chart','battery','bell','bluetooth','book','bookmark','briefcase','bug','building','calendar','camera','car','chat','chrome','clipboard','cloud','code','command','compass','copyleft','copyright','cpu','dashboard','database','delete-bin','device','dice','download','dribbble','drive','earth','edge','edit','facebook','file','filter','fire','flag','folder','gamepad','gift','github','gitlab','global','google','group','hard-drive','heart','home','image','inbox','instagram','keyboard','keynote','layout','links','list','lock','login','logout','mac','mail','map','menu','message','mic','moon','music','notification','paragraph','pause','phone','picture-in-picture','play','plug','price-tag','print','qr-code','question','reddit','refresh','restart','rocket','rss','scales','search','secure-payment','send','settings','share','shield','shopping-bag','slack','smartphone','sound-module','star','sun','t-box','tablet','tag','telegram','thumb-up','timer','tool','trophy','twitter','tv','upload','usb','user','video','visa','voicemail','volume-up','wallet','wifi','windows','xbox','youtube','zoom-in'],
  bootstrap: ['alarm','android','apple','archive','arrow-down','arrow-up','arrow-left','arrow-right','at','award','backspace','badge-4k','bag','bank','bar-chart','battery','bell','bluetooth','book','bookmark','box','briefcase','brush','bug','calendar','camera','card-image','card-list','cart','chat','check','chevron-down','circle','cloud','code','command','compass','cpu','credit-card','database','device-hdd','device-ssd','display','download','droplet','earbuds','emoji-smile','envelope','exclamation','eye','facebook','file','filter','flag','folder','funnel','gear','gift','globe','google','graph-up','grid','hammer','hand-thumbs-up','hash','headphones','heart','house','image','info','instagram','joystick','keyboard','laptop','layers','layout-split','lightning','link','lock','mailbox','map','megaphone','menu-button','mic','moon','music-note','nut','palette','paperclip','patch-check','pen','pencil','people','phone','pin','play','plug','plus','power','printer','qr-code','question','rocket','rss','save','scissors','search','server','share','shield','shop','skip-forward','slack','speaker','speedometer','star','sun','tablet','tag','terminal','tools','trash','trophy','truck','twitch','twitter','type','ui-checks','upload','usb','vector-pen','wallet','whatsapp','wifi','windows','wrench','x','youtube'],
  heroicons: ['academic-cap','adjustments-horizontal','adjustments-vertical','archive-box','arrow-down','arrow-up','arrow-right','arrow-left','at-symbol','backspace','banknotes','bars-2','bars-3','battery-100','beaker','bell','bookmark','briefcase','cake','calendar','camera','chart-bar','chat-bubble-bottom-center','chat-bubble-left','check','chevron-down','chip','circle-stack','cloud','code-bracket','cog','command-line','computer-desktop','cpu-chip','cube','currency-dollar','device-phone-mobile','device-tablet','document','document-text','ellipsis-horizontal','envelope','exclamation-circle','eye','film','finger-print','fire','flag','folder','gift','globe-alt','hand-thumb-up','heart','home','identification','inbox','information-circle','key','language','lifebuoy','light-bulb','link','lock-closed','magnifying-glass','map','megaphone','microphone','moon','musical-note','newspaper','paint-brush','paper-airplane','paper-clip','phone','photo','play','plus','power','printer','puzzle-piece','qr-code','question-mark-circle','rocket-launch','rss','scale','scissors','server','share','shield-check','sparkles','square-3-stack-3d','star','sun','swatch','tag','trophy','tv','user','users','video-camera','wallet','wifi','wrench','x-mark'],
  feather: ['activity','airplay','alert-circle','alert-triangle','anchor','aperture','archive','at-sign','award','bar-chart','battery','bell','bluetooth','book','bookmark','box','briefcase','calendar','camera','cast','check','chevron-down','chrome','circle','clipboard','cloud','code','command','compass','cpu','database','download','droplet','edit','eye','facebook','file','film','filter','flag','folder','gift','git-branch','git-commit','git-merge','github','gitlab','globe','grid','hash','headphones','heart','help-circle','home','image','info','instagram','key','layers','layout','link','lock','mail','map','menu','mic','monitor','moon','music','package','paperclip','pause','pen-tool','phone','play','plus','pocket','power','printer','radio','refresh-ccw','refresh-cw','repeat','rewind','rss','save','scissors','search','send','server','settings','share','shield','shopping-bag','shopping-cart','shuffle','slack','smartphone','speaker','square','star','sun','tablet','tag','target','terminal','thumbs-up','tool','trash','trello','trending-up','triangle','truck','tv','twitter','type','umbrella','unlock','upload','user','users','video','voicemail','volume','watch','wifi','wind','x','zap'],
  simple: ['github','gitlab','google','youtube','twitter','facebook','twitch','discord','spotify','apple','microsoft','android','linux','ubuntu','x','linkedin','npm','pypi','docker','kubernetes','aws','azure','gcp','cloudflare','figma','notion','slack','whatsapp','meta','paypal','stripe','reddit','snapchat','steam','xbox','playstation','nintendo','instagram','pinterest','soundcloud','openai','vercel','netlify','digitalocean'],
  radix: ['activity-log','airplane','backpack','bell','bookmark','calendar','camera','card-stack','caret-down','caret-up','chat-bubble','chat-dots','check','chevron-down','chevron-left','chevron-right','chevron-up','clock','code','component-1','component-2','cookie','copy','cube','discord-logo','double-arrow-down','double-arrow-left','double-arrow-right','double-arrow-up','drag-handle-dots-2','envelope-closed','envelope-open','exclamation-triangle','external-link','eye-open','file','file-text','file-plus','gear','globe','heart','home','image','info-circled','keyboard','laptop','layers','link-1','link-2','lock-closed','magic-wand','magnifying-glass','moon','notebook','open-in-new-window','paper-plane','pencil-1','person','pie-chart','pin-left','pin-right','plus','question-mark-circled','reload','rocket','rows','scissors','share-1','share-2','shield','speaker-loud','star','sun','target','trash','upload','video','zoom-in','zoom-out']
};

export const iconSets = {
  material: {
    label: 'Material',
    loader: async () => { try { return await fetchMaterialIcons(); } catch { return materialFallback; } },
    fetchIcon: async () => null
  },
  lucide: {
    label: 'Lucide',
    loader: async () => {
      const data = await attemptJSON('https://cdn.jsdelivr.net/npm/lucide@latest/dist/metadata.json', d => Object.keys(d));
      return data && data.length ? data : staticFallbacks.lucide;
    },
    fetchIcon: async (name) => {
      const svg = await attemptText(`https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/${name}.svg`);
      return svg ? svgToDataUrl(svg) : null;
    }
  },
  tabler: {
    label: 'Tabler',
    loader: async () => {
      const data = await attemptJSON('https://cdn.jsdelivr.net/gh/tabler/tabler-icons@latest/icons.json', d => d.map(o => o.name));
      return data && data.length ? data : staticFallbacks.tabler;
    },
    fetchIcon: async (name) => {
      const urls = [
        `https://cdn.jsdelivr.net/npm/@tabler/icons@latest/icons/outline/${name}.svg`,
        `https://cdn.jsdelivr.net/npm/@tabler/icons@latest/icons/filled/${name}.svg`
      ];
      for (const u of urls) { const svg = await attemptText(u); if (svg) return svgToDataUrl(svg); }
      return null;
    }
  },
  phosphor: {
    label: 'Phosphor',
    loader: async () => staticFallbacks.phosphor,
    fetchIcon: async (name) => {
      const styles = ['regular','bold','duotone','fill','light','thin'];
      for (const style of styles) {
        const svg = await attemptText(`https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2/assets/${style}/${name}.svg`);
        if (svg) return svgToDataUrl(svg);
      }
      return null;
    }
  },
  remix: {
    label: 'Remix',
  loader: async () => staticFallbacks.remix,
  fetchIcon: async () => null,
  fontClass: (name) => `ri-${name}-line` // use line style font sprite
  },
  bootstrap: {
    label: 'Bootstrap',
    loader: async () => staticFallbacks.bootstrap,
    fetchIcon: async (name) => {
      const svg = await attemptText(`https://cdn.jsdelivr.net/npm/bootstrap-icons@latest/icons/${name}.svg`);
      return svg ? svgToDataUrl(svg) : null;
    },
    fontClass: (name) => `bi-${name}`
  },
  heroicons: {
    label: 'Heroicons',
    loader: async () => staticFallbacks.heroicons,
    fetchIcon: async (name) => {
      const urls = [
        `https://cdn.jsdelivr.net/npm/heroicons@2/24/outline/${name}.svg`,
        `https://cdn.jsdelivr.net/npm/heroicons@2/24/solid/${name}.svg`
      ];
      for (const u of urls) { const svg = await attemptText(u); if (svg) return svgToDataUrl(svg); }
      return null;
    }
  },
  feather: {
    label: 'Feather',
    loader: async () => staticFallbacks.feather,
    fetchIcon: async (name) => {
      const svg = await attemptText(`https://cdn.jsdelivr.net/npm/feather-icons@4/dist/icons/${name}.svg`);
      return svg ? svgToDataUrl(svg) : null;
    },
    fontClass: (name) => `icon-${name}` // fallback for display
  },
  simple: {
    label: 'Simple Icons',
    loader: async () => staticFallbacks.simple,
    fetchIcon: async (name) => {
      const svg = await attemptText(`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${name}.svg`);
      return svg ? svgToDataUrl(svg) : null;
    }
  },
  radix: {
    label: 'Radix',
    loader: async () => staticFallbacks.radix,
    fetchIcon: async (name) => {
      const svg = await attemptText(`https://cdn.jsdelivr.net/npm/@radix-ui/icons@latest/icons/${name}.svg`);
      return svg ? svgToDataUrl(svg) : null;
    }
  }
};

// Utility: get list of set keys + label for UI
export function listIconSets() {
  return Object.entries(iconSets).map(([key, val]) => ({ key, label: val.label }));
}
