# Suspensión de Imprenta

Ejecutar desde el repositorio con Node 22 o posterior y Chrome:

```powershell
node tests/suspension/run.mjs
```

Si Chrome está en otra ruta, definir `CHROME_EXE`. Requiere libres los puertos locales 4178 y 9229.

El arnés copia la app original a `tmp/stripe/preview`, reemplaza Supabase y Stripe por datos ficticios y abre Chrome headless con perfil separado y resolución de dominios externos bloqueada. No necesita credenciales ni modifica cuentas reales. Las capturas quedan en `tmp/stripe/suspension-original-*.png`.

Comprueba cuenta vencida, prueba vigente y reactivación: bloqueo de acciones, guardado y exportaciones; consulta de cotizaciones en el visor original; filtros de ventas; permisos Básico/Pro; acceso a los manejadores existentes de pago y renovación; móvil y temas claro/oscuro. El portal y la renovación se prueban mediante dobles locales, no como un cobro real.
