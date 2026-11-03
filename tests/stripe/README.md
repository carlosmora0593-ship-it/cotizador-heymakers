# Prueba local de cobros

Desde esta carpeta, `npm install` y `npm test` (Node 24 con soporte de TypeScript).
El arnés encuentra el repositorio desde su propio archivo, sin importar la carpeta actual.

Ejecuta las migraciones 18, 22 y 23 sobre PostgreSQL embebido de PGlite.
Las HTTP de Supabase y Stripe están interceptadas; cualquier dirección no simulada falla.
No lee config.js, no requiere llaves, no ejecuta migraciones remotas.
Los errores impresos de cupón, respuesta perdida y base caída son casos negativos esperados.

Incluye precios, aliases, descuento en el campo correcto, prueba restante, conservación de
Checkout con clave idempotente, cambios de intento, pagos OXXO duplicados/concurrentes,
rollback, roles, estados de suscripción, avisos atrasados y confirmación por sesión.
No sustituye la prueba de cuatro facturas promocionales del sandbox ni el recorrido físico del APK.

Para usar una copia existente de PGlite, `PGLITE_MODULE` admite una URL file absoluta al módulo.
