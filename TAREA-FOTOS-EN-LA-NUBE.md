# Tarea para Codex: el logo y las fotos del Restaurant en la nube (6 nov 2026)

Escrita por Claude. Las reglas de `AGENTS.md` mandan. **Va después de `TAREA-CAJA-FIJA.md` y antes de `TAREA-PERSONAL-EN-SU-CELULAR.md`.**

## Lo que dijo Carlos

> «¿Por qué las fotos que cargo en un dispositivo no se guardan en la nube para todo el sistema? Por ejemplo, cargué mi logo desde mi laptop pero no sale en los demás dispositivos.»

## Cómo está hoy (lo revisó Claude)

- El logo vive en `P.negocio.logo` como `data:` URL (`prepararImagen`, máximo 280 KB). `proyectaRestaurant()` **no lo sube**: `rest_config` sólo lleva nombre, teléfono, dirección, IVA, etc.
- Las fotos de los platillos se quitan a propósito antes de subir (`delete safe.foto; delete safe.imagen; delete safe.base64`) y se conservan locales (`beFotoLocal`).
- Revisa también las fotos de categoría y los iconos del catálogo de alimentos del 6 nov.

Resultado: cada aparato ve sólo lo que se cargó en él.

## Lo que hay que hacer

1. **Supabase Storage**, bucket nuevo `restaurant-medios`, rutas `<cuenta_id>/logo/<id>.webp` y `<cuenta_id>/platillos/<id>.webp` (y categorías si aplica).
   - **Lectura:** pública. Son el logo y fotos de comida que el cliente ve; no son datos privados. El bucket `disenos` de Imprenta **se queda privado**; no lo toques.
   - **Escritura y borrado:** sólo admin del negocio (`rol_en(cuenta_id) = 'admin'`) en su propia carpeta. Política en un SQL nuevo y repetible.
   - Nombres de archivo aleatorios, WebP comprimido (logo ≤ 200 KB, platillos ≤ 150 KB).
2. **En la nube sólo se guarda la ruta**, no la imagen: `rest_config.logo` y `foto` en cada platillo o categoría. Al cambiar o quitar la imagen, se borra el archivo anterior.
3. **Todos los aparatos la ven:**
   - El service worker guarda las imágenes en caché para que salgan sin internet.
   - Sin conexión al subir, la imagen queda pendiente y se sube al volver la red.
4. **Migración:** si un aparato tiene logo o fotos locales y la nube no, el gerente ve una sola vez «Subir el logo y las fotos de este aparato a la nube». No se pierde nada de lo que ya se cargó.
5. **Tickets:** sin cambios. La ruta de texto sigue usando el nombre del negocio.

## Pruebas

- [ ] **SQL repetible en PostgreSQL local:** políticas de Storage (admin sube, otro negocio no, anónimo sólo lee).
- [ ] **Chrome con dos sesiones:** se carga el logo en la laptop y aparece en la tablet sin recargar a mano; quitar el logo; foto de platillo; sin internet; migración de un aparato con fotos locales.
- [ ] Celular a 390 px y tablet a 1280 px. Capturas en `tmp/fotos-nube/`.
- [ ] **Publicar fuera del horario de servicio.** El SQL lo corre Carlos.
