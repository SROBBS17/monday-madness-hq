'use strict';
(() => {
  const CLUB = {
    ARS: ['#EF0107', 'Arsenal'], AVL: ['#7A1E46', 'Aston Villa'], BHA: ['#0057B8', 'Brighton'], BOU: ['#DA291C', 'Bournemouth'],
    BRE: ['#E30613', 'Brentford'], CHE: ['#034694', 'Chelsea'], COV: ['#3EA6D6', 'Coventry'], CRY: ['#1B458F', 'Crystal Palace'],
    EVE: ['#003399', 'Everton'], FUL: ['#5b5b5b', 'Fulham'], HUL: ['#F5A12D', 'Hull'], IPS: ['#3A64A3', 'Ipswich'],
    LEE: ['#D4A800', 'Leeds'], LIV: ['#C8102E', 'Liverpool'], MCI: ['#4E9AD3', 'Man City'], MUN: ['#DA291C', 'Man Utd'],
    NEW: ['#3a3a3a', 'Newcastle'], NFO: ['#DD0000', "Nott'm Forest"], SUN: ['#EB172B', 'Sunderland'], TOT: ['#132257', 'Spurs'], WHU: ['#7A263A', 'West Ham'], MLB: ['#0c2a5b', 'MLB'],
  };
  const CHIP_NAMES = { wildcard: 'Wildcard', freehit: 'Free Hit', bboost: 'Bench Boost', '3xc': 'Triple Captain' };
  const POS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
  // Each app on this web address keeps its own saved settings; the name comes from config at publish time.
  const NS = '__NS__';
  const ME_KEY = `${NS}-me`;
  const APP_V = '__V__';
  const $ = (id) => document.getElementById(id);
  let D = null, M = new Map(), me = null, replayTimer = null;

  // Every value from the data is set as text, never as HTML.
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const svgNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); }
    kids.flat().forEach((k) => k && el.append(k));
    return el;
  }
  const ord = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
  const fmtTime = (iso, o) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...o }).format(new Date(iso));
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const player = (el) => D.players[String(el)] || { n: '?', t: '', p: 3, c: 0, gw: 0, s: 'a', news: '' };
  const clubBadge = (code) => code && CLUB[code] ? (() => { const b = h('span', { class: 'badge', text: code }); b.style.background = CLUB[code][0]; return b; })() : null;
  const isMe = (id) => me != null && id === me;
  const half = () => (D.meta.next_gw || D.meta.gw) <= 19 ? 1 : 2;
  const chipsLeft = (m) => Object.keys(CHIP_NAMES).filter((c) => !m.chips[`${c}_${half()}`]);

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Club-coloured shield: a cartoon of the manager where we have one, else their initial.
  const SHIELD = 'M20 1 38 7v15c0 12-8 19-18 23C10 41 2 34 2 22V7z';
  let clipSeq = 0;
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
  }
  function avatarParts(a, col) {
    const P = (d, fillc, extra) => s('path', Object.assign({ d, fill: fillc }, extra || {}));
    const E = (cx, cy, rx, ry, fillc) => s('ellipse', { cx, cy, rx, ry, fill: fillc });
    const sk = a.skin, sk2 = shade(a.skin, .86), hair = a.hair, fc = a.facialColor || hair;
    const rx = a.round ? 10.2 : 9.5;
    const out = [];
    out.push(P('M3 46C4 38.5 10.5 35.4 20 35.4S36 38.5 37 46Z', col));
    out.push(P('M15.6 35.6 20 40.5 24.4 35.6Z', col === '#eef0f8' ? '#132257' : '#ffffff', { opacity: '.9' }));
    out.push(P('M16.6 28h6.8v7.6c-1 1.4-5.8 1.4-6.8 0Z', sk2));
    out.push(E(20 - rx - .2, 22, 1.7, 2.5, sk2), E(20 + rx + .2, 22, 1.7, 2.5, sk2));
    out.push(E(20, 20.6, rx, 11.6, sk));
    if (a.facial === 'beard') out.push(P(`M${20 - rx + .1} 20.5C${20 - rx} 30 14 33.8 20 33.8S${20 + rx} 30 ${20 + rx - .1} 20.5C28.6 25.4 26 27.4 20 27.6 14 27.4 11.4 25.4 ${20 - rx + .1} 20.5Z`, fc));
    if (a.facial === 'stubble' || a.stubble) out.push(P(`M${20 - rx + .3} 22C${20 - rx + .4} 30 14.5 32.6 20 32.6S${20 + rx - .4} 30 ${20 + rx - .3} 22C28.4 26 26 27.6 20 27.8 14 27.6 11.6 26 ${20 - rx + .3} 22Z`, fc, { opacity: '.32' }));
    if (a.facial === 'beard' || a.facial === 'stubble' || a.facial === 'moustache') out.push(P('M15.4 25.3c1.6-1.7 3.6-1.3 4.6-.4 1-.9 3-1.3 4.6.4-1.6.5-3.2.5-4.6.2-1.4.3-3 .3-4.6-.2Z', a.facial === 'moustache' && a.tacheColor ? a.tacheColor : fc, a.facial === 'stubble' ? { opacity: '.45' } : null));
    if (a.mouth === 'grin') out.push(P('M16.4 26.4Q20 31 23.6 26.4Z', '#3a1416'), P('M16.9 26.6Q20 27.6 23.1 26.6L22.8 27.6Q20 28.2 17.2 27.6Z', '#ffffff'));
    else if (a.mouth === 'smile') out.push(P('M16.8 26.6Q20 29.6 23.2 26.6Q20 28 16.8 26.6Z', '#3a1416'), P('M17.6 26.9Q20 27.6 22.4 26.9L22.1 27.4Q20 27.9 17.9 27.4Z', '#ffffff'));
    else out.push(P('M17.4 27.2Q20 27.9 22.6 27.2', 'none', { stroke: shade(a.skin, .55), 'stroke-width': '.8', 'stroke-linecap': 'round' }));
    out.push(P('M20.2 20.2Q19 23.6 20.9 23.7', 'none', { stroke: shade(a.skin, .7), 'stroke-width': '.7', 'stroke-linecap': 'round' }));
    const eye = (x) => [E(x, 20, .95, a.mouth === 'closed' ? .75 : .95, '#20160f'), E(x + .3, 19.7, .28, .28, '#ffffff')];
    out.push(...eye(16.2), ...eye(23.8));
    out.push(P('M14.2 17.6q2-1.3 4.1-.2', 'none', { stroke: shade(hair, 1), 'stroke-width': '1.05', 'stroke-linecap': 'round' }), P('M21.7 17.4q2.1-1.1 4.1.2', 'none', { stroke: shade(hair, 1), 'stroke-width': '1.05', 'stroke-linecap': 'round' }));
    const H = (d) => out.push(P(d, hair));
    if (a.style === 'bald') {
      out.push(E(16.4, 12.4, 3.2, 1.9, '#ffffff'));
      out[out.length - 1].setAttribute('opacity', '.28');
      out.push(P(`M${20 - rx + .2} 21c-.2-2.4.1-4.4.8-5.6l.5 5.8Z`, hair, { opacity: '.35' }), P(`M${20 + rx - .2} 21c.2-2.4-.1-4.4-.8-5.6l-.5 5.8Z`, hair, { opacity: '.35' }));
    }
    if (a.style === 'swept') { H('M10.3 19C9.4 10.6 13.6 6.6 20.2 6.6c6.4 0 10.8 3.6 9.6 12-1-3.6-2.6-5.4-5-6.2-4 1.6-9.4 1-12.4.6-1.1 1.8-1.7 3.8-2.1 6Z'); H('M22 7.2c2.6-1.6 5.6-1.2 7 .4-2.2-.2-4.2.2-5.6 1.4Z'); }
    if (a.style === 'crop') H(`M${20 - rx + .1} 18C${20 - rx - .3} 11 14 7.8 20 7.8S${20 + rx + .3} 11 ${20 + rx - .1} 18C28.6 14.4 26 12.6 20 12.6S11.4 14.4 ${20 - rx + .1} 18Z`);
    if (a.style === 'slick') { H('M10.7 17.6C10 9.4 14 6 20.5 6S30.4 9.8 29.4 17.6c-.8-4.4-2.6-6-5.9-6.4-4.5-.4-9.5 0-11.5 2.3-.6 1.1-1 2.5-1.3 4.1Z'); out.push(P('M10.8 18.5c.2-2.4.8-4 1.6-5l-.2 6Z', hair, { opacity: '.45' }), P('M29.2 18.5c-.2-2.4-.8-4-1.6-5l.2 6Z', hair, { opacity: '.45' })); }
    if (a.style === 'quiff') H('M10.4 19C9.8 11 13 6.4 18 5.9c3-1.2 7-.5 9.5 1.6 2.5 2 2.9 5.5 2.1 11-1-4.5-2.8-6.1-7.6-6.2-5 0-9.2.8-11.6 6.7Z');
    if (a.style === 'curly') {
      out.push(P('M10.6 19.5C10 13 13 9.6 20 9.4S30 13 29.4 19.5C28.4 15.6 26.4 13.6 20 13.4S11.6 15.6 10.6 19.5Z', hair, { opacity: '.55' }));
      out.push(P('M11.6 15.5C11.4 9.5 15 6.4 20 6.4s8.8 3 8.6 9.1C26.6 12.8 24 12 20 12s-6.6.8-8.4 3.5Z', hair));
      [[12.4, 12.6, 2.1], [14.4, 9.6, 2.4], [17.4, 7.6, 2.5], [20.8, 7, 2.5], [24, 7.8, 2.4], [26.6, 9.8, 2.3], [27.8, 12.8, 2], [16, 12.2, 2], [19.4, 11.6, 2], [22.8, 11.8, 2], [25.4, 12.8, 1.8]].forEach(([x, y, r]) => out.push(s('circle', { cx: x, cy: y, r, fill: hair }), s('circle', { cx: x - r * .3, cy: y - r * .35, r: r * .35, fill: shade(hair, 1.6), opacity: '.5' })));
    }
    if (a.style === 'cap') {
      out.push(P('M10.1 17.2c-.3 1.6-.2 3 .3 4.2l.9-4.4Z', hair), P('M29.9 17.2c.3 1.6.2 3-.3 4.2l-.9-4.4Z', hair));
      out.push(P('M9.6 16.4C9.6 8.2 14 5.4 20 5.4s10.4 2.8 10.4 11Z', a.cap), P('M8.2 16.2c6-1.6 18-1.6 25 .8-7 1.4-19 1.2-25-.8Z', shade(a.cap, 1.5)), s('circle', { cx: 20, cy: 5.8, r: .9, fill: shade(a.cap, 2.2) }));
      if (a.logo) { const t = s('text', { x: 20, y: 13.4, 'text-anchor': 'middle', 'font-size': 5.2, 'font-weight': 700, 'letter-spacing': '-.1', text: a.logo }); t.style.fill = '#ffffff'; t.style.fontFamily = 'Teko, Impact, sans-serif'; out.push(t); }
    }
    return out;
  }
  function crest(m, cls) {
    const PAL = ['#3a4390', '#0e7c6b', '#8a3ab9', '#b4541a', '#1f6fb2', '#a8324e', '#4f6b1d', '#6b4a8a'];
    const col = m && m.club && CLUB[m.club] ? CLUB[m.club][0] : PAL[(m ? m.id : 0) % PAL.length];
    const a = m && m.avatar;
    const svg = s('svg', { viewBox: '0 0 40 46', class: `crest ${cls || ''}`, 'aria-hidden': 'true' });
    if (a) {
      const id = `av${++clipSeq}`;
      svg.append(s('defs', {}, s('clipPath', { id }, s('path', { d: SHIELD }))),
        s('path', { d: SHIELD, fill: shade(col, .55) }),
        s('g', { 'clip-path': `url(#${id})` }, s('path', { d: 'M2 30 38 12v6L5 35z', fill: 'rgba(255,255,255,.08)' }), ...avatarParts(a, m.club === 'TOT' ? '#eef0f8' : col)),
        s('path', { d: SHIELD, fill: 'none', stroke: 'rgba(255,255,255,.7)', 'stroke-width': '1.4' }));
      return svg;
    }
    svg.append(s('path', { d: SHIELD, fill: col, stroke: 'rgba(255,255,255,.55)', 'stroke-width': '1.5' }),
      s('path', { d: 'M2 30 38 12v6L5 35z', fill: 'rgba(255,255,255,.18)' }),
      s('text', { x: 20, y: 31, 'text-anchor': 'middle', 'font-size': 24, text: (m && m.name ? m.name[0] : '?').toUpperCase() }));
    return svg;
  }
  function crestImage(m) {
    return new Promise((resolve) => {
      const el = crest(m, ''); el.setAttribute('xmlns', svgNS); el.setAttribute('width', '400'); el.setAttribute('height', '460');
      el.querySelectorAll('text').forEach((t) => { t.setAttribute('fill', '#ffffff'); t.setAttribute('font-family', 'Impact, Arial Narrow, sans-serif'); t.setAttribute('font-weight', '700'); });
      const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(el));
    });
  }
  // Numbers count up the first time they are drawn.
  const counted = new Set();
  function countUp(el, to, key) {
    el.textContent = to;
    if (reduceMotion() || counted.has(key) || typeof to !== 'number' || to <= 0) return;
    counted.add(key);
    const from = Math.max(0, Math.round(to * 0.6)), t0 = performance.now(), dur = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  let prevPoints = null;

  function renderTicker() {
    const items = [];
    const g = D.meta.gw;
    const rows = D.managers.slice().sort((a, b) => a.rank - b.rank);
    const nm = (id) => M.get(id)?.name || '?';
    const push = (lead, rest) => items.push([lead, rest]);
    if (D.meta.live) {
      const top = D.managers.slice().sort((a, b) => b.gw_points - a.gw_points)[0];
      push('LIVE', `${top.name} leads GW${g} with ${top.gw_points}`);
    }
    push('TOP', `${rows[0].name} leads on ${rows[0].total}, ${rows[0].total - rows[1].total} clear of ${rows[1].name}`);
    const latest = Math.max(0, ...D.awards.map((a) => a.gw));
    const aw = (k) => D.awards.filter((a) => a.gw === latest && a.award === k);
    const motw = aw('motw'); if (motw.length) push(`GW${latest} STAR`, `${motw.map((a) => nm(a.id)).join(' & ')} with ${motw[0].value}`);
    const spoon = aw('spoon'); if (spoon.length) push('WOODEN SPOON', `${spoon.map((a) => nm(a.id)).join(' & ')} on ${spoon[0].value}`);
    const fail = aw('cap_fail'); if (fail.length) push('ARMBAND', fail.length > 2 ? `${fail.length} managers got just ${fail[0].value} from their captain` : `${fail.map((a) => nm(a.id)).join(' & ')}: ${fail[0].value} from the armband`);
    const bench = aw('bench'); if (bench.length) push('BENCH', `${nm(bench[0].id)} left ${bench[0].value} on the bench`);
    const best = aw('transfer_best'); if (best.length) push('TRANSFER', `${nm(best[0].id)}: ${best[0].text}`);
    const mover = rows.filter((m) => m.last_rank && m.last_rank > m.rank).sort((a, b) => (b.last_rank - b.rank) - (a.last_rank - a.rank))[0];
    if (mover) push('CLIMBER', `${mover.name} up ${mover.last_rank - mover.rank} to ${ord(mover.rank)}`);
    [...new Set([...(D.meta.banter_clubs || []), ...D.managers.map((m) => m.club).filter(Boolean)])].forEach((c) => {
      const r = D.last_result[c]; const t = D.pltable.find((x) => x.team === c); if (!r || !t) return;
      push(CLUB[c][1].toUpperCase(), `${r.res === 'W' ? 'beat' : r.res === 'L' ? 'lost to' : 'drew with'} ${(D.pltable.find((x) => x.team === r.opp) || { name: r.opp }).name} ${r.gf}-${r.ga}, now ${ord(t.pos)}`);
    });
    const run = $('ticker-run'); run.replaceChildren();
    for (let k = 0; k < 2; k++) items.forEach(([a, b]) => run.append(h('span', {}, h('b', { text: a }), ` ${b}`)));
    run.style.setProperty('--tick-dur', `${Math.max(30, items.length * 7)}s`);
    $('ticker').hidden = !items.length;
    $('ticker').classList.toggle('live', !!D.meta.live);
  }

  const tip = $('tip');
  let tipTimer = null;
  function showTip(ev, text) {
    tip.textContent = text; tip.hidden = false;
    clearTimeout(tipTimer); tipTimer = setTimeout(() => { tip.hidden = true; }, 2500);
    const x = Math.min(ev.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, ev.clientY - tip.offsetHeight - 12) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  window.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('svg')) tip.hidden = true; }, { passive: true });

  async function copyText(btn, text) {
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
    catch (e) { btn.textContent = 'Copy failed'; }
    setTimeout(() => { btn.textContent = 'Copy for the group'; }, 1600);
  }

  // ---------- header ----------
  function renderHeader() {
    const m = D.meta;
    document.title = `${m.title} HQ`;
    $('title').textContent = m.title;
    const pre = !m.live && !m.gw_finished; // after the deadline, before the first kick-off
    $('kicker').textContent = m.live ? `Gameweek ${m.gw} in play` : pre ? `Gameweek ${m.gw} kicks off soon` : `Mini-league HQ · ${D.managers.length} managers`;
    $('gw-pill').textContent = m.live ? `GW${m.gw}` : pre ? `GW${m.gw} up next` : `GW${m.gw} done`;
    $('live-pill').hidden = !m.live;
    const mine = M.get(me);
    $('me-chip').textContent = mine ? `You: ${mine.name}` : 'Pick your team';
    $('deadline').hidden = !m.next_deadline;
    if (m.next_deadline) $('deadline-time').textContent = `GW${m.next_gw} · ${fmtTime(m.next_deadline, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    tick();
    $('updated').textContent = `Last change spotted ${fmtTime(m.updated_at, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.`;
    renderTicker();
    $('contact').textContent = m.contact ? `Rather not be on here? Message ${m.contact} and you'll be removed at the next update.` : '';
  }
  function tick() {
    const m = D && D.meta;
    if (!m || !m.next_deadline) return;
    const ms = new Date(m.next_deadline) - Date.now();
    if (ms <= 0) { $('deadline-count').textContent = 'Deadline passed'; return; }
    const d = Math.floor(ms / 864e5), hr = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60;
    $('deadline-count').textContent = d ? `${d}d ${hr}h ${mi}m to go` : `${hr}h ${mi}m to go`;
  }

  // ---------- table ----------
  function renderTable() {
    const rows = D.managers.slice().sort((a, b) => a.rank - b.rank);
    const leader = rows[0];
    const hero = $('hero'); hero.replaceChildren();
    const gwRows = D.managers.slice().sort((a, b) => b.gw_points - a.gw_points);
    const mine = M.get(me);
    hero.append(
      (!D.meta.live && !D.meta.gw_finished)
        ? h('div', { class: 'stat feature' }, h('span', { class: 'lab', text: `GW${D.meta.gw}` }), h('span', { class: 'big', text: 'Teams locked' }), h('span', { class: 'sub', text: 'Live points from the first whistle' }))
        : h('div', { class: 'stat feature' }, h('span', { class: 'lab', text: D.meta.live ? `Leading GW${D.meta.gw} (live)` : `Won GW${D.meta.gw}` }), h('span', { class: 'big', text: gwRows[0].name }), h('span', { class: 'sub', text: `${gwRows[0].gw_points} points` })),
    );
    if (mine) {
      const gap = leader.total - mine.total;
      hero.append(h('div', { class: 'stat' }, h('span', { class: 'lab', text: 'You' }), h('span', { class: 'big', text: ord(mine.rank) }), h('span', { class: 'sub', text: gap ? `${gap} behind ${leader.name}` : 'Top of the pile' })));
    } else {
      const spread = rows[1] ? rows[1].total - rows[Math.min(6, rows.length - 1)].total : 0;
      hero.append(h('div', { class: 'stat' }, h('span', { class: 'lab', text: 'The chasing pack' }), h('span', { class: 'big', text: `${spread} pts` }), h('span', { class: 'sub', text: '2nd to 7th place' })));
    }
    $('table-title').textContent = D.meta.live ? `Live table: GW${D.meta.gw}` : 'The table';
    $('table-note').textContent = D.meta.live
      ? 'Live points include provisional bonus and automatic substitutions. Updated about every 10 minutes during matches.'
      : 'Arrows show the move since last gameweek. Dots are first-half chips still in hand.';
    const pod = $('podium'); pod.replaceChildren();
    [rows[1], rows[0], rows[2]].forEach((m, i) => {
      if (!m) return;
      const p = [2, 1, 3][i];
      const pts = h('span', { class: 'pod-pts' });
      pod.append(h('div', { class: `pod p${p} rise${isMe(m.id) ? ' me' : ''}`, style: null },
        crest(m, 'pod-crest'), h('span', { class: 'pod-name', text: m.name }), h('span', { class: 'pod-team', text: m.team }),
        h('div', { class: 'pod-block' }, h('span', { class: 'pod-pos', text: p }), pts)));
      pod.lastChild.style.setProperty('--i', String([1, 0, 2][i]));
      countUp(pts, m.total, `pod${m.id}`);
    });
    const list = $('standings'); list.replaceChildren();
    const bumped = new Map();
    if (prevPoints && D.meta.live) D.managers.forEach((m) => { const was = prevPoints.get(m.id); if (was != null && m.gw_points > was) bumped.set(m.id, m.gw_points - was); });
    prevPoints = new Map(D.managers.map((m) => [m.id, m.gw_points]));
    rows.forEach((m, idx) => {
      const mv = (m.last_rank ?? m.rank) - m.rank;
      const cap = m.captain ? player(m.captain) : null;
      const left = chipsLeft(m);
      const pips = h('span', { class: 'pips', 'aria-label': `${left.length} chips left` }, [0, 1, 2, 3].map((i) => h('span', { class: 'pip' + (i < left.length ? ' on' : '') })));
      const extra = h('div', { class: 'st-extra' },
        h('span', {}, 'Gap ', h('b', { text: leader.total - m.total ? `-${leader.total - m.total}` : '–' })),
        cap ? h('span', {}, 'Captain ', h('b', { text: `${cap.n} ${cap.gw * (m.active_chip === '3xc' ? 3 : 2)}` })) : null,
        h('span', { title: left.map((c) => CHIP_NAMES[c]).join(', ') || 'None left' }, 'Chips ', pips),
        m.active_chip ? h('span', {}, 'Playing ', h('b', { text: CHIP_NAMES[m.active_chip] })) : null,
        m.subs && m.subs.length ? h('span', {}, 'Auto-subs ', h('b', { text: m.subs.map(([o, i]) => `${player(i).n} for ${player(o).n}`).join(', ') })) : null,
      );
      const total = h('div', { class: 'st-total' });
      const li = h('li', { class: 'st enter' + (isMe(m.id) ? ' me' : '') + (m.rank <= 3 ? ' top3' : '') + (bumped.has(m.id) ? ' bump' : '') },
        h('div', { class: 'st-rank' }, String(m.rank), h('span', { class: 'st-move ' + (mv > 0 ? 'up' : mv < 0 ? 'down' : 'flat'), text: mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '–' })),
        crest(m, 'st-crest'),
        h('div', { class: 'st-who' }, h('div', { class: 'st-team', text: m.team }), h('div', { class: 'st-name' }, m.name, clubBadge(m.club))),
        h('div', { class: 'st-pts' }, total, h('div', { class: 'st-gw' }, D.meta.live ? 'Live ' : 'GW ', h('b', { text: m.gw_points }))),
        extra,
        bumped.has(m.id) ? h('span', { class: 'plus', text: `+${bumped.get(m.id)}` }) : null);
      li.style.setProperty('--i', String(idx));
      if (m.club && CLUB[m.club]) li.style.setProperty('--club', CLUB[m.club][0]);
      list.append(li);
      countUp(total, m.total, `row${m.id}`);
    });
    setupReplay();
  }

  // ---------- season replay (bump chart) ----------
  // Built once per data load; a tween moves a playhead along smooth S-curves.
  const RP = { pos: null, focus: null, raf: null, playing: false, geo: null };
  function setupReplay() {
    const gws = [...new Set(D.history.map((r) => r.gw))].sort((a, b) => a - b);
    const slider = $('replay-slider');
    slider.min = 1; slider.max = gws.length; slider.step = 'any';
    if (RP.pos == null || RP.pos > gws.length - 1) RP.pos = gws.length - 1;
    slider.value = RP.pos + 1;
    slider.oninput = () => { stopReplay(); tweenTo(+slider.value - 1, 0); };
    slider.onchange = () => { tweenTo(Math.round(+slider.value - 1), 250); };
    $('replay-play').onclick = () => (RP.playing ? stopReplay() : playReplay());
    buildReplay();
  }
  function buildReplay() {
    const box = $('replay-chart');
    const gws = [...new Set(D.history.map((r) => r.gw))].sort((a, b) => a - b);
    const n = D.managers.length;
    const W = Math.max(box.clientWidth, 320), rowH = 30, padT = 14, padL = 24, padR = Math.min(132, W * 0.34), H = padT + (n - 1) * rowH + 40;
    const x = (i) => padL + (gws.length > 1 ? i / (gws.length - 1) : 0.5) * (W - padL - padR);
    const y = (r) => padT + (r - 1) * rowH;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'League positions after every gameweek' });
    for (let r = 1; r <= n; r++) {
      const ln = s('line', { x1: padL, x2: W - padR, y1: y(r), y2: y(r) }); ln.style.stroke = 'rgba(160,175,255,.08)'; svg.append(ln);
      svg.append(s('text', { x: 4, y: y(r) + 4, text: r }));
    }
    gws.forEach((g, i) => { if (gws.length <= 20 || i % 2 === 0) svg.append(s('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', text: g })); });
    const clipId = 'rpclip';
    const clipRect = s('rect', { x: 0, y: 0, width: x(0), height: H });
    svg.append(s('defs', {}, s('clipPath', { id: clipId }, clipRect)));
    const lines = s('g', { 'clip-path': `url(#${clipId})` });
    const heads = s('g');
    svg.append(lines, heads);
    const series = D.managers.map((m) => {
      const pts = gws.map((g) => D.history.find((r) => r.id === m.id && r.gw === g) || null);
      let last = pts.find(Boolean);
      const ranks = pts.map((p) => { if (p) last = p; return last.rank; });
      const totals = pts.map((p) => (p ? p.total : 0));
      const color = isMe(m.id) ? '#ffbf1f' : (m.club && CLUB[m.club] ? CLUB[m.club][0] : '#6b75b8');
      let d = `M${x(0)},${y(ranks[0])}`;
      for (let i = 1; i < ranks.length; i++) { const mx = (x(i - 1) + x(i)) / 2; d += `C${mx},${y(ranks[i - 1])} ${mx},${y(ranks[i])} ${x(i)},${y(ranks[i])}`; }
      const glow = s('path', { d, fill: 'none' }); glow.style.stroke = color; glow.style.strokeWidth = '10'; glow.style.opacity = isMe(m.id) ? '.18' : '0';
      const path = s('path', { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      path.style.stroke = color; path.style.strokeWidth = isMe(m.id) ? '4' : '2.4';
      const hit = s('path', { d, fill: 'none' }); hit.style.stroke = 'transparent'; hit.style.strokeWidth = '18'; hit.style.cursor = 'pointer';
      lines.append(glow, path, hit);
      const dot = s('circle', { r: isMe(m.id) ? 6 : 4.5 }); dot.style.fill = color; dot.style.stroke = '#070a1f'; dot.style.strokeWidth = '2';
      const label = s('text', { x: 10, y: 4, text: m.name });
      label.style.fontWeight = isMe(m.id) ? '800' : '600'; label.style.fill = isMe(m.id) ? '#ffbf1f' : '#c9cff5'; label.style.fontSize = '12px';
      const val = s('text', { x: 10, y: 4, text: '' }); val.style.fill = '#9aa3d6'; val.style.fontSize = '11px';
      const head = s('g', {}, dot, label, val); head.style.cursor = 'pointer';
      heads.append(head);
      const pick = (ev) => { ev.stopPropagation(); RP.focus = RP.focus === m.id ? null : m.id; applyFocus(); };
      hit.addEventListener('click', pick); head.addEventListener('click', pick);
      return { m, ranks, totals, path, glow, head, label, val, color };
    });
    svg.addEventListener('click', () => { RP.focus = null; applyFocus(); });
    box.replaceChildren(svg);
    RP.geo = { gws, x, y, clipRect, series };
    applyFocus();
    drawAt(RP.pos);
  }
  function bez(p0, p1, u) { const k = 1 - u; return k * k * k * p0 + 3 * k * k * u * p0 + 3 * k * u * u * p1 + u * u * u * p1; }
  function drawAt(pos) {
    const G = RP.geo; if (!G) return;
    const last = G.gws.length - 1;
    pos = Math.max(0, Math.min(last, pos)); RP.pos = pos;
    const i0 = Math.floor(pos), i1 = Math.min(last, i0 + 1), u = pos - i0;
    const xa = G.x(i0), xb = G.x(i1), mx = (xa + xb) / 2;
    const k = 1 - u, hx = i0 === i1 ? xa : k * k * k * xa + 3 * k * k * u * mx + 3 * k * u * u * mx + u * u * u * xb;
    G.clipRect.setAttribute('width', String(hx + 1));
    const placed = G.series.map((sr) => ({ sr, yy: i0 === i1 ? G.y(sr.ranks[i0]) : bez(G.y(sr.ranks[i0]), G.y(sr.ranks[i1]), u) })).sort((a, b) => a.yy - b.yy);
    let prev = -Infinity;
    placed.forEach(({ sr, yy }) => {
      const ly = Math.max(yy, prev + 14); prev = ly;
      sr.head.setAttribute('transform', `translate(${hx},${yy})`);
      sr.label.setAttribute('y', String(ly - yy + 4));
      sr.val.setAttribute('y', String(ly - yy + 4));
      const tot = Math.round(sr.totals[i0] + (sr.totals[i1] - sr.totals[i0]) * u);
      sr.val.textContent = ` ${tot}`;
      sr.val.setAttribute('x', String(10 + sr.label.getComputedTextLength() + 2));
    });
    $('replay-gw').textContent = `GW${G.gws[Math.round(pos)]}`;
    const slider = $('replay-slider'); if (document.activeElement !== slider) slider.value = pos + 1;
    caption();
  }
  function applyFocus() {
    const G = RP.geo; if (!G) return;
    G.series.forEach((sr) => {
      const on = RP.focus == null || RP.focus === sr.m.id;
      const strong = RP.focus === sr.m.id || (RP.focus == null && isMe(sr.m.id));
      sr.path.style.opacity = on ? '1' : '.15';
      sr.path.style.strokeWidth = strong ? '4.5' : '2.4';
      sr.glow.style.opacity = strong ? '.22' : '0';
      sr.head.style.opacity = on ? '1' : '.2';
    });
    caption();
  }
  function caption() {
    const G = RP.geo, cap = $('replay-cap'); if (!G || !cap) return;
    const sr = G.series.find((q) => q.m.id === (RP.focus ?? me)) || null;
    if (!sr) { cap.textContent = 'Tap any line to follow one manager.'; return; }
    const i = Math.round(RP.pos);
    const best = Math.min(...sr.ranks), worst = Math.max(...sr.ranks);
    cap.textContent = `${sr.m.name} (${sr.m.team}): ${ord(sr.ranks[i])} after GW${G.gws[i]} on ${sr.totals[i]} pts. Highest ${ord(best)}, lowest ${ord(worst)}.${RP.focus == null ? ' Tap a line to follow someone else.' : ''}`;
  }
  function tweenTo(target, dur, done) {
    cancelAnimationFrame(RP.raf);
    const from = RP.pos, t0 = performance.now();
    if (!dur || reduceMotion()) { drawAt(target); if (done) done(); return; }
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      drawAt(from + (target - from) * e);
      if (k < 1) RP.raf = requestAnimationFrame(step); else if (done) done();
    };
    RP.raf = requestAnimationFrame(step);
  }
  function playReplay() {
    const G = RP.geo; if (!G) return;
    const last = G.gws.length - 1;
    RP.playing = true; $('replay-play').textContent = 'Pause';
    if (RP.pos >= last) drawAt(0);
    const next = () => {
      if (!RP.playing) return;
      const target = Math.min(last, Math.floor(RP.pos + 1e-6) + 1);
      tweenTo(target, reduceMotion() ? 0 : 650, () => { if (target >= last) { stopReplay(); return; } setTimeout(next, reduceMotion() ? 700 : 120); });
    };
    next();
  }
  function stopReplay() { RP.playing = false; cancelAnimationFrame(RP.raf); $('replay-play').textContent = 'Play'; }
  function drawReplay() { buildReplay(); }

  // ---------- awards ----------
  const GOOD = new Set(['motw', 'cap_hero', 'transfer_best']);
  const ICON = {
    motw: 'M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8',
    spoon: 'M12 3c3 0 4 3 4 5s-2 4-4 4-4-2-4-4 1-5 4-5zM12 12v9',
    cap_hero: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
    cap_fail: 'M4 9h16v6H4zM9 9v6M15 9v6M3 20 21 4',
    bench: 'M3 14h18M5 14v5M19 14v5M4 10h16',
    transfer_best: 'M4 8h13l-3-3M20 16H7l3 3',
    transfer_worst: 'M4 8h13l-3-3M20 16H7l3 3M4 4l16 16',
    hit_backfired: 'M5 12h6M14 4l6 16M20 4 14 20',
  };
  function renderAwards() {
    const gws = [...new Set(D.awards.map((a) => a.gw))].sort((a, b) => b - a);
    const sel = $('award-gw');
    const keep = sel.value;
    sel.replaceChildren(...gws.map((g) => new Option(`Gameweek ${g}`, g)));
    if (keep && gws.includes(+keep)) sel.value = keep;
    sel.onchange = drawAwards;
    drawAwards();
    // cabinet
    const tb = $('cabinet').tBodies[0]; tb.replaceChildren();
    const trophy = () => s('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, s('path', { d: 'M7 4h10v4a5 5 0 0 1-10 0zM12 13v4M8 20h8' }));
    const cab = D.managers.map((m) => ({
      m, wins: D.awards.filter((a) => a.award === 'motw' && a.id === m.id).length,
      spoons: D.awards.filter((a) => a.award === 'spoon' && a.id === m.id).length,
      best: Math.max(...D.history.filter((r) => r.id === m.id).map((r) => r.points)),
    })).sort((a, b) => b.wins - a.wins || a.spoons - b.spoons || b.best - a.best);
    cab.forEach(({ m, wins, spoons, best }) => {
      const t = h('span', { class: 'trophy up' }); for (let i = 0; i < Math.min(wins, 6); i++) t.append(trophy());
      tb.append(h('tr', { class: isMe(m.id) ? 'me' : '' },
        h('td', { class: 'l' }, `${m.name} `, h('span', { class: 'note', text: m.team })),
        h('td', {}, t, ` ${wins}`), h('td', { class: spoons ? 'down' : '' }, String(spoons)), h('td', {}, String(best))));
    });
    // month
    const months = D.months;
    const cur = months[months.length - 1];
    if (cur) {
      $('month-title').textContent = `Manager of the Month: ${cur.name}`;
      $('month-note').textContent = cur.complete ? `GW${cur.start} to GW${cur.stop}. Final.` : `GW${cur.start} to GW${cur.stop}. Still in play.`;
      const ol = $('month-list'); ol.replaceChildren();
      cur.standings.forEach((r, i) => { const m = M.get(r.id); if (m) ol.append(h('li', { class: isMe(r.id) ? 'me' : '' }, h('span', { class: 'pos', text: i + 1 }), h('span', {}, `${m.name} · ${m.team}`), h('b', { text: r.points }))); });
      const past = $('past-months'); past.replaceChildren();
      months.filter((mo) => mo.complete).reverse().forEach((mo) => {
        const w = M.get(mo.standings[0].id);
        if (w) past.append(h('span', { class: 'past-month' }, `${mo.name}: `, h('b', { text: w.name }), ` (${mo.standings[0].points})`));
      });
    }
  }
  function drawAwards() {
    const g = +$('award-gw').value;
    const grid = $('award-grid'); grid.replaceChildren();
    const byAward = new Map();
    D.awards.filter((a) => a.gw === g).forEach((a) => { if (!byAward.has(a.award)) byAward.set(a.award, []); byAward.get(a.award).push(a); });
    const order = ['motw', 'spoon', 'cap_hero', 'cap_fail', 'bench', 'transfer_best', 'transfer_worst', 'hit_backfired'];
    order.filter((k) => byAward.has(k)).forEach((k) => {
      const list = byAward.get(k);
      const names = list.map((a) => M.get(a.id)?.name).filter(Boolean);
      let who = names.length > 3 ? `${names.length} managers` : names.join(' & ');
      if (names.length > 3 && k === 'cap_fail') who = `${names.length} managers (herd mentality)`;
      const what = names.length > 3 ? `${list[0].text}: ${names.join(', ')}` : list.map((a) => a.text).filter((t, i, arr) => arr.indexOf(t) === i).join(' · ');
      const hero = k === 'motw';
      const card = h('div', { class: `award ${GOOD.has(k) ? 'good' : 'bad'}${hero ? ' hero-card' : ''}${list.some((a) => isMe(a.id)) ? ' me' : ''}` },
        s('svg', { viewBox: '0 0 24 24', class: 'ico', 'aria-hidden': 'true' }, s('path', { d: ICON[k] || ICON.motw })),
        hero ? h('span', { class: 'big-pts' }, String(list[0].value), h('small', { text: 'pts' })) : null,
        h('span', { class: 'lab', text: list[0].label }), h('span', { class: 'who', text: who }), h('span', { class: 'what', text: hero ? `Gameweek ${g}. ${M.get(list[0].id)?.team || ''}` : what }));
      grid.append(card);
    });
    if (!grid.children.length) grid.append(h('p', { class: 'note', text: 'Awards appear once a gameweek has finished.' }));
  }

  // ---------- fans ----------
  function renderFans() {
    const box = $('fanbase'); box.replaceChildren();
    const groups = new Map();
    D.managers.forEach((m) => { if (m.club) { if (!groups.has(m.club)) groups.set(m.club, []); groups.get(m.club).push(m); } });
    box.hidden = groups.size < 2;
    if (box.previousElementSibling) box.previousElementSibling.hidden = groups.size < 2;
    if (groups.size < 2) {
      box.append(h('div', { class: 'card' }, h('p', { class: 'note', text: `The fanbase league appears once ${D.meta.contact || 'the organiser'} has added which club everyone supports.` })));
    } else {
      const rows = [...groups.entries()].map(([club, ms]) => ({ club, ms, avg: ms.reduce((a, m) => a + m.total, 0) / ms.length, gwAvg: ms.reduce((a, m) => a + m.gw_points, 0) / ms.length }))
        .sort((a, b) => b.avg - a.avg);
      const max = rows[0].avg, min = Math.min(...rows.map((r) => r.avg));
      rows.forEach((r, i) => {
        const el = h('div', { class: 'fan' },
          h('span', { class: 'fan-pos', text: i + 1 }),
          h('span', { class: 'fan-name', text: `${(CLUB[r.club] || [, r.club])[1]} fans` }),
          h('span', { class: 'fan-score' }, Math.round(r.avg).toString(), h('small', { text: `avg · GW ${r.gwAvg.toFixed(1)}` })),
          h('span', { class: 'fan-members', text: r.ms.map((m) => m.name).join(', ') }),
          h('span', { class: 'fan-bar' }, (() => { const b = h('span'); b.style.width = `${max === min ? 100 : 30 + 70 * (r.avg - min) / (max - min)}%`; return b; })()));
        if (CLUB[r.club]) el.style.setProperty('--club', CLUB[r.club][0]);
        box.append(el);
      });
    }
    // results
    const res = $('results'); res.replaceChildren();
    const clubs = [...new Set([...(D.meta.banter_clubs || []), ...D.managers.map((m) => m.club).filter(Boolean)])];
    const nm = (code) => (D.pltable.find((t) => t.team === code) || { name: code }).name;
    clubs.forEach((c) => {
      const r = D.last_result[c];
      if (!r) {
        if (!CLUB[c]) return;
        const fans = D.managers.filter((m) => m.club === c).map((m) => m.name);
        const line = c === 'MLB' ? 'Major League Baseball. Wrong sport, wrong continent, still supported.' : `${CLUB[c][1]} aren't in the Premier League this season.`;
        const card = h('div', { class: 'result D' }, h('span', {}, clubBadge(c), fans.length ? h('span', { class: 'fan-tag', text: fans.join(', ') }) : null),
          h('span', { class: 'score', text: c === 'MLB' ? 'Baseball season' : 'No Premier League football' }), h('span', { class: 'line', text: line }));
        const btn = h('button', { class: 'copy', type: 'button', text: 'Copy for the group' });
        btn.addEventListener('click', () => copyText(btn, line));
        card.append(btn); res.append(card); return;
      }
      const pos = D.pltable.find((t) => t.team === c);
      const verb = r.res === 'W' ? 'beat' : r.res === 'L' ? 'lost to' : 'drew with';
      const line = `${nm(c)} ${verb} ${nm(r.opp)} ${r.gf}-${r.ga} ${r.ha === 'H' ? 'at home' : 'away'}. Now ${ord(pos.pos)} on ${pos.pts} points.`;
      const fans = D.managers.filter((m) => m.club === c).map((m) => m.name);
      const card = h('div', { class: `result ${r.res}` },
        h('span', { class: 'res-tag', text: r.res }),
        h('span', {}, clubBadge(c), fans.length ? h('span', { class: 'fan-tag', text: `${fans.join(', ')}` }) : null),
        h('span', { class: 'score', text: `${r.ha === 'H' ? c : r.opp} ${r.ha === 'H' ? r.gf : r.ga}-${r.ha === 'H' ? r.ga : r.gf} ${r.ha === 'H' ? r.opp : c}` }),
        h('span', { class: 'line', text: line }));
      const btn = h('button', { class: 'copy', type: 'button', text: 'Copy for the group' });
      btn.addEventListener('click', () => copyText(btn, line));
      card.append(btn);
      res.append(card);
    });
    // PL table
    const fanClubs = new Set(clubs);
    const tb = $('pl').tBodies[0]; tb.replaceChildren();
    D.pltable.forEach((t) => {
      const fans = D.managers.filter((m) => m.club === t.team).map((m) => m.name);
      tb.append(h('tr', { class: t.pos >= 18 ? 'zone' : '' },
        h('td', { text: t.pos }),
        h('td', { class: 'l' }, fanClubs.has(t.team) ? h('b', { text: t.name }) : t.name, fans.length ? h('span', { class: 'fan-tag', text: fans.join(', ') }) : null),
        h('td', { text: t.p }), h('td', { text: t.w }), h('td', { text: t.d }), h('td', { text: t.l }),
        h('td', { text: (t.gd > 0 ? '+' : '') + t.gd }), h('td', {}, h('b', { text: t.pts })), h('td', { class: 'l', text: t.form })));
    });
  }

  // ---------- rivals ----------
  function renderRivals() {
    const a = $('vs-a'), b = $('vs-b');
    const opts = () => D.managers.slice().sort((x, y) => x.rank - y.rank).map((m) => new Option(`${m.rank}. ${m.name} · ${m.team}`, m.id));
    const ka = a.value, kb = b.value;
    a.replaceChildren(...opts()); b.replaceChildren(...opts());
    const sorted = D.managers.slice().sort((x, y) => x.rank - y.rank);
    const defA = me ?? sorted[0].id;
    const defB = sorted.find((m) => m.id !== defA && (me == null || m.rank < M.get(me).rank))?.id ?? sorted.find((m) => m.id !== defA).id;
    a.value = ka || defA; b.value = kb || defB;
    a.onchange = b.onchange = drawRivals;
    drawRivals();
  }
  function drawRivals() {
    const A = M.get(+$('vs-a').value), B = M.get(+$('vs-b').value);
    if (!A || !B) return;
    const ha = D.history.filter((r) => r.id === A.id), hb = D.history.filter((r) => r.id === B.id);
    let wa = 0, wb = 0, dr = 0;
    ha.forEach((r) => { const o = hb.find((q) => q.gw === r.gw); if (!o) return; if (r.points > o.points) wa++; else if (r.points < o.points) wb++; else dr++; });
    const best = (hh) => Math.max(...hh.map((r) => r.points));
    const capTot = (hh) => hh.reduce((x, r) => x + r.captain_pts, 0);
    const row = (k, va, vb, higherWins = true) => {
      const aw = higherWins ? va > vb : va < vb, bw = higherWins ? vb > va : vb < va;
      return h('div', { class: 'vs-row' }, h('span', { class: aw ? 'win-a' : '', text: va }), h('span', { class: 'k', text: k }), h('span', { class: bw ? 'win-b' : '', text: vb }));
    };
    const board = $('vs-board');
    board.style.setProperty('--club-a', A.club && CLUB[A.club] ? CLUB[A.club][0] : '#2a3480');
    board.style.setProperty('--club-b', B.club && CLUB[B.club] ? CLUB[B.club][0] : '#2a3480');
    board.replaceChildren(
      h('div', { class: 'vs-side a' }, h('span', { class: 'vs-team', text: A.team }), h('span', { class: 'vs-name', text: A.name }), h('span', { class: 'vs-big', text: A.total })),
      h('div', { class: 'vs-mid' }, h('span', { text: Math.abs(A.total - B.total) }), 'pts apart'),
      h('div', { class: 'vs-side b' }, h('span', { class: 'vs-team', text: B.team }), h('span', { class: 'vs-name', text: B.name }), h('span', { class: 'vs-big', text: B.total })),
      h('div', { class: 'vs-rows' },
        row('Gameweeks won', wa, wb), row('League position', ord(A.rank), ord(B.rank), false),
        row('Best week', best(ha), best(hb)), row('Captain points', capTot(ha), capTot(hb)),
        row('Points on bench', A.bench_total, B.bench_total, false), row('Hits taken', A.hits ? `-${A.hits}` : 0, B.hits ? `-${B.hits}` : 0),
        row('Chips in hand', chipsLeft(A).length, chipsLeft(B).length),
        dr ? h('p', { class: 'note', text: `${dr} gameweek${dr > 1 ? 's' : ''} drawn.` }) : null));
    $('vs-chart-title').textContent = 'Who was ahead, week by week';
    const legend = $('vs-legend'); legend.replaceChildren(
      h('span', { class: 'key a' }, h('i'), `${A.name} ahead (above the line)`),
      h('span', { class: 'key b' }, h('i'), `${B.name} ahead (below the line)`));
    drawGap($('vs-chart'), ha, hb, A, B);
    const pa = new Set(A.picks.map((p) => p.el)), pb = new Set(B.picks.map((p) => p.el));
    const list = (cls, title, sub, els) => h('div', { class: `card own ${cls}` },
      h('h3', { class: 'card-title' }, h('i', { class: 'own-dot' }), title, h('span', { class: 'own-count', text: els.length })),
      h('p', { class: 'note', text: sub }),
      h('div', { class: 'chips-list' }, els.length ? els.map((e) => h('span', { class: 'chip', text: `${player(e).n} (${player(e).t})` })) : h('span', { class: 'note', text: 'None' })));
    $('vs-squads').replaceChildren(
      list('a', `Only ${A.name} has`, `Where ${A.name} can gain on ${B.name}`, [...pa].filter((e) => !pb.has(e))),
      list('both', 'Both have', 'These cancel out between them', [...pa].filter((e) => pb.has(e))),
      list('b', `Only ${B.name} has`, `Where ${B.name} can gain on ${A.name}`, [...pb].filter((e) => !pa.has(e))));
  }
  function drawGap(box, ha, hb, A, B) {
    const pts = ha.map((r) => ({ gw: r.gw, d: r.total - (hb.find((q) => q.gw === r.gw)?.total ?? 0) }));
    const W = Math.max(box.clientWidth, 300), H = 220, pl = 40, pr = 8, pt = 12, pb = 24;
    const ext = Math.max(10, ...pts.map((p) => Math.abs(p.d)));
    const step = (W - pl - pr) / Math.max(1, pts.length);
    const x = (i) => pl + step * (i + 0.5);
    const y = (v) => pt + (1 - (v + ext) / (2 * ext)) * (H - pt - pb);
    const bw = Math.max(4, Math.min(28, step * 0.62));
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Bar chart of the points gap between ${A.name} and ${B.name} after each gameweek` });
    [-ext, 0, ext].forEach((v) => {
      const ln = s('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v) });
      ln.style.stroke = v === 0 ? 'rgba(243,245,255,.55)' : 'rgba(160,175,255,.18)';
      ln.style.strokeWidth = v === 0 ? '1.5' : '1';
      svg.append(ln, s('text', { x: pl - 8, y: y(v) + 4, 'text-anchor': 'end', text: v > 0 ? `+${v}` : v }));
    });
    pts.forEach((p, i) => {
      const r = s('rect', { x: x(i) - bw / 2, width: bw, y: Math.min(y(0), y(p.d)), height: Math.max(2, Math.abs(y(p.d) - y(0))), rx: 2 });
      r.style.fill = p.d > 0 ? '#ffbf1f' : p.d < 0 ? '#33d6ff' : '#9aa3d6';
      r.addEventListener('pointermove', (ev) => showTip(ev, `After GW${p.gw}: ${p.d === 0 ? 'level' : p.d > 0 ? `${A.name} ahead by ${p.d}` : `${B.name} ahead by ${-p.d}`}`));
      r.addEventListener('pointerleave', hideTip);
      svg.append(r);
      if (pts.length <= 20 || p.gw % 2 === 0) svg.append(s('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', text: p.gw }));
    });
    box.replaceChildren(svg);
  }

  // ---------- squads ----------
  function renderSquads() {
    const sel = $('squad-pick');
    const keep = sel.value;
    sel.replaceChildren(...D.managers.slice().sort((a, b) => a.rank - b.rank).map((m) => new Option(`${m.rank}. ${m.name} · ${m.team}`, m.id)));
    sel.value = keep || (me ?? D.managers.slice().sort((a, b) => a.rank - b.rank)[0].id);
    sel.onchange = drawPitch;
    drawPitch();
    // chips
    const hf = half();
    $('chips-note').textContent = hf === 1 ? 'First-half chips expire at the GW19 deadline. Everyone gets a fresh four from GW20.' : 'Second-half chips, usable until GW38.';
    const tb = $('chips').tBodies[0]; tb.replaceChildren();
    D.managers.slice().sort((a, b) => a.rank - b.rank).forEach((m) => {
      tb.append(h('tr', { class: isMe(m.id) ? 'me' : '' }, h('td', { class: 'l', text: m.name }),
        Object.keys(CHIP_NAMES).map((c) => { const g = m.chips[`${c}_${hf}`]; return h('td', {}, g ? h('span', { class: 'used', text: `GW${g}` }) : h('span', { class: 'inhand', text: 'In hand' })); })));
    });
    // transfers
    const g = D.meta.gw;
    $('moves-note').textContent = `Every move made for GW${g}, with what each player scored that week.`;
    const mt = $('moves').tBodies[0]; mt.replaceChildren();
    const all = D.transfers.filter((t) => t.gw === g);
    const ts = all.filter((t) => !['wildcard', 'freehit'].includes(t.chip));
    if (!all.length) mt.append(h('tr', {}, h('td', { class: 'l', colspan: 4, text: 'Nobody made a transfer.' })));
    const chipMoves = new Map();
    all.filter((t) => ['wildcard', 'freehit'].includes(t.chip)).forEach((t) => { const k = `${t.id}|${t.chip}`; if (!chipMoves.has(k)) chipMoves.set(k, []); chipMoves.get(k).push(t); });
    chipMoves.forEach((list, k) => {
      const [id, chip] = k.split('|');
      const net = list.reduce((a, t) => a + t.pts_in - t.pts_out, 0);
      mt.append(h('tr', { class: isMe(+id) ? 'me' : '' }, h('td', { class: 'l', text: `${M.get(+id)?.name} (${CHIP_NAMES[chip]})` }),
        h('td', { class: 'l', colspan: 2, text: `${list.length} changes, in: ${list.map((t) => player(t.el_in).n).join(', ')}` }),
        h('td', { class: net > 0 ? 'up' : net < 0 ? 'down' : '', text: net > 0 ? `+${net}` : net })));
    });
    ts.forEach((t) => {
      const net = t.pts_in - t.pts_out;
      mt.append(h('tr', { class: isMe(t.id) ? 'me' : '' }, h('td', { class: 'l', text: M.get(t.id)?.name }),
        h('td', { class: 'l down', text: `${player(t.el_out).n} ${t.pts_out}` }), h('td', { class: 'l up', text: `${player(t.el_in).n} ${t.pts_in}` }),
        h('td', { class: net > 0 ? 'up' : net < 0 ? 'down' : '', text: net > 0 ? `+${net}` : net })));
    });
    // fixtures
    const next = D.fixtures.filter((f) => f.gw >= (D.meta.next_gw || D.meta.gw));
    const gws = [...new Set(next.map((f) => f.gw))].sort((a, b) => a - b).slice(0, 6);
    const thead = $('fdr').tHead; thead.replaceChildren(h('tr', {}, h('th', { class: 'l', text: 'Club' }), gws.map((x) => h('th', { text: `GW${x}` }))));
    const clubs = Object.keys(CLUB).filter((c) => D.pltable.some((t) => t.team === c));
    const rows = clubs.map((c) => {
      const cells = gws.map((x) => next.filter((f) => f.gw === x && (f.h === c || f.a === c)).map((f) => f.h === c ? { o: f.a, home: true, d: f.hd } : { o: f.h, home: false, d: f.ad }));
      return { c, cells, score: cells.flat().reduce((a, f) => a + f.d, 0) / Math.max(1, cells.flat().length) };
    }).sort((a, b) => a.score - b.score);
    const ft = $('fdr').tBodies[0]; ft.replaceChildren();
    rows.forEach((r) => ft.append(h('tr', {}, h('td', { class: 'l' }, clubBadge(r.c)), r.cells.map((fx) => {
      const td = h('td', { class: 'f' + (fx.length ? ` f${Math.round(fx.reduce((a, f) => a + f.d, 0) / fx.length)}` : ''), text: fx.length ? fx.map((f) => f.home ? f.o : f.o.toLowerCase()).join('+') : 'Blank' });
      return td;
    }))));
  }
  function drawPitch() {
    const m = M.get(+$('squad-pick').value);
    const pitch = $('pitch'); pitch.replaceChildren();
    if (!m || !m.picks.length) { pitch.append(h('p', { class: 'note', text: 'No team picked yet.' })); return; }
    const subbedOut = new Set((m.subs || []).map(([o]) => o)), subbedIn = new Set((m.subs || []).map(([, i]) => i));
    const card = (p) => {
      const pl = player(p.el);
      const mult = p.el === m.captain ? (m.active_chip === '3xc' ? 3 : 2) : 1;
      const el = h('div', { class: 'pl' + (p.el === m.captain ? ' cap' : '') + (pl.s !== 'a' ? ' flag' : '') + (subbedOut.has(p.el) ? ' subbed' : ''), title: pl.news || null },
        h('b', { text: pl.n + (p.c ? ' (C)' : p.v ? ' (V)' : '') }), h('small', { text: `${pl.t} · £${pl.c.toFixed(1)}m` }),
        h('span', { class: 'pts', text: mult > 1 ? `${pl.gw}×${mult}` : pl.gw }),
        subbedIn.has(p.el) ? h('small', { text: 'Auto-sub in' }) : subbedOut.has(p.el) ? h('small', { text: 'Subbed off' }) : null);
      if (CLUB[pl.t]) el.style.setProperty('--kit', CLUB[pl.t][0]);
      return el;
    };
    const xi = m.picks.filter((p) => p.slot <= 11), bench = m.picks.filter((p) => p.slot > 11);
    [1, 2, 3, 4].forEach((pos) => pitch.append(h('div', { class: 'pline' }, xi.filter((p) => player(p.el).p === pos).map(card))));
    pitch.append(h('div', { class: 'bench-label', text: m.active_chip === 'bboost' ? 'Bench (Bench Boost: these count)' : 'Bench' }), h('div', { class: 'pline bench' }, bench.map(card)));
    const value = m.picks.reduce((a, p) => a + player(p.el).c, 0);
    $('squad-note').textContent = `${m.team} · ${D.meta.live ? 'live' : `GW${D.meta.gw}`} ${m.gw_points} pts · bank £${m.bank.toFixed(1)}m · ${m.free_transfers} free transfer${m.free_transfers === 1 ? '' : 's'} · squad £${value.toFixed(1)}m`;
  }

  // ---------- shareable images ----------
  async function shareImage(draw, filename, text, height) {
    try { await Promise.all([document.fonts.load('700 100px Teko'), document.fonts.load('600 30px Archivo'), document.fonts.load('800 30px Archivo')]); } catch (e) { /* fall back to system fonts */ }
    const c = document.createElement('canvas'); c.width = 1080; c.height = height || 1350;
    draw(c.getContext('2d'), 1080, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (!blob) return;
    const file = new File([blob], filename, { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const img = $('share-img');
    if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    img.dataset.url = URL.createObjectURL(blob); img.src = img.dataset.url;
    $('share-preview').hidden = false;
  }
  $('share-close').addEventListener('click', () => { $('share-preview').hidden = true; });
  const TEKO = (px) => `700 ${px}px Teko, "Arial Narrow", Impact, sans-serif`;
  const ARCH = (px, w = 600) => `${w} ${px}px Archivo, system-ui, sans-serif`;
  function fill(g, text, x, y, font, color, align = 'center', maxW) {
    g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic';
    if (maxW) { let size = parseInt(font.match(/(\d+)px/)[1], 10); while (g.measureText(text).width > maxW && size > 20) { size -= 4; g.font = font.replace(/\d+px/, `${size}px`); } }
    g.fillText(text, x, y);
  }
  function stadium(g, W, H, a, b) {
    const lg = g.createLinearGradient(0, 0, W * .4, H); lg.addColorStop(0, a); lg.addColorStop(1, b); g.fillStyle = lg; g.fillRect(0, 0, W, H);
    [[W * .1, -H * .05, 'rgba(255,255,255,.28)'], [W * .95, -H * .08, 'rgba(255,191,31,.22)']].forEach(([x, y, col]) => {
      const rg = g.createRadialGradient(x, y, 10, x, y, W * .9); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    });
    g.save(); g.globalAlpha = .07; g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W * .18, 0); g.lineTo(W * .7, H); g.lineTo(W * .36, H); g.fill();
    g.beginPath(); g.moveTo(W, 0); g.lineTo(W * .82, 0); g.lineTo(W * .3, H); g.lineTo(W * .64, H); g.fill(); g.restore();
  }
  function footer(g, W, H) {
    g.fillStyle = '#ffbf1f'; g.beginPath(); g.moveTo(60, H - 118); g.lineTo(W - 60, H - 118); g.lineTo(W - 72, H - 112); g.lineTo(60, H - 112); g.fill();
    fill(g, `${D.meta.title.toUpperCase()} · LEAGUE HQ`, W / 2, H - 60, TEKO(44), 'rgba(255,255,255,.85)');
  }

  // ---------- walkout intro ----------
  function playIntro(done) {
    const today = new Date().toISOString().slice(0, 10);
    if (reduceMotion() || store.get(`${NS}-intro`) === today) { done(); return; }
    store.set(`${NS}-intro`, today);
    const el = $('intro');
    $('intro-name').textContent = D.meta.title;
    $('intro-kicker').textContent = D.meta.live ? `Gameweek ${D.meta.gw} · Live` : `Gameweek ${D.meta.gw_finished ? (D.meta.next_gw || D.meta.gw) : D.meta.gw}`;
    el.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('play')));
    let ended = false;
    const end = () => { if (ended) return; ended = true; el.classList.add('out'); setTimeout(() => { el.hidden = true; el.classList.remove('play', 'out'); done(); }, 450); };
    el.addEventListener('click', end, { once: true });
    setTimeout(end, 2100);
  }

  // ---------- Gameweek Wrapped ----------
  function lastFinished() { const f = D.meta.finished_gws; return f.length ? f[f.length - 1] : null; }
  function wrappedData(id) {
    const g = lastFinished(); if (!g) return null;
    const rows = D.history.filter((r) => r.gw === g), prev = D.history.filter((r) => r.gw === g - 1);
    const mine = rows.find((r) => r.id === id); if (!mine) return null;
    const myPrev = prev.find((r) => r.id === id);
    const before = myPrev ? myPrev.rank : mine.rank, after = mine.rank;
    const was = (rid) => prev.find((q) => q.id === rid)?.rank;
    const overtook = myPrev ? rows.filter((r) => r.id !== id && was(r.id) < before && r.rank > after).map((r) => M.get(r.id).name) : [];
    const passedBy = myPrev ? rows.filter((r) => r.id !== id && was(r.id) > before && r.rank < after).map((r) => M.get(r.id).name) : [];
    const capCount = rows.filter((r) => r.captain && r.captain === mine.captain).length - 1;
    return {
      g, mine, m: M.get(id), n: rows.length,
      beat: rows.filter((r) => r.id !== id && r.points < mine.points).length,
      avg: Math.round(rows.reduce((a, r) => a + r.points, 0) / rows.length),
      weekRank: 1 + rows.filter((r) => r.points > mine.points).length,
      before, after, overtook, passedBy,
      cap: mine.captain ? player(mine.captain).n : null, capPts: mine.captain_pts, capCount: Math.max(0, capCount),
      tr: D.transfers.filter((t) => t.id === id && t.gw === g),
      awards: D.awards.filter((a) => a.gw === g && a.id === id),
    };
  }
  function wrappedCards(w) {
    const card = (bg, ...kids) => {
      const c = h('div', { class: 'w-card' }, ...kids); c.style.setProperty('--wbg', bg);
      let d = 0; c.querySelectorAll('.pop').forEach((el) => { el.style.setProperty('--d', String(d)); d += 170; });
      return c;
    };
    const cards = [];
    cards.push(card('radial-gradient(80% 60% at 20% 10%, #7a3cff, transparent), radial-gradient(70% 60% at 90% 90%, #ff2e8a, transparent), #120a3a',
      h('span', { class: 'w-eyebrow pop', text: `Gameweek ${w.g}` }), h('span', { class: 'w-big pop', text: 'Wrapped' }),
      h('span', { class: 'w-line pop', text: `${w.m.name}, here's how your week went.` }), h('span', { class: 'w-sub pop', text: `${w.m.team}. Tap to go on.` })));
    const beatLine = w.beat === w.n - 1 ? 'Nobody scored more. Take a bow.' : w.beat === 0 ? 'Every single one of them beat you.' : `You beat ${w.beat} of the other ${w.n - 1}.`;
    cards.push(card('radial-gradient(90% 60% at 80% 0%, #33d6ff, transparent), radial-gradient(80% 60% at 0% 100%, #1d3cff, transparent), #071040',
      h('span', { class: 'w-eyebrow pop', text: 'You scored' }), h('span', { class: 'w-huge pop', 'data-count': w.mine.points, text: w.mine.points }),
      h('span', { class: 'w-line pop', text: beatLine }), h('span', { class: 'w-sub pop', text: `League average ${w.avg}. ${ord(w.weekRank)} best score this week.` })));
    const mv = w.before - w.after;
    cards.push(card(mv > 0 ? 'radial-gradient(90% 70% at 50% 0%, #22e6a8, transparent), #04291f' : mv < 0 ? 'radial-gradient(90% 70% at 50% 0%, #ff3d6e, transparent), #2a0614' : 'radial-gradient(90% 70% at 50% 0%, #6b75b8, transparent), #0d1235',
      h('span', { class: 'w-eyebrow pop', text: 'League position' }),
      h('span', { class: 'w-arrow pop', text: mv > 0 ? `▲ ${mv}` : mv < 0 ? `▼ ${-mv}` : '=' }),
      h('span', { class: 'w-huge pop', text: ord(w.after) }),
      h('span', { class: 'w-line pop', text: mv > 0 ? `Up from ${ord(w.before)}.` : mv < 0 ? `Down from ${ord(w.before)}.` : 'Holding your ground.' }),
      w.overtook.length ? h('span', { class: 'w-sub pop', text: `You overtook ${w.overtook.join(', ')}.` }) : null,
      w.passedBy.length ? h('span', { class: 'w-sub pop', text: `Overtaken by ${w.passedBy.join(', ')}.` }) : null));
    if (w.cap) {
      const verdict = w.capPts >= 20 ? 'An absolute haul.' : w.capPts >= 12 ? 'Solid return.' : w.capPts >= 6 ? 'Did a job.' : 'Armband blank. Ouch.';
      cards.push(card('radial-gradient(90% 70% at 10% 10%, #ffbf1f, transparent), radial-gradient(70% 60% at 100% 100%, #ff8a00, transparent), #2a1600',
        h('span', { class: 'w-eyebrow pop', text: 'Your captain' }), h('span', { class: 'w-big pop', text: w.cap }),
        h('span', { class: 'w-huge pop', 'data-count': w.capPts, text: w.capPts }), h('span', { class: 'w-line pop', text: verdict }),
        h('span', { class: 'w-sub pop', text: w.capCount ? `${w.capCount} other${w.capCount > 1 ? 's' : ''} picked the same captain.` : 'Nobody else went with that pick. Bold.' })));
    }
    const chipTr = w.tr.find((t) => ['wildcard', 'freehit'].includes(t.chip));
    const normal = w.tr.filter((t) => !['wildcard', 'freehit'].includes(t.chip));
    const net = normal.reduce((a, t) => a + t.pts_in - t.pts_out, 0) - w.mine.hit;
    cards.push(card('radial-gradient(90% 70% at 90% 10%, #7a3cff, transparent), radial-gradient(80% 60% at 0% 100%, #33d6ff, transparent), #0b0a35',
      h('span', { class: 'w-eyebrow pop', text: 'Transfers' }),
      chipTr ? h('span', { class: 'w-big pop', text: CHIP_NAMES[chipTr.chip] }) : !normal.length ? h('span', { class: 'w-big pop', text: 'No moves' }) : h('span', { class: 'w-huge pop', text: net > 0 ? `+${net}` : net }),
      normal.length && !chipTr ? h('div', { class: 'w-list pop' }, normal.map((t) => h('div', {}, h('span', { text: `${player(t.el_out).n} → ${player(t.el_in).n}` }), h('b', { text: (t.pts_in - t.pts_out > 0 ? '+' : '') + (t.pts_in - t.pts_out) })))) : null,
      h('span', { class: 'w-line pop', text: chipTr ? `${w.tr.length} changes in one go.` : !normal.length ? 'Rolled the transfer.' : net > 0 ? 'Points gained from your moves.' : net < 0 ? 'Your moves cost you this week.' : 'Your moves broke even.' }),
      w.mine.hit ? h('span', { class: 'w-sub pop', text: `Includes a -${w.mine.hit} hit.` }) : null));
    cards.push(card(w.awards.some((a) => GOOD.has(a.award)) ? 'radial-gradient(90% 70% at 50% 0%, #fff3c4, transparent), radial-gradient(90% 70% at 50% 100%, #d99100, transparent), #4a2c00' : 'radial-gradient(90% 70% at 50% 0%, #ff3d6e, transparent), #1a0618',
      h('span', { class: 'w-eyebrow pop', text: 'Awards' }),
      w.awards.length ? h('div', { class: 'w-list pop' }, w.awards.map((a) => h('div', {}, h('span', { text: a.label }), h('b', { text: GOOD.has(a.award) ? 'WON' : 'OOF' })))) : h('span', { class: 'w-big pop', text: 'Nothing' }),
      h('span', { class: 'w-line pop', text: w.awards.length ? 'Your silverware (and shame) this week.' : 'No trophies, no spoons. Quietly anonymous.' }),
      h('span', { class: 'w-sub pop', text: `${w.mine.bench} points left on your bench.` })));
    const btn = h('button', { class: 'btn w-share pop', type: 'button', text: 'Share to the group' });
    btn.addEventListener('click', (e) => { e.stopPropagation(); shareWrapped(w); });
    cards.push(card('radial-gradient(80% 60% at 0% 0%, #ff2e8a, transparent), radial-gradient(80% 60% at 100% 100%, #33d6ff, transparent), #150a40',
      h('span', { class: 'w-eyebrow pop', text: `GW${w.g} in one picture` }), h('span', { class: 'w-big pop', text: w.m.name }),
      h('div', { class: 'w-list pop' },
        h('div', {}, h('span', { text: 'Points' }), h('b', { text: w.mine.points })),
        h('div', {}, h('span', { text: 'League position' }), h('b', { text: `${ord(w.after)}${mv ? (mv > 0 ? ` ▲${mv}` : ` ▼${-mv}`) : ''}` })),
        w.cap ? h('div', {}, h('span', { text: `Captain ${w.cap}` }), h('b', { text: w.capPts })) : null,
        h('div', {}, h('span', { text: 'Beat this week' }), h('b', { text: `${w.beat}/${w.n - 1}` }))),
      btn));
    return cards;
  }
  function shareWrapped(w) {
    const mv = w.before - w.after;
    shareImage((g, W, H) => {
      stadium(g, W, H, '#2a0f6e', '#07051f');
      const rg = g.createRadialGradient(W, H, 10, W, H, W); rg.addColorStop(0, 'rgba(255,46,138,.45)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
      fill(g, `GAMEWEEK ${w.g} WRAPPED`, W / 2, 150, TEKO(70), '#ffbf1f');
      fill(g, w.m.name.toUpperCase(), W / 2, 300, TEKO(170), '#ffffff', 'center', W - 120);
      fill(g, w.m.team, W / 2, 360, ARCH(36), 'rgba(255,255,255,.75)', 'center', W - 120);
      fill(g, String(w.mine.points), W / 2, 700, TEKO(380), '#ffffff');
      fill(g, 'POINTS', W / 2, 770, TEKO(64), 'rgba(255,255,255,.7)');
      const stats = [[`${ord(w.after)}${mv > 0 ? ` ▲${mv}` : mv < 0 ? ` ▼${-mv}` : ''}`, 'IN THE LEAGUE'], [w.cap ? `${w.capPts}` : '–', w.cap ? `FROM ${w.cap.toUpperCase()} (C)` : 'NO CAPTAIN'], [`${w.beat}/${w.n - 1}`, 'BEATEN THIS WEEK']];
      stats.forEach(([v, k], i) => {
        const y = 900 + i * 110;
        g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(110, y - 72, W - 220, 92);
        fill(g, v, 150, y, TEKO(84), '#ffbf1f', 'left');
        fill(g, k, W - 150, y - 8, TEKO(46), '#ffffff', 'right', 520);
      });
      footer(g, W, H);
    }, `gw${w.g}-wrapped-${w.m.name}.png`, `My GW${w.g} Wrapped`);
  }
  let wState = null;
  function openWrapped(id) {
    const w = wrappedData(id); if (!w) return;
    const cards = wrappedCards(w);
    wState = { cards, i: 0, timer: null };
    $('w-bars').replaceChildren(...cards.map(() => h('span', {}, h('i'))));
    $('wrapped').hidden = false; document.body.style.overflow = 'hidden';
    store.set(`${NS}-wrapped`, String(w.g));
    showW(0);
  }
  function showW(i) {
    if (!wState) return;
    const n = wState.cards.length;
    if (i >= n) { closeWrapped(); return; }
    i = Math.max(0, i); wState.i = i; clearTimeout(wState.timer);
    $('w-stage').replaceChildren(wState.cards[i]);
    [...$('w-bars').children].forEach((b, k) => { b.className = ''; void b.offsetWidth; b.className = k < i ? 'done' : k === i ? 'on' : ''; });
    wState.cards[i].querySelectorAll('[data-count]').forEach((el) => {
      const to = +el.dataset.count; if (reduceMotion() || to <= 0) { el.textContent = to; return; }
      const t0 = performance.now(); const stepf = (t) => { const k = Math.min(1, (t - t0) / 1100); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(stepf); }; requestAnimationFrame(stepf);
    });
    if (i < n - 1) wState.timer = setTimeout(() => showW(i + 1), 6000);
  }
  function closeWrapped() { if (!wState) return; clearTimeout(wState.timer); wState = null; $('wrapped').hidden = true; document.body.style.overflow = ''; }
  $('w-next').addEventListener('click', () => wState && showW(wState.i + 1));
  $('w-prev').addEventListener('click', () => wState && showW(wState.i - 1));
  $('w-close').addEventListener('click', closeWrapped);
  document.addEventListener('keydown', (e) => {
    if (!wState) return;
    if (e.key === 'Escape') closeWrapped(); else if (e.key === 'ArrowRight') showW(wState.i + 1); else if (e.key === 'ArrowLeft') showW(wState.i - 1);
  });
  function renderWrappedCta() {
    const g = lastFinished(); const btn = $('wrapped-cta');
    if (!g) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.replaceChildren(h('span', {}, `Your GW${g} Wrapped`, h('small', { text: me != null ? 'Your week in seven swipes, ready to share' : 'Pick your team to see your week in seven swipes' })), h('span', { class: 'play', text: '▶' }));
    btn.onclick = () => { if (me == null) openSheet(); else openWrapped(me); };
  }
  function maybeWrapped() {
    const g = lastFinished();
    if (me != null && g && !D.meta.live && store.get(`${NS}-wrapped`) !== String(g)) openWrapped(me);
  }

  // ---------- Match Centre ----------
  const EV = { goal: ['G', 'scores', 1], own_goal: ['OG', 'own goal', 2], assist: ['A', 'assist', 3], pen_save: ['PS', 'saves a penalty', 4], pen_miss: ['PM', 'misses a penalty', 5], red: ['R', 'sent off', 6] };
  function ownersOf(el) {
    return D.managers.filter((m) => m.picks.some((k) => k.el === el)).map((m) => {
      const k = m.picks.find((p) => p.el === el);
      return { m, cap: m.captain === el, bench: k.slot > 11 && m.active_chip !== 'bboost' };
    });
  }
  function ownersRow(el) {
    const o = ownersOf(el);
    const pl = player(el);
    const row = h('div', { class: 'ev-own' });
    if (!o.length) return null;
    const caps = o.filter((x) => x.cap).length;
    row.append(h('span', { text: `Owned by ${o.length}${caps ? `, captained by ${caps}` : ''} · ${pl.gw} pts:` }));
    o.forEach((x) => row.append(h('span', { class: 'o' + (x.cap ? ' cap' : '') + (isMe(x.m.id) ? ' me' : ''), text: `${x.m.name}${x.cap ? ' (C)' : ''}${x.bench ? ' (bench)' : ''}` })));
    return row;
  }
  function renderMatch() {
    const gw = D.meta.gw, match = D.match || [];
    const anyStarted = match.some((f) => f.started);
    $('match-title').textContent = D.meta.live ? `GW${gw} live` : D.meta.gw_finished ? `GW${gw}: full time` : `GW${gw}`;
    $('match-note').textContent = D.meta.live ? 'Scores, scorers and bonus as they happen, with who in the league each one affects. Updates about every 10 minutes.' : 'Every goal, assist, card and bonus from the last gameweek, and who in the league it hit.';
    const seenKey = `${NS}-seen-${gw}`;
    let seen = null; try { seen = JSON.parse(store.get(seenKey) || 'null'); } catch (e) { seen = null; }
    const seenSet = new Set(seen || []);
    const allKeys = [];
    let fresh = 0;
    const box = $('fixtures'); box.replaceChildren();
    if (!anyStarted) box.append(h('div', { class: 'card' }, h('p', { class: 'note', text: `GW${gw} hasn't kicked off yet. This fills up from the first whistle.` })));
    const ownedEls = new Set(D.managers.flatMap((m) => m.picks.map((k) => k.el)));
    const involved = (f) => [...ownedEls].some((e) => [f.h, f.a].includes(player(e).t));
    const started = match.filter((f) => f.started);
    const quietFx = started.filter((f) => !involved(f));
    started.filter(involved).forEach((f) => {
      const st = f.done ? 'FT' : `${f.mins}'`;
      const head = h('div', { class: 'fx-head' },
        h('span', { class: 'fx-team', text: (CLUB[f.h] || [, f.h])[1] }),
        h('span', { class: 'fx-score' }, `${f.hs ?? 0}-${f.as_ ?? 0}`, h('small', { class: f.done ? '' : 'live', text: st })),
        h('span', { class: 'fx-team a', text: (CLUB[f.a] || [, f.a])[1] }));
      if (CLUB[f.h]) head.style.setProperty('--ch', CLUB[f.h][0]);
      if (CLUB[f.a]) head.style.setProperty('--ca', CLUB[f.a][0]);
      const evs = h('div', { class: 'fx-events' });
      const list = f.events.filter((e) => EV[e.t]).sort((a, b) => EV[a.t][2] - EV[b.t][2]);
      const items = list.map((e) => ({ key: `${f.id}|${e.t}|${e.el}|${e.n}`, ico: EV[e.t][0], cls: e.t, text: `${player(e.el).n} ${EV[e.t][1]}${e.n > 1 ? ` ×${e.n}` : ''}`, el: e.el }));
      f.bonus.forEach((b) => items.push({ key: `${f.id}|bonus|${b.el}|${b.b}`, ico: `+${b.b}`, cls: 'bonus', text: `${player(b.el).n} ${b.b} bonus${b.prov ? ' (provisional)' : ''}`, el: b.el }));
      items.forEach((it) => {
        allKeys.push(it.key);
        const isNew = seen && !seenSet.has(it.key);
        if (isNew) fresh += 1;
        const own = ownersRow(it.el);
        evs.append(h('div', { class: 'ev' + (isNew ? ' new' : '') + (own ? '' : ' quiet') },
          h('span', { class: `ev-ico ${it.cls}`, text: it.ico }),
          h('span', { class: 'ev-main' }, it.text, own ? null : h('span', { class: 'ev-none', text: ' · not owned here' }), isNew ? h('span', { class: 'newtag', text: 'NEW' }) : null),
          own));
      });
      const sb = h('button', { class: 'share-btn small', type: 'button', text: 'Share' });
      sb.addEventListener('click', busy(sb, () => shareFixture(f, items)));
      box.append(h('div', { class: 'fx' }, head, items.length ? evs : h('div', { class: 'fx-quiet', text: 'Nothing to report yet.' }), h('div', { class: 'fx-foot' }, sb)));
    });
    if (quietFx.length) {
      box.append(h('div', { class: 'fx quiet-list' }, h('div', { class: 'ql-head', text: 'Other results · no league players involved' }),
        quietFx.map((f) => h('div', { class: 'ql-row' }, h('span', { text: (CLUB[f.h] || [, f.h])[1] }), h('b', { text: `${f.hs ?? 0}-${f.as_ ?? 0}` }), h('span', { text: (CLUB[f.a] || [, f.a])[1] }), h('small', { text: f.done ? 'FT' : `${f.mins}'` })))));
    }
    $('match-new').hidden = !fresh;
    $('match-new').textContent = `${fresh} new since you last looked`;
    clearTimeout(renderMatch.t);
    renderMatch.t = setTimeout(() => { if (!$('match').hidden) store.set(seenKey, JSON.stringify(allKeys)); }, 4000);
    if (!seen) store.set(seenKey, JSON.stringify(allKeys));
    // upcoming
    const nxt = D.meta.live || !D.meta.gw_finished ? null : D.meta.next_gw;
    const up = (D.fixtures || []).filter((f) => f.gw === (nxt || D.meta.gw) && !f.started).sort((a, b) => String(a.ko).localeCompare(String(b.ko)));
    $('upcoming-head').hidden = !up.length;
    $('upcoming-title').textContent = `Coming up: GW${nxt || D.meta.gw}`;
    const ub = $('upcoming'); ub.replaceChildren();
    const owned = new Set(D.managers.flatMap((m) => m.picks.map((k) => k.el)));
    up.forEach((f) => {
      const inv = [...owned].filter((e) => [f.h, f.a].includes(player(e).t)).length;
      ub.append(h('div', { class: 'up-fx' }, h('b', { text: `${f.h} v ${f.a}` }),
        h('span', { text: f.ko ? fmtTime(f.ko, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Time to be confirmed' }),
        h('span', { text: inv ? `${inv} league player${inv > 1 ? 's' : ''} involved` : 'No league players involved' })));
    });
  }

  // ---------- Manager cards ----------
  const STATS = ['CAP', 'TRF', 'BEN', 'CON', 'CLU', 'CHP'];
  function ratings() {
    const fin = new Set(D.meta.finished_gws);
    const n = D.managers.length;
    const weekRank = (r) => 1 + D.history.filter((q) => q.gw === r.gw && q.points > r.points).length;
    const raw = new Map(D.managers.map((m) => {
      const hh = D.history.filter((r) => r.id === m.id && fin.has(r.gw));
      const pts = hh.map((r) => r.points);
      const mean = pts.reduce((a, b) => a + b, 0) / Math.max(1, pts.length);
      const sd = Math.sqrt(pts.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, pts.length));
      const tr = D.transfers.filter((t) => t.id === m.id && fin.has(t.gw) && !['wildcard', 'freehit'].includes(t.chip));
      const chipW = hh.filter((r) => r.chip), plain = hh.filter((r) => !r.chip);
      const avg = (a) => a.reduce((x, r) => x + r.points, 0) / Math.max(1, a.length);
      return [m.id, {
        CAP: hh.reduce((a, r) => a + r.captain_pts, 0) / Math.max(1, hh.length),
        TRF: tr.reduce((a, t) => a + t.pts_in - t.pts_out, 0) - hh.reduce((a, r) => a + r.hit, 0),
        BEN: -hh.reduce((a, r) => a + r.bench, 0),
        CON: -sd,
        CLU: hh.filter((r) => weekRank(r) <= 3).length,
        CHP: chipW.length ? avg(chipW) - avg(plain) : null,
        form: D.meta.finished_gws.slice(-3).map((g) => { const r = hh.find((q) => q.gw === g); return r ? weekRank(r) : n; }),
      }];
    }));
    const out = new Map(D.managers.map((m) => [m.id, {}]));
    STATS.forEach((k) => {
      const vals = [...raw.values()].map((r) => r[k]).filter((v) => v != null);
      raw.forEach((r, id) => {
        const v = r[k];
        if (v == null) { out.get(id)[k] = 60; return; }
        const below = vals.filter((x) => x < v).length, eq = vals.filter((x) => x === v).length;
        out.get(id)[k] = Math.round(55 + 43 * (vals.length > 1 ? (below + (eq - 1) / 2) / (vals.length - 1) : .5));
      });
    });
    D.managers.forEach((m) => {
      const r = out.get(m.id);
      const pos = 55 + 43 * (1 - (m.rank - 1) / Math.max(1, n - 1));
      r.OVR = Math.round(STATS.reduce((a, k) => a + r[k], 0) / STATS.length * 0.55 + pos * 0.45);
      const f = raw.get(m.id).form; const fa = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length);
      r.tier = fa <= 3 ? 'inform' : r.OVR >= 80 ? 'gold' : r.OVR >= 70 ? 'silver' : 'bronze';
    });
    return out;
  }
  const TIER = { inform: 'In form', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
  const TIER_BG = { inform: ['#3a1260', '#7a2cff', '#12d6ff'], gold: ['#fff4c4', '#ffcf4a', '#b87800'], silver: ['#ffffff', '#c9d0dc', '#8a93a6'], bronze: ['#f3c9a0', '#c98a52', '#8a5228'] };
  function renderCards() {
    const R = ratings();
    const rail = $('cards-rail'); rail.replaceChildren();
    D.managers.slice().sort((a, b) => R.get(b.id).OVR - R.get(a.id).OVR).forEach((m) => {
      const r = R.get(m.id);
      const share = h('button', { class: 'mc-share', type: 'button', text: 'Share' });
      share.addEventListener('click', () => shareCard(m, r));
      rail.append(h('article', { class: `mcard ${r.tier}${isMe(m.id) ? ' me' : ''}`, 'aria-label': `${m.name}, overall ${r.OVR}` },
        h('div', { class: 'mc-top' }, h('span', { class: 'mc-ovr', text: r.OVR }), h('div', {}, h('span', { class: 'mc-pos', text: m.club || 'FPL' }), h('br'), h('span', { class: 'mc-tier', text: TIER[r.tier] }))),
        crest(m, 'mc-crest'),
        h('div', {}, h('div', { class: 'mc-name', text: m.name }), h('div', { class: 'mc-team', text: m.team })),
        h('div', { class: 'mc-stats' }, STATS.map((k) => h('div', {}, h('b', { text: r[k] }), h('span', { text: k })))),
        share));
    });
    if (me != null) {
      const mine = [...rail.children].findIndex((c) => c.classList.contains('me'));
      if (mine > 0) requestAnimationFrame(() => { rail.scrollLeft = rail.children[mine].offsetLeft - (rail.clientWidth - rail.children[mine].clientWidth) / 2; });
    }
  }
  async function shareCard(m, r) {
    const crestImg = await crestImage(m);
    shareImage((g, W, H) => {
      stadium(g, W, H, '#1b2370', '#070a1f');
      const cw = 760, ch = 1080, x0 = (W - cw) / 2, y0 = 90;
      const pts = [[.14, 0], [.86, 0], [1, .07], [1, .9], [.5, 1], [0, .9], [0, .07]].map(([a, b]) => [x0 + a * cw, y0 + b * ch]);
      g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 50; g.shadowOffsetY = 20;
      const [c1, c2, c3] = TIER_BG[r.tier];
      const lg = g.createLinearGradient(x0, y0, x0 + cw * .6, y0 + ch); lg.addColorStop(0, c1); lg.addColorStop(.45, c2); lg.addColorStop(1, c3);
      g.fillStyle = lg; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.restore();
      const ink = r.tier === 'inform' ? '#ffffff' : '#1a1205';
      fill(g, String(r.OVR), x0 + 70, y0 + 210, TEKO(220), ink, 'left');
      fill(g, (m.club || 'FPL'), x0 + 78, y0 + 270, TEKO(70), ink, 'left');
      fill(g, TIER[r.tier].toUpperCase(), x0 + 78, y0 + 315, ARCH(26, 800), ink, 'left');
      const sx = x0 + cw - 290, sy = y0 + 70, sc = 5.6;
      if (crestImg) g.drawImage(crestImg, sx, sy, 40 * sc, 46 * sc);
      fill(g, m.name.toUpperCase(), W / 2, y0 + 560, TEKO(150), ink, 'center', cw - 120);
      g.fillStyle = ink; g.fillRect(x0 + 90, y0 + 585, cw - 180, 5);
      fill(g, m.team, W / 2, y0 + 640, ARCH(32, 700), ink, 'center', cw - 140);
      STATS.forEach((k, i) => {
        const cx = x0 + 150 + (i % 2) * 300, cy = y0 + 760 + Math.floor(i / 2) * 95;
        fill(g, String(r[k]), cx, cy, TEKO(92), ink, 'left');
        fill(g, k, cx + 110, cy, TEKO(64), ink, 'left');
      });
      footer(g, W, H);
    }, `card-${m.name}.png`, `${m.name}: ${r.OVR} rated`);
  }

  // ---------- share buttons ----------
  async function crestImages(ms) { const out = new Map(); await Promise.all(ms.map(async (m) => out.set(m.id, await crestImage(m)))); return out; }
  function title(g, W, kicker, big) { fill(g, kicker, W / 2, 112, TEKO(54), '#ffbf1f'); fill(g, big, W / 2, 222, TEKO(128), '#ffffff', 'center', W - 110); }
  function busy(btn, fn) { return async () => { if (btn.disabled) return; btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } }; }
  async function shareTable() {
    const rows = D.managers.slice().sort((a, b) => a.rank - b.rank);
    const imgs = await crestImages(rows);
    shareImage((g, W, H) => {
      stadium(g, W, H, '#1b2370', '#070a1f');
      title(g, W, D.meta.live ? `GAMEWEEK ${D.meta.gw} · LIVE` : `AFTER GAMEWEEK ${D.meta.gw_finished ? D.meta.gw : D.meta.gw - 1}`, 'THE TABLE');
      const top = 280, rh = 84;
      rows.forEach((m, i) => {
        const y = top + i * rh, mv = (m.last_rank ?? m.rank) - m.rank;
        g.fillStyle = i % 2 ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.08)'; g.fillRect(60, y, W - 120, rh - 8);
        if (i < 3) { g.fillStyle = '#ffbf1f'; g.fillRect(60, y, 10, rh - 8); }
        fill(g, String(m.rank), 120, y + 60, TEKO(64), i < 3 ? '#ffbf1f' : '#ffffff');
        fill(g, mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '', 182, y + 52, ARCH(22, 800), mv > 0 ? '#22e6a8' : '#ff3d6e');
        const im = imgs.get(m.id); if (im) g.drawImage(im, 220, y + 6, 56, 64);
        fill(g, m.name.toUpperCase(), 300, y + 46, TEKO(48), '#ffffff', 'left', 420);
        fill(g, m.team, 300, y + 68, ARCH(20), 'rgba(255,255,255,.65)', 'left', 420);
        fill(g, `${D.meta.live ? 'LIVE' : 'GW'} ${m.gw_points}`, W - 250, y + 56, TEKO(40), 'rgba(255,255,255,.7)', 'right');
        fill(g, String(m.total), W - 90, y + 60, TEKO(64), '#ffffff', 'right');
      });
      footer(g, W, H);
    }, `table-gw${D.meta.gw}.png`, `The table after GW${D.meta.gw}`);
  }
  async function shareH2H() {
    const A = M.get(+$('vs-a').value), B = M.get(+$('vs-b').value); if (!A || !B) return;
    const imgs = await crestImages([A, B]);
    const ha = D.history.filter((r) => r.id === A.id), hb = D.history.filter((r) => r.id === B.id);
    let wa = 0, wb = 0; ha.forEach((r) => { const o = hb.find((q) => q.gw === r.gw); if (o) { if (r.points > o.points) wa++; else if (r.points < o.points) wb++; } });
    const best = (hh) => Math.max(...hh.map((r) => r.points)), cap = (hh) => hh.reduce((x, r) => x + r.captain_pts, 0);
    const rows = [['Gameweeks won', wa, wb, true], ['Total points', A.total, B.total, true], ['Best week', best(ha), best(hb), true], ['Captain points', cap(ha), cap(hb), true], ['Points on bench', A.bench_total, B.bench_total, false], ['Hits taken', A.hits, B.hits, false]];
    shareImage((g, W, H) => {
      stadium(g, W, H, '#1b2370', '#070a1f');
      const ca = A.club && CLUB[A.club] ? CLUB[A.club][0] : '#2a3480', cb = B.club && CLUB[B.club] ? CLUB[B.club][0] : '#2a3480';
      let gr = g.createLinearGradient(0, 0, W / 2, 0); gr.addColorStop(0, ca); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = .45; g.fillStyle = gr; g.fillRect(0, 0, W / 2, 620);
      gr = g.createLinearGradient(W, 0, W / 2, 0); gr.addColorStop(0, cb); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(W / 2, 0, W / 2, 620); g.globalAlpha = 1;
      fill(g, 'HEAD TO HEAD', W / 2, 100, TEKO(56), '#ffffff');
      const ia = imgs.get(A.id), ib = imgs.get(B.id);
      if (ia) g.drawImage(ia, 120, 150, 220, 253); if (ib) g.drawImage(ib, W - 340, 150, 220, 253);
      fill(g, 'V', W / 2, 330, TEKO(150), '#ffbf1f');
      fill(g, A.name.toUpperCase(), 230, 480, TEKO(80), '#ffbf1f', 'center', 400); fill(g, B.name.toUpperCase(), W - 230, 480, TEKO(80), '#33d6ff', 'center', 400);
      fill(g, A.team, 230, 520, ARCH(24), 'rgba(255,255,255,.75)', 'center', 400); fill(g, B.team, W - 230, 520, ARCH(24), 'rgba(255,255,255,.75)', 'center', 400);
      fill(g, `${Math.abs(A.total - B.total)} POINTS APART`, W / 2, 600, TEKO(52), '#ffffff');
      rows.forEach(([k, va, vb, hi], i) => {
        const y = 690 + i * 86;
        g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(90, y - 58, W - 180, 74);
        const aw = hi ? va > vb : va < vb, bw = hi ? vb > va : vb < va;
        fill(g, String(va), 140, y, TEKO(64), aw ? '#ffbf1f' : '#ffffff', 'left');
        fill(g, k.toUpperCase(), W / 2, y - 6, TEKO(40), 'rgba(255,255,255,.7)');
        fill(g, String(vb), W - 140, y, TEKO(64), bw ? '#33d6ff' : '#ffffff', 'right');
      });
      footer(g, W, H);
    }, `${A.name}-v-${B.name}.png`, `${A.name} v ${B.name}`);
  }
  async function shareAwards() {
    const gw = +$('award-gw').value;
    const list = D.awards.filter((a) => a.gw === gw);
    const order = ['motw', 'spoon', 'cap_hero', 'cap_fail', 'bench', 'transfer_best', 'transfer_worst', 'hit_backfired'];
    const groups = order.map((k) => list.filter((a) => a.award === k)).filter((x) => x.length);
    const imgs = await crestImages([...new Set(list.map((a) => a.id))].map((id) => M.get(id)).filter(Boolean));
    shareImage((g, W, H) => {
      stadium(g, W, H, '#1b2370', '#070a1f');
      title(g, W, `GAMEWEEK ${gw}`, 'THE AWARDS');
      const rh = Math.min(118, 940 / Math.max(1, groups.length));
      groups.forEach((grp, i) => {
        const y = 280 + i * rh, good = GOOD.has(grp[0].award);
        g.fillStyle = good ? 'rgba(255,191,31,.14)' : 'rgba(255,61,110,.12)'; g.fillRect(60, y, W - 120, rh - 12);
        g.fillStyle = good ? '#ffbf1f' : '#ff3d6e'; g.fillRect(60, y, 10, rh - 12);
        const names = grp.map((a) => M.get(a.id)?.name).filter(Boolean);
        const shown = grp.slice(0, 4);
        shown.forEach((a, j) => { const im = imgs.get(a.id); if (im) g.drawImage(im, 92 + j * 46, y + (rh - 12) / 2 - 34, 59, 68); });
        const tx = 92 + Math.min(4, shown.length) * 46 + 44;
        fill(g, grp[0].label.toUpperCase(), tx, y + rh * .38, TEKO(40), good ? '#ffbf1f' : '#ff3d6e', 'left', W - tx - 80);
        fill(g, names.length > 3 ? `${names.length} MANAGERS` : names.join(' & ').toUpperCase(), tx, y + rh * .7, TEKO(50), '#ffffff', 'left', W - tx - 260);
        fill(g, names.length > 3 ? grp[0].text : grp[0].text, W - 90, y + rh * .7, ARCH(22, 600), 'rgba(255,255,255,.7)', 'right', 300);
      });
      footer(g, W, H);
    }, `awards-gw${gw}.png`, `GW${gw} awards`);
  }
  async function shareFixture(f, items) {
    const ownerIds = new Set(); items.forEach((it) => ownersOf(it.el).forEach((o) => ownerIds.add(o.m.id)));
    const imgs = await crestImages([...ownerIds].map((id) => M.get(id)));
    shareImage((g, W, H) => {
      stadium(g, W, H, '#1b2370', '#070a1f');
      const ch = CLUB[f.h] ? CLUB[f.h][0] : '#333', ca = CLUB[f.a] ? CLUB[f.a][0] : '#333';
      g.fillStyle = ch; g.globalAlpha = .55; g.fillRect(0, 60, W / 2, 230); g.fillStyle = ca; g.fillRect(W / 2, 60, W / 2, 230); g.globalAlpha = 1;
      fill(g, (CLUB[f.h] || [, f.h])[1].toUpperCase(), 225, 200, TEKO(80), '#ffffff', 'center', 300);
      fill(g, (CLUB[f.a] || [, f.a])[1].toUpperCase(), W - 225, 200, TEKO(80), '#ffffff', 'center', 300);
      g.fillStyle = 'rgba(3,4,13,.75)'; g.fillRect(W / 2 - 120, 90, 240, 170);
      fill(g, `${f.hs ?? 0}-${f.as_ ?? 0}`, W / 2, 210, TEKO(130), '#ffffff');
      fill(g, f.done ? 'FULL TIME' : `${f.mins}'`, W / 2, 248, ARCH(24, 800), f.done ? '#9aa3d6' : '#ff2448');
      const owned = items.filter((it) => ownersOf(it.el).length).slice(0, 7);
      const rows = owned.length ? owned : items.slice(0, 7);
      rows.forEach((it, i) => {
        const y = 340 + i * 118, o = ownersOf(it.el);
        g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(60, y, W - 120, 104);
        fill(g, it.ico, 110, y + 66, TEKO(52), it.cls === 'bonus' ? '#ffbf1f' : ['red', 'pen_miss', 'own_goal'].includes(it.cls) ? '#ff3d6e' : '#22e6a8');
        fill(g, it.text.toUpperCase(), 170, y + 50, TEKO(46), '#ffffff', 'left', W - 260);
        if (o.length) {
          const caps = o.filter((x) => x.cap).length;
          const who = o.map((x) => x.m.name + (x.cap ? ' (C)' : '')).join(', ');
          fill(g, `Owned by ${o.length}${caps ? `, captained by ${caps}` : ''}: ${who}`, 170, y + 86, ARCH(22, 600), 'rgba(255,255,255,.75)', 'left', W - 260 - Math.min(5, o.length) * 46);
          o.slice(0, 5).forEach((x, j) => { const im = imgs.get(x.m.id); if (im) g.drawImage(im, W - 80 - (Math.min(5, o.length) - j) * 46, y + 18, 42, 48); });
        } else fill(g, 'Nobody in the league owns him', 170, y + 86, ARCH(22, 600), 'rgba(255,255,255,.5)', 'left');
      });
      footer(g, W, H);
    }, `${f.h}-${f.a}.png`, `${f.h} ${f.hs}-${f.as_} ${f.a}`, Math.max(760, 340 + Math.min(7, items.filter((it) => ownersOf(it.el).length).length || Math.min(7, items.length)) * 118 + 170));
  }
  async function shareFdr() {
    const next = D.fixtures.filter((f) => f.gw >= (D.meta.next_gw || D.meta.gw));
    const gws = [...new Set(next.map((f) => f.gw))].sort((a, b) => a - b).slice(0, 6);
    const clubs = Object.keys(CLUB).filter((c) => D.pltable.some((t) => t.team === c));
    const rows = clubs.map((c) => { const cells = gws.map((x) => next.filter((f) => f.gw === x && (f.h === c || f.a === c)).map((f) => (f.h === c ? { o: f.a, home: true, d: f.hd } : { o: f.h, home: false, d: f.ad }))); return { c, cells, score: cells.flat().reduce((a, f) => a + f.d, 0) / Math.max(1, cells.flat().length) }; }).sort((a, b) => a.score - b.score);
    const FDR = { 2: '#1f8f63', 3: '#3b4475', 4: '#a3304e', 5: '#d1214f' };
    shareImage((g, W, H) => {
      stadium(g, W, H, '#1b2370', '#070a1f');
      title(g, W, `GAMEWEEKS ${gws[0]}–${gws[gws.length - 1]}`, 'FIXTURE SWING');
      fill(g, 'Easiest run at the top. Capitals are home games.', W / 2, 268, ARCH(24, 600), 'rgba(255,255,255,.7)');
      const top = 340, rh = 43, x0 = 70, cw = (W - 140 - 120) / gws.length;
      gws.forEach((x, i) => fill(g, `GW${x}`, x0 + 120 + cw * (i + .5), top - 14, TEKO(34), 'rgba(255,255,255,.7)'));
      rows.forEach((r, i) => {
        const y = top + i * rh;
        g.fillStyle = CLUB[r.c][0]; g.fillRect(x0, y + 4, 106, rh - 8);
        fill(g, r.c, x0 + 53, y + 32, TEKO(34), '#ffffff');
        r.cells.forEach((fx, j) => {
          const d = fx.length ? Math.round(fx.reduce((a, f) => a + f.d, 0) / fx.length) : 3;
          g.fillStyle = fx.length ? FDR[d] || FDR[3] : 'rgba(255,255,255,.08)'; g.fillRect(x0 + 120 + cw * j + 3, y + 4, cw - 6, rh - 8);
          fill(g, fx.length ? fx.map((f) => (f.home ? f.o : f.o.toLowerCase())).join('+') : 'BLANK', x0 + 120 + cw * (j + .5), y + 31, TEKO(30), '#ffffff', 'center', cw - 10);
        });
      });
      footer(g, W, H);
    }, `fixture-swing.png`, 'Fixture swing');
  }
  $('share-table').addEventListener('click', busy($('share-table'), shareTable));
  $('share-h2h').addEventListener('click', busy($('share-h2h'), shareH2H));
  $('share-awards').addEventListener('click', busy($('share-awards'), shareAwards));
  $('share-fdr').addEventListener('click', busy($('share-fdr'), shareFdr));

  // ---------- me picker ----------
  function openSheet() {
    const list = $('sheet-list'); list.replaceChildren();
    D.managers.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((m) => list.append(
      h('button', { type: 'button', onclick: () => { me = m.id; store.set(ME_KEY, String(m.id)); closeSheet(); renderAll(); maybeWrapped(); } }, crest(m), h('b', { text: m.name }), h('span', { text: m.team }))));
    $('sheet').hidden = false;
  }
  function closeSheet() { $('sheet').hidden = true; store.set(ME_KEY + '-asked', '1'); }
  $('me-chip').addEventListener('click', () => D && openSheet());
  $('sheet-skip').addEventListener('click', () => { me = null; store.set(ME_KEY, ''); closeSheet(); renderAll(); });
  $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

  // ---------- routing ----------
  const VIEWS = ['table', 'match', 'awards', 'fans', 'rivals', 'squads'];
  function route() {
    const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'table';
    VIEWS.forEach((x) => { $(x).hidden = x !== v || !D; });
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === v));
    if (D) { if (v === 'table') buildReplay(); if (v === 'rivals') drawRivals(); }
  }
  window.addEventListener('hashchange', () => { tip.hidden = true; stopReplay(); route(); window.scrollTo(0, 0); });

  function renderAll() {
    M = new Map(D.managers.map((m) => [m.id, m]));
    if (me != null && !M.has(me)) me = null;
    renderHeader(); renderTable(); renderWrappedCta(); renderMatch(); renderAwards(); renderFans(); renderCards(); renderRivals(); renderSquads(); route();
  }

  async function load(first) {
    try {
      const r = await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      const live = data.meta.app_version;
      if (APP_V !== '__' + 'V__' && live && live !== APP_V) {
        let done = false; try { done = sessionStorage.getItem(`${NS}-reload`) === live; sessionStorage.setItem(`${NS}-reload`, live); } catch (e) { /* ignore */ }
        if (!done) { location.replace(`${location.pathname}?v=${live}${location.hash}`); return; }
      }
      if (D && data.meta.hash === D.meta.hash) return;
      D = data;
      $('loading').hidden = true; $('error').hidden = true;
      renderAll();
      if (first) playIntro(() => { if (!store.get(ME_KEY + '-asked')) openSheet(); else maybeWrapped(); });
    } catch (e) {
      if (!D) { $('loading').hidden = true; $('error').hidden = false; }
    }
  }
  const saved = store.get(ME_KEY);
  me = saved ? +saved : null;
  load(true);
  setInterval(tick, 30000);
  setInterval(() => { if (document.visibilityState === 'visible') load(false); }, 120000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(false); });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (D) { buildReplay(); drawRivals(); } }, 200); });
})();
