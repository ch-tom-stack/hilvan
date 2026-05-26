'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

// ─── useConfirm ──────────────────────────────────────────────────────────────

interface ConfirmState {
  open: boolean
  message: string
}

/**
 * Reemplaza window.confirm() con un modal React propio.
 *
 * Uso:
 *   const { confirm, ConfirmDialog } = useConfirm()
 *   // En el JSX: {ConfirmDialog}
 *   // En handlers: if (!await confirm('¿Eliminar?')) return
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({ open: false, message: '' })
  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
      resolveRef.current = resolve
      setState({ open: true, message })
    })
  }, [])

  const handleClose = useCallback((value: boolean) => {
    resolveRef.current?.(value)
    resolveRef.current = null
    setState({ open: false, message: '' })
  }, [])

  const ConfirmDialog = state.open ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={() => handleClose(false)}
    >
      <div
        className="bg-ch-surface border border-ch-border p-6 max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <p className="font-body text-sm text-ch-cream mb-6 leading-relaxed">{state.message}</p>
        <div className="flex justify-end gap-3">
          <button
            className="px-4 py-2 text-sm font-body text-ch-muted hover:text-ch-cream border border-ch-border transition-colors"
            onClick={() => handleClose(false)}
          >
            Cancelar
          </button>
          <button
            className="px-4 py-2 text-sm font-body bg-red-700 hover:bg-red-600 text-white transition-colors"
            onClick={() => handleClose(true)}
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, ConfirmDialog }
}

// ─── usePrompt ───────────────────────────────────────────────────────────────

interface PromptState {
  open: boolean
  message: string
  defaultValue: string
}

/**
 * Reemplaza window.prompt() con un modal React propio.
 *
 * Uso:
 *   const { prompt, PromptDialog } = usePrompt()
 *   // En el JSX: {PromptDialog}
 *   // En handlers: const nombre = await prompt('Nombre:', valorInicial)
 *   //              if (!nombre) return
 */
export function usePrompt() {
  const [state, setState] = useState<PromptState>({ open: false, message: '', defaultValue: '' })
  const [value, setValue] = useState('')
  const resolveRef = useRef<((v: string | null) => void) | null>(null)

  const prompt = useCallback((message: string, defaultValue = ''): Promise<string | null> => {
    return new Promise(resolve => {
      resolveRef.current = resolve
      setValue(defaultValue)
      setState({ open: true, message, defaultValue })
    })
  }, [])

  const handleSubmit = useCallback(() => {
    resolveRef.current?.(value.trim() || null)
    resolveRef.current = null
    setState({ open: false, message: '', defaultValue: '' })
  }, [value])

  const handleCancel = useCallback(() => {
    resolveRef.current?.(null)
    resolveRef.current = null
    setState({ open: false, message: '', defaultValue: '' })
  }, [])

  const PromptDialog = state.open ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleCancel}
    >
      <div
        className="bg-ch-surface border border-ch-border p-6 max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <p className="font-body text-sm text-ch-cream mb-3 leading-relaxed">{state.message}</p>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape') handleCancel()
          }}
          className="w-full bg-ch-dark border border-ch-border px-3 py-2 text-sm font-body text-ch-cream focus:outline-none focus:border-ch-green mb-4"
        />
        <div className="flex justify-end gap-3">
          <button
            className="px-4 py-2 text-sm font-body text-ch-muted hover:text-ch-cream border border-ch-border transition-colors"
            onClick={handleCancel}
          >
            Cancelar
          </button>
          <button
            className="px-4 py-2 text-sm font-body bg-ch-green hover:bg-ch-green-light text-ch-black transition-colors"
            onClick={handleSubmit}
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { prompt, PromptDialog }
}
