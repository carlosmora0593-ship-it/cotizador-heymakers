/* Nuvoor · tiempo de uso (sql/37-tiempo-y-uso.sql)
   Cuenta los minutos en que alguien de verdad está trabajando en el
   sistema: la pantalla al frente y algún movimiento (clic, tecla, toque o
   scroll) en los últimos 3 minutos. Cada 2 minutos manda los segundos a
   Supabase con la sesión que ya tiene el sistema.
   No guarda qué se hizo ni nada de lo capturado: sólo segundos.
   Si no hay internet, no hay sesión o falta el SQL 37, se queda callado y
   nunca estorba al sistema. */
(function () {
  "use strict";
  try {
    var yo = document.currentScript;
    var PRODUCTO = (yo && yo.getAttribute("data-producto")) || "";
    if (!/^(imprenta|restaurant|store)$/.test(PRODUCTO) || window.__nuvoorUso) return;
    window.__nuvoorUso = true;

    var PASO = 15, ENVIA_CADA = 120, INACTIVO = 3 * 60 * 1000, TOPE = 1800;
    var acumulado = 0, ultimoMovimiento = Date.now(), ultimoEnvio = Date.now(), enviando = false, apagado = false;

    var mueve = function () { ultimoMovimiento = Date.now(); };
    ["pointerdown", "keydown", "touchstart", "wheel", "scroll"].forEach(function (ev) {
      window.addEventListener(ev, mueve, { passive: true, capture: true });
    });

    function config() { return window.CONFIG && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY ? CONFIG : null; }
    function sesion() {
      try {
        var cf = config(); if (!cf) return null;
        var ref = new URL(cf.SUPABASE_URL).hostname.split(".")[0];
        var st = JSON.parse(localStorage.getItem("sb-" + ref + "-auth-token") || "null");
        var s = st && (st.currentSession || st);
        if (!s || !s.access_token || !s.user || !s.user.id) return null;
        if (s.expires_at && s.expires_at * 1000 < Date.now() + 30000) return null;   // el sistema lo renueva solo
        return s;
      } catch (e) { return null; }
    }
    function cuenta(userId) {
      var claves = { restaurant: "nuvoor_restaurant_last_v1_", store: "nuvoor_store_last_account_v1_" };
      if (!claves[PRODUCTO]) return null;
      try {
        var crudo = localStorage.getItem(claves[PRODUCTO] + String(userId).replace(/[^a-zA-Z0-9_-]/g, ""));
        if (!crudo) return null;
        var v = crudo; try { var j = JSON.parse(crudo); v = (j && (j.accountId || j.id)) || j; } catch (e) {}
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v)) ? String(v) : null;
      } catch (e) { return null; }
    }

    function envia(alSalir) {
      if (apagado || enviando || acumulado < 1) return;
      if (navigator.onLine === false) return;
      var cf = config(), s = sesion(); if (!cf || !s) return;
      var seg = Math.min(Math.round(acumulado), 900);
      acumulado -= seg; enviando = true; ultimoEnvio = Date.now();
      var regresa = function () { acumulado = Math.min(acumulado + seg, TOPE); };
      try {
        fetch(cf.SUPABASE_URL + "/rest/v1/rpc/suma_uso", {
          method: "POST", keepalive: !!alSalir,
          headers: { "apikey": cf.SUPABASE_ANON_KEY, "Authorization": "Bearer " + s.access_token, "Content-Type": "application/json" },
          body: JSON.stringify({ p_producto: PRODUCTO, p_segundos: seg, p_cuenta: cuenta(s.user.id) })
        }).then(function (r) {
          enviando = false;
          if (r.status === 404) { apagado = true; return; }          // falta el SQL 37: no insistir
          if (!r.ok && r.status >= 500) regresa();
        }, function () { enviando = false; regresa(); });
      } catch (e) { enviando = false; regresa(); }
    }

    setInterval(function () {
      try {
        if (document.visibilityState === "visible" && Date.now() - ultimoMovimiento < INACTIVO)
          acumulado = Math.min(acumulado + PASO, TOPE);
        if (acumulado >= 60 && Date.now() - ultimoEnvio >= ENVIA_CADA * 1000) envia(false);
      } catch (e) {}
    }, PASO * 1000);

    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") envia(true); });
    window.addEventListener("pagehide", function () { envia(true); });
  } catch (e) {}
})();
