// Emblemas de las medallas.
//
// Line art geométrico, trazo de 1.4, sin relleno y en `currentColor`: heredan
// el color de la medalla (apagada, verde o dorada) sin duplicar la paleta. Sin
// esquinas redondeadas ni sombras, como el resto del sistema.
//
// El motivo de cada uno sale de su medalla, no de un banco genérico: la aguja
// enhebrada para el primer contacto, el carrete para el volumen, la costura
// invisible para lo legendario. Un ícono que no se relaciona con lo que premia
// es decoración, y decorar acá sería exactamente el defecto que evitamos.

export const EMBLEMAS: Record<string, string> = {
  // ── I · Hilvanar ──────────────────────────────────────────────────────────
  // Aguja enhebrada
  primer_contacto: 'M5 19L19 5M19 5l-3 .4M19 5l-.4 3M7.5 16.5a2 2 0 1 0 0-.1',
  // Telas apiladas
  diez_marcas: 'M3 8l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4',
  // Cuatro agujas en abanico
  cuatro_canales: 'M12 21V10M12 21l-5-4M12 21l5-4M12 10L7 5M12 10l5-5M12 10V3',
  // Dos sillas frente a frente
  primera_reunion: 'M4 20v-5a2 2 0 0 1 2-2h1v-4h2v4M20 20v-5a2 2 0 0 0-2-2h-1v-4h-2v4M11 16h2',
  // Salto al vacío
  primer_frio: 'M12 3v10m0 0l-3.5-3.5M12 13l3.5-3.5M4 17c2 2 4 2 6 0s4-2 6 0 4 2 4 2',

  // ── II · La trama ─────────────────────────────────────────────────────────
  // Mano sosteniendo hilo
  diez_contactos: 'M7 21v-6a3 3 0 0 1 3-3h1V7a1.5 1.5 0 0 1 3 0v5M14 12V6a1.5 1.5 0 0 1 3 0v9a6 6 0 0 1-6 6H7',
  // Carrete a medias
  cincuenta_contactos: 'M6 4h12M6 20h12M8 4v16M16 4v16M8 9h8M8 14h8',
  // Carrete lleno
  cien_contactos: 'M6 4h12M6 20h12M8 4v16M16 4v16M8 7h8M8 10h8M8 13h8M8 16h8',
  // Telar
  quinientos_contactos: 'M3 4h18M3 20h18M6 4v16M12 4v16M18 4v16M3 9h18M3 15h18',
  // Calendario con puntadas
  veinte_dias: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2M14 17h2',
  // Calendario denso
  cincuenta_dias: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M7 13h2M11 13h2M15 13h2M7 16h2M11 16h2M15 16h2',
  // Nudo que no cede
  no_soltar: 'M8 8c4 0 4 8 8 8M16 8c-4 0-4 8-8 8M5 5l2 2M19 5l-2 2M5 19l2-2M19 19l-2-2',
  // Muchas telas
  treinta_marcas: 'M2 7l10-4 10 4-10 4-10-4zm0 4l10 4 10-4M2 15l10 4 10-4M2 19l10 3 10-3',
  // Red completa
  cobertura: 'M12 3l8 5v8l-8 5-8-5V8zM12 3v18M4 8l16 8M20 8L4 16',
  // Termómetro doble
  ambas_temperaturas: 'M8 4a2 2 0 0 1 4 0v9a3 3 0 1 1-4 0zM16 6h5M16 10h5M16 14h5',

  // ── III · La costura ──────────────────────────────────────────────────────
  // Sobre abierto con respuesta
  primera_respuesta: 'M3 8l9 6 9-6M3 8v10h18V8l-9-5-9 5M8 12l-3 3M16 12l3 3',
  // Cinco voces
  cinco_responden: 'M4 6h7v6H6l-2 2V6zM13 10h7v6h-5l-2 2v-8z',
  // Coro
  quince_responden: 'M3 5h6v5H5l-2 2V5zM10 8h5v4h-3l-2 2V8zM16 4h5v5h-3l-2 2V4z',
  // Uno de cinco marcado
  tasa_veinte: 'M4 12h3M9 12h3M14 12h3M19 12h1M4 8l3 8M5.5 6a2 2 0 1 1 0 .1',
  // Uno de tres
  tasa_treinta: 'M5 12h4M11 12h4M17 12h2M5 7a2.5 2.5 0 1 1 0 .1M4 15l3 4',
  // Costura rematada
  primer_cierre: 'M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3M8 8v8M12 8v8M16 8v8',
  // Tres costuras
  tres_cierres: 'M3 6h18M3 12h18M3 18h18M6 4v4M12 4v4M18 4v4M6 10v4M12 10v4M18 10v4M6 16v4M12 16v4M18 16v4',
  // De la nada: hilo que aparece del vacío
  frio_a_cierre: 'M3 20c3-1 4-4 5-7s3-6 6-6 5 2 5 4-2 4-4 4-4-1-4-3M19 4l1-1M19 8l2 1',

  // ── IV · El taller ────────────────────────────────────────────────────────
  primera_cotizacion: 'M6 3h9l3 3v15H6zM15 3v3h3M9 11h6M9 14h6M9 17h3',
  diez_cotizaciones: 'M4 5h9l3 3v13H4zM13 5v3h3M8 20h12V9M7 12h6M7 15h6',
  cotizacion_aprobada: 'M6 3h9l3 3v15H6zM15 3v3h3M8 13l3 3 5-6',
  primer_rodaje: 'M3 8h18v12H3zM3 8l2-4h14l2 4M7 4l-2 4M12 4l-2 4M17 4l-2 4',
  cinco_rodajes: 'M3 9h14v11H3zM3 9l2-3h10l2 3M8 6L6 9M13 6l-2 3M19 11l2-1v9l-2-1z',
  primer_cliente: 'M12 4a3.5 3.5 0 1 1 0 .1M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2',
  primera_reserva: 'M4 7h16v13H4zM4 11h16M8 4v4M16 4v4M10 15h4',
  reserva_aprobada: 'M4 7h16v13H4zM4 11h16M8 4v4M16 4v4M9 15l2 2 4-4',
  primera_rendicion: 'M7 3h10v18H7zM10 7h4M10 11h4M10 15h4M7 3v18',
  calendario_limpio: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 15l2 2 5-5',
  oficio_completo: 'M12 2l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 9l6-1z',

  // ── Sorpresas ─────────────────────────────────────────────────────────────
  madrugar: 'M12 3v3M5 12H2M22 12h-3M6 6L4 4M18 6l2-2M4 18h16M8 15a4 4 0 1 1 8 0',
  jornada_llena: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 13h1M11 13h1M14 13h1M8 16h1M11 16h1',
  a_la_primera: 'M5 12h11M16 12l-4-4M16 12l-4 4M18 5v14M21 8l-1 1M21 16l-1-1',
  una_semana_viva: 'M3 12h18M6 9v6M9 8v8M12 9v6M15 8v8M18 9v6',
}

/** Fallback: una puntada simple. Nunca debería usarse — hay emblema para todas. */
export const EMBLEMA_DEFECTO = 'M4 16c4-8 12-8 16 0'
