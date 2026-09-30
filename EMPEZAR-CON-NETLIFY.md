# Lo que falta, y que solo puedes hacer tú

Todo lo demás ya quedó mientras dormías. Esto son unos 15 minutos y son cosas
que tocan tus cuentas y tus llaves: yo no puedo crear cuentas a tu nombre ni
escribir tus contraseñas, y no debería aunque me lo pidas.

---

## 1. Conectar Netlify al repositorio (5 min)

1. Entra a **netlify.com** con tu cuenta de GitHub.
2. **Add new site → Import an existing project → GitHub**.
3. Elige el repositorio `cotizador-heymakers`.
4. No cambies nada de la configuración: ya viene en `netlify.toml`
   (publica `public/`, funciones en `netlify/functions`).
5. **Deploy**.

Te va a dar una dirección tipo `algo-random.netlify.app`. En
**Site configuration → Change site name** ponle `cotizador-heymakers`.

> **GitHub Pages sigue funcionando igual.** No lo apagues todavía. Netlify se
> suma; cuando todo esté probado allá, mueves el dominio y apagas el otro.

---

## 2. Las cuatro variables de entorno (5 min)

En **Site configuration → Environment variables → Add a variable**.
Ponlas para *All scopes* y *All deploy contexts*.

| Nombre | De dónde sale |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → **service_role** |
| `MP_ACCESS_TOKEN` | Mercado Pago → Tus integraciones → tu app → Credenciales **de prueba** |
| `WEBHOOK_CLAVE` | Invéntala tú. Larga y sin sentido, tipo `hm-8f3k-92xq-p4mt-71ab` |

**Tres reglas que no se rompen:**

- La `service_role` **nunca** va en `config.js`, ni en el repositorio, ni en el
  navegador. Solo aquí. Quien la tenga pasa por encima de toda la seguridad de
  tu base.
- Empieza con las credenciales **de prueba** de Mercado Pago. Las de producción
  se cambian el día que vayas a cobrar de verdad, y no antes.
- `WEBHOOK_CLAVE` es lo único que separa un aviso real de Mercado Pago de
  cualquiera que adivine tu dirección. Que sea larga.

---

## 3. Registrar el webhook en Mercado Pago (3 min)

**Tus integraciones → tu aplicación → Webhooks → Configurar notificaciones.**

URL, con tu clave pegada al final:

```
https://cotizador-heymakers.netlify.app/.netlify/functions/webhook-mercadopago?clave=LA-QUE-PUSISTE
```

Evento a marcar: **Suscripciones (preapproval)**.

---

## 4. Correr el SQL nuevo

`CORRER-7-timbres.sql` ya está en tu carpeta, **pero ya lo corrí yo anoche**.
Solo lo dejo por si algún día reinstalas desde cero. Si lo vuelves a correr no
pasa nada: está hecho para repetirse.

---

## 5. Probar antes de cobrarle a nadie

1. Entra al sitio de Netlify (no al de GitHub Pages).
2. Crea una cuenta nueva de prueba.
3. Perfil → Mi plan → Cambiar de plan → elige Maker.
4. Debe mandarte a Mercado Pago. Paga con una **tarjeta de prueba** de ellos.
5. Vuelve al cotizador: en menos de un minuto el plan debe cambiar solo, sin
   recargar.

Si el plan no cambia, el problema casi siempre es el webhook: revisa en Netlify
→ **Functions → webhook-mercadopago → Logs**. Ahí se ve cada aviso que llegó y
qué se hizo con él. Mándame una captura y lo vemos.

---

## Lo que NO hay que hacer todavía

- **No** cambies las credenciales de Mercado Pago a producción hasta que la
  prueba completa funcione dos veces seguidas.
- **No** apagues GitHub Pages.
- **No** contrates el PAC todavía. Eso lo vemos juntos, porque hay que decidir
  cuál y probar contra su sandbox antes de que un cliente dependa de ello.
