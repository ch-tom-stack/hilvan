import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = fs.readFileSync('.env.local', 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))
const B = 'https://app.casahiedra.com/api/agent', T = get('HILVAN_AGENT_TOKEN')
const api = async (m, r, body) => { const x = await fetch(B + r, { method: m, headers: { Authorization: `Bearer ${T}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j; try { j = await x.json() } catch { j = null }; return { status: x.status, json: j } }
let fallos = 0
const ok = (c, msg, extra = '') => { console.log(`${c ? '✓' : '✗ FALLA'} ${msg}${extra ? ' — ' + String(extra).slice(0, 160) : ''}`); if (!c) fallos++ }
const it = (nombre, precio, extra = {}) => ({ nombre, tipo: 'rol', precio_cliente: precio, cantidad: 1, dias: 1, ...extra })
let cotId = null
try {
  console.log('— 7. crear con cliente + agencia')
  let r = await api('POST', '/crear-cotizacion', { nombre: 'ZZ PRUEBA API (borrar)', cliente_nombre_libre: 'Stanley Tools', agencia_nombre_libre: 'TMP.Digital', serie: 'ZZ', historica: true, notas_cliente: 'Nota visible', notas_internas: 'Nota interna', descripcion: 'Desc cot',
    departamentos: [{ nombre: 'Cámara', items: [it('Asistente', 1000, { descripcion: 'desc del asistente' }), it('Asistente', 2000)], subgrupos: [{ nombre: 'Ópticas', items: [it('Lente 35', 500)] }] }, { nombre: 'Arte', items: [it('Utilería', 700)] }] })
  cotId = r.json?.cotizacion_id
  ok(r.status === 200 && cotId, 'creada', r.json?.numero)

  console.log('— 8. buscar')
  r = await api('GET', '/cotizaciones?q=TMP.Digital')
  const f = (r.json ?? []).find(x => x.id === cotId)
  ok(f && f.nombre?.startsWith('ZZ PRUEBA') && f.cliente === 'Stanley Tools' && f.agencia === 'TMP.Digital', 'buscar por agencia devuelve nombre, cliente y agencia', JSON.stringify(f))

  console.log('— 1/4/6. detalle e items')
  r = await api('GET', `/cotizacion-detalle?cotizacion_id=${cotId}`)
  const d = r.json?.[0]
  const cam = d?.departamentos.find(x => x.nombre === 'Cámara'), arte = d?.departamentos.find(x => x.nombre === 'Arte')
  ok(d && d.cliente === 'Stanley Tools' && d.agencia === 'TMP.Digital' && d.notas_cliente === 'Nota visible' && d.notas_internas === 'Nota interna' && d.descripcion === 'Desc cot', 'detalle: encabezado y textos')
  ok(cam?.departamento_id && cam.subgrupos[0]?.subgrupo_id && cam.items[0]?.departamento_id === cam.departamento_id && cam.subgrupos[0].items[0]?.subgrupo_id === cam.subgrupos[0].subgrupo_id, 'detalle: ids en nodos e ítems')
  ok(cam?.items.find(i => i.nombre === 'Asistente' && i.descripcion === 'desc del asistente'), 'detalle: descripcion por ítem')
  ok(cam?.vacio === false && cam.subgrupos[0].vacio === false, 'detalle: vacio=false donde hay contenido')
  r = await api('GET', `/cotizacion-detalle?cotizacion_id=${cotId}&incluir_textos=false`)
  ok(!('notas_internas' in (r.json?.[0] ?? {})) && !('descripcion' in (r.json?.[0]?.departamentos?.[0]?.items?.[0] ?? {})), 'incluir_textos=false omite textos')
  r = await api('GET', `/cotizacion-items?cotizacion_id=${cotId}`)
  ok(r.json?.every(x => x.departamento_id) && r.json.find(x => x.subgrupo === 'Ópticas')?.subgrupo_id, 'items: departamento_id y subgrupo_id')

  console.log('— 1. categorías por nombre')
  r = await api('POST', '/cotizacion-precio-categoria', { nivel: 'departamento', id: 'arte', cotizacion_id: cotId, precio_manual: 123456 })
  ok(r.status === 200 && r.json.nombre === 'Arte', 'precio_categoria por nombre (minúsculas)', JSON.stringify(r.json).slice(0, 100))
  r = await api('POST', '/cotizacion-precio-categoria', { nivel: 'departamento', id: 'arte', precio_manual: 1 })
  ok(r.status === 400 && /cotizacion_id/.test(r.json?.error), 'por nombre sin cotizacion_id → 400 claro', r.json?.error)
  r = await api('POST', '/cotizacion-categoria', { accion: 'renombrar', nivel: 'subgrupo', id: 'OPTICAS', cotizacion_id: cotId, nombre: 'Ópticas G Master' })
  ok(r.status === 200, 'categoria renombrar sub-grupo por nombre sin tilde', JSON.stringify(r.json).slice(0, 100))
  r = await api('POST', '/cotizacion-categoria', { accion: 'renombrar', nivel: 'departamento', id: 'Vestuario', cotizacion_id: cotId, nombre: 'x' })
  ok(r.status === 404 && /Hay:/.test(r.json?.error), 'nombre inexistente → dice cuáles hay', r.json?.error)

  console.log('— 2. mover ítems sin recrear')
  const asisId = cam.items.find(i => i.nombre === 'Asistente' && i.precio_cliente === 2000).item_id
  r = await api('POST', '/cotizacion-editar-item', { item_id: asisId, departamento: 'arte', subgrupo: 'Nuevo sub' })
  ok(r.status === 200 && r.json.cambios.departamento_id === arte.departamento_id && r.json.cambios.subgrupo_id && r.json.creadas?.length === 1, 'editar_item: mueve a Arte y crea el sub-grupo', JSON.stringify(r.json).slice(0, 140))
  r = await api('POST', '/cotizacion-editar-item', { item_id: asisId, subgrupo: null })
  ok(r.status === 200 && r.json.cambios.subgrupo_id === null, 'subgrupo:null lo deja directo')
  r = await api('POST', '/cotizacion-categoria', { accion: 'mover_item', item_id: asisId, departamento_id: 'Cámara', subgrupo_id: 'ópticas g master' })
  ok(r.status === 200, 'mover_item con nombres', JSON.stringify(r.json).slice(0, 100))

  console.log('— 6. categoría vacía: eliminar por nombre')
  r = await api('GET', `/cotizacion-detalle?cotizacion_id=${cotId}`)
  const arte2 = r.json[0].departamentos.find(x => x.nombre === 'Arte')
  const sgVacio = arte2.subgrupos.find(s => s.nombre === 'Nuevo sub')
  ok(sgVacio?.vacio === true, 'detalle marca vacio:true el sub-grupo que quedó sin ítems')
  r = await api('POST', '/cotizacion-categoria', { accion: 'eliminar', nivel: 'subgrupo', id: 'nuevo sub', cotizacion_id: cotId })
  ok(r.status === 200, 'eliminar sub-grupo vacío por nombre', JSON.stringify(r.json).slice(0, 80))

  console.log('— 3/10. agregar con boleta; con_boleta=false → tasa 0')
  r = await api('POST', '/cotizacion-agregar-items', { cotizacion_id: cotId, items: [{ departamento: 'Cámara', nombre: 'Gaffer', precio_cliente: 90000, con_boleta: true, tasa_boleta: 0.1525, precio_neto_proveedor: 70000, descuento_item: 10, descuento_item_tipo: 'porcentaje' }, { departamento: 'Cámara', nombre: 'Sin boleta', precio_cliente: 100, con_boleta: false, tasa_boleta: 0.153 }] })
  ok(r.status === 200 && r.json.agregados === 2, 'agregar_items acepta los campos')
  const { data: nuevos } = await admin.from('cotizacion_items').select('nombre, con_boleta, tasa_boleta, precio_neto_proveedor, descuento_item, descuento_item_tipo').eq('cotizacion_id', cotId).in('nombre', ['Gaffer', 'Sin boleta'])
  const g = nuevos.find(x => x.nombre === 'Gaffer'), sb = nuevos.find(x => x.nombre === 'Sin boleta')
  ok(g?.con_boleta === true && Math.abs(g.tasa_boleta - 0.1525) < 1e-6 && g.precio_neto_proveedor === 70000 && g.descuento_item === 10 && g.descuento_item_tipo === 'porcentaje', 'Gaffer guardado con boleta, neto y descuento', JSON.stringify(g))
  ok(sb?.con_boleta === false && Number(sb.tasa_boleta) === 0, 'sin boleta → tasa_boleta 0 aunque venga 0.153', JSON.stringify(sb))
  const gId = (await admin.from('cotizacion_items').select('id').eq('cotizacion_id', cotId).eq('nombre', 'Gaffer').single()).data.id
  r = await api('POST', '/cotizacion-editar-item', { item_id: gId, con_boleta: false })
  ok(r.status === 200 && r.json.cambios.tasa_boleta === 0, 'editar_item con_boleta=false deja tasa 0')

  console.log('— 7. editar encabezado')
  r = await api('POST', '/cotizacion-editar', { cotizacion_id: cotId, agencia_nombre_libre: 'Republik', cliente_nombre_libre: 'Falabella' })
  ok(r.status === 200, 'editar agencia/cliente')
  r = await api('GET', `/cotizacion-detalle?cotizacion_id=${cotId}&incluir_textos=false`)
  ok(r.json[0].cliente === 'Falabella' && r.json[0].agencia === 'Republik', 'detalle refleja el encabezado nuevo')

  console.log('— 9. equipos y kits')
  r = await api('GET', '/equipos?q=a7s&solo_rentables=true')
  ok(r.status === 200 && r.json.equipos.some(e => e.codigo === 'CH-CAM-002') && r.json.categorias.length > 0, 'equipos_listar q=a7s', r.json?.equipos?.[0]?.nombre)
  r = await api('GET', '/equipos?categoria=OPT')
  ok(r.json.equipos.length > 0 && r.json.equipos.every(e => e.categoria_codigo === 'OPT'), 'filtro por categoría')
  r = await api('GET', '/bundles')
  const camion = r.json?.bundles?.find(b => b.codigo === 'CH-CAMION')
  ok(camion && camion.incluye.some(i => i.nombre === 'SONY A7S III') && camion.incluye.filter(i => i.codigo.startsWith('CH-OPT')).length === 6, 'bundles: Camión con A7S III y 6 G Master', `${camion?.incluye?.length} componentes · $${camion?.precio_jornada}`)

  console.log('— 5. eliminar y deshacer')
  r = await api('POST', '/cotizacion-eliminar', { cotizacion_id: cotId })
  ok(r.status === 200 && r.json.grupo_borrado === true, 'eliminar: borra cotización y grupo (era la única versión)', r.json?.nota)
  const { count: c1 } = await admin.from('cotizaciones').select('id', { count: 'exact', head: true }).eq('id', cotId)
  ok(c1 === 0, 'ya no existe')
  const { data: acc } = await admin.from('agente_acciones').select('id').eq('herramienta', 'cotizacion-eliminar').eq('resultado_id', cotId).eq('deshecha', false).limit(1)
  r = await api('POST', '/deshacer', { accion_id: acc[0].id })
  ok(r.status === 200, 'deshacer restaura', JSON.stringify(r.json))
  r = await api('GET', `/cotizacion-detalle?cotizacion_id=${cotId}&incluir_textos=false`)
  const dd = r.json?.[0]
  ok(dd && dd.numero && dd.departamentos.length === 2 && dd.departamentos.reduce((s, x) => s + x.items.length + x.subgrupos.reduce((t, y) => t + y.items.length, 0), 0) === 6, 'vuelve completa con número, 2 grupos y 6 ítems', `${dd?.numero} · ${dd?.cliente}`)
} catch (e) { console.log('✗ EXCEPCIÓN', e.message); fallos++ } finally {
  console.log('— Limpieza')
  if (cotId) { const r = await api('POST', '/cotizacion-eliminar', { cotizacion_id: cotId }); console.log('eliminar de nuevo →', r.status) }
  await admin.from('agente_acciones').delete().in('herramienta', ['cotizacion-eliminar', 'cotizacion-precio-categoria', 'cotizacion-categoria', 'cotizacion-editar-item', 'cotizacion-agregar-items', 'cotizacion-editar', 'crear-cotizacion']).gte('created_at', new Date(Date.now() - 10 * 60000).toISOString())
  const { count: a } = await admin.from('cotizaciones').select('id', { count: 'exact', head: true }).like('nombre', 'ZZ PRUEBA%')
  const { count: b } = await admin.from('cotizacion_grupos').select('id', { count: 'exact', head: true }).like('numero_base', 'CH-ZZ-%')
  console.log(`residuos → cotizaciones: ${a} · grupos CH-ZZ: ${b}`)
  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`)
}
