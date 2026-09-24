'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { copiaDeItem, copiaDeGrupo, cuentaItems, guardarPortapapeles, leerPortapapeles, CLAVE_PORTAPAPELES, type Portapapeles } from '@/lib/portapapeles-cotizacion'
import { useConfirm, usePrompt } from '@/components/ui/useConfirm'
import { toastOk, toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import { useCambiado } from '@/components/ui/useCambiado'
import {
  actualizarCotizacion,
  enviarCotizacion,
  nuevaVersion,
  nuevaVariante,
  duplicarCotizacion,
  eliminarCotizacion,
  agregarDepartamento,
  actualizarDepartamento,
  eliminarDepartamento,
  agregarSubgrupo,
  actualizarSubgrupo,
  reordenarNivel,
  eliminarSubgrupo,
  agregarItem,
  actualizarItem,
  eliminarItem,
  cambiarEstadoCotizacion,
} from '@/app/actions/cotizaciones'
import {
  numeroCotizacion,
  calcularTotales,
  type Cotizacion,
  type CotizacionDepartamento,
  type CotizacionSubgrupo,
  type CotizacionItem,
  type TarifaBase,
  type Equipo,
} from '@/types'
import Link from 'next/link'
import ItemModal from './ItemModal'
import PanelFacturacion from './PanelFacturacion'
import DepBlock from './BloquesDepartamento'
import PanelTotales from './PanelTotales'
import { ordenar, renumerar, moverUnPuesto, insertarAntesDe, cambiosDeOrden, siguienteOrden } from '@/lib/orden'

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface Props {
  cotizacion: Cotizacion
  tarifas: TarifaBase[]
  equipos: Equipo[]
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  borrador:      { label: 'Borrador',      color: 'text-ch-muted' },
  enviada:       { label: 'Enviada',       color: 'text-blue-300' },
  aprobada:      { label: 'Aprobada',      color: 'text-ch-green' },
  rechazada:     { label: 'Rechazada',     color: 'text-red-400' },
  en_produccion: { label: 'En producción', color: 'text-amber-300' },
  cerrada:       { label: 'Cerrada',       color: 'text-ch-muted/60' },
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function ConstructorCotizacion({ cotizacion: initial, tarifas, equipos }: Props) {
  // Un solo ref para el panel de totales: cambie el precio de un
  // departamento, de un subgrupo o de un ítem, lo que la persona mira para
  // saber si el cambio surtió efecto es el total.
  const cam = useCambiado<HTMLDivElement>()
  const [cot, setCot] = useState<Cotizacion>(initial)
  // Tras un deshacer/rehacer global la página se refresca y llega un `initial`
  // nuevo: el estado local se alinea con lo que quedó en el servidor.
  useEffect(() => { setCot(initial) }, [initial])

  // Selección con clic (para Ctrl+C / Ctrl+V): un ítem o un grupo.
  const [seleccion, setSeleccion] = useState<{ tipo: 'item'; item: CotizacionItem; depId: string; sgId: string | null } | { tipo: 'grupo'; depId: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [linkCopiado, setLinkCopiado] = useState(false)
  const [estadoOpen, setEstadoOpen] = useState(false)
  const [itemModal, setItemModal] = useState<{
    mode: 'nuevo' | 'editar'
    depId: string
    sgId?: string
    item?: CotizacionItem
  } | null>(null)
  const [showInterno, setShowInterno] = useState(false)
  const [editandoNombre, setEditandoNombre] = useState(false)
  const { confirm, ConfirmDialog } = useConfirm()
  const { prompt, PromptDialog } = usePrompt()

  const numVisible = numeroCotizacion({ grupo: cot.grupo, version: cot.version, variante: cot.variante })
  const totales = calcularTotales(cot)
  const editable = cot.estado === 'borrador'

  // ── HELPERS DE ESTADO LOCAL ─────────────────────────────────────────────────

  function actualizarDepLocal(depId: string, fn: (d: CotizacionDepartamento) => CotizacionDepartamento) {
    setCot(c => ({
      ...c,
      departamentos: c.departamentos?.map(d => d.id === depId ? fn(d) : d),
    }))
  }

  function actualizarSgLocal(depId: string, sgId: string, fn: (sg: CotizacionSubgrupo) => CotizacionSubgrupo) {
    actualizarDepLocal(depId, d => ({
      ...d,
      subgrupos: d.subgrupos?.map(sg => sg.id === sgId ? fn(sg) : sg),
    }))
  }

  // ── ACCIONES COTIZACIÓN ─────────────────────────────────────────────────────

  async function handleEnviar() {
    try {
      const token = await enviarCotizacion(cot.id)
      const link = `${window.location.origin}/cotizacion/${token}`
      await navigator.clipboard.writeText(link)
      setLinkCopiado(true)
      setCot(c => ({ ...c, estado: 'enviada', token }))
      setTimeout(() => setLinkCopiado(false), 3000)
      momento('cotizacion.enviada')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al enviar')
    }
  }

  async function handleCopiarLink() {
    if (!cot.token) return
    const link = `${window.location.origin}/cotizacion/${cot.token}`
    await navigator.clipboard.writeText(link)
    setLinkCopiado(true)
    setTimeout(() => setLinkCopiado(false), 3000)
  }

  // ── DEPARTAMENTOS ───────────────────────────────────────────────────────────

  async function handleAgregarDep() {
    const nombre = await prompt('Nombre del departamento:')
    if (!nombre?.trim()) return
    const orden = siguienteOrden(cot.departamentos ?? [])
    try {
      const data = await agregarDepartamento(cot.id, nombre.trim(), orden)
      setCot(c => ({
        ...c,
        departamentos: [...(c.departamentos ?? []), { ...data, subgrupos: [], items: [] }],
      }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al agregar departamento')
    }
  }

  async function handleRenombrarDep(dep: CotizacionDepartamento) {
    const nombre = await prompt('Nuevo nombre:', dep.nombre)
    if (!nombre?.trim() || nombre === dep.nombre) return
    try {
      await actualizarDepartamento(dep.id, cot.id, { nombre: nombre.trim() })
      actualizarDepLocal(dep.id, d => ({ ...d, nombre: nombre.trim() }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al renombrar departamento')
    }
  }

  // Precio nativo del bundle a nivel de categoría: vacío = volver a sumar ítems.
  function parsearPrecioBundle(val: string | null): number | null | undefined {
    if (val === null) return undefined // cancelado
    const limpio = val.trim()
    if (limpio === '') return null // sin precio manual → suma de ítems
    const n = parseFloat(limpio.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) { toastError('Monto inválido'); return undefined }
    return Math.round(n)
  }

  async function handlePrecioDep(dep: CotizacionDepartamento) {
    const actual = dep.precio_manual != null ? String(dep.precio_manual) : ''
    const val = await prompt(`Precio del bundle para "${dep.nombre}" (vacío = sumar ítems):`, actual)
    const precio_manual = parsearPrecioBundle(val)
    if (precio_manual === undefined) return
    try {
      await actualizarDepartamento(dep.id, cot.id, { precio_manual })
      cam.marcar()
      actualizarDepLocal(dep.id, d => ({ ...d, precio_manual }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al fijar el precio')
    }
  }

  async function handlePrecioSg(dep: CotizacionDepartamento, sg: CotizacionSubgrupo) {
    const actual = sg.precio_manual != null ? String(sg.precio_manual) : ''
    const val = await prompt(`Precio del bundle para "${sg.nombre}" (vacío = sumar ítems):`, actual)
    const precio_manual = parsearPrecioBundle(val)
    if (precio_manual === undefined) return
    try {
      await actualizarSubgrupo(sg.id, cot.id, { precio_manual })
      cam.marcar()
      actualizarSgLocal(dep.id, sg.id, s => ({ ...s, precio_manual }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al fijar el precio')
    }
  }

  async function handleEliminarDep(dep: CotizacionDepartamento) {
    if (!await confirm(`¿Eliminar "${dep.nombre}" y todos sus ítems?`)) return
    try {
      await eliminarDepartamento(dep.id, cot.id)
      toastOk('Eliminado')
      setCot(c => ({
        ...c,
        departamentos: c.departamentos?.filter(d => d.id !== dep.id),
      }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al eliminar departamento')
    }
  }

  // ── SUB-GRUPOS ──────────────────────────────────────────────────────────────

  async function handleAgregarSg(dep: CotizacionDepartamento) {
    const nombre = await prompt('Nombre del sub-grupo:')
    if (!nombre?.trim()) return
    const orden = siguienteOrden(dep.subgrupos ?? [])
    try {
      const data = await agregarSubgrupo(cot.id, dep.id, nombre.trim(), orden)
      actualizarDepLocal(dep.id, d => ({
        ...d,
        subgrupos: [...(d.subgrupos ?? []), { ...data, items: [] }],
      }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al agregar sub-grupo')
    }
  }

  async function handleRenombrarSg(dep: CotizacionDepartamento, sg: CotizacionSubgrupo) {
    const nombre = await prompt('Nuevo nombre:', sg.nombre)
    if (!nombre?.trim() || nombre === sg.nombre) return
    try {
      await actualizarSubgrupo(sg.id, cot.id, { nombre: nombre.trim() })
      actualizarSgLocal(dep.id, sg.id, s => ({ ...s, nombre: nombre.trim() }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al renombrar sub-grupo')
    }
  }

  async function handleEliminarSg(dep: CotizacionDepartamento, sg: CotizacionSubgrupo) {
    if (!await confirm(`¿Eliminar "${sg.nombre}" y todos sus ítems?`)) return
    try {
      await eliminarSubgrupo(sg.id, cot.id)
      toastOk('Eliminado')
      actualizarDepLocal(dep.id, d => ({
        ...d,
        subgrupos: d.subgrupos?.filter(s => s.id !== sg.id),
      }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al eliminar sub-grupo')
    }
  }

  // ── ÍTEMS ───────────────────────────────────────────────────────────────────

  async function handleGuardarItem(itemData: Omit<CotizacionItem, 'id' | 'created_at' | 'subtotal_cliente' | 'costo_real' | 'margen'>) {
    try {
      if (itemModal?.mode === 'nuevo') {
        // Al final de SU grupo. El modal mandaba siempre orden 99: todos los
        // ítems nacían empatados y la base los devolvía en cualquier orden.
        const orden = siguienteOrden(itemsDe(itemModal.depId, itemModal.sgId ?? null))
        const data = await agregarItem({ ...itemData, orden })
        momento('gasto.creado')
        if (itemModal.sgId) {
          actualizarSgLocal(itemModal.depId, itemModal.sgId, sg => ({
            ...sg,
            items: [...(sg.items ?? []), data],
          }))
        } else {
          actualizarDepLocal(itemModal.depId, d => ({
            ...d,
            items: [...(d.items ?? []), data],
          }))
        }
      } else if (itemModal?.mode === 'editar' && itemModal.item) {
        await actualizarItem(itemModal.item.id, cot.id, itemData)
        const itemId = itemModal.item.id
        const updatedItem = { ...itemModal.item, ...itemData }
        const oldDep = itemModal.depId
        const oldSg = itemModal.sgId ?? null
        const newDep = itemData.departamento_id
        const newSg = itemData.subgrupo_id ?? null
        const movido = oldDep !== newDep || oldSg !== newSg

        if (!movido) {
          // Edición en el mismo lugar: reemplazar en sitio.
          if (oldSg) {
            actualizarSgLocal(oldDep, oldSg, sg => ({ ...sg, items: sg.items?.map(i => i.id === itemId ? updatedItem : i) }))
          } else {
            actualizarDepLocal(oldDep, d => ({ ...d, items: d.items?.map(i => i.id === itemId ? updatedItem : i) }))
          }
        } else {
          // Movido de categoría/subgrupo: sacar del lugar viejo y agregar al nuevo.
          if (oldSg) {
            actualizarSgLocal(oldDep, oldSg, sg => ({ ...sg, items: sg.items?.filter(i => i.id !== itemId) }))
          } else {
            actualizarDepLocal(oldDep, d => ({ ...d, items: d.items?.filter(i => i.id !== itemId) }))
          }
          if (newSg) {
            actualizarSgLocal(newDep, newSg, sg => ({ ...sg, items: [...(sg.items ?? []), updatedItem] }))
          } else {
            actualizarDepLocal(newDep, d => ({ ...d, items: [...(d.items ?? []), updatedItem] }))
          }
        }
      }
      setItemModal(null)
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al guardar ítem')
    }
  }

  async function handleEliminarItem(item: CotizacionItem, depId: string, sgId?: string) {
    if (!await confirm(`¿Eliminar "${item.nombre}"?`)) return
    try {
      await eliminarItem(item.id, cot.id)
      toastOk('Eliminado')
      if (sgId) {
        actualizarSgLocal(depId, sgId, sg => ({
          ...sg,
          items: sg.items?.filter(i => i.id !== item.id),
        }))
      } else {
        actualizarDepLocal(depId, d => ({
          ...d,
          items: d.items?.filter(i => i.id !== item.id),
        }))
      }
      // Si era el último ítem, se ofrece borrar la categoría que quedó vacía.
      const dep = cot.departamentos?.find(d => d.id === depId)
      if (dep) {
        if (sgId) {
          const sg = dep.subgrupos?.find(s => s.id === sgId)
          const quedan = (sg?.items ?? []).filter(i => i.id !== item.id).length
          if (sg && quedan === 0 && await confirm(`El sub-grupo "${sg.nombre}" quedó vacío. ¿Eliminarlo también?`)) {
            await eliminarSubgrupo(sg.id, cot.id)
            actualizarDepLocal(depId, d => ({ ...d, subgrupos: d.subgrupos?.filter(s => s.id !== sg.id) }))
          }
        } else {
          const quedan = (dep.items ?? []).filter(i => i.id !== item.id).length
          if (quedan === 0 && (dep.subgrupos?.length ?? 0) === 0 && await confirm(`El grupo "${dep.nombre}" quedó vacío. ¿Eliminarlo también?`)) {
            await eliminarDepartamento(dep.id, cot.id)
            setCot(c => ({ ...c, departamentos: c.departamentos?.filter(d => d.id !== dep.id) }))
          }
        }
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al eliminar ítem')
    }
  }

  // Drag-and-drop: mover un ítem a otra categoría / subgrupo (o sacarlo: toSg=null).
  // ── COPIAR / PEGAR (entre cotizaciones, vía localStorage) ───────────────────
  const [portapapeles, setPortapapeles] = useState<Portapapeles | null>(null)
  useEffect(() => {
    setPortapapeles(leerPortapapeles())
    // Copiar en otra pestaña se refleja acá sin recargar.
    const onStorage = (e: StorageEvent) => { if (e.key === CLAVE_PORTAPAPELES) setPortapapeles(leerPortapapeles()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function copiarItem(item: CotizacionItem) {
    const p: Portapapeles = { tipo: 'item', etiqueta: item.nombre, origen: cot.nombre, datos: copiaDeItem(item) }
    if (!guardarPortapapeles(p)) { toastError('No se pudo copiar (el navegador bloquea el almacenamiento)'); return }
    setPortapapeles(p)
    toastOk(`Copiado «${item.nombre}». Aparece "pegar ítem" en cada grupo, también en otras cotizaciones.`)
  }

  function copiarGrupo(dep: CotizacionDepartamento) {
    const datos = copiaDeGrupo(dep)
    const p: Portapapeles = { tipo: 'grupo', etiqueta: dep.nombre, origen: cot.nombre, datos }
    if (!guardarPortapapeles(p)) { toastError('No se pudo copiar (el navegador bloquea el almacenamiento)'); return }
    setPortapapeles(p)
    toastOk(`Copiado el grupo «${dep.nombre}» (${cuentaItems(datos)} ítems). Aparece "Pegar grupo" al final, también en otras cotizaciones.`)
  }

  async function pegarItem(depId: string, sgId: string | null) {
    if (portapapeles?.tipo !== 'item') return
    try {
      const data = await agregarItem({
        ...portapapeles.datos, cotizacion_id: cot.id, departamento_id: depId, subgrupo_id: sgId,
        orden: siguienteOrden(itemsDe(depId, sgId)),
      })
      ponerItems(depId, sgId, [...itemsDe(depId, sgId), data])
      toastOk(`Pegado «${portapapeles.etiqueta}»`)
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'No se pudo pegar el ítem')
    }
  }

  async function pegarGrupo() {
    if (portapapeles?.tipo !== 'grupo') return
    const g = portapapeles.datos
    try {
      // Se crea en orden y se refleja al final: si algo falla a mitad queda lo
      // creado hasta ahí (se ve al recargar) y se avisa.
      const dep = await agregarDepartamento(cot.id, g.nombre, siguienteOrden(cot.departamentos ?? []))
      if (g.precio_manual != null) await actualizarDepartamento(dep.id, cot.id, { precio_manual: g.precio_manual })
      const items: CotizacionItem[] = []
      for (let i = 0; i < g.items.length; i++) {
        items.push(await agregarItem({ ...g.items[i], cotizacion_id: cot.id, departamento_id: dep.id, subgrupo_id: null, orden: i }))
      }
      const subgrupos: CotizacionSubgrupo[] = []
      for (let k = 0; k < g.subgrupos.length; k++) {
        const sgc = g.subgrupos[k]
        const sg = await agregarSubgrupo(cot.id, dep.id, sgc.nombre, k)
        if (sgc.precio_manual != null) await actualizarSubgrupo(sg.id, cot.id, { precio_manual: sgc.precio_manual })
        const sgItems: CotizacionItem[] = []
        for (let i = 0; i < sgc.items.length; i++) {
          sgItems.push(await agregarItem({ ...sgc.items[i], cotizacion_id: cot.id, departamento_id: dep.id, subgrupo_id: sg.id, orden: i }))
        }
        subgrupos.push({ ...sg, precio_manual: sgc.precio_manual, items: sgItems })
      }
      setCot(c => ({ ...c, departamentos: [...(c.departamentos ?? []), { ...dep, precio_manual: g.precio_manual, subgrupos, items }] }))
      toastOk(`Pegado el grupo «${g.nombre}» con ${cuentaItems(g)} ítems`)
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'No se pudo pegar el grupo completo. Recarga para ver qué alcanzó a crearse.')
    }
  }

  // Ctrl+C copia lo seleccionado; Ctrl+V pega en el grupo de lo seleccionado
  // (un ítem) o al final (un grupo). Dentro de un campo de texto no interviene.
  useEffect(() => {
    const enCampo = () => { const t = document.activeElement?.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (document.activeElement as HTMLElement | null)?.isContentEditable }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || enCampo() || itemModal) return
      const k = e.key.toLowerCase()
      if (k === 'c' && seleccion) {
        e.preventDefault()
        if (seleccion.tipo === 'item') copiarItem(seleccion.item)
        else { const d = cot.departamentos?.find(x => x.id === seleccion.depId); if (d) copiarGrupo(d) }
      } else if (k === 'v' && editable && portapapeles) {
        if (portapapeles.tipo === 'item') {
          e.preventDefault()
          const destino = seleccion?.tipo === 'item' ? { depId: seleccion.depId, sgId: seleccion.sgId }
            : seleccion?.tipo === 'grupo' ? { depId: seleccion.depId, sgId: null }
            : cot.departamentos?.length ? { depId: cot.departamentos[cot.departamentos.length - 1].id, sgId: null } : null
          if (destino) void pegarItem(destino.depId, destino.sgId)
        } else if (portapapeles.tipo === 'grupo') {
          e.preventDefault()
          void pegarGrupo()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── ORDEN ───────────────────────────────────────────────────────────────────
  // Se mueve en pantalla al tiro y se guarda después; si el guardado falla se
  // vuelve atrás. Siempre se renumera la lista completa (ver lib/orden.ts).

  async function guardarOrden(
    nivel: 'departamento' | 'subgrupo' | 'item',
    antes: { id: string; orden: number }[],
    despues: { id: string; orden: number }[],
    aplicar: (lista: any[]) => void,
  ) {
    const cambios = cambiosDeOrden(antes, despues)
    if (cambios.length === 0) return
    aplicar(despues)
    try {
      await reordenarNivel(cot.id, nivel, cambios)
    } catch (e) {
      aplicar(ordenar(antes))
      toastError(e instanceof Error ? e.message : 'No se pudo guardar el orden')
    }
  }

  function moverDep(dep: CotizacionDepartamento, dir: -1 | 1) {
    const antes = cot.departamentos ?? []
    const despues = moverUnPuesto(antes, dep.id, dir)
    if (!despues) return
    void guardarOrden('departamento', antes, despues, lista => setCot(c => ({ ...c, departamentos: lista })))
  }

  function moverSg(dep: CotizacionDepartamento, sg: CotizacionSubgrupo, dir: -1 | 1) {
    const antes = dep.subgrupos ?? []
    const despues = moverUnPuesto(antes, sg.id, dir)
    if (!despues) return
    void guardarOrden('subgrupo', antes, despues, lista => actualizarDepLocal(dep.id, d => ({ ...d, subgrupos: lista })))
  }

  function itemsDe(depId: string, sgId: string | null): CotizacionItem[] {
    const dep = cot.departamentos?.find(d => d.id === depId)
    return (sgId ? dep?.subgrupos?.find(s => s.id === sgId)?.items : dep?.items) ?? []
  }

  function ponerItems(depId: string, sgId: string | null, lista: CotizacionItem[]) {
    if (sgId) actualizarSgLocal(depId, sgId, sg => ({ ...sg, items: lista }))
    else actualizarDepLocal(depId, d => ({ ...d, items: lista }))
  }

  function moverItemPuesto(item: CotizacionItem, depId: string, sgId: string | null, dir: -1 | 1) {
    const antes = itemsDe(depId, sgId)
    const despues = moverUnPuesto(antes, item.id, dir)
    if (!despues) return
    void guardarOrden('item', antes, despues, lista => ponerItems(depId, sgId, lista))
  }

  // Arrastrar: cambia de grupo y/o de posición. Soltar SOBRE un ítem lo deja
  // justo antes de ese; soltar en el grupo lo deja al final.
  async function moverItem(
    itemId: string, fromDep: string, fromSg: string | null,
    toDep: string, toSg: string | null, antesDeId: string | null = null,
  ) {
    const mismoGrupo = fromDep === toDep && (fromSg ?? null) === (toSg ?? null)
    if (mismoGrupo && !antesDeId) return
    const origen = itemsDe(fromDep, fromSg)
    const item = origen.find(i => i.id === itemId)
    if (!item) return

    if (mismoGrupo) {
      await guardarOrden('item', origen, insertarAntesDe(origen, item, antesDeId), lista => ponerItems(toDep, toSg, lista))
      return
    }

    const destino = itemsDe(toDep, toSg)
    const movido = { ...item, departamento_id: toDep, subgrupo_id: toSg }
    const destinoNuevo = insertarAntesDe(destino, movido, antesDeId)
    const origenNuevo = renumerar(ordenar(origen).filter(i => i.id !== itemId))
    try {
      const ordenMovido = destinoNuevo.find(i => i.id === itemId)!.orden
      await actualizarItem(itemId, cot.id, { departamento_id: toDep, subgrupo_id: toSg, orden: ordenMovido })
      ponerItems(fromDep, fromSg, origenNuevo)
      ponerItems(toDep, toSg, destinoNuevo)
      // El resto de las filas que se corrieron, en los dos grupos.
      const resto = [
        ...cambiosDeOrden(origen, origenNuevo),
        ...cambiosDeOrden(destino, destinoNuevo).filter(c => c.id !== itemId),
      ]
      if (resto.length > 0) await reordenarNivel(cot.id, 'item', resto)
      toastOk('Ítem movido')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al mover el ítem')
    }
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      {ConfirmDialog}
      {PromptDialog}

      {/* ── HEADER ── */}
      <div className="border-b border-ch-border px-6 py-4 flex items-center justify-between gap-4 bg-ch-dark sticky top-0 z-20">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/cotizaciones" className="text-ch-muted hover:text-ch-cream transition-colors text-sm font-body shrink-0">
            ← Cotizaciones
          </Link>
          <span className="text-ch-subtle">|</span>
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-body text-xs text-ch-muted shrink-0">{numVisible}</span>
            {editandoNombre ? (
              <input
                autoFocus
                defaultValue={cot.nombre}
                onBlur={async e => {
                  const val = e.target.value.trim()
                  if (val && val !== cot.nombre) {
                    try {
                      await actualizarCotizacion(cot.id, { nombre: val })
                      setCot(c => ({ ...c, nombre: val }))
                    } catch (e) {
                      toastError(e instanceof Error ? e.message : 'Error al guardar nombre')
                    }
                  }
                  setEditandoNombre(false)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditandoNombre(false)
                }}
                className="bg-transparent border-b border-ch-cream/40 text-ch-cream font-body text-sm focus:outline-none min-w-0"
              />
            ) : (
              <button
                onClick={() => setEditandoNombre(true)}
                className="font-body text-sm text-ch-cream truncate hover:text-white ch-press"
              >
                {cot.nombre}
              </button>
            )}
            {/* Estado — dropdown admin */}
            <div className="relative">
              <button
                onClick={() => setEstadoOpen(o => !o)}
                className={`font-body text-xs ${ESTADO_CONFIG[cot.estado]?.color} flex items-center gap-1 hover:opacity-80 transition-opacity ch-press`}
              >
                {ESTADO_CONFIG[cot.estado]?.label}
                <span className="text-[8px] opacity-50">▾</span>
              </button>
              {estadoOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setEstadoOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-50 bg-ch-surface border border-ch-border min-w-[140px]">
                    {Object.entries(ESTADO_CONFIG).map(([key, { label, color }]) => (
                      <button
                        key={key}
                        disabled={isPending}
                        onClick={async () => {
                          setEstadoOpen(false)
                          startTransition(async () => {
                            try {
                              const res = await cambiarEstadoCotizacion(cot.id, key)
                              if (res.error) toastError(res.error)
                              else {
                                setCot(c => ({ ...c, estado: key as typeof c.estado }))
                                if (key === 'aprobada') momento('cotizacion.aprobada', { monto: totales.total })
                              }
                            } catch (e) {
                              toastError(e instanceof Error ? e.message : 'Error al cambiar estado')
                            }
                          })
                        }}
                        className={`w-full text-left px-3 py-2 font-body text-xs ${color} hover:bg-ch-border/20 transition-colors disabled:opacity-50 ${
                          key === cot.estado ? 'bg-ch-border/10' : ''
                        } ch-press`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Versiones */}
          <div className="flex items-center gap-1 border border-ch-border rounded overflow-hidden">
            <button
              onClick={() => startTransition(async () => {
                try {
                  const r = await nuevaVersion(cot.id)
                  if (r) { toastOk(`Nueva versión creada: ${r.numero}`); window.open(`/cotizaciones/${r.id}`, '_blank') }
                } catch (e) { toastError(e instanceof Error ? e.message : 'Error al crear versión') }
              })}
              disabled={isPending}
              className="px-3 py-1.5 font-body text-xs text-ch-muted hover:text-ch-cream hover:bg-ch-border/20 transition-colors ch-press"
            >
              + versión
            </button>
            <span className="w-px h-4 bg-ch-border" />
            <button
              onClick={() => startTransition(async () => {
                try {
                  const r = await nuevaVariante(cot.id)
                  if (r) { toastOk(`Nueva variante creada: ${r.numero}`); window.open(`/cotizaciones/${r.id}`, '_blank') }
                } catch (e) { toastError(e instanceof Error ? e.message : 'Error al crear variante') }
              })}
              disabled={isPending}
              className="px-3 py-1.5 font-body text-xs text-ch-muted hover:text-ch-cream hover:bg-ch-border/20 transition-colors ch-press"
            >
              + variante
            </button>
            <span className="w-px h-4 bg-ch-border" />
            <button
              onClick={() => startTransition(async () => {
                try {
                  const r = await duplicarCotizacion(cot.id)
                  if (r) { toastOk(`Cotización duplicada: ${r.numero}`); window.open(`/cotizaciones/${r.id}`, '_blank') }
                } catch (e) { toastError(e instanceof Error ? e.message : 'Error al duplicar') }
              })}
              disabled={isPending}
              className="px-3 py-1.5 font-body text-xs text-ch-muted hover:text-ch-cream hover:bg-ch-border/20 transition-colors ch-press"
            >
              duplicar
            </button>
            <span className="w-px h-4 bg-ch-border" />
            <button
              onClick={async () => {
                const etiqueta = numeroCotizacion({ grupo: cot.grupo, version: cot.version, variante: cot.variante })
                if (!await confirm(`¿Eliminar la cotización ${etiqueta}? Se puede recuperar con Ctrl+Z desde el listado.`)) return
                try {
                  await eliminarCotizacion(cot.id)
                  toastOk(`Cotización ${etiqueta} eliminada (Ctrl+Z en el listado la recupera)`)
                  window.location.href = '/cotizaciones'
                } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo eliminar') }
              }}
              disabled={isPending}
              className="px-3 py-1.5 font-body text-xs text-ch-muted hover:text-red-400 hover:bg-ch-border/20 transition-colors ch-press"
            >
              eliminar
            </button>
          </div>

          {/* Vista previa */}
          <a
            href={`/preview/${cot.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 border border-ch-border text-ch-muted font-body text-xs rounded hover:text-ch-cream hover:border-ch-cream/40 transition-colors"
          >
            Vista previa
          </a>

          {/* Descargar PDF */}
          <a
            href={`/api/cotizaciones/${cot.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            // Dentro del gesto, no después: el PDF se genera en el servidor y
            // la respuesta puede tardar. El obturador confirma el click.
            onClick={() => momento('pdf.generado')}
            className="px-3 py-1.5 border border-ch-border text-ch-muted font-body text-xs rounded hover:text-ch-cream hover:border-ch-cream/40 transition-colors"
          >
            ↓ PDF
          </a>

          {/* Enviar / link */}
          {cot.estado === 'borrador' ? (
            <button
              onClick={handleEnviar}
              className="px-4 py-1.5 bg-ch-cream text-ch-dark font-body text-xs font-medium rounded hover:bg-ch-cream/90 transition-colors ch-press"
            >
              Enviar al cliente
            </button>
          ) : cot.token ? (
            <button
              onClick={handleCopiarLink}
              className={`px-4 py-1.5 border font-body text-xs rounded transition-colors ${
                linkCopiado
                  ? 'border-ch-green/40 text-ch-green'
                  : 'border-ch-border text-ch-muted hover:text-ch-cream'
              } ch-press`}
            >
              {linkCopiado ? '✓ Link copiado' : 'Copiar link'}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── CUERPO ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── COLUMNA IZQUIERDA: constructor ── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">

          {/* Comentario del cliente si rechazó */}
          {cot.estado === 'rechazada' && cot.comentario_cliente && (
            <div className="border border-red-500/30 bg-red-500/5 rounded p-4">
              <p className="font-body text-xs text-red-400 uppercase tracking-wider mb-1">Comentario del cliente</p>
              <p className="font-body text-sm text-ch-cream">{cot.comentario_cliente}</p>
            </div>
          )}

          {cot.estado === 'aprobada' && (
            <div className="border border-ch-green/30 bg-ch-green/5 rounded p-3">
              <p className="font-body text-xs text-ch-green">
                ✓ Cotización aprobada por el cliente
                {cot.comentario_cliente && ` · "${cot.comentario_cliente}"`}
              </p>
            </div>
          )}

          {/* ── FACTURACIÓN ── */}
          <PanelFacturacion cot={cot} setCot={setCot} />

          {/* Departamentos */}
          {(cot.departamentos ?? []).map((dep, iDep, todosDep) => (
            <DepBlock
              key={dep.id}
              dep={dep}
              editable={editable}
              showInterno={showInterno}
              onRenombrar={() => handleRenombrarDep(dep)}
              onPrecio={() => handlePrecioDep(dep)}
              onEliminar={() => handleEliminarDep(dep)}
              onAgregarSg={() => handleAgregarSg(dep)}
              onRenombrarSg={sg => handleRenombrarSg(dep, sg)}
              onPrecioSg={sg => handlePrecioSg(dep, sg)}
              onEliminarSg={sg => handleEliminarSg(dep, sg)}
              onAgregarItem={(sgId) => setItemModal({ mode: 'nuevo', depId: dep.id, sgId })}
              onEditarItem={(item, sgId) => setItemModal({ mode: 'editar', depId: dep.id, sgId, item })}
              onEliminarItem={(item, sgId) => handleEliminarItem(item, dep.id, sgId)}
              onMoverItem={moverItem}
              onSubir={iDep > 0 ? () => moverDep(dep, -1) : undefined}
              onBajar={iDep < todosDep.length - 1 ? () => moverDep(dep, 1) : undefined}
              onMoverSg={(sg, dir) => moverSg(dep, sg, dir)}
              onMoverItemPuesto={(item, sgId, dir) => moverItemPuesto(item, dep.id, sgId, dir)}
              copiado={editable && portapapeles && portapapeles.tipo !== 'bloque' ? { tipo: portapapeles.tipo, etiqueta: portapapeles.etiqueta } : null}
              onCopiarItem={copiarItem}
              onCopiarGrupo={() => copiarGrupo(dep)}
              onPegarItem={sgId => pegarItem(dep.id, sgId)}
              seleccionId={seleccion?.tipo === 'item' ? seleccion.item.id : seleccion?.tipo === 'grupo' ? seleccion.depId : null}
              onSeleccionarItem={(item, sgId) => setSeleccion({ tipo: 'item', item, depId: dep.id, sgId })}
              onSeleccionarGrupo={() => setSeleccion({ tipo: 'grupo', depId: dep.id })}
            />
          ))}

          {editable && (
            <button
              onClick={handleAgregarDep}
              className="w-full py-3 border border-dashed border-ch-border/40 rounded text-ch-muted font-body text-xs hover:text-ch-cream hover:border-ch-border transition-colors ch-press"
            >
              + Agregar departamento
            </button>
          )}
          {editable && portapapeles?.tipo === 'grupo' && (
            <button
              onClick={pegarGrupo}
              className="w-full py-3 border border-dashed border-ch-green/40 rounded text-ch-green font-body text-xs hover:border-ch-green transition-colors ch-press"
            >
              Pegar grupo «{portapapeles.etiqueta}» ({cuentaItems(portapapeles.datos)} ítems{portapapeles.origen !== cot.nombre ? ` · de ${portapapeles.origen}` : ''})
            </button>
          )}
        </div>

        {/* ── COLUMNA DERECHA: totales ──
            Envuelto para poder marcarlo: cambiar el precio de un departamento
            o un subgrupo mueve el total, y el total es lo que la persona mira
            para saber si el cambio surtió efecto. */}
        <div ref={cam.ref}>
        <PanelTotales
          cot={cot}
          setCot={setCot}
          totales={totales}
          showInterno={showInterno}
          setShowInterno={setShowInterno}
          editable={editable}
        />
        </div>
      </div>

      {/* ── MODAL ÍTEM ── */}
      {itemModal && (
        <ItemModal
          mode={itemModal.mode}
          item={itemModal.item}
          cotizacionId={cot.id}
          departamentoId={itemModal.depId}
          subgrupoId={itemModal.sgId}
          departamentos={cot.departamentos ?? []}
          tarifas={tarifas}
          equipos={equipos}
          onGuardar={handleGuardarItem}
          onCerrar={() => setItemModal(null)}
        />
      )}
    </div>
  )
}
