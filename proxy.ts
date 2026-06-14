import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const { hostname, pathname } = request.nextUrl

  // Subdominio rental — sirve el catálogo público sin auth
  if (hostname === 'rental.casahiedra.com') {
    const url = request.nextUrl.clone()
    url.pathname = '/arriendo' + (pathname === '/' ? '' : pathname)
    return NextResponse.rewrite(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Rutas públicas — no requieren autenticación
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/arriendo') ||
    pathname.startsWith('/api/arriendo/') ||
    pathname.startsWith('/api/agent/') ||
    pathname === '/api/mcp' ||
    pathname === '/api/sse' ||
    pathname.startsWith('/m/') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/cotizacion/') ||
    pathname.startsWith('/citacion/') ||
    pathname.startsWith('/col/') ||
    pathname.startsWith('/api/cron/') ||
    pathname.match(/^\/rodaje\/[^/]+\/ver/) ||
    pathname.match(/^\/api\/rodaje\/[^/]+\/pdf/) ||
    pathname.match(/^\/api\/cotizaciones\/[^/]+\/pdf/)
  ) {
    if (user && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // Rutas protegidas
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
