# Hilván — Contexto para un agente de Cowork

Este documento le da a un agente de Claude (Cowork) el contexto para **operar Hilván**: registrar pagos recibidos de clientes, cargar boletas de honorarios y gastos, y entender el resto de la app. Está escrito para un agente que trabaja **a través de la interfaz web**, como lo haría una persona de contabilidad: inicia sesión, navega y completa formularios.

> **Hilván no tiene API pública.** Toda la operación es por la web (`app.casahiedra.com`). El agente actúa como operador humano: clickea, escribe, guarda.

---

## 1. Qué es Hilván

Hilván es la plataforma de gestión interna de **Casa Hiedra**, una productora audiovisual en Santiago de Chile. Centraliza cotizaciones a clientes, planificación de rodajes, inventario de equipos, colaboradores (freelancers), gastos/rendiciones, finanzas y arriendo de equipos (rental). Está en producción.

Idioma: todo en español. Moneda: peso chileno (CLP), sin decimales. Fechas: formato chileno (DD-MM-AAAA).

---

## 2. Cómo accede el agente (importante)

- **Usa una cuenta dedicada con rol `contabilidad`.** Ese rol ve exactamente lo que el agente necesita —**Cotizaciones**, **Centro de costos** y **Financiero**— y tiene oculto el resto (rodajes, equipos, colaboradores, etc.), lo que reduce el riesgo de que toque algo que no le corresponde. Pídele al admin (Tomás) que cree ese usuario.
- **Las credenciales NO van en este documento.** Se entregan por un canal seguro aparte. El agente nunca debe compartir ni exponer la contraseña.
- El agente debe operar **solo sobre datos reales que el usuario le entregue** (un comprobante, un aviso de pago). No debe inventar montos, fechas ni RUTs.

---

## 3. Glosario (contexto chileno)

- **Cotización:** presupuesto que Casa Hiedra envía a un cliente. Tiene versiones y un flujo de estados (borrador → enviada → aprobada → en producción → cerrada).
- **Factura:** documento tributario que Casa Hiedra **emite al cliente** para cobrar. Tiene un folio (número SII).
- **Pago recibido:** cuando el cliente efectivamente paga la factura. Es lo que el agente registrará seguido.
- **Boleta de honorarios:** documento que un **freelancer/colaborador emite a Casa Hiedra** por su trabajo. En Chile lleva una **retención de impuesto** (sube por año; 2026: **15,25%**): Casa Hiedra paga el neto al colaborador y retiene ese % para el SII.
- **Retención:** el % que se descuenta de una boleta de honorarios. Bruto − retención = neto (lo que recibe la persona).
- **Rendición / Centro de costos:** el módulo donde se cargan los **gastos** de un proyecto o del mes (boletas, facturas de proveedores, transporte, etc.). Ojo: el módulo se llama **"Centro de costos"** en el menú y vive en la ruta `/costos`, pero internamente cada documento de gasto sigue llamándose "rendición".
- **Glosa / ítem:** cada línea de una cotización (ej. "Director", "2 Cámaras") contra la que se cargan gastos.
- **Colaborador:** freelancer del equipo (cámara, sonido, etc.).

---

## 4. Mapa de módulos (qué hace cada uno)

| Módulo | Ruta | Para qué sirve | ¿Lo usa este agente? |
|---|---|---|---|
| **Dashboard** | `/dashboard` | Resumen general | Lectura |
| **Cotizaciones** | `/cotizaciones` | Crear/enviar presupuestos a clientes; **registrar factura emitida y pago recibido** | **Sí (pagos)** |
| **Centro de costos** | `/costos` | Cargar **gastos y boletas de honorarios** por proyecto (`/costos/admin`) o del mes (`/costos/mensual`) | **Sí (boletas/gastos)** |
| **Financiero** | `/financiero` | Estado de resultados, **cuentas por cobrar** (`/financiero/cobrar`), flujo de caja, créditos, inversiones | **Sí (consulta cobranza)** |
| Rodajes | `/rodaje` | Hojas de llamado y citaciones | No |
| Colaboradores | `/colaboradores` | Fichas de freelancers y contratos | No |
| Equipos | `/equipos` | Inventario, maletas, QR | No |
| Clientes | `/clientes` | Cartera de clientes y proyectos | No |
| Calendario | `/calendario` | Eventos importados de Google Calendar | No |
| Rental | `/rental` | Arriendo de equipos a terceros | No |
| Usuarios | `/usuarios` | Gestión de cuentas (solo admin) | No |

---

## 5. PLAYBOOK A — Registrar un pago recibido de un cliente

**Cuándo:** el usuario avisa que un cliente pagó (o que se emitió una factura). Son **dos momentos** distintos: primero se registra la *factura emitida*, después el *pago recibido*.

**Dónde:** dentro de cada cotización, en el panel **Facturación** (lateral derecho). El panel solo aparece si la cotización está en estado **aprobada, en producción o cerrada**.

### Paso a paso

1. Ir a **Cotizaciones** en el menú.
2. Abrir el grupo de cotización del cliente y luego la versión correcta.
3. En el panel derecho, ubicar **Facturación**.

**Momento 1 — Registrar factura emitida** (cuando se emitió la factura al cliente):
4. Completar **Fecha factura** (obligatorio) con la fecha de emisión.
5. Completar **Nº folio SII** (opcional) con el número de la factura.
6. Click en **Registrar factura**. El panel pasa a mostrar "✓ Factura emitida".

**Momento 2 — Registrar pago recibido** (cuando el cliente pagó):
7. Una vez registrada la factura, aparece **Fecha de pago recibido**.
8. Completar la fecha en que entró el dinero.
9. Click en **Registrar pago**. El panel muestra "✓ Pago recibido".

### Verificación
- Ir a **Financiero → Cuentas por cobrar** (`/financiero/cobrar`): la cotización pagada debe **salir** de "Pendiente de cobro". Las pendientes muestran los días transcurridos (verde <30, ámbar 30–60, rojo >60).

### Reglas
- No registrar un pago si no hay factura emitida primero.
- Confirmar el **monto y la fecha** con el comprobante real que entregue el usuario. Si hay duda (monto distinto, cliente que no calza), **preguntar antes de guardar**, no asumir.

---

## 6. PLAYBOOK B — Cargar una boleta de honorarios / gasto

**Cuándo:** llega una boleta de honorarios de un colaborador, o una factura/boleta de un gasto del proyecto.

**Dónde:**
- Gastos **de un proyecto** → **Centro de costos → Admin** (`/costos/admin`), dentro de la rendición de la cotización correspondiente, botón **+ Gasto** en el ítem/glosa adecuado.
- Gastos **operacionales del mes** (no atados a un proyecto: oficina, suscripciones) → **Centro de costos → Mensual** (`/costos/mensual`).

### Paso a paso (formulario de gasto)

1. **Tipo de gasto:** elegir entre Honorarios, Transporte, Alimentación, Arte/Props, Insumos, Servicios, Viáticos, Otro. Para una boleta de honorarios → **Honorarios**.
2. **Tipo de documento:** elegir **Boleta de honorarios** (otras opciones: Boleta/Ticket con IVA, Factura, Boleta exenta, Sin documento).
3. **Adjuntar el comprobante (recomendado):** subir el PDF de la boleta/factura. Si es un PDF de factura SII, el sistema **detecta automáticamente** RUT, razón social y monto, y ofrece un botón **Aplicar** para rellenar esos campos. Revisar que lo detectado sea correcto antes de aplicar.
4. **Si es factura:** completar **RUT emisor**, **Razón social**, y marcar **"Factura a nombre de Casa Hiedra"** si corresponde (da derecho a crédito fiscal de IVA).
5. **Monto (CLP):** ingresar el monto. **Para boletas de honorarios** hay un selector **Neto / Bruto**:
   - **Bruto** = el total de la boleta (antes de retención).
   - **Neto** = lo que el colaborador efectivamente recibe.
   - El sistema muestra el cálculo (ej.: *Bruto $150.000 · Retención $27.720 · Neto $152.280* … verificar). **Confirmar con el colaborador/boleta si el número que tienes es neto o bruto** antes de elegir el toggle — equivocarse aquí cambia el monto pagado.
6. **Descripción** (opcional): detalle del gasto.
7. **Guardar:** "Guardar y agregar otro" (para cargar varios seguidos) o "Guardar y cerrar".

### Qué pasa después (no lo hace el agente)
- El gasto queda en estado **enviado** y un admin lo **aprueba** (y luego aprueba el pago). El agente normalmente **solo carga**; la aprobación final la hace Tomás/contabilidad responsable, salvo que se le indique explícitamente.

### Reglas
- El **monto siempre se guarda como bruto** internamente; por eso importa elegir bien Neto/Bruto.
- La retención (15,25% en 2026) se calcula sola para tipo "Boleta de honorarios". No calcularla a mano.
- Adjuntar siempre el comprobante cuando exista. "Sin documento" requiere justificación y es excepcional.

---

## 7. Portal externo (para contexto)

Los colaboradores pueden cargar **sus propias** boletas sin cuenta, mediante un link temporal con expiración (`/r/[token]`) que genera un admin desde Centro de costos. Si el usuario te pide "mandarle el link a alguien", esa función la inicia un admin desde `/costos/admin` (botón **Link →** en un ítem). El agente normalmente no genera estos links salvo indicación.

---

## 8. Reglas de oro para el agente

1. **No inventes datos.** Monto, fecha, RUT, folio, cliente: siempre vienen de un documento o aviso real del usuario. Ante cualquier ambigüedad, **pregunta antes de guardar**.
2. **Dinero = cuidado.** Estás operando datos financieros de producción. Antes de guardar un pago o una boleta, **resume lo que vas a registrar** (cliente/colaborador, monto, fecha, documento) y confírmalo.
3. **No borres ni rechaces** rendiciones, gastos ni cotizaciones. Tu rol es **agregar/registrar**. Eliminar o rechazar lo decide un humano.
4. **No cambies configuración, usuarios ni permisos.**
5. **Verifica después de guardar:** que el pago salga de "por cobrar", que el gasto aparezca en la rendición. Reporta lo hecho con el dato concreto.
6. Si una pantalla no calza con este manual (la app cambió), **detente y avisa** en vez de improvisar.

---

## 9. Notas técnicas (para quien configure el agente)

- Hilván corre en `app.casahiedra.com` (Next.js + Supabase, hosteado en Vercel).
- No hay API externa de escritura; la operación es por UI. Si en el futuro se quiere una integración más robusta (que el agente registre pagos vía API/MCP en vez de clickear), habría que exponer endpoints autenticados — es un desarrollo aparte.
- El módulo "Centro de costos" usa la ruta `/costos`; los enlaces viejos `/rendiciones` redirigen solos.
- Tasa de retención de honorarios: por año (Ley 21.133; 2026: 15,25%), centralizada en lib/rendiciones-calc.ts (tasaRetencionBoleta).

---

*Documento de contexto operativo — Hilván v1. Mantener actualizado si cambian los flujos de Cotizaciones o Centro de costos.*
