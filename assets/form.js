/* KAARVAN forms.
   Every form carries data-endpoint (FormSubmit AJAX) and a mailto: action as
   the no-JavaScript fallback. We post JSON, keep the visitor on the page, and
   never clear what they typed unless it actually went. */
(function () {
  var EMAIL = 'sales@kaarvan.in';
  var forms = document.querySelectorAll('form[data-endpoint]');
  if (!forms.length) return;

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text) n.textContent = text;
    return n;
  }

  function show(box, kind, nodes) {
    box.className = 'form-status is-' + kind;
    while (box.firstChild) box.removeChild(box.firstChild);
    nodes.forEach(function (n) {
      box.appendChild(typeof n === 'string' ? document.createTextNode(n) : n);
    });
  }

  function collect(form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (f) {
      if (!f.name || f.name === 'website' || f.type === 'submit') return;
      if (f.type === 'checkbox') { out[f.name] = f.checked ? 'Yes' : 'No'; return; }
      var v = (f.value || '').trim();
      if (v) out[f.name] = v;
    });
    return out;
  }

  function mailtoHref(subject, d) {
    var body = Object.keys(d).map(function (k) {
      return k.replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }) + ': ' + d[k];
    }).join('\n');
    return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  Array.prototype.forEach.call(forms, function (form) {
    var box = form.querySelector('.form-status');
    var btn = form.querySelector('button[type="submit"]');
    var endpoint = (form.getAttribute('data-endpoint') || '').trim();
    var subject = form.getAttribute('data-subject') || 'KAARVAN website';
    var label = btn ? btn.textContent : 'Send';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.elements.website && form.elements.website.value) return;  // a bot filled the hidden field
      if (!form.checkValidity()) { form.reportValidity(); return; }

      var d = collect(form);
      var who = d.name ? ' from ' + d.name : '';

      if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Sending…'; }
      show(box, 'info', ['Sending…']);

      var body = { _subject: subject + who, _template: 'table', _captcha: 'false' };
      Object.keys(d).forEach(function (k) { body[k] = d[k]; });

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json().catch(function () { return {}; });
        })
        .then(function (res) {
          if (!res || (res.success !== true && res.success !== 'true')) throw new Error('not accepted');
          if (/activat|confirm/i.test(String(res.message || ''))) {
            show(box, 'info', [
              el('strong', {}, 'Not delivered yet. '),
              'The form service is waiting for the inbox to be confirmed. Please write to ',
              el('a', { href: 'mailto:' + EMAIL }, EMAIL),
              ', or ',
              el('a', { href: mailtoHref(subject + who, d) }, 'open an email with your details filled in'),
              '.'
            ]);
            return;
          }
          show(box, 'success', ['Thank you. This has reached the KAARVAN team and we will come back to you.']);
          form.reset();
        })
        .catch(function () {
          show(box, 'error', [
            'We could not send it. Nothing you typed has been lost. Please try again, or write to ',
            el('a', { href: 'mailto:' + EMAIL }, EMAIL),
            '.'
          ]);
        })
        .then(function () {
          if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = label; }
        });
    });
  });
})();
