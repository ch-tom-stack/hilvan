'use client'

import { useEffect, useRef, useState } from 'react'
import { momento } from '@/lib/momentos'
import QRCode from 'qrcode'

interface Props {
  codigo: string
  nombre: string
}

export default function GeneradorQR({ codigo, nombre }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [listo, setListo] = useState(false)

  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/m/${codigo}`

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, url, {
      width: 240,
      margin: 2,
      color: { dark: '#111110', light: '#f5f0e8' },
    }, () => setListo(true))
  }, [url])

  function descargar() {
    if (!canvasRef.current) return
    const link = document.createElement('a')
    link.download = `QR-${codigo}.png`
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
    // ch-scan-qr al DESCARGAR, no al escanear: el escaneo aterriza en la ficha
    // pública, donde el navegador bloquea el audio hasta que el usuario toque
    // algo. Ese sonido no sonaría nunca.
    momento('qr.escaneado')
  }

  function imprimir() {
    if (!canvasRef.current) return
    const dataUrl = canvasRef.current.toDataURL('image/png')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>QR ${codigo}</title>
      <style>
        body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; background: white; }
        img { width: 240px; height: 240px; }
        p { margin: 8px 0 4px; font-size: 14px; font-weight: 600; }
        small { font-size: 11px; color: #666; }
      </style></head>
      <body>
        <img src="${dataUrl}" />
        <p>${nombre}</p>
        <small>${codigo}</small>
      </body></html>
    `)
    win.document.close()
    win.print()
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="bg-ch-cream p-4">
        <canvas ref={canvasRef} />
      </div>
      <p className="text-ch-muted font-body text-xs text-center break-all max-w-[240px]">{url}</p>
      {listo && (
        <div className="flex gap-3">
          <button
            onClick={descargar}
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors"
          >
            Descargar
          </button>
          <button
            onClick={imprimir}
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors"
          >
            Imprimir
          </button>
        </div>
      )}
    </div>
  )
}
