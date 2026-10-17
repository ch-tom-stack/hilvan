// Borradores de factura en el Portal MIPYME del SII, CON referencias (OC / HES).
// Corre en el Mac (lo usará el trabajador). Ver docs/sii/facturacion-mipyme.md.
//
// La librería albertomarturelo/sii arma el borrador (receptor, ítems, forma de pago) pero
// no llena las referencias. Este módulo usa sus mismas piezas y agrega ese paso ENTRE el
// llenado y la grabación, dentro de la página del formulario, y vuelve a correr el
// validador del SII (validaFacEx) para que sus rechazos lleguen textuales.
//
// NUNCA emite: solo graba borradores y baja la vista previa. La firma la hace Tomás en
// sii.cl. MIPYME se opera con la sesión de la PERSONA (no la de la empresa), guardada
// aparte en ~/.hilvan-sii-persona/.sii.
//
// Depende de módulos internos de @albertomarturelo/sii-core 0.10.0 (dist/portal/…), que
// no son API pública: fijar la versión y revisar al actualizar.
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'

/** Tipos de referencia que usa Casa Hiedra → código del select EFXP_TPO_DOC_REF del SII. */
export const TIPOS_REFERENCIA = { oc: '801', hes: 'HES', nota_pedido: '802', contrato: '803' }
export const MAX_REFERENCIAS = 3 // filas _001…_003 del formulario
export const MAX_NOMBRE_ITEM = 25 // EFXP_NMB_nn maxlength
export const MAX_ITEMS = 10 // cantTotCol del formulario
export const SESION_PERSONA_DIR = join(homedir(), '.hilvan-sii-persona', '.sii')

/** Texto que el SII acepta. Rechaza la raya larga "—" ("se encontraron caracteres no
 *  validos", observado 17-oct-2026); las tildes sí pasan. Se reemplazan los signos
 *  tipográficos comunes y se quita lo que no sea Latin-1 imprimible. */
export function limpiarTexto(v) {
  return String(v ?? '')
    .replace(/[‒-―−]/g, '-')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7e -ÿ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Valida y normaliza las referencias. Lanza Error con un mensaje en español. */
export function normalizarReferencias(refs) {
  if (refs === undefined || refs === null) return []
  if (!Array.isArray(refs)) throw new Error('referencias debe ser una lista')
  if (refs.length > MAX_REFERENCIAS) throw new Error(`El SII admite ${MAX_REFERENCIAS} referencias como máximo`)
  return refs.map((r, i) => {
    const n = `referencias[${i}]`
    const tipo = TIPOS_REFERENCIA[String(r?.tipo ?? '').toLowerCase()] ?? String(r?.tipo ?? '')
    if (!tipo) throw new Error(`${n}: falta tipo (oc, hes, nota_pedido, contrato o un código del SII)`)
    const folio = String(r?.folio ?? '').trim()
    if (!folio) throw new Error(`${n}: falta folio`)
    if (folio.length > 18) throw new Error(`${n}: el folio admite 18 caracteres`)
    const fecha = String(r?.fecha ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`${n}: fecha debe ser AAAA-MM-DD`)
    // Sin razón, el folio: así salen las facturas de Casa Hiedra ("6001751562- Orden Compra
    // N° 6001751562 del …"); vacía, el PDF muestra "- Orden Compra …".
    const razon = limpiarTexto(r?.razon ?? '') || folio
    if (razon.length > 90) throw new Error(`${n}: la razón admite 90 caracteres`)
    return { tipo, folio, fecha, razon }
  })
}

/** Código que corre DENTRO de la página del formulario ya llenado por la librería: marca
 *  "Referencias", llena las filas, vuelve a validar con el SII y serializa el formulario
 *  con la misma regla que la librería (fillScript). */
export function referenciasScript(refs) {
  return `(async () => {
  const R = ${JSON.stringify(refs)};
  const f = document.forms['VIEW_EFXP'];
  if (!f) return { scraper: 'no está el formulario VIEW_EFXP' };
  const el = (n) => f.elements[n] || null;
  const esperar = async (nombres, ms) => {
    const fin = Date.now() + ms;
    for (;;) {
      if (nombres.every((n) => el(n))) return true;
      if (Date.now() > fin) return false;
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const cambio = (e) => e.dispatchEvent(new Event('change', { bubbles: true }));
  const elegir = (n, v) => {
    const e = el(n);
    if (!e) return 'falta ' + n;
    if (!Array.from(e.options).some((o) => o.value === v)) {
      return n + ': el SII no ofrece "' + v + '" (opciones: ' + Array.from(e.options).map((o) => o.value).filter(Boolean).join(', ') + ')';
    }
    e.value = v; cambio(e); return null;
  };

  const casilla = el('REF_SI_NO');
  if (!casilla) return { scraper: 'falta la casilla REF_SI_NO' };
  if (!casilla.checked) casilla.click();
  if (!(await esperar(['EFXP_TPO_DOC_REF_001', 'EFXP_FOLIO_REF_001', 'EFXP_FCH_REF_001'], 10000))) {
    return { scraper: 'no se dibujaron las filas de referencias' };
  }
  for (let i = 0; i < R.length; i += 1) {
    const r = R[i];
    const n3 = String(i + 1).padStart(3, '0');
    const n2 = String(i + 1).padStart(2, '0');
    let err = elegir('EFXP_TPO_DOC_REF_' + n3, r.tipo);
    if (err) return { error: err };
    const folio = el('EFXP_FOLIO_REF_' + n3);
    if (!folio) return { scraper: 'falta EFXP_FOLIO_REF_' + n3 };
    folio.value = r.folio; cambio(folio);
    const [a, m, d] = r.fecha.split('-');
    for (const [campo, v] of [['cbo_anio_boleta_ref_' + n2, a], ['cbo_mes_boleta_ref_' + n2, m], ['cbo_dia_boleta_ref_' + n2, d]]) {
      err = elegir(campo, v);
      if (err) return { error: 'fecha de la referencia ' + (i + 1) + ': ' + err };
    }
    const fch = el('EFXP_FCH_REF_' + n3);
    if (!fch || fch.value !== r.fecha) {
      return { scraper: 'la fecha de la referencia ' + (i + 1) + ' no quedó en EFXP_FCH_REF_' + n3 + ' (' + (fch && fch.value) + ')' };
    }
    const razon = el('EFXP_RAZON_REF_' + n3);
    if (!razon) return { scraper: 'falta EFXP_RAZON_REF_' + n3 };
    razon.value = r.razon;
  }

  const msgs = [];
  const prev = window.alert;
  window.alert = (x) => msgs.push(String(x).trim());
  let ok = false;
  try {
    const btn = el('Button_Update');
    if (!btn) { window.alert = prev; return { scraper: 'falta el botón Button_Update' }; }
    ok = !!validaFacEx(btn);
  } catch (e) { window.alert = prev; return { scraper: String((e && e.message) || e) }; }
  window.alert = prev;

  const fields = {};
  for (const e of f.elements) {
    if (!e.name || e.type === 'button' || e.type === 'submit') continue;
    if ((e.type === 'checkbox' || e.type === 'radio') && !e.checked) continue;
    fields[e.name] = e.value;
  }
  const num = (n) => Number((el(n) || {}).value || 0);
  return { ok, msgs, fields, totales: { neto: num('EFXP_MNT_NETO'), iva: num('EFXP_IVA'), total: num('EFXP_MNT_TOTAL') } };
})()`
}

/** Carga sii-core desde su instalación (por defecto ~/sii-ensayo). */
export async function cargarSiiCore(dist = process.env.SII_CORE_DIST || join(homedir(), 'sii-ensayo', 'node_modules', '@albertomarturelo', 'sii-core', 'dist')) {
  const imp = (p) => import(pathToFileURL(join(dist, p)).href)
  const [node, auth, mipyme, rut, tareas, cli] = await Promise.all([
    imp('node.js'), imp('auth/index.js'), imp('portal/dte-mipyme.js'), imp('rut/index.js'), imp('index.js'), imp('cli.js'),
  ])
  return { node, auth, mipyme, rut, tareas, cli }
}

/** Runtime de la librería apuntando a la sesión PERSONAL (no toca ~/.sii de la empresa). */
export function runtimePersona(core, dir = SESION_PERSONA_DIR) {
  const { createNodeRuntime, FileKeyValueStore, FileAuditSink, KeyringSecretStore } = core.node
  return createNodeRuntime({
    store: new FileKeyValueStore(dir),
    audit: new FileAuditSink(join(dir, 'audit.jsonl')),
    secrets: new KeyringSecretStore(),
  })
}

const hoyChile = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/**
 * Graba un borrador (con referencias) y baja su vista previa. Devuelve
 * { id, empresa, totales, avisos, vistaPrevia }. Lanza Error con el mensaje del SII si
 * su validador rechaza el documento. Nunca reintenta una escritura.
 *
 * doc: { empresa, tipoDte?, fechaEmision?, ciudadEmisor, formaPago?, receptor:{rut,
 *        razonSocial, direccion, comuna, ciudad, giro, contacto?}, items:[{nombre,
 *        descripcion?, cantidad, unidad?, precioUnitario, descuentoPct?}], referencias? }
 */
export async function prepararBorrador(core, runtime, doc, { outDir, pausaMs = 1000 } = {}) {
  const { withSession } = core.auth
  const { resolveAndSelectEmpresa, fetchBorradores, fillFactura, grabaBorrador, fetchPreviewPdf } = core.mipyme
  const { Rut } = core.rut
  const pausa = () => new Promise((r) => setTimeout(r, pausaMs))

  const tipoDte = doc.tipoDte ?? 33
  if (tipoDte !== 33 && tipoDte !== 34) throw new Error('Solo facturas 33 (afecta) o 34 (exenta)')
  const items = doc.items ?? []
  if (!items.length) throw new Error('La factura no trae ítems')
  if (items.length > MAX_ITEMS) throw new Error(`El SII admite ${MAX_ITEMS} líneas como máximo`)
  const referencias = normalizarReferencias(doc.referencias)
  const receptorRut = Rut.parse(doc.receptor.rut)
  const input = {
    tipoDte,
    fechaEmision: doc.fechaEmision ?? hoyChile(),
    ciudadEmisor: doc.ciudadEmisor,
    formaPago: doc.formaPago ?? 'credito',
    receptor: {
      rut: String(receptorRut.body),
      dv: receptorRut.dv,
      razonSocial: doc.receptor.razonSocial,
      direccion: doc.receptor.direccion,
      comuna: doc.receptor.comuna,
      ciudad: doc.receptor.ciudad,
      giro: doc.receptor.giro,
      ...(doc.receptor.contacto ? { contacto: doc.receptor.contacto } : {}),
    },
    items: items.map((it, i) => {
      const nombre = limpiarTexto(it.nombre)
      if (!nombre) throw new Error(`items[${i}]: falta nombre`)
      if (nombre.length > MAX_NOMBRE_ITEM) throw new Error(`items[${i}]: el nombre admite ${MAX_NOMBRE_ITEM} caracteres ("${nombre}")`)
      return {
        nombre,
        ...(it.descripcion ? { descripcion: limpiarTexto(it.descripcion) } : {}),
        cantidad: it.cantidad,
        ...(it.unidad ? { unidad: it.unidad } : {}),
        precioUnitario: it.precioUnitario,
        ...(it.descuentoPct ? { descuentoPct: it.descuentoPct } : {}),
      }
    }),
  }

  return withSession(runtime, async (s) => {
    const emp = await resolveAndSelectEmpresa(s, Rut.parse(doc.empresa), tipoDte, pausa)
    const antes = (await fetchBorradores(s)).map((b) => b.id)
    await pausa()
    let lleno = await fillFactura(s, emp, { ...input, empresa: emp.rut })
    if (referencias.length) {
      const r = await s.evaluate(referenciasScript(referencias))
      if (r.scraper) throw new Error(`Formulario de referencias del SII no reconocido (${r.scraper})`)
      if (r.error) throw new Error(r.error)
      if (!r.ok) throw new Error((r.msgs ?? []).join(' ') || 'El SII rechazó las referencias')
      lleno = { fields: r.fields, totales: r.totales, avisos: lleno.avisos }
    }
    await pausa()
    await grabaBorrador(s, lleno) // escritura: nunca se reintenta
    await pausa()
    const id = (await fetchBorradores(s)).find((b) => !antes.includes(b.id))?.id ?? null
    let vistaPrevia = null
    if (outDir) {
      await pausa()
      const pdf = await fetchPreviewPdf(s, lleno, pausa)
      await mkdir(outDir, { recursive: true, mode: 0o700 })
      vistaPrevia = join(outDir, `borrador-${tipoDte}-${emp.rut}-${id ?? 'sin-id'}.pdf`)
      await writeFile(vistaPrevia, pdf, { mode: 0o600 })
    }
    return { id, empresa: emp, totales: lleno.totales, avisos: lleno.avisos, vistaPrevia }
  })
}
