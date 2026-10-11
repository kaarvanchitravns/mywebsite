(function(){
  var form = document.getElementById('kvContactForm');
  if(!form) return;
  var status = document.getElementById('kvStatus');
  var btn = document.getElementById('kvSubmitBtn');
  var EMAIL = 'sales@kaarvan.in';
  var endpoint = (form.getAttribute('data-endpoint') || '').trim();
  function el(tag, attrs, text){
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function(k){ n.setAttribute(k, attrs[k]); });
    if(text) n.textContent = text;
    return n;
  }
  function show(kind, nodes){
    status.className = 'form-status show is-' + kind;
    while(status.firstChild) status.removeChild(status.firstChild);
    nodes.forEach(function(n){ status.appendChild(typeof n === 'string' ? document.createTextNode(n) : n); });
  }
  function clearStatus(){ status.className = 'form-status'; while(status.firstChild) status.removeChild(status.firstChild); }
  function fieldError(input, msg){
    var err = document.getElementById(input.getAttribute('aria-describedby'));
    if(msg){ input.setAttribute('aria-invalid','true'); if(err) err.textContent = msg; }
    else { input.removeAttribute('aria-invalid'); if(err) err.textContent = ''; }
  }
  function validate(){
    var name = form.elements.name, phone = form.elements.phone, first = null;
    var okName = name.value.trim().length >= 2;
    fieldError(name, okName ? '' : 'Please enter your name.');
    if(!okName) first = name;
    var digits = phone.value.replace(/[\s()-]/g,'');
    var okPhone = /^(\+?91)?0?[6-9]\d{9}$/.test(digits) || /^0?\d{10,11}$/.test(digits);
    fieldError(phone, okPhone ? '' : 'Please enter a valid phone number, for example +91 98765 43210.');
    if(!okPhone && !first) first = phone;
    if(first){ first.focus(); return false; }
    return true;
  }
  function payload(){
    return {
      name: form.elements.name.value.trim(),
      company: form.elements.company.value.trim(),
      phone: form.elements.phone.value.trim(),
      fleet_size: form.elements.fleet_size.value,
      message: form.elements.message.value.trim()
    };
  }
  function mailtoHref(d){
    var body = 'Name: ' + d.name + '\nCompany: ' + d.company + '\nPhone: ' + d.phone + '\nFleet size: ' + d.fleet_size + '\n\n' + d.message;
    return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('KAARVAN inquiry from ' + d.name) + '&body=' + encodeURIComponent(body);
  }
  ['name','phone'].forEach(function(n){
    form.elements[n].addEventListener('input', function(){ fieldError(form.elements[n], ''); });
  });
  form.addEventListener('submit', function(e){
    e.preventDefault();
    clearStatus();
    if(form.elements.website && form.elements.website.value) return;   // honeypot: ignore bots silently
    if(!validate()) return;
    var d = payload();
    if(!endpoint){
      show('info', [
        el('strong', {}, 'Your inquiry has not been sent. '),
        'This form is not connected to an inbox yet. Please email us at ',
        el('a', {href:'mailto:' + EMAIL}, EMAIL),
        ', or ',
        el('a', {href: mailtoHref(d)}, 'open an email with your details filled in'),
        '.'
      ]);
      return;
    }
    btn.disabled = true; btn.setAttribute('aria-busy','true'); btn.textContent = 'Sending…';
    show('info', ['Sending your inquiry…']);
    var body = Object.assign({_subject:'KAARVAN website inquiry from ' + d.name, _template:'table', _captcha:'false'}, d);
    fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify(body)})
      .then(function(r){
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().catch(function(){ return {}; });
      })
      .then(function(res){
        var accepted = res && (res.success === true || res.success === 'true');
        if(!accepted) throw new Error('not accepted');
        if(/activat|confirm/i.test(String(res.message || ''))){
          show('info', [el('strong', {}, 'Your inquiry has not been delivered yet. '), 'The form service is waiting for the sales inbox to be confirmed. Please email us at ', el('a', {href:'mailto:' + EMAIL}, EMAIL), ', or ', el('a', {href: mailtoHref(d)}, 'open an email with your details filled in'), '.']);
          return;
        }
        show('success', ['Thank you. Your inquiry has been sent to the KAARVAN sales team.']);
        form.reset();
      })
      .catch(function(){
        show('error', ['We could not send your inquiry. Your details are still in the form. Please try again, or email us at ', el('a', {href:'mailto:' + EMAIL}, EMAIL), '.']);
      })
      .then(function(){ btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = 'Send inquiry'; });
  });
})();
