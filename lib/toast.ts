import { toast } from 'sonner'

// `duracion` opcional: los momentos de hito (pago, cierre) se dejan más rato
// en pantalla que una confirmación corriente. Ver lib/momentos.ts.
export const toastOk = (msg: string, duracion = 3000) =>
  toast.success(msg, { duration: duracion })

export const toastError = (msg: string) =>
  toast.error(msg, { duration: 4000 })

export const toastLoading = (msg: string) =>
  toast.loading(msg)

export { toast }
