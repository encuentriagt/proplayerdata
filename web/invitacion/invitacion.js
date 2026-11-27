// Invitación de vínculo padre-hijo: ya no pide contraseña (la cuenta puede ser de Google).
// Abre la App con el mismo enlace; la App vincula con la cuenta con la que el padre entró.
(function () {
  var t = PPD.token();
  function fail(m) { PPD.show('loading', false); PPD.show('open', false); PPD.show('invalid', true); if (m) document.getElementById('invalid-msg').textContent = m; }
  if (!t) return fail();

  var ua = navigator.userAgent || '';
  var android = /Android/i.test(ua);
  var store = 'https://play.google.com/store/apps/details?id=com.ppdguate.app';
  // Android: intent con respaldo a la tienda si la App no está instalada. Otros: esquema propio.
  var appUrl = android
    ? 'intent://invitacion?token=' + t + '#Intent;scheme=ppdguate;package=com.ppdguate.app;S.browser_fallback_url=' + encodeURIComponent(store) + ';end'
    : 'ppdguate://invitacion?token=' + t;

  PPD.req('GET', '/public/invitations/' + t).then(function (r) {
    if (r.status !== 200) return fail();
    var info = r.json.data;
    if (info.role !== 'guardian') return fail('Esta invitación es para la plataforma de su institución. Ábrala desde el correo en una computadora.');
    if (info.status === 'expired') return fail('La invitación venció. Pida una nueva a su institución.');
    if (info.status === 'declined') return fail('Esta invitación fue rechazada. Pida una nueva a su institución.');
    if (info.status === 'accepted') return fail('Esta invitación ya fue aceptada. Abra la App ProPlayer Data para ver a su hijo o hija.');
    var child = info.player_first_name || 'su hijo o hija';
    document.getElementById('intro').textContent = info.organization.name + ' lo invita a seguir a ' + child + ' en la App ProPlayer Data.';
    document.getElementById('open-app').setAttribute('href', appUrl);
    if (info.code) { document.getElementById('code').textContent = info.code; PPD.show('code-box', true); }
    PPD.show('loading', false); PPD.show('open', true);
    // Intento automático de abrir la App (algunos navegadores lo bloquean sin un toque: queda el botón).
    if (android) { setTimeout(function () { location.href = appUrl; }, 400); }
  });
})();
