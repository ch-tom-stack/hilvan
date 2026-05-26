'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Cliente } from '@/types'

interface Props {
  clientes: Cliente[]
}

export default function ListaClientes({ clientes }: Props) {
  const [busqueda, setBusqueda] = useState('')

  const filtrados = busqueda.trim()
    ? clientes.filter(c =>
        c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        (c.empresa ?? '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (c.email ?? '').toLowerCase().includes(busqueda.toLowerCase())
      )
    : clientes

  // Construcción jerarquía: padres primero, hijos indentados
  const ordenados: { cliente: Cliente; nivel: number }[] = []

  if (!busqueda.trim()) {
    const padres = filtrados.filter(c => !c.parent_id)
    const hijos = filtrados.filter(c => c.parent_id)

    for (const padre of padres) {
      ordenados.push({ cliente: padre, nivel: 0 })
      const hijosDelPadre = hijos.filter(h => h.parent_id === padre.id)
      for (const hijo of hijosDelPadre) {
        ordenados.push({ cliente: hijo, nivel: 1 })
      }
    }
    // Hijos huérfanos (padre no en lista)
    const idsEnLista = new Set(padres.map(p => p.id))
    for (const h of hijos.filter(h => !idsEnLista.has(h.parent_id!))) {
      ordenados.push({ cliente: h, nivel: 0 })
    }
  } else {
    filtrados.forEach(c => ordenados.push({ cliente: c, nivel: 0 }))
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-10 gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Módulo</p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">Clientes</h1>
        </div>
        <Link
          href="/clientes/nuevo"
          className="border border-ch-cream text-ch-cream hover:bg-ch-cream hover:text-ch-dark font-body text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors flex-shrink-0"
        >
          + Nuevo cliente
        </Link>
      </div>

      {/* Búsqueda */}
      <div className="mb-6 max-w-sm">
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, empresa o email…"
          className="w-full bg-transparent border border-ch-border text-ch-cream font-body text-sm px-3 py-2 focus:outline-none focus:border-ch-cream transition-colors placeholder:text-ch-muted"
        />
      </div>

      {/* Tabla */}
      {ordenados.length === 0 ? (
        <div className="border border-dashed border-ch-border rounded-[2px] p-10 text-center">
          <p className="text-ch-muted font-body text-sm mb-1">
            {busqueda ? 'Sin resultados para esa búsqueda.' : 'No hay clientes registrados.'}
          </p>
          {!busqueda && (
            <p className="text-ch-subtle font-body text-xs">
              Usa el botón + Nuevo cliente para agregar el primero.
            </p>
          )}
        </div>
      ) : (
        <div className="border border-ch-border">
          {/* Encabezado */}
          <div className="grid grid-cols-[2fr_2fr_1fr] border-b border-ch-border px-4 py-2 hidden lg:grid">
            <span className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Nombre / Empresa</span>
            <span className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Email</span>
            <span className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Teléfono</span>
          </div>

          {ordenados.map(({ cliente: c, nivel }) => (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              className="flex items-center justify-between gap-3 border-b border-ch-border/50 px-4 py-3 hover:bg-white/5 transition-colors group lg:grid lg:grid-cols-[2fr_2fr_1fr]"
            >
              {/* Nombre / empresa */}
              <div className={`min-w-0 ${nivel === 1 ? 'pl-4 flex items-start gap-2' : 'flex items-start gap-2'}`}>
                {nivel === 1 && <span className="text-ch-muted/50 text-xs mt-0.5 shrink-0">·</span>}
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-body text-sm text-ch-cream group-hover:text-white transition-colors">
                      {c.nombre}
                    </span>
                    {c.empresa && c.empresa !== c.nombre && (
                      <span className="font-body text-xs text-ch-muted">{c.empresa}</span>
                    )}
                  </div>
                  {/* Móvil: email + teléfono debajo del nombre (solo si existen) */}
                  <div className="lg:hidden flex gap-3 flex-wrap mt-0.5">
                    {c.email && (
                      <span className="font-body text-[11px] text-ch-muted truncate max-w-[200px]">{c.email}</span>
                    )}
                    {c.telefono && (
                      <span className="font-body text-[11px] text-ch-muted">{c.telefono}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop: email y teléfono en columnas separadas */}
              <span className="hidden lg:block font-body text-xs text-ch-muted self-center">
                {c.email ?? '—'}
              </span>
              <span className="hidden lg:block font-body text-xs text-ch-muted self-center">
                {c.telefono ?? '—'}
              </span>

              {/* Móvil: flecha */}
              <span className="lg:hidden font-body text-[10px] text-ch-muted shrink-0">→</span>
            </Link>
          ))}
        </div>
      )}

      <p className="text-ch-muted font-body text-[10px] mt-4">
        {ordenados.length} cliente{ordenados.length !== 1 ? 's' : ''}
      </p>
    </>
  )
}
