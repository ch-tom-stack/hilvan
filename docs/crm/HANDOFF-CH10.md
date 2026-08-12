# CRM (CH-10) — Handoff de integración y auditoría

> **Para:** chat madre de Hilván (auditoría de relación con el resto de la app, pre-push).
> **Estado:** módulo completo F1–F5. `tsc` y `npm run build` **verdes** (109/109 páginas). Todo local, **sin push**.
> **Naturaleza:** aditivo y aislado. No se tocó ningún módulo existente salvo los enganches mínimos descritos abajo.

---

## 1. Qué se construyó (resumen por fases)

- **F1 — Base:** módulo `/crm` (ruta elegida, NO `/prospectos`), Kanban con drag + toggle a tabla, ficha, bitácora, CRUD manual. Sidebar +1 ítem.
- **F2 — Bandeja:** `/crm/aprobaciones` (propuestas agente→humano agrupadas por severidad) + contador y punto `ch-gold` en el Kanban.
- **F3 — Capa agente:** 11 endpoints `/api/agent/crm/*` + 11 tools `hilvan_*` en `app/api/[transport]/route.ts` (MCP remoto). Regla "todo propuesto".
- **F4 — Programado:** cron `crm-seguimientos` (digest por responsable) + `crm-correos` (stub, pendiente decisión Gmail).
- **F5 — Handoff:** aprobar brief crea/linkea cliente (CH-7); botón "Derivar" en ficha; regla "prospectos estancados" en Auditoría.

---

## 2. Superficie de contacto con el resto de la app (a auditar)

### 2.1 Base de datos — `sql/crm.sql` (ya corrida en Supabase)
4 tablas nuevas: `prospectos`, `crm_interacciones`, `crm_lecturas`, `crm_aprobaciones`.
FKs **nullable** → `profiles(id)` (responsable) y `clientes(id)` (cliente_id). RLS permisiva (`USING true`) + grants a `authenticated`/`service_role`.
**Auditar:** que la convención de constraint `prospectos_responsable_id_fkey` (usada en varios `.select('... !prospectos_responsable_id_fkey ...')`) calce con el esquema real; que F4/F5 no requieran migración adicional (no la requieren).

### 2.2 Clientes (CH-7) — integración F5
Al aprobar un `brief_cotizacion`, `lib/crm-aprobaciones.ts`:
1. busca cliente existente por `ilike empresa` y luego `ilike nombre`;
2. si no hay, inserta `{ nombre, empresa }` en `clientes` **sin `created_by`**;
3. setea `prospectos.cliente_id`.
**No crea la cotización** — entrega `brief + cliente_id` para el flujo de cotizaciones.
**Auditar:** ver Riesgo #1 y #2 (sección 4).

### 2.3 Auditoría — `lib/agent-auditoria.ts` + `app/api/agent/auditoria/route.ts`
Regla nueva `prospecto_estancado` (severidad media; alta si ≥ 2× umbral). `DatasetAuditoria.prospectos` se agregó **opcional** (no rompe llamadas previas). Config nueva `dias_estancado` (default 21). El route hace una query extra de `prospectos` con sus interacciones para calcular última actividad.
**Auditar:** que no afecte las 6 reglas existentes ni el rendimiento del endpoint.

### 2.4 Capa agente — `/api/agent/crm/*` + `app/api/[transport]/route.ts` + `lib/agent-crm.ts`
11 endpoints (crear, buscar, pipeline, mover-etapa, interaccion, seguimientos, lectura, brief, metricas, aprobaciones, resolver-aprobacion) siguiendo el patrón existente: `requireAgentToken`, `createAdminClient`, `registrarAccion`.
Regla "todo propuesto": `brief` y altas-desde-correo (`crear` con `como_propuesta:true`) entran a `crm_aprobaciones`; el resto es directo con "CONFIRMA antes de llamar" en la descripción.
`lib/crm-aprobaciones.ts` (`aplicarEfectoAprobacion`) es **compartido** entre el endpoint del agente y la server action de la UI.

### 2.5 Crons — `vercel.json` + `app/api/cron/crm-*`
- `crm-seguimientos`: registrado en `vercel.json` (`30 12 * * 1`, lunes). Llama `procesarSeguimientosCrm` (`createAdminClient` + `sendEmail`). Soporta `?dry=true`.
- `crm-correos`: **stub** (no en `vercel.json`). No lee Gmail; espera decisión §9.1.

### 2.6 Otros
- `Sidebar.tsx`: +1 ítem (`CRM`, `rolesPermitidos: ['admin','productor']`).
- `types/index.ts`: sección "CH-10 CRM" appendeada (enums, constantes, interfaces).
- **Sin variables de entorno nuevas** (`CRON_SECRET`, `HILVAN_AGENT_TOKEN`, `GMAIL_*` ya existen).

---

## 3. Errores encontrados durante la construcción (y su estado)

| # | Error | Dónde | Estado |
|---|---|---|---|
| 1 | **TS2352** `GenericStringError → Record<string,unknown>` rompía `npm run build` | `app/api/agent/cotizacion-editar-item/route.ts:86` — archivo **no-CRM**, untracked | ✅ **Resuelto** externamente (`fila as unknown as Record<string,unknown>`). Build verde. |
| 2 | `parseInt(param) \|\| DEFAULT` trataba `0` como falsy → `dias_estancado=0` se volvía 21 | `app/api/agent/auditoria/route.ts` (código CRM F5) | ✅ **Corregido** (parse que respeta 0) + expuesto en `config_usada`. Nota: el mismo patrón sigue en `aging_dias`, `dias_sin_factura`, `dias_sin_rodaje`, `ventana_duplicados_dias` (pre-existentes) — no soportan `0`. Bajo impacto. |
| 3 | Tipos en transiciones: `return toastError()` y updater en prop no-setter | Componentes CRM F1 | ✅ Corregidos al construir. |
| 4 | **Corrupción de caché Turbopack** del dev server | operacional | ✅ Resuelto reiniciando. Causa: `rm -rf .next` con el dev server vivo. No repetir. |

---

## 4. Riesgos abiertos (no son bugs hoy; validar antes de confiar en prod)

1. **`clientes` se inserta sin `created_by`** (F5, `lib/crm-aprobaciones.ts`). Probado end-to-end y **funcionó** (columna nullable en la DB de prueba). **Si en prod fuera `NOT NULL`, aprobar un brief fallaría al crear cliente nuevo.** Confirmar paridad y decidir si atribuir autoría como `resolverPerfilAgente`.
2. **Dedup de cliente por `ilike`** empresa/nombre puede mergear marcas distintas con nombres parecidos. Evaluar match más estricto o confirmación humana.
3. **`procesarSeguimientosCrm` envía correos reales** a los responsables. Validar que todos tengan email correcto antes de activar el cron.

---

## 5. Recomendaciones (priorizadas)

- **Alta:** confirmar nullability de `clientes.created_by` en prod (Riesgo #1) antes de confiar el handoff de F5.
- **Alta:** correr `GET /api/cron/crm-seguimientos?dry=true` (con `CRON_SECRET`) en prod una vez para ver a quién le llegaría el digest, sin enviar.
- **Media:** unificar el parse de umbrales en `auditoria/route.ts` para que acepten `0` (limpieza).
- **Media:** decidir §9.1 (lectura Gmail). Hasta entonces `crm-correos` queda stub y la ingesta va por el agente (camino b).
- **Baja:** `DELETE FROM crm_aprobaciones WHERE estado <> 'pendiente';` para limpiar registros de prueba ya resueltos.

---

## 6. Qué se probó (en vivo, contra la DB real, luego limpiado)

- **F1:** crear prospecto → Kanban; drag entre columnas (mismo path que `moverEtapa`); confirmación inline al soltar en "Confirmado"; interacción con próximo paso vencido → resaltado `ch-gold`; toggle tabla; eliminar.
- **F2:** Bandeja agrupa por tipo; aprobar lead → crea prospecto; aprobar brief → marca aprobado; contador + punto dorado.
- **F3:** 11 tools vía curl (= lo que ejecuta el MCP); E7 (lookbook→temporadas) sin bajar etapa; concentración Falabella; errores 401/400/404.
- **F4:** `crm-seguimientos?dry=true` → `totalVencidos:1`, `sinEmail:1`, sin envío real; 401 sin secret.
- **F5:** auditoría con `dias_estancado=0` marca el prospecto de prueba; aprobar brief crea + linkea cliente; botón "Derivar" en ficha → propuesta en Bandeja.

---

## 7. Checklist de pre-push

- [ ] **Bloqueador de build:** resuelto (tsc/build verdes). ✅
- [ ] Confirmar que `sql/crm.sql` está corrido en la **instancia de producción** (F4/F5 no agregan tablas).
- [ ] Validar Riesgo #1 (`clientes.created_by` nullable en prod).
- [ ] Reiniciar el conector de Cowork para que tome las tools nuevas (el MCP remoto las expone tras el deploy; verificar con `npm run smoke:mcp`).
- [ ] (Opcional) `dry=true` del cron en prod para revisar destinatarios.
- [ ] (Opcional) Limpiar `crm_aprobaciones` resueltas de prueba.
- [ ] Rama sugerida: `feat/crm-ch10` para la PR (en vez de commit directo a `main`).

---

## 8. Pendientes de fases futuras (fuera de F1–F5)

- Decisión §9.1 (lectura Gmail) para ingesta automática de correos.
- Tools de agente que generen propuestas tipo `cambio_etapa` / `correo_borrador` (hoy solo `prospecto_nuevo` y `brief_cotizacion`).
- Creación de borrador real en Gmail al aprobar un `correo_borrador`.
- Derivación real al flujo de cotizaciones al aprobar un brief (hoy se entrega `brief + cliente_id`; no se crea la cotización, por diseño).
