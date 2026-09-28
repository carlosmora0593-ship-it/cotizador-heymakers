/* ============================================================
   CONFIGURACIÓN — el único archivo que necesitas editar.
   Pega aquí las llaves que te dan Supabase y tu sitio de Netlify.
   Estas dos llaves son públicas por diseño: pueden verse desde el
   navegador y no dan acceso a los datos de nadie, porque la base
   está protegida con reglas por fila.
   ============================================================ */

window.CONFIG = {

  // Supabase → Project Settings → API
  SUPABASE_URL:      "https://vgobhszuziyrrgfysenk.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnb2Joc3p1eml5cnJnZnlzZW5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3OTA1NzgsImV4cCI6MjEwNTM2NjU3OH0.cb4RR7cMwJHKZVckqlp2KqYPpHG922-NcS4QeE0mo0A",

  // Nombre que ve el cliente
  MARCA: "Hey Makers",
  ESLOGAN: "Cursos y Talleres",

  // Precios de la suscripción (MXN). Cámbialos cuando quieras:
  // el cobro se crea con estos montos al momento de suscribirse.
  PLANES: {
    basico: {
      nombre: "Básico",
      mensual: 199,
      anual: 1990,
      para: "Para quien toma el curso y cotiza por su cuenta",
      incluye: [
        "Cotizador completo con todas las técnicas",
        "Catálogo propio de artículos y precios",
        "Orden de producción con tallas y checklist",
        "Carga de los archivos de impresión",
        "Hasta 150 cotizaciones guardadas",
        "1 usuario"
      ]
    },
    pro: {
      nombre: "Pro",
      mensual: 499,
      anual: 4990,
      para: "Para talleres con equipo y control de ventas",
      incluye: [
        "Todo lo del plan Básico, sin límite de cotizaciones",
        "Registro de ventas con cortes diario, semanal y mensual",
        "Utilidad y margen real por periodo",
        "Exportación de datos",
        "Varios usuarios en la misma cuenta",
        "Soporte prioritario"
      ]
    }
  },

  DIAS_DE_PRUEBA: 14
};
