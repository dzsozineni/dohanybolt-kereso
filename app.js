'use strict';
/* Dohánybolt Kereső – webes változat.
   Az adat a data/shops.json-ban van (tools/build_data.py készíti az eredeti SQLite-ból). */

const PAGE = 20;
const DAY_NAMES = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const state = {
  shops: [], meta: null,
  user: null,            // {lat, lng}
  search: '', filter: 'all', cardOnly: false, hasCardData: false,
  limit: PAGE, results: [],
  tab: 'list', selected: null,
};

/* ---------------- ikonok ---------------- */
const ICON = {
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  tune: '<svg viewBox="0 0 24 24"><path d="M4 7h9m4 0h3M4 17h3m4 0h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Zm0 0v14m6-12v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  nav: '<svg viewBox="0 0 24 24"><path d="M20.5 3.5 3.8 10.6l7 2.6 2.6 7Z" fill="currentColor"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 2.5a7 7 0 0 0-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 0 0-7-7Z" fill="currentColor"/><circle cx="12" cy="9.5" r="2.6" fill="#fff"/></svg>',
  card: '<svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M7 15h4" stroke="currentColor" stroke-width="2"/></svg>',
};

/* ---------------- segédek ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dayIdx = d => (d.getDay() + 6) % 7; // 0 = hétfő

function haversine(a, b) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function fmtDist(m) {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}
function fmtStamp(raw) {
  if (!raw) return null;
  const d = new Date(raw.replace(' ', 'T'));
  if (isNaN(d)) return raw;
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}. ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function navUrl(s) {
  return IS_IOS
    ? `https://maps.apple.com/?daddr=${s.lat},${s.lng}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

/* ---------------- nyitvatartás (az eredeti app logikájának portja) ----------------
   week[nap] = [s1,e1,s2,e2,s3,e3,s4,e4] percben; 0/0 = nincs; 0–1439 = egész nap */
const slots = day => [0, 1, 2, 3].map(i => ({ n: i + 1, s: day[i * 2], e: day[i * 2 + 1] }));
const isFull = day => day[0] === 0 && day[1] === 1439;
const defined = t => t.s !== 0 && t.e !== 0;

function status(shop, now = new Date()) {
  const di = dayIdx(now), m = now.getHours() * 60 + now.getMinutes();
  const today = shop.week[di];
  if (isFull(today)) return { open: true, text: 'Egész nap nyitva' };
  const cur = slots(today).find(t => t.e > 0 && t.s <= m && m <= t.e);
  if (cur) {
    const last = !slots(today).some(t => t.n > cur.n && defined(t));
    return { open: true, text: `${last ? 'Ma nyitva' : 'Most nyitva'} ${hm(cur.e)}-ig` };
  }
  const next = (day, from) => slots(day).find(t => defined(t) && from <= t.s);
  const n = next(today, m);
  if (n) return { open: false, text: `Ma nyit ${hm(n.s)}-kor` };
  for (let i = 1; i <= 6; i++) {
    const d = (di + i) % 7, day = shop.week[d];
    const when = i === 1 ? 'Holnap' : DAY_NAMES[d];
    if (isFull(day)) return { open: false, text: `${when} egész nap nyitva` };
    const n2 = next(day, 0);
    if (n2) return { open: false, text: `${when} nyit ${hm(n2.s)}-kor` };
  }
  return { open: false, text: 'Zárva' };
}
function dayText(day) {
  if (isFull(day)) return '0–24';
  const parts = slots(day).filter(t => t.e > 0).map(t => `${hm(t.s)}–${hm(t.e === 1439 ? 1440 : t.e)}`);
  return parts.length ? parts.join('  |  ') : 'Zárva';
}

/* ---------------- adat ---------------- */
async function loadData() {
  const res = await fetch('data/shops.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Az adatfájl nem tölthető be (HTTP ${res.status}).`);
  const data = await res.json();
  state.meta = data.meta;
  state.shops = data.shops.map(([id, zip, city, district, address, lat, lng, card, si]) => ({
    id, zip, city, district, address, lat, lng, card: !!card,
    week: data.schedules[si],
    hay: norm(`${city} ${address} ${district}`),
  }));
  state.hasCardData = state.shops.some(s => s.card);
}

function matchesOpen(s, now) {
  if (state.filter === 'all') return true;
  const today = s.week[dayIdx(now)];
  if (state.filter === 'allday') return isFull(today);
  const m = now.getHours() * 60 + now.getMinutes();
  return slots(today).some(t => t.e > 0 && t.s <= m && m <= t.e);
}
function tokens() {
  if (state.search.trim().length < 3) return [];
  return state.search.split(/\s+/)
    .map(t => norm(t.replace(/[^\p{L}\p{N}]/gu, '')))
    .filter(Boolean);
}
/** Szűrt és rendezett lista egy referenciapont körül (felhasználó vagy térképközép). */
function query(around) {
  const now = new Date(), toks = tokens();
  let list = state.shops.filter(s =>
    (!state.cardOnly || s.card) &&
    matchesOpen(s, now) &&
    toks.every(t => s.zip.startsWith(t) || s.hay.includes(t)));
  if (around) {
    for (const s of list) s._d = haversine(around, s);
    list.sort((a, b) => a._d - b._d);
  } else {
    list.sort((a, b) => a.city.localeCompare(b.city, 'hu') || a.address.localeCompare(b.address, 'hu'));
  }
  return list;
}

/* ---------------- kereső + chipek (mindkét nézetben) ---------------- */
function buildControls() {
  $$('[data-search]').forEach(row => {
    row.innerHTML = `
      <label class="search-field">
        ${ICON.search}
        <input type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false"
               placeholder="Település, cím, irányítószám" aria-label="Keresés településre, címre vagy irányítószámra">
        <button type="button" class="clear-btn" aria-label="Keresés törlése" hidden>${ICON.close}</button>
      </label>
      <button type="button" class="filter-btn" aria-label="Szűrők">${ICON.tune}</button>`;
    const input = $('input', row), clear = $('.clear-btn', row);
    let t;
    input.addEventListener('input', () => {
      clear.hidden = !input.value;
      clearTimeout(t);
      t = setTimeout(() => setSearch(input.value), 200);
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; setSearch(''); input.focus(); });
    $('.filter-btn', row).addEventListener('click', openFilters);
  });
  $$('[data-chips]').forEach(box => {
    box.innerHTML = `
      <button type="button" class="chip" data-filter="now" aria-pressed="false">${ICON.clock}Nyitva most</button>
      <button type="button" class="chip" data-filter="allday" aria-pressed="false">${ICON.cal}Ma 0–24</button>
      ${box.hasAttribute('data-with-map') ? `<button type="button" class="chip chip-map" data-goto-map>${ICON.map}Térkép</button>` : ''}`;
    $$('[data-filter]', box).forEach(b => b.addEventListener('click', () =>
      setFilter(state.filter === b.dataset.filter ? 'all' : b.dataset.filter)));
    $('[data-goto-map]', box)?.addEventListener('click', () => showTab('map'));
  });
}
function syncControls() {
  $$('[data-search] input').forEach(i => {
    if (document.activeElement !== i && i.value !== state.search) {
      i.value = state.search;
      $('.clear-btn', i.parentElement).hidden = !i.value;
    }
  });
  $$('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)));
  $$('.filter-btn').forEach(b => b.classList.toggle('is-on', state.cardOnly));
}
function setSearch(v) {
  const wasActive = state.search.trim().length >= 3;
  state.search = v;
  if (!wasActive && v.trim().length < 3) { syncControls(); return; }
  refresh();
}
function setFilter(f) { state.filter = f; refresh(); }
function setCardOnly(v) { state.cardOnly = v; refresh(); }

function refresh() {
  state.limit = PAGE;
  syncControls();
  renderList();
  if (map) loadMarkers();
}

/* ---------------- lista ---------------- */
function cardHtml(s, i) {
  const st = status(s), d = state.user ? haversine(state.user, s) : null;
  const meta = [fmtDist(d), st.text].filter(Boolean).join(', ');
  return `
  <li class="card" data-id="${s.id}" tabindex="0">
    <span class="pin ${i === 0 && state.user ? 'is-gold' : ''}">${ICON.pin}</span>
    <div>
      <h2 class="card-title">${esc(s.city)}</h2>
      <p class="card-addr">${esc(s.district ? `${s.address}, ${s.district}` : s.address)}</p>
      <p class="card-meta">${esc(meta)}</p>
    </div>
    <div class="card-side">
      <span class="pill ${st.open ? 'open' : 'closed'}">${ICON.clock}${st.open ? 'Nyitva' : 'Zárva'}</span>
      <a class="nav-btn" href="${navUrl(s)}" target="_blank" rel="noopener" aria-label="Útvonal ide: ${esc(s.city)}, ${esc(s.address)}">${ICON.nav}</a>
    </div>
  </li>`;
}
function renderList() {
  state.results = query(state.user);
  const shown = state.results.slice(0, state.limit);
  $('#cards').innerHTML = shown.map(cardHtml).join('');
  $('#count').textContent = `${state.results.length.toLocaleString('hu-HU')} találat`;
  $('#empty').hidden = state.results.length > 0;
}
function appendPage() {
  if (state.limit >= state.results.length) return;
  const from = state.limit;
  state.limit += PAGE;
  $('#cards').insertAdjacentHTML('beforeend',
    state.results.slice(from, state.limit).map((s, i) => cardHtml(s, from + i)).join(''));
}
function bindList() {
  const cards = $('#cards');
  cards.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('.card');
    if (li) openShop(+li.dataset.id);
  });
  cards.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('card')) openShop(+e.target.dataset.id);
  });
  new IntersectionObserver(es => { if (es[0].isIntersecting) appendPage(); },
    { root: $('#viewList'), rootMargin: '600px' }).observe($('#sentinel'));
}

/* ---------------- lapok ---------------- */
let openSheetEl = null, lastFocus = null;
function openSheet(el, html) {
  closeSheet(true);
  lastFocus = document.activeElement;
  el.innerHTML = `<div class="handle"></div>
    <button type="button" class="sheet-close" aria-label="Bezárás">${ICON.close}</button>${html}`;
  el.hidden = false; $('#backdrop').hidden = false;
  el.scrollTop = 0;
  openSheetEl = el;
  $('.sheet-close', el).addEventListener('click', () => closeSheet());
  $('.sheet-close', el).focus({ preventScroll: true });
  enableSwipeDown(el);
}
function closeSheet(silent) {
  if (!openSheetEl) return;
  openSheetEl.hidden = true; openSheetEl.style.transform = '';
  $('#backdrop').hidden = true;
  openSheetEl = null;
  if (!silent) lastFocus?.focus?.({ preventScroll: true });
}
function enableSwipeDown(el) {
  let y0 = null, dy = 0;
  el.ontouchstart = e => { y0 = el.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; };
  el.ontouchmove = e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0) { el.style.transform = `translateY(${dy}px)`; }
  };
  el.ontouchend = () => {
    if (y0 != null && dy > 110) closeSheet(); else el.style.transform = '';
    y0 = null;
  };
}

function openShop(id) {
  const s = state.shops.find(x => x.id === id);
  if (!s) return;
  const st = status(s), d = state.user ? haversine(state.user, s) : null;
  const today = dayIdx(new Date());
  const sub = [s.zip, s.district].filter(Boolean).join(' · ');
  openSheet($('#sheetShop'), `
    <div class="shop-head">
      <div>
        <h2 id="shopTitle">${esc(s.city)}</h2>
        <p class="addr">${esc(s.address)}</p>
        ${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
        <div class="shop-status">
          <span class="pill large ${st.open ? 'open' : 'closed'}">${ICON.clock}${st.open ? 'Nyitva' : 'Zárva'}</span>
          <span class="txt">${esc(st.text)}</span>
        </div>
      </div>
      <a class="route" href="${navUrl(s)}" target="_blank" rel="noopener">
        <span class="nav-btn big">${ICON.nav}</span>Útvonal${d != null ? `<small>${fmtDist(d)}</small>` : ''}
      </a>
    </div>
    <hr class="rule">
    <h3>Nyitvatartás</h3>
    <ul class="hours">
      ${s.week.map((day, i) => {
        const t = dayText(day);
        return `<li class="${i === today ? 'today' : ''}"><b>${DAY_NAMES[i]}:</b><span class="${t === 'Zárva' ? 'closed' : ''}">${t}</span></li>`;
      }).join('')}
    </ul>
    ${s.card ? `<div class="note-box">${ICON.card}Bankkártyás fizetés elfogadott</div>` : ''}`);
}

function openFilters() {
  const seg = [['all', 'Mind'], ['now', 'Nyitva most'], ['allday', 'Ma 0–24']];
  openSheet($('#sheetFilters'), `
    <h3 id="filtersTitle">Szűrők</h3>
    <p class="label">Nyitvatartás</p>
    <div class="seg" role="group" aria-label="Nyitvatartás szűrő">
      ${seg.map(([v, l]) => `<button type="button" data-seg="${v}" aria-pressed="${state.filter === v}">${l}</button>`).join('')}
    </div>
    ${state.hasCardData ? `
    <label class="switch-row">Csak bankkártyás fizetés
      <input type="checkbox" class="switch" id="cardOnly" ${state.cardOnly ? 'checked' : ''}>
    </label>` : ''}`);
  $$('#sheetFilters [data-seg]').forEach(b => b.addEventListener('click', () => {
    setFilter(b.dataset.seg);
    $$('#sheetFilters [data-seg]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('#cardOnly')?.addEventListener('change', e => setCardOnly(e.target.checked));
}

function openAbout() {
  const m = state.meta || {};
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  openSheet($('#sheetAbout'), `
    <h3 id="aboutTitle">Névjegy</h3>
    <dl class="facts">
      <div><dt>Adatbázis frissítve</dt><dd>${esc(fmtStamp(m.lastUpdate) || 'Beépített adatbázis (még nem frissült)')}</dd></div>
      <div><dt>Adatfájl készült</dt><dd>${esc(fmtStamp(m.builtAt) || '–')}</dd></div>
      <div><dt>Boltok száma</dt><dd>${(m.count || state.shops.length).toLocaleString('hu-HU')}</dd></div>
    </dl>
    ${standalone ? '' : `<div class="install-tip">${IS_IOS
      ? 'Tedd ki a főképernyőre: Safariban koppints a Megosztás gombra, majd a „Főképernyőhöz adás” pontra.'
      : 'Tedd ki a főképernyőre: a böngésző menüjében válaszd az „Alkalmazás telepítése” vagy „Hozzáadás a kezdőképernyőhöz” pontot.'}</div>`}
    <p class="fine">Nem hivatalos alkalmazás. Az adatok a nyilvános dohánybolt-adatbázisból származnak, a tényleges nyitvatartás eltérhet.<br>
    Térkép: © OpenStreetMap közreműködők.</p>`);
}

/* ---------------- térkép ---------------- */
let map = null, markerLayer = null, meMarker = null, didFocusUser = false;
const pinIcon = sel => L.divIcon({
  className: '', iconSize: [44, 44], iconAnchor: [22, 42],
  html: `<div class="map-pin ${sel ? 'is-selected' : ''}">${ICON.pin}</div>`,
});

function initMap() {
  if (map) return;
  const start = state.user || { lat: 47.4979, lng: 19.0402 };
  map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 6, maxZoom: 19 })
    .setView([start.lat, start.lng], state.user ? 14 : 12);
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap közreműködők',
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  map.on('moveend', loadMarkers);
  map.on('click', () => select(null));
  $('#zoomIn').onclick = () => map.zoomIn();
  $('#zoomOut').onclick = () => map.zoomOut();
  $('#locate').onclick = focusUser;
  updateMe();
  if (state.user) { didFocusUser = true; focusUser(); } else loadMarkers();
}

function loadMarkers() {
  if (!map) return;
  const c = map.getCenter(), b = map.getBounds().pad(0.2);
  let list = query({ lat: c.lat, lng: c.lng });
  const inView = list.filter(s => b.contains([s.lat, s.lng]));
  list = (inView.length >= 15 ? inView : list).slice(0, 250);
  if (state.selected && !list.some(s => s.id === state.selected.id)) {
    const still = state.shops.find(s => s.id === state.selected.id);
    if (still && matchesOpen(still, new Date())) list.push(still); else select(null);
  }
  markerLayer.clearLayers();
  for (const s of list) {
    const sel = state.selected?.id === s.id;
    L.marker([s.lat, s.lng], { icon: pinIcon(sel), zIndexOffset: sel ? 1000 : 0, keyboard: true, title: `${s.city}, ${s.address}` })
      .on('click', e => { L.DomEvent.stopPropagation(e); select(s); })
      .addTo(markerLayer);
  }
}

function select(s) {
  state.selected = s;
  const box = $('#selected');
  $('#mapButtons').classList.toggle('lifted', !!s);
  if (!s) { box.hidden = true; if (map) loadMarkers(); return; }
  const st = status(s), d = state.user ? haversine(state.user, s) : null;
  box.innerHTML = `
    <div class="handle"></div>
    <div class="selected-row">
      <div class="selected-main">
        <h2>${esc(s.city)}</h2>
        <p class="addr">${esc(s.address)}</p>
        <div class="status-line ${st.open ? 'open' : 'closed'}">${ICON.clock}<span>${esc([st.text, fmtDist(d)].filter(Boolean).join(', '))}</span></div>
      </div>
      <a class="nav-btn big" href="${navUrl(s)}" target="_blank" rel="noopener" aria-label="Útvonal">${ICON.nav}</a>
    </div>`;
  box.hidden = false;
  box.onclick = e => { if (!e.target.closest('a')) openShop(s.id); };
  map.panTo([s.lat, s.lng], { animate: true });
  loadMarkers();
}

/** Saját hely és a 3 legközelebbi bolt egyszerre látsszon. */
function focusUser() {
  if (!map) return;
  if (!state.user) { toast('A helyzeted még nem ismert. Engedélyezd a helyhozzáférést.'); askLocation(); return; }
  const near = query(state.user).slice(0, 3);
  const pts = [[state.user.lat, state.user.lng], ...near.map(s => [s.lat, s.lng])];
  if (pts.length === 1) map.flyTo(pts[0], 15, { duration: .6 });
  else map.flyToBounds(pts, { paddingTopLeft: [50, 170], paddingBottomRight: [80, 130], maxZoom: 16, duration: .6 });
}

function updateMe() {
  if (!map || !state.user) return;
  const ll = [state.user.lat, state.user.lng];
  if (meMarker) meMarker.setLatLng(ll);
  else meMarker = L.marker(ll, {
    icon: L.divIcon({ className: '', iconSize: [22, 22], html: '<div class="me-dot"></div>' }),
    interactive: false, zIndexOffset: 2000,
  }).addTo(map);
}

/* ---------------- helyzet ---------------- */
let watchId = null;
function askLocation() {
  if (!('geolocation' in navigator) || watchId != null) return;
  watchId = navigator.geolocation.watchPosition(p => {
    const first = !state.user;
    const moved = state.user ? haversine(state.user, { lat: p.coords.latitude, lng: p.coords.longitude }) : Infinity;
    state.user = { lat: p.coords.latitude, lng: p.coords.longitude };
    updateMe();
    if (first || moved > 150) renderList();
    if (map && !didFocusUser) { didFocusUser = true; focusUser(); }
  }, err => {
    watchId = null;
    if (err.code === err.PERMISSION_DENIED) toast('Helyhozzáférés nélkül ábécérendben listázok.');
  }, { enableHighAccuracy: true, maximumAge: 60000, timeout: 20000 });
}

/* ---------------- nézetváltás ---------------- */
function showTab(tab) {
  state.tab = tab;
  $('#viewList').hidden = tab !== 'list';
  $('#viewMap').hidden = tab !== 'map';
  $$('.tab').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  if (tab === 'map') {
    initMap();
    requestAnimationFrame(() => map.invalidateSize());
  }
  history.replaceState(null, '', tab === 'map' ? '#terkep' : '#');
}

/* ---------------- indulás ---------------- */
async function main() {
  buildControls();
  bindList();
  $$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#btnAbout').addEventListener('click', openAbout);
  $('#backdrop').addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  $('#count').textContent = 'Betöltés…';
  try {
    await loadData();
  } catch (e) {
    $('#count').textContent = '';
    $('#empty').hidden = false;
    $('#empty strong').textContent = 'Az adatok nem töltődtek be';
    $('#empty span').textContent = `${e.message} Ellenőrizd a netkapcsolatot, majd töltsd újra az oldalt.`;
    return;
  }
  syncControls();
  renderList();
  if (location.hash === '#terkep') showTab('map');
  askLocation();

  // percenként frissül a nyitva/zárva állapot
  setInterval(() => { if (state.tab === 'list') renderList(); else if (state.selected) select(state.selected); }, 60000);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
main();
