/* KAARVAN toll estimator.
   Reads three CSV files from assets/toll/ (routes, plazas, route_plazas) plus meta.json.
   To update fares, replace the CSV files. No build step is needed. */
(function () {
  'use strict';

  var BASE = '../assets/toll/';
  var CLASSES = ['car', 'lcv', 'bus_2axle', 'axle3', 'axle4to6', 'axle7plus'];
  var TRIPS = ['single', 'return'];

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

  /* Checks the data and returns a list of problems. Any problem stops the tool from showing fares. */
  function validate(routes, plazas, links) {
    var errs = [], plazaById = {}, routeById = {};
    plazas.forEach(function (p) {
      if (!p.plaza_id) { errs.push('Plaza row without plaza_id'); return; }
      if (plazaById[p.plaza_id]) errs.push('Duplicate plaza_id ' + p.plaza_id);
      plazaById[p.plaza_id] = p;
      CLASSES.forEach(function (c) {
        TRIPS.forEach(function (t) {
          var col = c + '_' + t, v = p[col];
          if (v === undefined || v === '' || !/^\d+(\.\d+)?$/.test(v)) errs.push('Plaza ' + p.plaza_id + ': ' + col + ' is not a number ("' + (v || '') + '")');
        });
      });
    });
    routes.forEach(function (r) {
      if (!r.route_id) { errs.push('Route row without route_id'); return; }
      if (routeById[r.route_id]) errs.push('Duplicate route_id ' + r.route_id);
      routeById[r.route_id] = r;
      if (!r.from_city || !r.to_city) errs.push('Route ' + r.route_id + ': from_city and to_city are required');
      if (!/^\d+(\.\d+)?$/.test(r.distance_km || '')) errs.push('Route ' + r.route_id + ': distance_km is not a number');
    });
    var seen = {};
    links.forEach(function (l) {
      if (!routeById[l.route_id]) errs.push('route_plazas: unknown route_id ' + l.route_id);
      if (!plazaById[l.plaza_id]) errs.push('route_plazas: unknown plaza_id ' + l.plaza_id + ' on ' + l.route_id);
      if (!/^\d+$/.test(l.stop_order || '')) errs.push('route_plazas: stop_order not a whole number on ' + l.route_id);
      var k = l.route_id + '#' + l.stop_order;
      if (seen[k]) errs.push('route_plazas: stop_order ' + l.stop_order + ' used twice on ' + l.route_id);
      seen[k] = 1;
    });
    routes.forEach(function (r) {
      if (r.route_id && !links.some(function (l) { return l.route_id === r.route_id; })) errs.push('Route ' + r.route_id + ' has no toll plazas listed');
    });
    return { errors: errs, plazaById: plazaById, routeById: routeById };
  }

  function buildModel(routes, plazas, links, meta) {
    var v = validate(routes, plazas, links);
    var stops = {};
    links.forEach(function (l) { (stops[l.route_id] = stops[l.route_id] || []).push(l); });
    Object.keys(stops).forEach(function (k) { stops[k].sort(function (a, b) { return +a.stop_order - +b.stop_order; }); });
    return { routes: routes, plazaById: v.plazaById, routeById: v.routeById, stops: stops, meta: meta || {}, errors: v.errors };
  }

  /* Total toll for one route, vehicle class and trip type. Returns null if the route is unknown. */
  function estimate(model, routeId, cls, trip) {
    var route = model.routeById[routeId];
    if (!route || CLASSES.indexOf(cls) < 0 || TRIPS.indexOf(trip) < 0) return null;
    var items = (model.stops[routeId] || []).map(function (l) {
      var p = model.plazaById[l.plaza_id];
      return { plaza: p, fare: Number(p[cls + '_' + trip]) };
    });
    var total = items.reduce(function (s, x) { return s + x.fare; }, 0);
    return { route: route, items: items, total: total, km: Number(route.distance_km) };
  }

  window.kvToll = { parseCSV: parseCSV, validate: validate, buildModel: buildModel, estimate: estimate, CLASSES: CLASSES, TRIPS: TRIPS };

  /* ---------------- page wiring ---------------- */
  var app = document.getElementById('tollApp');
  if (!app) return;

  var $ = function (id) { return document.getElementById(id); };
  var inr = function (n) { return '₹' + Math.round(n).toLocaleString('en-IN'); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function fail(msg) {
    var e = $('tollError');
    e.textContent = msg;
    e.hidden = false;
    $('tollResultBody').hidden = true;
  }

  function get(name) {
    return fetch(BASE + name, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(name + ' could not be loaded (' + r.status + ')');
      return r.text();
    });
  }

  if (window.location.protocol === 'file:') {
    fail('Open this page through a web server to load toll data.');
    return;
  }

  Promise.all([get('routes.csv'), get('plazas.csv'), get('route_plazas.csv'), get('meta.json')]).then(function (t) {
    var model = buildModel(parseCSV(t[0]), parseCSV(t[1]), parseCSV(t[2]), JSON.parse(t[3]));
    window.kvToll.model = model;
    if (model.errors.length) {
      fail('Toll data has ' + model.errors.length + ' problem(s), so no fares are shown. First: ' + model.errors[0]);
      return;
    }
    init(model);
  }).catch(function (err) { fail('Toll data could not be loaded. ' + err.message); });

  // Old or other names people type for route cities.
  var ALIAS = { Bengaluru: 'Bangalore', Mumbai: 'Bombay', Belagavi: 'Belgaum', Delhi: 'New Delhi NCR Gurgaon', Pune: 'Poona' };

  // Type-to-search box laid over a <select>. The select stays (hidden) as the source of truth,
  // so the fare code reads it exactly as before. Follows the WAI-ARIA combobox pattern.
  function combo(sel, onPick, lead) {
    var lid = sel.id + 'List';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.id = sel.id + 'Box';
    inp.className = 'toll-combo__in';
    inp.placeholder = 'Type a city';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.setAttribute('autocapitalize', 'words');
    inp.setAttribute('role', 'combobox');
    inp.setAttribute('aria-autocomplete', 'list');
    inp.setAttribute('aria-expanded', 'false');
    inp.setAttribute('aria-controls', lid);
    var list = document.createElement('ul');
    list.id = lid;
    list.className = 'toll-combo__list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    var field = sel.parentNode, lab = field.querySelector('label[for="' + sel.id + '"]');
    if (lab) { lab.htmlFor = inp.id; list.setAttribute('aria-label', lab.textContent); }
    field.classList.add('toll-combo');
    sel.hidden = true;
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    field.insertBefore(inp, sel);
    field.insertBefore(list, sel);

    var shown = [], active = -1;
    function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
    function current() { var o = sel.options[sel.selectedIndex]; return o ? o.text : ''; }
    function sync() { inp.value = current(); }
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
    function open(all) {
      var q = all ? '' : norm(inp.value), raw = all ? '' : inp.value.trim().toLowerCase();
      shown = [];
      for (var i = 0; i < sel.options.length; i++) {
        var o = sel.options[i], name = norm(o.text), k = norm(o.text + ' ' + (o.getAttribute('data-k') || ''));
        var rank = !q ? 0 : name.indexOf(q) === 0 ? 0 : (' ' + k).indexOf(' ' + q) >= 0 ? 1 : k.indexOf(q) >= 0 ? 2 : -1;
        if (rank >= 0) shown.push({ i: i, o: o, rank: rank });
      }
      shown.sort(function (a, b) { return a.rank - b.rank || a.i - b.i; });
      if (!shown.length) {
        var names = [];
        for (var c = 0; c < sel.options.length; c++) names.push(sel.options[c].text);
        list.innerHTML = '<li class="toll-combo__none"><b>No Toll Meter route for &ldquo;' + esc(inp.value.trim()) +
          '&rdquo; yet.</b> ' + esc(lead ? lead() : 'Toll Meter covers these cities for now') + ': ' + esc(names.join(', ')) + '.</li>';
      } else {
        list.innerHTML = shown.map(function (s, n) {
          return '<li role="option" id="' + lid + n + '" data-n="' + n + '" aria-selected="' + (s.i === sel.selectedIndex) + '">' +
            hl(s.o.text, raw) + '</li>';
        }).join('');
      }
      list.hidden = false;
      inp.setAttribute('aria-expanded', 'true');
      var start = 0;
      if (all) for (var j = 0; j < shown.length; j++) if (shown[j].i === sel.selectedIndex) start = j;
      setActive(start);
    }
    function pick(n) {
      var s = shown[n];
      close();
      if (!s) { sync(); return; }
      if (sel.selectedIndex !== s.i) {
        sel.selectedIndex = s.i;
        sel.dispatchEvent(new Event('change'));
      }
      sync();
      if (onPick) onPick();
    }

    inp.addEventListener('focus', function () { inp.select(); open(true); });
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
      if (t && shown.length && (shown.length === 1 || norm(shown[0].o.text) === t)) pick(0);
      else { close(); sync(); }
    });
    list.addEventListener('mousedown', function (e) {
      e.preventDefault(); // keep focus in the box
      var li = e.target.closest('li[data-n]');
      if (li) pick(+li.getAttribute('data-n'));
    });

    return { sync: sync, focus: function () { inp.focus(); } };
  }

  function init(model) {
    var from = $('tollFrom'), to = $('tollTo'), trips = $('tollTrips');
    if (model.meta.status !== 'live') $('tollSample').hidden = false;
    var upd = $('tollUpdated'); if (upd) upd.textContent = model.meta.fares_updated || '';

    var cities = [], points = {};
    model.routes.forEach(function (r) {
      if (cities.indexOf(r.from_city) < 0) cities.push(r.from_city);
      points[r.from_city] = (points[r.from_city] || '') + ' ' + (r.from_point || '');
    });
    cities.sort();
    // data-k = extra words the type-to-search box also matches (start points, old city names)
    from.innerHTML = cities.map(function (c) {
      return '<option data-k="' + esc(points[c] + ' ' + (ALIAS[c] || '')) + '">' + esc(c) + '</option>';
    }).join('');

    function fillTo() {
      var list = model.routes.filter(function (r) { return r.from_city === from.value; });
      list.sort(function (a, b) { return a.to_city.localeCompare(b.to_city); });
      to.innerHTML = list.map(function (r) {
        return '<option value="' + esc(r.route_id) + '" data-k="' + esc(ALIAS[r.to_city] || '') + '">' + esc(r.to_city) +
          (r.to_point && r.to_point !== r.to_city ? ' (' + esc(r.to_point) + ')' : '') + '</option>';
      }).join('');
    }

    var toBox = combo(to, null, function () { return 'From ' + from.value + ', Toll Meter goes to'; });
    var fromBox = combo(from, function () { toBox.focus(); });

    function val(name) { var el = app.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }

    function render() {
      var res = estimate(model, to.value, val('tollClass'), val('tollTrip'));
      if (!res) return;
      var n = Math.max(0, Math.min(500, Math.round(Number(trips.value) || 0)));
      var r = res.route;
      $('tollTotal').textContent = inr(res.total);
      $('tollMeta').textContent = res.items.length + (res.items.length === 1 ? ' plaza' : ' plazas') + ' · ' + Math.round(res.km) + ' km' +
        (r.typical_hours ? ' · about ' + r.typical_hours + ' h' : '') + (r.highways_via ? ' · via ' + r.highways_via : '');
      $('tollPerKm').textContent = res.km > 0 ? '₹' + (res.total / res.km).toFixed(2) : '–';
      $('tollMonthly').textContent = inr(res.total * n);
      $('tollMonthlyLbl').textContent = 'Monthly (' + n + (val('tollTrip') === 'return' ? ' round trips)' : ' trips)');
      $('tollList').innerHTML = res.items.map(function (x) {
        var p = x.plaza;
        return '<li><div class="nm"><span>' + esc(p.plaza_name) + '</span><b>' + inr(x.fare) + '</b></div><div class="sub">' +
          esc([p.highway, p.state, p.km_marker ? 'km ' + p.km_marker : ''].filter(Boolean).join(' · ')) + '</div></li>';
      }).join('');
    }

    from.addEventListener('change', function () { fillTo(); toBox.sync(); render(); });
    to.addEventListener('change', render);
    trips.addEventListener('input', render);
    app.querySelectorAll('input[type="radio"]').forEach(function (el) { el.addEventListener('change', render); });
    fillTo();
    fromBox.sync();
    toBox.sync();
    render();
    app.setAttribute('data-ready', '1');
  }
})();
