(function () {
  var t = PPD.token(), key = PPD.uuid();
  function fail() { PPD.show('loading', false); PPD.show('form', false); PPD.show('invalid', true); }
  if (!t) return fail();

  PPD.req('GET', '/auth/password/reset/' + t).then(function (r) {
    if (r.status !== 200) return fail();
    document.getElementById('intro').textContent = 'Cuenta: ' + r.json.data.email_masked;
    PPD.show('loading', false); PPD.show('form', true);
  });

  document.getElementById('form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var err = document.getElementById('err'), btn = document.getElementById('send');
    var p1 = document.getElementById('password').value, p2 = document.getElementById('password2').value;
    if (p1 !== p2) { err.textContent = 'Las contraseñas no coinciden.'; return; }
    err.textContent = ''; btn.disabled = true;
    PPD.req('POST', '/auth/password/reset', { token: t, password: p1, password_confirmation: p2 }, key).then(function (r) {
      btn.disabled = false;
      if (r.status === 200) { PPD.show('form', false); PPD.show('done', true); return; }
      if (r.status === 410) return fail();
      if (r.status === 422) key = PPD.uuid();
      err.textContent = PPD.msg(r);
    });
  });
})();
