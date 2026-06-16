'use client'

import { useState, useEffect, useRef } from 'react'

// Reemplazar con la URL pública del MP4 en Supabase Storage
const VIDEO_URL = ''

const SESSION_KEY = 'ch_rental_promo_visto'

export default function VideoPromoPopup() {
  const [visible, setVisible] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!VIDEO_URL) return
    if (!sessionStorage.getItem(SESSION_KEY)) {
      setVisible(true)
    }
  }, [])

  const cerrar = () => {
    setVisible(false)
    sessionStorage.setItem(SESSION_KEY, '1')
    if (videoRef.current) videoRef.current.pause()
  }

  if (!visible || !VIDEO_URL) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ch-black/90 px-4"
      onClick={cerrar}
    >
      <div
        className="relative w-full max-w-4xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Cierre */}
        <button
          onClick={cerrar}
          className="absolute -top-10 right-0 font-body text-[10px] tracking-[0.4em] uppercase text-ch-muted hover:text-ch-cream transition-colors"
        >
          Cerrar ✕
        </button>

        {/* Video */}
        <video
          ref={videoRef}
          src={VIDEO_URL}
          autoPlay
          muted
          controls
          playsInline
          className="w-full border border-ch-border"
          style={{ maxHeight: '80vh' }}
        />

        <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-subtle mt-3 text-center">
          Casa Hiedra · Rental
        </p>
      </div>
    </div>
  )
}
