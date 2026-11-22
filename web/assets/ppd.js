/* Utilidades comunes de las páginas públicas de ppd (sin dependencias). */
window.PPD = (function () {
  var API = 'https://api.ppdguate.com/api';
  function token() { var t = new URLSearchParams(location.search).get('token') || ''; return /^[A-Za-z0-9]{48}$/.test(t) ? t : ''; }
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); }
  function req(method, path, body, key) {
    var h = { 'Accept': 'application/json' };
    if (body) h['Content-Type'] = 'application/json';
    if (key) h['Idempotency-Key'] = key;
    return fetch(API + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); })
      .catch(function () { return { status: 0, json: { error: { message: 'No hay conexión. Intente de nuevo.' } } }; });
  }
  function msg(res) {
    var e = (res.json && res.json.error) || {};
    if (e.fields) { var k = Object.keys(e.fields)[0]; if (k) return e.fields[k][0]; }
    return e.message || 'Ocurrió un error. Intente de nuevo.';
  }
  function brand(org) {
    if (!org) return;
    var r = document.documentElement.style, c = org.colors || {};
    if (c.primary) r.setProperty('--primary', c.primary);
    if (c.on_primary) r.setProperty('--on-primary', c.on_primary);
    var box = document.getElementById('brand');
    var img = org.crest_url || org.logo_url;
    box.textContent = '';
    if (img) { var i = document.createElement('img'); i.src = img; i.alt = org.name; box.appendChild(i); }
    else { var d = document.createElement('div'); d.className = 'initials'; d.textContent = (org.name || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(); box.appendChild(d); }
    var n = document.createElement('strong'); n.textContent = org.name; box.appendChild(n);
  }
  function show(id, on) { document.getElementById(id).classList.toggle('hidden', !on); }
  return { token: token, uuid: uuid, req: req, msg: msg, brand: brand, show: show };
})();
