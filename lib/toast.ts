import { toast } from 'sonner'

export const toastOk = (msg: string) =>
  toast.success(msg, { duration: 3000 })

export const toastError = (msg: string) =>
  toast.error(msg, { duration: 4000 })

export const toastLoading = (msg: string) =>
  toast.loading(msg)

export { toast }
