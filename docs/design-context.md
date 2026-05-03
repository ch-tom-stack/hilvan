# Hilván — Contexto de diseño

*Documento para el chat de diseño. Última actualización: mayo 2026.*

---

## 1. Qué es Hilván

Hilván es el sistema operativo interno de **Casa Hiedra**, productora audiovisual chilena. No es un SaaS público — es una herramienta usada exclusivamente por el equipo de Casa Hiedra y sus colaboradores externos (freelance técnicos, modelos, proveedores).

El nombre "Hilván" es una puntada provisional en costura: une las piezas antes de coserlas en definitivo. Metáfora para un sistema que conecta producción, finanzas y personas.

**Stack**: Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Supabase (PostgreSQL + Auth + Storage).

---

## 2. Módulos actuales

| Código | Módulo | Estado | Descripción |
|--------|--------|--------|-------------|
| CH-1 | Equipos | Activo | Inventario de cámara, iluminación, sonido. QR por equipo. Maletas con lista de contenido. |
| CH-2 | Cotizaciones | Activo | Constructor de presupuestos por proyecto. Jerarquía: cotización → departamento → subgrupo → ítem. Vista cliente con aprobación. |
| CH-3 | Rodaje | Activo | Gestión del día de rodaje. Hoja de llamados PDF. Sistema de citaciones con confirmación por link. Equipo técnico por departamentos. |
| CH-4 | Colaboradores | Activo | Directorio de freelancers y proveedores. Ficha con datos bancarios, fiscales, especialidades, tarifas, contratos generados. |
| CH-5 | Rendiciones | Activo | Gastos de colaboradores por proyecto. Portal externo (link temporal), admin de revisión, export para pago Santander. |
| CH-6 | Financiero | Próximo | Estado de resultados. No implementado. |
| CH-7 | CRM | Próximo | Clientes y proyectos. No implementado. |

---

## 3. Sistema de color

Definido en `globals.css` con variables de Tailwind v4.

```css
--color-ch-black:       #111110   /* fondo base, más oscuro */
--color-ch-dark:        #1c1c1a   /* fondo body */
--color-ch-surface:     #242422   /* superficies: cards, inputs */
--color-ch-border:      #2e2e2b   /* bordes sutiles */
--color-ch-muted:       #6b6b65   /* texto secundario, labels */
--color-ch-cream:       #f5f0e8   /* texto principal */
--color-ch-white:       #faf9f7   /* texto más claro, hover */
--color-ch-green:       #7a9e7e   /* acento principal: activo, confirmado, CTA */
--color-ch-green-light: #9dbfa1   /* hover del verde */
--color-ch-gold:        #c9a84c   /* acento secundario: advertencia, pendiente */
--color-ch-gold-light:  #dfc078   /* hover del dorado */
```

**Paleta extra en uso** (no en variables, heredada del sidebar original):
```
zinc-950  →  sidebar bg
zinc-900  →  sidebar border / nav item hover
zinc-800  →  nav item activo
zinc-700  →  bordes en páginas públicas (citación)
zinc-500  →  texto secundario en zinc-context
zinc-100  →  texto principal en zinc-context
```

> **Inconsistencia actual**: el sidebar y la página de citación usan zinc, mientras el resto del dashboard usa ch-tokens. En una segunda iteración hay que unificar — probablemente migrar sidebar a ch-tokens.

---

## 4. Tipografía

```css
--font-display: 'Cormorant Garamond', Georgia, serif
--font-body:    'DM Sans', system-ui, sans-serif
```

| Uso | Clase | Estilo |
|-----|-------|--------|
| Títulos de módulo, nombres propios | `font-display italic` | Cormorant Garamond itálica |
| Cuerpo, datos, labels | `font-body` | DM Sans |
| Labels de sección | `font-body text-[9px] tracking-[0.5em] uppercase` | Microlabels en caps con mucho tracking |
| Datos monoespaciados (RUT, códigos) | `font-mono` | Monospace del sistema |

**Regla editorial**: los títulos siempre en itálica (`font-display italic`). Los labels de sección en mayúsculas pequeñas con tracking exagerado. Nunca bold en titulares.

---

## 5. Convenciones de componentes

### Bordes
- Sin `border-radius` o máximo `rounded-[2px]`. Estética recta, casi impresa.
- Los borders usan `ch-border` (#2e2e2b) en el dashboard.

### Inputs
```css
.input-ch {
  background: #242422;      /* ch-surface */
  border: 1px solid #2e2e2b; /* ch-border */
  color: #f5f0e8;             /* ch-cream */
  font-size: 0.75rem;
  padding: 0.5rem 0.75rem;
}
```

### Botones CTA
```html
<!-- Botón principal (verde) -->
<button class="bg-ch-green text-ch-black font-body text-[10px] tracking-[0.3em] uppercase px-5 py-3">
  + NUEVO
</button>

<!-- Botón secundario / borde -->
<button class="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3">
  ← VOLVER
</button>
```

### Tabs
```html
<button class="font-body text-[10px] tracking-[0.3em] uppercase px-4 py-3 border-b-2 border-ch-green text-ch-cream">
  TAB ACTIVO
</button>
<button class="font-body text-[10px] tracking-[0.3em] uppercase px-4 py-3 border-b-2 border-transparent text-ch-muted">
  TAB INACTIVO
</button>
```

### Tablas de datos
Borde perimetral, sin zebra, separadores horizontales internos finos:
```html
<div class="border border-ch-border">
  <div class="flex ... border-b border-ch-border/50 px-5 py-4">fila</div>
</div>
```

### Labels de sección
```html
<p class="text-ch-muted font-body text-[9px] tracking-[0.5em] uppercase mb-1">
  MÓDULO CH-4
</p>
<h1 class="font-display italic text-4xl text-ch-cream">Colaboradores</h1>
```

### Tags / Badges
```html
<span class="border border-ch-green text-ch-green font-body text-[9px] tracking-[0.2em] uppercase px-2 py-0.5">
  Disponible
</span>
```

---

## 6. Páginas del dashboard — patrones por módulo

### `/dashboard`
Grid 2×N de tarjetas de módulo. Cada tarjeta: label CH-N en caps, título en Cormorant itálica, descripción small, estado (ACTIVO / PRÓXIMO). Los módulos inactivos se muestran atenuados (no se ocultan).

### `/equipos`
Lista tabular de equipos. Filtros por categoría. Formulario de equipo con uploader de fotos. Sub-sección de maletas con QR generado en cliente (qrcode.react).

### `/cotizaciones`
Vista más compleja: constructor de ítems con drag-and-drop implícito, totales en tiempo real, exportación a PDF (react-pdf). Vista cliente pública en `/cotizacion/[token]`.

### `/rodaje`
Lista de rodajes → ficha de rodaje con tabs: Producción, Hoja de llamados, Escenas, Equipo técnico, Citaciones. La hoja de llamados genera PDF on-demand (react-pdf renderizado en servidor). Las citaciones se envían por email y tienen confirmación pública.

### `/colaboradores`
Lista tabular → ficha con 7 tabs: Identidad, Bancario, Fiscal, Especialidades, Contratos, Tarifas, Rendiciones. Tab Contratos genera `.docx` via API route con la librería `docx`. Tab Rendiciones muestra gastos históricos del colaborador.

### `/rendiciones`
Admin con estadísticas (por revisar / por pagar / sin documento), listado por cotización con gastos inline expandidos, botón de marcar pagado. Link de rendición externo por colaborador.

---

## 7. Páginas públicas — estética diferenciada

Las rutas sin autenticación tienen una estética ligeramente distinta, más minimalista aún:

### `/citacion/[token]` — Citación de rodaje
- Fondo `bg-black` puro, texto zinc-100
- Card principal en `bg-zinc-900 border border-zinc-800`
- Hora de llamado en `text-3xl`
- Formulario de confirmación / declinar
- Footer simple

### `/m/[codigo]` — Maleta pública (QR)
- Usa ch-tokens (fondo ch-black, texto ch-cream)
- Lista de ítems con fotos del equipo
- Sección de notas del equipo (input inline)

### `/r/[token]` — Portal de rendición externo
- Colaborador ve sus gastos y sube documentos
- Diseño funcional, sin sidebar

### `/cotizacion/[token]` — Vista cliente de cotización
- La más "de cara al cliente": logo, totales, desglose, botón de aprobación

---

## 8. Sidebar / Navegación

El sidebar desktop es fijo a la izquierda (w-52), con el logo de Casa Hiedra arriba y el nombre del usuario abajo. En mobile es un header horizontal con scroll.

**Inconsistencia actual**: el sidebar usa `bg-zinc-950`, `zinc-900` para borders y `zinc-800` para activo. No usa ch-tokens. Candidato a rediseño para unificar paleta.

---

## 9. Qué necesita más trabajo de diseño

En orden de impacto:

1. **Dashboard vacío**: cuando los módulos no tienen datos aún, no hay estado vacío definido. Tablas sin filas se ven como errores.

2. **Feedback de acciones**: los botones de guardar/confirmar no tienen spinner ni feedback visual más allá de un texto que aparece brevemente. Falta un sistema consistente de toast/notificación.

3. **Mobile**: la experiencia en mobile es funcional pero no pulida. El header mobile con tabs horizontales no escala bien con más módulos.

4. **Formularios largos**: la ficha de colaborador tiene 7 tabs con muchos campos. No hay indicación de qué tabs tienen datos completados vs. vacíos.

5. **Módulos Financiero y CRM**: están en el dashboard como "próximos" pero sin diseño conceptual.

6. **Página de error / 404**: solo existe el default de Next.js.

7. **Print / PDF**: la hoja de llamados se genera con react-pdf desde datos del servidor. El estilo PDF es funcional pero básico.

---

## 10. Qué NO cambiar

- La doble tipografía (Cormorant itálica + DM Sans) es la identidad central. No mezclar más fuentes.
- Los colores ch- son los definitivos. No usar grises genéricos (gray-500) en contenido nuevo.
- El patrón de microlabels en caps con tracking exagerado es deliberado y se mantiene.
- Sin border-radius. Máximo `rounded-[2px]` si es absolutamente necesario.
- Sin sombras (box-shadow). La profundidad se crea solo con color de fondo y borde.

---

## 11. Referencias visuales del proyecto

El lenguaje visual está inspirado en:
- Interfaces de software editorial (Notion, Linear en su versión oscura temprana)
- Diseño de publicaciones impresas de alto nivel (revistas de moda/arquitectura)
- La identidad existente de Casa Hiedra: dark, warm, editorial

La intención es que la herramienta se sienta como una extensión natural de la marca, no como un SaaS genérico.
