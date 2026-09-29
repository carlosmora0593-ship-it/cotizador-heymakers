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

  // Precios de la suscripción (MXN, IVA incluido). Cámbialos cuando
  // quieras: el cobro se crea con estos montos al momento de suscribirse.
  // El orden de aquí es el orden en que se pintan las tarjetas.
  PLANES: {
    basico: {
      nombre: "Básico",
      mensual: 199,
      anual: 1990,
      destacado: true,
      para: "El que se prueba y el que arranca",
      incluye: [
        "Cotizador completo con todas las técnicas",
        "Catálogo propio de artículos y precios",
        "Orden de producción con folio, tallas y checklist",
        "Clientes y expedientes",
        "Hasta 150 cotizaciones guardadas",
        "1 usuario"
      ]
    },
    maker: {
      nombre: "Maker",
      mensual: 449,
      anual: 4490,
      para: "Cuando ya son dos o tres en el taller",
      incluye: [
        "Todo lo del plan Básico",
        "Roles de ventas, diseño y producción",
        "Compras: requisiciones foliadas y proveedores",
        "Inventario y bitácora de movimientos",
        "Hasta 600 cotizaciones guardadas",
        "Hasta 3 usuarios"
      ]
    },
    pro: {
      nombre: "Pro",
      mensual: 899,
      anual: 8990,
      para: "Para la empresa que mide",
      incluye: [
        "Todo lo del plan Maker, sin límite de cotizaciones",
        "Caja y registro de ventas con cortes",
        "Utilidad y margen real por periodo",
        "Reportes en Excel por área",
        "Usuarios sin límite",
        "Soporte prioritario"
      ]
    }
  },

  DIAS_DE_PRUEBA: 15
};
