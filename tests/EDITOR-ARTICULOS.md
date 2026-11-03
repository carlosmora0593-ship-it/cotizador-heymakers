# Editor de artículos por categoría

```powershell
node tests/editor-articulos.mjs
```

Requiere Node 22+, Chrome y `playwright-core`, igual que `tests/menu.mjs`. Usa el puerto 4180 y la carpeta temporal de vista previa; ejecutar las pruebas en secuencia. Admite `CHROME_EXE` y `PLAYWRIGHT_MODULE`.

Se prueba el código real de la app con un catálogo y servicios de base/archivos ficticios, navegador aislado y red externa bloqueada. No requiere claves ni opera sobre cuentas reales.

Comprueba alta/edición, cancelación, validación, códigos con ceros iniciales, foto subida sólo al confirmar, persistencia de `fotoRef` sin URL temporal, existencia de sólo lectura, conservación de campos y otros modelos modificados, conflictos del mismo artículo, error y reintento, cambio de cuenta, permisos y vencimiento, eliminación con confirmación, renderer anterior de Store, móvil, foco y tema oscuro. También comprueba que el menú no contenga campos para autocompletado y que permanezcan Excel/códigos/etiquetas.

El editor lee el catálogo antes de mezclar sus campos y detecta cambios del modelo entre apertura y lectura. Esto usa el puente existente y no sustituye un mecanismo atómico de concurrencia en el servidor para toda la aplicación.
