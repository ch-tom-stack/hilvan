# Prueba de aceptación — `hilvan_buscar_leads_web` v2.1 (marcas de vestuario)

**Doble objetivo:**
1. **Generalización:** ¿la tool sirve fuera de agencias, en **marcas medianas de vestuario/ropa** (clientes finales)?
2. **Validar prod:** confirmar que la **v2.1 desplegada + `FIRECRAWL_API_KEY` en Vercel** funcionan end-to-end con Cowork.

**Qué mide:** marcas de ropa **reales** (no retailers multimarca grandes tipo Ripley/Falabella, no listicles/directorios) + **canal de contacto** (correo genérico o formulario) + **gancho usable**. NO mide correos de decisores (eso no se scrapea — entrega el genérico de la marca).

**Quién la corre:** el agente de Cowork. **Entregable:** `RESULTADO-leads-web-vestuario.md` lleno, además de las propuestas en la Bandeja.

---

## Pasos para Cowork

1. **Corre la tool:**
   `hilvan_buscar_leads_web { "sector": "marca de vestuario / ropa independiente Chile", "max": 8 }`
2. **Inspecciona:** `hilvan_listar_aprobaciones { "estado": "pendiente" }` + abre `/crm/aprobaciones`. Anota también el campo **`descartados_por_filtro`** que devuelve la tool (cuántos botó el clasificador de rubro v2.1).
3. **Puntúa CADA propuesta** (Sí/No):
   - **A — ¿Es una marca de vestuario/ropa real?** (una marca propia; NO un retailer multimarca grande, NO un listicle/directorio, NO otro rubro)
   - **B — ¿Trae canal de contacto?** (correo genérico publicado **o** formulario en el sitio). *Nota: la tool NO extrae WhatsApp/Instagram; si la marca solo ofrece eso, cuenta como "sin canal extraído".*
   - **C — ¿Gancho usable?** (algo real de la marca: colección, propuesta, historia; NO basura tipo nombre de archivo)
4. **Llena `RESULTADO-leads-web-vestuario.md`** con scorecard + tabla + veredicto.
5. **NO apruebes ni descartes nada** — eso lo hace Tomás en la Bandeja.

---

## Rúbrica

| Criterio | "Sí" si… |
|---|---|
| **A** | El sitio es de una **marca de ropa/vestuario propia** (mediana/independiente), no un retailer grande multimarca, ni listado, ni otro rubro. |
| **B** | Hay correo genérico (`contacto@`, `hola@`, `ventas@`…) **o** formulario de contacto. |
| **C** | El gancho dice algo real de la marca (colección, diseño, historia, propósito). |

**Accionable** = A + B + C.

---

## Scorecard (a llenar)

| Métrica | Valor |
|---|---|
| Revisados / **descartados por filtro (rubro)** / candidatos / propuestas creadas | _ / _ / _ / _ |
| **Precisión** = % que cumplen A (marcas reales) | _% |
| % con correo genérico real | _% |
| % con canal (correo **o** formulario) (B) | _% |
| % con gancho usable (C) | _% |
| **Accionables** (A+B+C) | _ de 8 |

---

## Barra de éxito (calibrada para vestuario)

Generaliza/sirve si cumple las TRES:

- ✅ **≥ 60%** son marcas de ropa reales (A) — *mide que el clasificador de rubro v2.1 funciona en otro sector*
- ✅ **≥ 50%** traen canal de contacto (B: correo **o** formulario) — *en vestuario muchas son e-commerce con formulario; por eso B cuenta el form*
- ✅ **≥ 3 de 8** accionables (A+B+C)

> Chequeo extra v2.1: si `descartados_por_filtro` es **alto** y los candidatos quedaron **muy pocos** (< 4), revisar si el clasificador está botando marcas reales (falso negativo). Anotarlo.

---

## Después del resultado

- **Accionables** → Tomás aprueba en la Bandeja (entran al pipeline con su gancho).
- **Basura / falsos positivos** → descartar; anotar cuáles para la siguiente iteración.
- **Comparación:** ponemos este scorecard junto al de agencias (v1/v2.1) para ver si la calidad se sostiene cross-sector.
- Recordatorio: la métrica es **marca real + canal de contacto + gancho**, NO correos de decisores.
