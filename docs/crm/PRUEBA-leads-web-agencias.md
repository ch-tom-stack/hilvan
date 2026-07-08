# Prueba de aceptación — `hilvan_buscar_leads_web` (agencias)

**Objetivo:** medir si la tool sirve, con un número duro. No mide "correos de
decisores" (eso no se scrapea) — mide **agencias reales + canal de contacto +
gancho usable**, en cantidad que valga la pena revisar.

**Quién la corre:** el agente de Cowork (tiene la tool por MCP + navegador con
sesión en `app.casahiedra.com`).

**Entregable:** un archivo de resultado en formato de `RESULTADO-leads-web-agencias.md`
(plantilla adjunta), **además** de las propuestas que queden en la Bandeja del CRM.

---

## Pasos para Cowork

1. **Corre la tool:**
   `hilvan_buscar_leads_web { "sector": "agencia de publicidad creativa Santiago Chile", "max": 8 }`
2. **Inspecciona la salida:** lista la Bandeja con `hilvan_listar_aprobaciones { "estado": "pendiente" }` y ábrela en el navegador (`/crm/aprobaciones`) para confirmar que las propuestas aparecen.
3. **Puntúa CADA propuesta** con la rúbrica (Sí/No):
   - **A — ¿Es realmente una agencia de publicidad/creativa?** (no un listicle, no otro rubro)
   - **B — ¿Trae canal de contacto real?** (correo genérico publicado, o al menos el formulario del sitio)
   - **C — ¿El gancho es real y usable?** (algo de la agencia o su trabajo; NO basura: nombre de imagen, texto de cookies, etc.)
4. **Llena la plantilla de resultado** (`RESULTADO-leads-web-agencias.md`) con el scorecard, la tabla por propuesta y el veredicto.
5. **NO apruebes ni descartes nada.** Eso lo hace Tomás en la Bandeja. Tu trabajo es medir y reportar.

> Opcional (control): repite con `{ "sector": "agencia de marketing digital Providencia Chile", "max": 8 }` y compara consistencia.

---

## Rúbrica

| Criterio | Pregunta | Cuenta como "Sí" si… |
|---|---|---|
| **A** | ¿Es agencia real? | El sitio es de una agencia de publicidad/creativa/marketing, no un listado ni otro rubro. |
| **B** | ¿Canal de contacto? | Hay un correo genérico publicado (`contacto@`, `hola@`, `marketing@`…) **o** un formulario de contacto en el sitio. |
| **C** | ¿Gancho usable? | El gancho dice algo real de la agencia o su trabajo (cliente, propuesta, servicio). Basura = nombre de archivo de imagen, cookies, texto de menú. |

**Accionable** = cumple **A + B + C**.

---

## Scorecard (lo que debe quedar en el resultado)

| Métrica | Valor |
|---|---|
| Candidatas revisadas / propuestas creadas / duplicados omitidos | _ / _ / _ |
| **Precisión de descubrimiento** = % que cumplen A | _% |
| % con correo genérico real (B con email) | _% |
| % solo formulario / % sin contacto | _% / _% |
| % con gancho usable (C) | _% |
| **Accionables** (A+B+C) | _ de 8 |

---

## Barra de éxito

La v1 **sirve tal cual** (con revisión humana en la Bandeja) si cumple las TRES:

- ✅ **≥ 60%** son agencias reales (A)
- ✅ **≥ 50%** traen correo genérico real (B con email)
- ✅ **≥ 3 de 8** accionables (A+B+C)

Si queda **bajo eso** → no se usa a ciegas; se pasa a **v2** (filtro más duro de
no-agencias/listicles + mejor extracción de gancho). El scorecard indica qué
falla.

---

## Después del resultado

- Las **accionables** → Tomás las aprueba en la Bandeja (entran al pipeline con su gancho).
- Las **basura** → Tomás las descarta; anotar cuáles eran (para afinar filtros en v2).
- La tool deja `tipo=prospecto_nuevo` pendientes en `/crm/aprobaciones`; nada se crea directo.
