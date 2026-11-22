(function () {
  var t = PPD.token(), info = null, key = PPD.uuid();
  function fail(m) { PPD.show('loading', false); PPD.show('form', false); PPD.show('invalid', true); if (m) document.getElementById('invalid-msg').textContent = m; }
  if (!t) return fail();

  PPD.req('GET', '/public/invitations/' + t).then(function (r) {
    if (r.status !== 200) return fail();
    info = r.json.data;
    PPD.brand(info.organization);
    if (info.status === 'expired') return fail('La invitación venció. Pida una nueva a su institución.');
    if (info.status === 'accepted') return fail('Esta invitación ya fue aceptada. Ya puede ingresar con su correo y contraseña.');
    var child = info.player_first_name ? ' de ' + info.player_first_name : '';
    document.getElementById('intro').textContent = info.organization.name + ' le invita como ' + info.role_label.toLowerCase() + child + ' (' + info.email_masked + ').';
    if (info.user_exists) {
      PPD.show('new-user', false); PPD.show('confirm-box', false);
      document.getElementById('password-label').textContent = 'Ingrese la contraseña de su cuenta de ppd';
      document.getElementById('password-hint').textContent = 'Usted ya tiene una cuenta con este correo.';
      document.getElementById('password').setAttribute('autocomplete', 'current-password');
    }
    PPD.show('loading', false); PPD.show('form', true);
  });

  document.getElementById('form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var err = document.getElementById('err'), btn = document.getElementById('send');
    var pass = document.getElementById('password').value;
    var body = { password: pass };
    if (!info.user_exists) {
      body.name = document.getElementById('name').value.trim();
      body.password_confirmation = document.getElementById('password2').value;
      var rel = document.getElementById('relationship').value.trim();
      if (rel) body.relationship = rel;
      if (body.name.length < 3) { err.textContent = 'Ingrese su nombre completo.'; return; }
      if (pass !== body.password_confirmation) { err.textContent = 'Las contraseñas no coinciden.'; return; }
    }
    err.textContent = ''; btn.disabled = true;
    PPD.req('POST', '/public/invitations/' + t + '/accept', body, key).then(function (r) {
      btn.disabled = false;
      if (r.status === 200) {
        PPD.show('form', false); PPD.show('done', true);
        document.getElementById('done-msg').textContent = info.role === 'guardian'
          ? 'Su cuenta quedó vinculada. Ingrese a la App de ppd con su correo y la contraseña que creó.'
          : 'Su cuenta quedó lista. Ya puede ingresar a la plataforma de su institución.';
        return;
      }
      if (r.status === 410) return fail(PPD.msg(r));
      if (r.status === 422) key = PPD.uuid(); // datos corregidos = acción nueva
      err.textContent = PPD.msg(r);
    });
  });
})();
