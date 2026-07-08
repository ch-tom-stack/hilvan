# Funnel de venta — Casa Hiedra (doc de trabajo)

> Borrador para revisar y corregir juntos. **No es código.** Marca lo que esté
> mal: este doc define QUÉ construimos después.
> Estado: 🟢 decidido · 🟡 en discusión · ⚪ idea

---

## 1. ICP — a nivel EMPRESA (no persona)

La persona compradora es demasiado amplia para fijarla (dueño → todas las
jefaturas/gerencias de marketing → product manager → **RRHH** para video
interno/employer brand). Por eso el ICP se define **por empresa**, y el contacto
se resuelve en la relación.

**Ejes de fit de empresa** 🟡
- **Tamaño** (empresa o de su depto. de marketing) → mejor proxy de presupuesto. Eje #1.
- **Rubro** → derivado de tus clientes ganados reales en Hilván (`clientes` + `cotizaciones` aceptadas).
- **Produce contenido con regularidad** (campañas, lanzamientos, temporadas).
- **Vector de necesidad** (tag, no otro ICP): `marketing` (campañas/marca) · `RRHH` (institucional/interno) · `producto` (catálogo/lookbook).

**Cómo se deriva** 🟡 minar `clientes`/`cotizaciones`/`proyectos` ganados → rubros núcleo, ticket típico, tamaño → umbral que Tomás valida. El fit-score se calcula contra esto, no contra un "sector" suelto.

---

## 2. Las etapas (ya existen en el pipeline) + play + señal

| Etapa | Play que la mueve | Señal | Motor |
|---|---|---|---|
| **prospecto** | descubrir + enriquecer + fit-score | detectada (web) | — |
| **calificado** | pasa el umbral de ICP | — | — |
| **lectura_entregada** | **La Lectura** (dossier a medida, gratis) | **generada** | generativo |
| **conversación** | el prospecto responde la Lectura | generada | generativo |
| **producto_propuesto** | propones `banco`/`lookbook`/`spot` | — | — |
| **cotización_enviada** | cotizas (conecta con CH-2) | — | — |
| **seguimiento** | cadencia corta de seguimiento | — | cadencia |
| **confirmado** | cierre | — | — |
| _nurture_ (cajón) | cadencia larga a fuego lento (~15 correos) | reactivación | cadencia |
| _descartado_ (cajón) | — | — | — |

---

## 3. Motor generativo — La Lectura 🟢 (ya existe, fortalecer)

El corazón del funnel. En vez de outbound frío con "gancho", **das valor primero**:
analizas el contenido de la marca (`feed` o `temporadas`) y le mandas una lectura
a medida con un ángulo audiovisual. Su respuesta es la señal.

- Heurística E7 ya implementada: `feed → banco`, `temporadas → lookbook`; entregarla avanza a `lectura_entregada`.
- **Fortalecer:** que el enriquecimiento (multi-página: home, /clientes, /prensa) **alimente** la Lectura con material real, para que el ángulo sea específico y no genérico.

---

## 4. Capa de cadencia (correos pre-programados) 🟡

**Principio:** secuencia larga = solo para quien ya interactuó. Frío = corto.
*(15 correos en frío a direcciones scrapeadas quema el dominio de Casa Hiedra.)*

### 4a. Cadencia FRÍA (etapa prospecto→calificado) — 2 a 4 toques
1. **La Lectura** (valor puro, sin venta)
2. Recordatorio + 1 idea concreta (a los ~4–5 días)
3. Caso/portafolio relevante a su rubro (~1 semana)
4. Cierre suave "quedo por acá" (~1 semana) → si no responde, **a `nurture`**

### 4b. Cadencia NURTURE / warm (etapa nurture o post-conversación) — hasta ~15
Espaciada en **meses**, mezcla **~80% valor / 20% venta**:
- ideas/POV, casos nuevos, ganchos de temporada, novedades de Casa Hiedra,
  invitaciones, "vi que lanzaron X"… top-of-mind hasta que esté listo.

### 4c. Cómo "se gesta solo" ⚪
Cron-secuenciador: por prospecto mira `etapa` + última `interaccion` + timing →
elige el siguiente correo de plantilla → **lo redacta** → lo registra como
`interaccion`. **Auto-stop apenas el prospecto responde** (respuesta = señal → a humano / avanza etapa).

### 4d. Decisión pendiente — "todo propuesto" vs auto-envío 🟡
El CRM se construyó con la regla *nada se manda sin aprobación humana*. El drip la rompe. Opciones:
- **(A)** Apruebas la *inscripción* a la secuencia; de ahí corre y envía sola.
- **(B) (recomendada para arrancar)** El cron **redacta** el correo; Natalia/Tomás aprueban con un click. Protege deliverability + la regla. Migrar a (A) por segmento cuando las plantillas estén probadas.

---

## 5. Motor detector (señales web) ⚪ — secundario

Lo poco scrapeable que sí sirve, en orden de valor:
1. **Ofertas de trabajo** ("content manager / encargado audiovisual / mkt") = señal fuerte y temprana.
2. **Financiamiento / rondas** (presupuesto nuevo).
3. Nuevo gerente de marketing / rebrand / lanzamiento / premio.

→ Cuando aparece una señal sobre una empresa del ICP, sube su prioridad y dispara el play (La Lectura con ese ángulo).

---

## 6. Infra que ya existe (no partimos de cero)
- Gmail SMTP (nodemailer, `natalia@casahiedra.com`) · `crm_interacciones` · `crm_lecturas` · cron (`crm-correos`) · `hilvan_correo_pendientes` · pipeline 8 etapas + productos + arquetipos.

## 7. Orden de construcción sugerido (cuando aprobemos el mapa)
1. ICP de empresa derivado de datos reales (+ fit-score).
2. Enriquecimiento multi-página que alimenta La Lectura.
3. Capa de cadencia: plantillas frías (4) + motor secuenciador con auto-stop (modo B).
4. Cadencia nurture (15) + detector de señales (ofertas de trabajo).

---

### Preguntas abiertas para Tomás
- ¿Modo **A o B** para el auto-envío? (recomiendo B)
- ¿Largo de la cadencia fría: 3 o 4 toques?
- ¿El ICP lo derivo de tus datos y tú validas, o me lo defines tú?
- ¿Qué rubros/tamaños son hoy tu mejor cliente? (para calibrar el ICP)
