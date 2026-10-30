# Qué hay en esta carpeta

Mapa de la carpeta del cotizador, para no tener que adivinar. Si algo no
aparece aquí, probablemente es basura y puede irse a `_archivo\`.

---

## Lo que es el sitio — esto no se toca

| Carpeta | Qué es |
|---|---|
| `public\` | **El sitio.** Lo que ve la gente. GitHub Pages publica exactamente esta carpeta. |
| `public\index.html` | El cotizador del taller. Lo arma Claude y lo escribe aquí. |
| `public\lab.html` | Makers Lab, el panel de administración. |
| `public\restaurant.html` · `public\restaurante\` | Makers Restaurant, y su app de Android. |
| `public\tiendita\` | Tiendita Makers. |
| `public\cuenta.js` | Las cuentas, la sesión, los planes. Habla con Supabase. |
| `public\config.js` | **Tus llaves de Supabase.** La dirección y la llave `anon`, que son públicas a propósito. Nadie sobrescribe este archivo, nunca. |
| `public\version.json` | El sello de la versión publicada. Así sabe el cotizador que hay una nueva y se recarga solo. |
| `supabase\functions\` | Las tres funciones de servidor: cobro, aviso de pago e invitar usuarios. |
| `netlify\` · `netlify.toml` | Lo que queda de Netlify. Ya casi no se usa: ver `guias\EMPEZAR-CON-NETLIFY.md`. |
| `sql\` | Los SQL que se corren en Supabase, con un marcador en lugar de tu correo. Éstos **sí** suben al repositorio. |
| `.github\` | La receta que publica el sitio en cada empujón. |
| `android-native\` · `android-release\` | El código y el APK de la app de restaurante. |

---

## Los botones — se quedan en la raíz

Estos funcionan porque están **aquí arriba**: si los mueves a una subcarpeta,
dejan de encontrar lo que necesitan.

| Archivo | Qué hace |
|---|---|
| `PUBLICAR.bat` | **El de todos los días.** Guarda, trae lo de GitHub y sube. Actualiza el sitio. |
| `SUBIR-A-GITHUB.bat` | La primera subida de todas. Ya casi no hace falta. |
| `LIMPIAR-REPOSITORIO.bat` | Saca del repositorio público lo que lleva tu correo. Se corre una vez. |
| `PREPARAR-APP-RESTAURANTE.bat` | Arma el APK de restaurante y lo deja en `public\restaurante\`. |
| `PUBLICAR-RESTAURANTE-PRUEBA.bat` | Hace la copia de prueba del restaurante. |
| `PRUEBA-cotizador.html` · `PRUEBA-restaurant.html` · `PRUEBA-tiendita.html` | Para abrir cada uno desde tu máquina, sin publicar. Doble clic y listo. |
| `netlify.toml` · `package.json` · `.gitignore` | Configuración. No se mueven. |

---

## Lo ordenado

| Carpeta | Qué guarda |
|---|---|
| `guias\` | Los manuales: instalación, Netlify, Supabase, las dos apps. |
| `sql-con-mi-correo\` | Los `CORRER-*.sql` con tu correo escrito adentro. **No suben al repositorio** y así debe quedarse. |
| `plantillas\` | Los diseños sueltos de tickets, recibos y reportes. Referencia, no los usa el programa. |
| `_archivo\` | Copias viejas, capturas y borradores. No sube al repositorio. Bórralo cuando quieras espacio. |

---

## Dos cosas que conviene saber

**Tu `.git` pesa 24 MB y crece.** Cada publicación guarda una copia completa de
`public\index.html`, que son 1.25 MB. Es normal y no hace daño, pero por eso la
carpeta pesa más de lo que parece.

**Las copias viejas no son respaldo.** El respaldo de verdad es el historial de
git: ahí está cada versión publicada, con su fecha. Lo que está en `_archivo\`
son fotos sueltas de momentos que ya pasaron.
