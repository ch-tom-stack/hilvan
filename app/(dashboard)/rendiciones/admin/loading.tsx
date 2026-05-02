export default function LoadingAdmin() {
  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">Rendiciones · Admin</p>
          <div className="h-12 w-48 bg-ch-surface/40 animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-24 bg-ch-surface/40 animate-pulse" />
          <div className="h-10 w-24 bg-ch-surface/40 animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="border border-ch-border p-4">
            <div className="h-3 w-20 bg-ch-surface/40 animate-pulse mb-2" />
            <div className="h-8 w-16 bg-ch-surface/40 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="border border-ch-border p-4">
            <div className="h-4 w-3/4 bg-ch-surface/40 animate-pulse mb-2" />
            <div className="h-3 w-1/2 bg-ch-surface/40 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
