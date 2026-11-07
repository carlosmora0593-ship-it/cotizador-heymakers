# TAREA 0p · Logo en el ticket Bluetooth y «¡» bien impreso

Va **junto con 0n (TAREA-FOTOS-EN-LA-NUBE)**, en la misma pasada. Autor: Claude, 6 nov 2026, 22:35. Carlos autorizó a Codex publicar en automático (ver AGENTS.md).

## Reporte de Carlos

El 6 de noviembre a las 22:30, Carlos mandó foto del ticket de Mesa 13 (T-1A63-0022, cuenta por Bluetooth).

- Subió el logo en los tres aparatos y aun así **el ticket sale sin logo**.
- Al subirlo en un aparato no aparece en los demás. Eso ya es 0n.
- El ticket termina en **«?Gracias por su visita!»**.

## Causa en el código

- **La cuenta por Bluetooth es solo texto.** Sale por `printKitchenTicket` con `renglonesCuentaPOS(modelo)` y no lleva imagen.
  - El logo solo aparece en la ruta HTML («Otra impresora»).
  - Ajustes → Ticket dice «El logo que configuraste en "Tu negocio" también aparece en los tickets impresos». Hoy eso no se cumple por Bluetooth.
- **El APK ya puede imprimir imágenes.** Tiene `printImage(jobId, mac, mm, pngBase64, opcionesJson)` desde 0.1.3: raster `GS v 0`, 384 px en 58 mm y 576 px en 80 mm. Hay que confirmar que 0.1.7 lo conserva. Si es así, no hace falta APK nuevo.
- **El «?» viene del puente.** Quita acentos y cambia todo lo que no es ASCII imprimible por «?» (`[^\x20-\x7E]`). Por eso «¡» sale «?».
- **El logo no está en la nube.** Vive solo en el localStorage de cada aparato (`P.negocio.logo`, data URL) y `proyectaRestaurant` lo excluye. Eso se resuelve en 0n.

## Hacer

1. **Logo arriba de la cuenta Bluetooth.**
   - Si hay logo y el puente tiene `printImage`, imprimir primero el logo y luego los renglones, sin corte entre ambos. El corte va solo al final.
   - El logo va en blanco y negro (umbral o dithering), centrado, a no más de ~60 % del ancho del rollo y ~200 px de alto.
   - Guardar en caché el bitmap ya convertido en cada aparato.
   - Si no existe `printImage`, imprimir solo texto, como hoy.
   - Solo en cuentas y recibos, no en comandas de cocina.
2. **Interruptor en Ajustes → Ticket:** «Imprimir logo en la cuenta», encendido cuando hay logo.
3. **Mismo logo en todos los aparatos.** Cuando 0n esté listo, el ticket usa el logo de Storage guardado en caché, así los tres aparatos imprimen el mismo.
4. **«¡» y «¿».** Antes de mandar texto al puente, quitarlos, en leyenda, encabezado y cualquier texto libre.
   - Mejor aún, si es posible sin APK nuevo: mandar el encabezado y la leyenda como imagen junto con el logo, para conservar acentos.
   - Lo de usar codepage PC850/PC858 en el APK se evalúa después y no bloquea esta tarea.
5. **Corregir el texto de Ajustes** si alguna ruta sigue sin imprimir logo.

## Pruebas mínimas

- Puente falso con `printImage` y sin él.
- Rollo de 58 y de 80 mm.
- Tres tipos de logo: PNG transparente, JPG ancho y logo alto.
- Una sola orden de corte, al final.
- Leyenda con «¡» y «¿» que no imprima «?».
- La prueba física en la impresora la hace Carlos.

## Reglas

- Publicar fuera del servicio de Asada de noche (después de 23:30).
- No correr SQL en producción. Si hace falta, va al Lab y lo corre Carlos.
- Registrar en HISTORIAL-CODEX y marcar 0p en AGENTS.md.
