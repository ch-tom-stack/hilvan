# Prueba operacional — flujo de 2 pasos (descubrir → podar → enriquecer)

**Objetivo:** correr el flujo **como en funcionamiento real**, de punta a punta:
descubrir marcas de un sector → podarlas con un criterio (ICP) → enriquecer solo
las aprobadas → revisar las propuestas en la Bandeja. Mide si el flujo entrega
una **shortlist usable de prospectos reales con canal de contacto + gancho**.

**Quién la corre:** el agente de Cowork (tools por MCP + navegador con sesión).

**Entregable:** `RESULTADO-flujo2pasos.md` (plantilla adjunta), además de las
propuestas que queden en la Bandeja.

---

## 0. Define el ICP antes de empezar (best practice)
Antes de descubrir, ten claro **a quién queremos** (perfil de cliente ideal):
- **Sector sugerido para esta corrida:** `viñas boutique chilenas` *(tienen sitio propio → el pipeline sí baja correo/formulario; necesitan contenido audiovisual; evita el caso Instagram-only de la ropa indie). Puedes cambiarlo.*
- **Criterio de "sirve" (para podar en el paso 2):** marca/empresa **chilena**, **real** (no listicle/medio/extranjera), con **sitio propio o canal alcanzable** (no solo IG), y que **plausiblemente necesite producción audiovisual** (campañas, lanzamientos, contenido de marca).

---

## Pasos para Cowork

1. **Descubrir** — `hilvan_descubrir_marcas { "sector": "viñas boutique chilenas" }`.
   - Anota cuántas marcas devolvió y de cuántas fuentes.
2. **Podar (el paso humano/agente)** — sobre esa lista, marca cuáles PASAN el ICP del punto 0 y cuáles NO (con motivo: extranjera / no es del rubro / solo IG / es un medio/listicle). Arma la **lista aprobada** (sus dominios o nombres).
3. **Enriquecer** — `hilvan_buscar_leads_web { "sector": "viñas boutique chilenas", "objetivos": [<lista aprobada>] }`.
   - Deja propuestas en la Bandeja. Anota cuántas se crearon.
4. **Revisar** — abre `/crm/aprobaciones` (y `hilvan_listar_aprobaciones`) y, por cada propuesta enriquecida, evalúa: ¿trae **canal de contacto** real (correo/formulario)? ¿el **gancho** es usable? ¿es **accionable** (la mandarías a Tomás)?
5. **NO apruebes ni descartes** nada. Mide y reporta.

---

## Scorecard (va al resultado)

| Etapa | Métrica | Valor |
|---|---|---|
| Descubrir | marcas devueltas / fuentes mineadas | _ / _ |
| Podar | aprobadas / podadas (y motivos) | _ / _ |
| Enriquecer | propuestas creadas | _ |
| Calidad | % con canal de contacto (correo o formulario) | _% |
| Calidad | % con gancho usable | _% |
| **Final** | **accionables** (real + canal + gancho) | _ de aprobadas |

---

## Barra de éxito (flujo en operación)
El flujo de 2 pasos **sirve para operar** si:
- ✅ Descubrir devuelve **≥ 15** marcas candidatas del sector.
- ✅ Tras podar, queda una shortlist **≥ 5** marcas que pasan el ICP.
- ✅ Al enriquecer, **≥ 60%** de las aprobadas traen canal de contacto real.
- ✅ **≥ 5 accionables** para entregar a Tomás.

Si falla en "descubrir" → mejorar fuentes/queries. Si falla en "enriquecer/canal"
→ el sector es de los IG-only (cambiar de segmento o aceptar IG como canal).

---

## Después
- Las **accionables** → Tomás las aprueba en la Bandeja.
- Anota en el resultado **qué se podó y por qué** (afina el descubrimiento) y si
  el sector resultó "con sitio" o "IG-only".
