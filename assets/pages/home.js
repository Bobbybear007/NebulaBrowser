(() => {
	const qs = sel => document.querySelector(sel);
	const qsa = sel => [...document.querySelectorAll(sel)];

	const searchForm = qs('#searchForm');
	const searchInput = qs('#searchInput');
	const engineBtn = qs('#engineBtn');
	const engineIcon = qs('#engineIcon');
	const engineList = qs('#engineList');
	const quickLinksEl = qs('#quickLinks');
	const tileTemplate = qs('#tileTemplate');
	const addLinkDialog = qs('#addLinkDialog');
	const addLinkForm = qs('#addLinkForm');
	const greetingEl = qs('#greeting');
	const timeNowEl = qs('#timeNow');
	const resetLinksBtn = qs('#resetLinks');
	const themeToggle = qs('#themeToggle');
	const weatherBody = qs('#weatherBody');
	// Removed focus/quote widget

	/* --- THEME --- */
	const PREF_KEY = 'nebula:theme';
	const storedTheme = localStorage.getItem(PREF_KEY);
	if (storedTheme) document.documentElement.dataset.theme = storedTheme;
	themeToggle.addEventListener('click', () => {
		const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
		document.documentElement.dataset.theme = cur;
		localStorage.setItem(PREF_KEY, cur);
	});

	/* --- GREETING / TIME --- */
	function updateGreeting() {
		const now = new Date();
		const hr = now.getHours();
		let label = hr < 5 ? 'Still up?' : hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : hr < 22 ? 'Good Evening' : 'Good Night';
		greetingEl.textContent = label;
	}
	function updateTime() { timeNowEl.textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}); }
	updateGreeting(); updateTime();
	// Update time every second for a live clock
	setInterval(updateTime, 1000);
	setInterval(updateGreeting, 15 * 60_000);

	/* --- SEARCH ENGINES --- */
	const ENGINES = {
		google: { name: 'Google', url: 'https://www.google.com/search?q=', icon: '../b-icons/google.svg' },
		duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', icon: '../b-icons/duckduckgo.svg' },
		bing: { name: 'Bing', url: 'https://www.bing.com/search?q=', icon: '../b-icons/Bing.svg' }
	};
	let currentEngine = localStorage.getItem('nebula:engine') || 'google';
	function applyEngine() {
		const e = ENGINES[currentEngine];
		engineIcon.src = e.icon; engineIcon.alt = e.name;
	}
	applyEngine();
		function openEngineList() {
			engineList.removeAttribute('hidden');
			engineBtn.setAttribute('aria-expanded','true');
			const sel = engineList.querySelector(`[data-engine='${currentEngine}']`);
			engineList.querySelectorAll('li').forEach(li => li.removeAttribute('aria-selected'));
			sel?.setAttribute('aria-selected','true');
		}
		function closeEngineList() {
			engineList.setAttribute('hidden','');
			engineBtn.setAttribute('aria-expanded','false');
		}
		engineBtn.addEventListener('click', () => {
			if (engineList.hasAttribute('hidden')) openEngineList(); else closeEngineList();
		});
	engineList.addEventListener('click', e => {
		const li = e.target.closest('li'); if (!li) return;
		currentEngine = li.dataset.engine; localStorage.setItem('nebula:engine', currentEngine); applyEngine();
		engineList.setAttribute('hidden', ''); engineBtn.setAttribute('aria-expanded','false'); searchInput.focus();
	});
		document.addEventListener('click', e => { if (!engineList.contains(e.target) && !engineBtn.contains(e.target)) closeEngineList(); });
		document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEngineList(); });

	searchForm.addEventListener('submit', e => {
		e.preventDefault();
		const q = searchInput.value.trim(); if (!q) { searchInput.focus(); return; }
		const url = ENGINES[currentEngine].url + encodeURIComponent(q);
		// In CEF we can just set window.location or create a new browser tab depending on host integration.
		window.location.href = url;
	});

	/* --- QUICK LINKS --- */
	const LINKS_KEY = 'nebula:links';
	const DEFAULT_LINKS = [
		{ name: 'YouTube', url: 'https://www.youtube.com' },
		{ name: 'Reddit', url: 'https://www.reddit.com' },
		{ name: 'GitHub', url: 'https://github.com' },
		{ name: 'StackOverflow', url: 'https://stackoverflow.com' },
		{ name: 'MDN', url: 'https://developer.mozilla.org' },
		{ name: 'Wikipedia', url: 'https://wikipedia.org' }
	];

	// Persistent storage upgrade: use IndexedDB (graceful fallback to localStorage)
	const IDB_DB = 'nebulaStore';
	const IDB_STORE = 'kv'; // simple key-value store {key, value}

	function openIDB() {
		return new Promise((res, rej) => {
			if (!('indexedDB' in window)) { rej(new Error('no-idb')); return; }
			const req = indexedDB.open(IDB_DB, 1);
			req.onerror = () => rej(req.error || new Error('idb-open'));
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'key' });
			};
			req.onsuccess = () => res(req.result);
		});
	}
	async function idbGet(key) {
		try {
			const db = await openIDB();
			return await new Promise((res, rej) => {
				const tx = db.transaction(IDB_STORE, 'readonly');
				const store = tx.objectStore(IDB_STORE);
				const r = store.get(key);
				r.onsuccess = () => res(r.result ? r.result.value : undefined);
				r.onerror = () => rej(r.error);
			});
		} catch { return undefined; }
	}
	async function idbSet(key, value) {
		try {
			const db = await openIDB();
			await new Promise((res, rej) => {
				const tx = db.transaction(IDB_STORE, 'readwrite');
				const store = tx.objectStore(IDB_STORE);
				store.put({ key, value });
				tx.oncomplete = () => res();
				tx.onerror = () => rej(tx.error);
			});
		} catch {/* ignore write errors */}
	}

	async function loadLinksPersistent() {
		// 1. Try IndexedDB
		const fromIDB = await idbGet('links');
		if (Array.isArray(fromIDB) && fromIDB.length) return fromIDB;
		// 2. Fallback to localStorage
		let local = undefined;
		try { local = JSON.parse(localStorage.getItem(LINKS_KEY)); } catch {}
		if (Array.isArray(local) && local.length) {
			// migrate to IDB (fire & forget)
			idbSet('links', local);
			return local;
		}
		// 3. Defaults
		return DEFAULT_LINKS.slice();
	}

	let links = [];
	function saveLinks() {
		localStorage.setItem(LINKS_KEY, JSON.stringify(links));
		idbSet('links', links); // async, no await needed
	}

	function faviconUrl(u) {
		try { const {origin} = new URL(u); return origin + '/favicon.ico'; } catch { return ''; }
	}
	function renderLinks() {
		quickLinksEl.innerHTML = '';
		links.forEach((link, idx) => {
			const node = tileTemplate.content.firstElementChild.cloneNode(true);
			const btn = node.querySelector('[data-open]');
			const favWrap = node.querySelector('[data-favicon]');
			const lab = node.querySelector('[data-label]');
			lab.textContent = link.name;
			const fav = new Image(); fav.decoding='async'; fav.loading='lazy'; fav.src = faviconUrl(link.url); fav.alt='';
			fav.onerror = () => { favWrap.textContent = link.name[0]?.toUpperCase() || '?'; favWrap.style.fontWeight='600'; };
			favWrap.appendChild(fav);
			btn.addEventListener('click', () => window.location.href = link.url);
			node.querySelector('.remove').addEventListener('click', () => { links.splice(idx,1); saveLinks(); renderLinks(); });
			node.dataset.index = idx;
			quickLinksEl.appendChild(node);
		});
		// Add tile button
		const addTile = tileTemplate.content.firstElementChild.cloneNode(true);
		addTile.classList.add('add');
		addTile.querySelector('[data-label]').textContent='';
		const wrap = addTile.querySelector('[data-favicon]');
		wrap.textContent='+'; wrap.style.fontSize='42px'; wrap.style.background='transparent'; wrap.style.color='#ffffff40';
		const btn = addTile.querySelector('[data-open]');
		btn.addEventListener('click', () => addLinkDialog.showModal());
		quickLinksEl.appendChild(addTile);
	}
	// Initialize links asynchronously then render
	(async () => {
		links = await loadLinksPersistent();
		renderLinks();
	})();

		// Remove pseudo add handlers (no longer needed)
	addLinkForm.addEventListener('submit', e => {
		e.preventDefault();
		const formData = new FormData(addLinkForm);
		const name = formData.get('name').toString().trim();
		const url = formData.get('url').toString().trim();
		if (!/^https?:\/\//i.test(url)) { alert('URL must start with http/https'); return; }
		links.push({name,url}); saveLinks(); renderLinks(); addLinkDialog.close(); addLinkForm.reset();
	});
	resetLinksBtn.addEventListener('click', () => { links = DEFAULT_LINKS.slice(); saveLinks(); renderLinks(); });

	/* --- DRAG / REORDER --- */
	let dragIdx = null;
	quickLinksEl.addEventListener('dragstart', e => {
		const li = e.target.closest('.tile'); if (!li) return;
		if (li.classList.contains('add')) { e.preventDefault(); return; }
		dragIdx = Number(li.dataset.index); e.dataTransfer.effectAllowed='move';
		setTimeout(()=> li.classList.add('dragging'),0);
	});
	quickLinksEl.addEventListener('dragend', e => {
		const li = e.target.closest('.tile'); if (li) li.classList.remove('dragging');
	});
	quickLinksEl.addEventListener('dragover', e => {
		e.preventDefault();
		const after = [...quickLinksEl.querySelectorAll('.tile:not(.dragging)')].find(el => {
			const rect = el.getBoundingClientRect();
			return e.clientY < rect.top + rect.height/2;
		});
		const dragging = quickLinksEl.querySelector('.tile.dragging');
		if (!dragging) return;
		if (after) quickLinksEl.insertBefore(dragging, after); else quickLinksEl.appendChild(dragging);
	});
	quickLinksEl.addEventListener('drop', () => {
			const newOrder = [...quickLinksEl.querySelectorAll('.tile')]
				.filter(el => !el.classList.contains('add'))
				.map(el => links[Number(el.dataset.index)])
				.filter(Boolean);
		links = newOrder; saveLinks(); renderLinks();
	});

	/* --- WEATHER (periodic refresh + simple caching) --- */
	const WX_CACHE_KEY = 'nebula:wxcache';
	const WX_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
	async function fetchLocation() {
		try {
			const r = await fetch('https://ipapi.co/json/');
			if(!r.ok) throw 0; return await r.json();
		} catch { throw new Error('loc'); }
	}
	async function fetchWeather(lat, lon) {
		const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 7000);
		try {
			const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`, {signal:ctrl.signal});
			clearTimeout(t); if(!r.ok) throw 0; return await r.json();
		} catch { throw new Error('wx'); }
	}
	function formatWeather(data) {
		const cw = data.current_weather; if(!cw) return 'Weather unavailable';
		return `${Math.round(cw.temperature)}°C · Wind ${Math.round(cw.windspeed)} km/h`;
	}
	async function updateWeather(force=false) {
		try {
			if(!force) {
				const cached = JSON.parse(localStorage.getItem(WX_CACHE_KEY) || 'null');
				if(cached && Date.now() - cached.t < WX_CACHE_TTL) { weatherBody.textContent = cached.text; return; }
			}
			weatherBody.textContent = 'Loading…';
			const loc = await fetchLocation();
			const wx = await fetchWeather(loc.latitude, loc.longitude);
			const text = formatWeather(wx);
			weatherBody.textContent = text;
			localStorage.setItem(WX_CACHE_KEY, JSON.stringify({t:Date.now(), text}));
		} catch {
			weatherBody.textContent = 'Weather unavailable';
		}
	}
	updateWeather();
	setInterval(()=>updateWeather(), WX_CACHE_TTL); // refresh every TTL

	/* --- STARFIELD CANVAS --- */
	const canvas = qs('#stars');
	const ctx = canvas.getContext('2d');
	let stars = [];
	function resize() { canvas.width = innerWidth; canvas.height = innerHeight; initStars(); }
	window.addEventListener('resize', resize);
	function initStars() {
		const count = Math.min(450, Math.floor(innerWidth * innerHeight / 4500));
		stars = Array.from({length:count}, () => ({
			x: Math.random()*canvas.width,
			y: Math.random()*canvas.height,
			z: Math.random()*1 + .2,
			r: Math.random()*1.2 + .2,
			o: Math.random()*0.8 + 0.2,
			tw: Math.random()*0.02 + 0.005
		}));
	}
	function renderStars(t) {
		ctx.clearRect(0,0,canvas.width,canvas.height);
		for (const s of stars) {
			const alpha = s.o * (0.5 + 0.5*Math.sin(t * s.tw));
			ctx.beginPath();
			ctx.fillStyle = `hsla(${220 + s.z*40},70%,${70 + s.z*20}%,${alpha})`;
			ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
			ctx.fill();
		}
		requestAnimationFrame(renderStars);
	}
	resize(); requestAnimationFrame(renderStars);

})();
