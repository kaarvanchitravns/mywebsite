/* KAARVAN Toll Meter: any city to any city.
   Data in assets/toll/: cities.csv (GeoNames, CC BY 4.0), plazas_all.csv (plaza positions and fares), meta.json.
   1. The user picks From and To from the city list.
   2. A routing service returns the road route between them (meta.json "router").
   3. Every plaza within MATCH_M metres of that route is on the trip, in route order.
   4. Plazas with a checked fare (counted=1) are added up; the rest are listed as "fare not available". */
(function () {
  'use strict';

  var BASE = '../assets/toll/';
  var CLASSES = ['car', 'lcv', 'bus_2axle', 'axle3', 'axle4to6', 'axle7plus'];
  var TRIPS = ['single', 'return'];
  var MATCH_M = 150;   // tuned on the hand-checked lanes: real plazas sat 3-94 m from the route, false ones 200 m+
  var R = 6371000;

  function parseCSV(text) {
    var rows = [], row = [], field = '', q = false, i, c;
    text = text.replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') { q = false; }
        else { field += c; }
      } else if (c === '"') { q = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.join('').trim() !== '') rows.push(row);
        row = [];
      } else { field += c; }
    }
    row.push(field);
    if (row.join('').trim() !== '') rows.push(row);
    var head = (rows.shift() || []).map(function (h) { return h.trim(); });
    return rows.map(function (r) {
      var o = {};
      head.forEach(function (h, k) { o[h] = (r[k] || '').trim(); });
      return o;
    });
  }

  function prepPlazas(rows) {
    return rows.map(function (p) {
      p.lat = Number(p.lat); p.lng = Number(p.lng); p.counted = p.counted === '1';
      return p;
    }).filter(function (p) { return isFinite(p.lat) && isFinite(p.lng) && p.lat !== 0; });
  }

  /* Plazas on a route. line = [[lat, lng], ...]. Returns [{plaza, along_m, off_m}] in route order. */
  function matchPlazas(line, plazas) {
    if (!line || line.length < 2) return [];
    var minLa = 90, maxLa = -90, minLo = 180, maxLo = -180, i;
    for (i = 0; i < line.length; i++) {
      minLa = Math.min(minLa, line[i][0]); maxLa = Math.max(maxLa, line[i][0]);
      minLo = Math.min(minLo, line[i][1]); maxLo = Math.max(maxLo, line[i][1]);
    }
    var pad = 0.01, lat0 = (minLa + maxLa) / 2, kx = Math.cos(lat0 * Math.PI / 180) * R * Math.PI / 180, ky = R * Math.PI / 180;
    var pts = line.map(function (p) { return [p[1] * kx, p[0] * ky]; });
    var cum = [0];
    for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    var out = [];
    plazas.forEach(function (p) {
      if (p.lat < minLa - pad || p.lat > maxLa + pad || p.lng < minLo - pad || p.lng > maxLo + pad) return;
      var qx = p.lng * kx, qy = p.lat * ky, best = Infinity, along = 0;
      for (var j = 1; j < pts.length; j++) {
        var x1 = pts[j - 1][0], y1 = pts[j - 1][1], dx = pts[j][0] - x1, dy = pts[j][1] - y1, l2 = dx * dx + dy * dy;
        // quick reject: segment box more than MATCH_M away
        if (qx < Math.min(x1, x1 + dx) - MATCH_M || qx > Math.max(x1, x1 + dx) + MATCH_M ||
            qy < Math.min(y1, y1 + dy) - MATCH_M || qy > Math.max(y1, y1 + dy) + MATCH_M) continue;
        var t = l2 > 0 ? Math.max(0, Math.min(1, ((qx - x1) * dx + (qy - y1) * dy) / l2)) : 0;
        var d = Math.hypot(qx - (x1 + t * dx), qy - (y1 + t * dy));
        if (d < best) { best = d; along = cum[j - 1] + t * Math.sqrt(l2); }
      }
      if (best <= MATCH_M) out.push({ plaza: p, along_m: along, off_m: best });
    });
    out.sort(function (a, b) { return a.along_m - b.along_m; });
    return out;
  }

  /* Toll for matched plazas, one vehicle class and trip type. */
  function estimate(hits, km, cls, trip) {
    if (CLASSES.indexOf(cls) < 0 || TRIPS.indexOf(trip) < 0) return null;
    var total = 0, missing = 0;
    var items = hits.map(function (h) {
      var p = h.plaza, f = p.counted ? Number(p[cls + '_' + trip]) : NaN;
      if (isFinite(f)) total += f; else missing++;
      return { plaza: p, fare: isFinite(f) ? f : null };
    });
    return { items: items, total: total, missing: missing, km: km };
  }

  window.kvToll = { parseCSV: parseCSV, matchPlazas: matchPlazas, estimate: estimate, CLASSES: CLASSES, TRIPS: TRIPS, MATCH_M: MATCH_M };

  /* ---------------- routing ---------------- */
  // "relay": KAARVAN's relay (Cloudflare Worker) in front of OpenRouteService truck routing; the API key stays there.
  // "osrm-demo": public OSRM demo server, car profile. For testing on this computer only (its terms forbid production use).
  function getRoute(router, a, b) {
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    var provider = local && router.local ? router.local : router.provider;   // "local": router used when testing on this computer
    if (provider === 'osrm-demo') {
      if (!local) return Promise.reject(new Error('The route service is not set up yet.'));
      var u = 'https://router.project-osrm.org/route/v1/driving/' + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat +
              '?overview=full&geometries=geojson';
      return fetch(u).then(function (r) { if (!r.ok) throw new Error('route ' + r.status); return r.json(); }).then(function (j) {
        if (!j.routes || !j.routes.length) throw new Error('no route');
        return { km: j.routes[0].distance / 1000, line: j.routes[0].geometry.coordinates.map(function (c) { return [c[1], c[0]]; }) };
      });
    }
    if (provider === 'relay' && router.url) {
      var q = router.url + (router.url.indexOf('?') < 0 ? '?' : '&') + 'from=' + a.lng.toFixed(4) + ',' + a.lat.toFixed(4) +
              '&to=' + b.lng.toFixed(4) + ',' + b.lat.toFixed(4);
      return fetch(q).then(function (r) { if (!r.ok) throw new Error('route ' + r.status); return r.json(); }).then(function (j) {
        if (!j.coordinates || j.coordinates.length < 2) throw new Error('no route');
        return { km: j.distance_m / 1000, line: j.coordinates.map(function (c) { return [c[1], c[0]]; }) };
      });
    }
    return Promise.reject(new Error('The route service is not set up yet.'));
  }

  /* ---------------- page wiring ---------------- */
  var app = document.getElementById('tollApp');
  if (!app) return;

  var $ = function (id) { return document.getElementById(id); };
  var inr = function (n) { return '₹' + Math.round(n).toLocaleString('en-IN'); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  function fail(msg) {
    var e = $('tollError');
    e.textContent = msg;
    e.hidden = false;
    $('tollResultBody').hidden = true;
  }
  function note(msg) {
    var e = $('tollError');
    if (msg) { e.textContent = msg; e.hidden = false; } else { e.hidden = true; }
  }

  function get(name) {
    return fetch(BASE + name, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(name + ' could not be loaded (' + r.status + ')');
      return r.text();
    });
  }

  if (window.location.protocol === 'file:' && !window.__TOLL_DATA) {
    fail('Open this page through a web server to load toll data.');
    return;
  }

  Promise.all([get('cities.csv'), get('plazas_all.csv'), get('meta.json')]).then(function (t) {
    var cities = parseCSV(t[0]).map(function (c) {
      return { name: c.name, state: c.state, lat: Number(c.lat), lng: Number(c.lng), pop: Number(c.pop) || 0,
               key: norm(c.name), alt: norm((c.alt || '').split('|').join(' ')) };
    });
    var plazas = prepPlazas(parseCSV(t[1]));
    var meta = JSON.parse(t[2]);
    window.kvToll.data = { cities: cities, plazas: plazas, meta: meta };
    if (!cities.length || !plazas.length) { fail('Toll data is empty, so no fares are shown.'); return; }
    init(cities, plazas, meta);
  }).catch(function (err) { fail('Toll data could not be loaded. ' + err.message); });

  /* Type-to-search box over the city list (WAI-ARIA combobox). Shows the best 8 matches. */
  function combo(inp, cities, onPick) {
    var lid = inp.id + 'List';
    inp.setAttribute('role', 'combobox');
    inp.setAttribute('aria-autocomplete', 'list');
    inp.setAttribute('aria-expanded', 'false');
    inp.setAttribute('aria-controls', lid);
    var list = document.createElement('ul');
    list.id = lid;
    list.className = 'toll-combo__list';
    list.setAttribute('role', 'listbox');
    var lab = document.querySelector('label[for="' + inp.id + '"]');
    if (lab) list.setAttribute('aria-label', lab.textContent);
    list.hidden = true;
    inp.parentNode.classList.add('toll-combo');
    inp.parentNode.appendChild(list);

    var chosen = null, shown = [], active = -1;
    var top = cities.slice().sort(function (a, b) { return b.pop - a.pop; }).slice(0, 8);
    function label(c) { return c ? c.name : ''; }
    function sync() { inp.value = label(chosen); }
    function close() {
      list.hidden = true;
      inp.setAttribute('aria-expanded', 'false');
      inp.removeAttribute('aria-activedescendant');
      active = -1;
    }
    function hl(text, q) {
      var i = q ? text.toLowerCase().indexOf(q) : -1;
      if (i < 0) return esc(text);
      return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
    }
    function setActive(n) {
      var items = list.querySelectorAll('li[data-n]');
      if (!items.length) { active = -1; return; }
      active = Math.max(0, Math.min(items.length - 1, n));
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('is-active', i === active);
      inp.setAttribute('aria-activedescendant', items[active].id);
      items[active].scrollIntoView({ block: 'nearest' });
    }
    function search(q) {
      if (!q) return top;
      var res = [];
      for (var i = 0; i < cities.length; i++) {
        var c = cities[i];
        // exact name first, then an exact old/other name (Kashi -> Varanasi before Kashipur), then prefix matches
        var rank = c.key === q ? -2 : (' ' + c.alt + ' ').indexOf(' ' + q + ' ') >= 0 ? -1 : c.key.indexOf(q) === 0 ? 0 : (' ' + c.key).indexOf(' ' + q) >= 0 ? 1 :
                   (' ' + c.alt).indexOf(' ' + q) >= 0 ? 2 : (q.length >= 3 && c.key.indexOf(q) >= 0) ? 3 : null;
        if (rank !== null) res.push({ c: c, rank: rank });
      }
      res.sort(function (a, b) { return a.rank - b.rank || b.c.pop - a.c.pop; });
      return res.slice(0, 8).map(function (r) { return r.c; });
    }
    function open(all) {
      var q = all ? '' : norm(inp.value), raw = all ? '' : inp.value.trim().toLowerCase();
      shown = search(q);
      if (!shown.length) {
        list.innerHTML = '<li class="toll-combo__none"><b>No city or town called &ldquo;' + esc(inp.value.trim()) +
          '&rdquo; found.</b> Check the spelling, or try the nearest larger town.</li>';
      } else {
        list.innerHTML = shown.map(function (c, n) {
          return '<li role="option" id="' + lid + n + '" data-n="' + n + '" aria-selected="' + (c === chosen) + '">' +
            '<span>' + hl(c.name, raw) + '</span><small>' + esc(c.state) + '</small></li>';
        }).join('');
      }
      list.hidden = false;
      inp.setAttribute('aria-expanded', 'true');
      var start = 0;
      if (all) for (var j = 0; j < shown.length; j++) if (shown[j] === chosen) start = j;
      setActive(start);
    }
    function pick(n) {
      var c = shown[n];
      close();
      if (!c) { sync(); return; }
      var changed = c !== chosen;
      chosen = c;
      sync();
      if (onPick) onPick(changed);
    }

    inp.addEventListener('focus', function () { inp.select(); open(!chosen || inp.value === label(chosen)); });
    inp.addEventListener('click', function () { if (list.hidden) open(true); });
    inp.addEventListener('input', function () { open(false); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) open(true); else setActive(active + (e.key === 'ArrowDown' ? 1 : -1));
      } else if (e.key === 'Enter') {
        if (!list.hidden) { e.preventDefault(); pick(active); }
      } else if (e.key === 'Escape') {
        close(); sync();
      }
    });
    inp.addEventListener('blur', function () {
      if (list.hidden) return;
      var t = norm(inp.value);
      // leaving the box picks the top suggestion only if what was typed clearly points to it
      if (t && shown.length && (shown.length === 1 || shown[0].key === t)) pick(0);
      else { close(); sync(); }
    });
    list.addEventListener('mousedown', function (e) {
      e.preventDefault(); // keep focus in the box
      var li = e.target.closest('li[data-n]');
      if (li) pick(+li.getAttribute('data-n'));
    });

    return { get: function () { return chosen; }, focus: function () { inp.focus(); } };
  }

  function init(cities, plazas, meta) {
    var trips = $('tollTrips');
    if (meta.status !== 'live') $('tollSample').hidden = false;
    var router = meta.router || {};
    var route = null, routeKey = '', seq = 0;

    var toBox, fromBox = combo($('tollFromBox'), cities, function (changed) { if (changed) { route = null; go(); } if (!toBox.get()) toBox.focus(); });
    toBox = combo($('tollToBox'), cities, function (changed) { if (changed) { route = null; go(); } });

    function val(name) { var el = app.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }

    function blank(msg) {
      $('tollTotal').textContent = '–';
      $('tollMeta').textContent = msg;
      $('tollPerKm').textContent = '–';
      $('tollMonthly').textContent = '–';
      $('tollList').innerHTML = '';
      $('tollMissing').hidden = true;
    }

    function render() {
      if (!route) return;
      var res = estimate(route.hits, route.km, val('tollClass'), val('tollTrip'));
      if (!res) return;
      var n = Math.max(0, Math.min(500, Math.round(Number(trips.value) || 0)));
      var hw = [];
      res.items.forEach(function (x) { var h = x.plaza.highway; if (h && hw.indexOf(h) < 0) hw.push(h); });
      $('tollTotal').textContent = inr(res.total);
      $('tollMeta').textContent = res.items.length + (res.items.length === 1 ? ' plaza' : ' plazas') + ' · about ' +
        Math.round(res.km) + ' km' + (hw.length ? ' · via ' + hw.slice(0, 3).join(', ') : '');
      $('tollPerKm').textContent = res.km > 0 ? '₹' + (res.total / res.km).toFixed(2) : '–';
      $('tollMonthly').textContent = inr(res.total * n);
      $('tollMonthlyLbl').textContent = 'Monthly (' + n + (val('tollTrip') === 'return' ? ' round trips)' : ' trips)');
      var miss = $('tollMissing');
      if (res.missing) {
        miss.textContent = 'The total leaves out ' + res.missing + (res.missing === 1 ? ' plaza' : ' plazas') +
          ' with no published fare. Check those at the plaza.';
        miss.hidden = false;
      } else { miss.hidden = true; }
      $('tollList').innerHTML = res.items.length ? res.items.map(function (x) {
        var p = x.plaza;
        return '<li' + (x.fare === null ? ' class="nofare"' : '') + '><div class="nm"><span>' + esc(p.plaza_name) + '</span><b>' +
          (x.fare === null ? 'Not available' : inr(x.fare)) + '</b></div><div class="sub">' +
          esc([p.highway, p.state, x.fare === null ? (p.note || 'Fare not available') : ''].filter(Boolean).join(' · ')) + '</div></li>';
      }).join('') : '<li class="none"><div class="nm"><span>No toll plaza found on this route.</span></div></li>';
    }

    function go() {
      var a = fromBox.get(), b = toBox.get();
      note('');
      if (!a || !b) { blank('Pick From and To to see the toll.'); return; }
      if (a === b) { route = null; blank('From and To are the same place. Pick a different To.'); return; }
      var key = a.lat + ',' + a.lng + ';' + b.lat + ',' + b.lng;
      if (route && routeKey === key) { render(); return; }
      var my = ++seq;
      blank('Finding the route from ' + a.name + ' to ' + b.name + '…');
      app.setAttribute('aria-busy', 'true');
      getRoute(router, a, b).then(function (r) {
        if (my !== seq) return;
        route = { km: r.km, hits: matchPlazas(r.line, plazas) };
        routeKey = key;
        app.removeAttribute('aria-busy');
        render();
      }).catch(function (err) {
        if (my !== seq) return;
        app.removeAttribute('aria-busy');
        route = null;
        blank('');
        note('Toll Meter could not find a road route from ' + a.name + ' to ' + b.name + ' right now. ' +
             (/set up/.test(err.message) ? err.message : 'Please try again in a minute.'));
      });
    }

    trips.addEventListener('input', render);
    app.querySelectorAll('input[type="radio"]').forEach(function (el) { el.addEventListener('change', render); });
    blank('Pick From and To to see the toll.');
    app.setAttribute('data-ready', '1');
  }
})();
