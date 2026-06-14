// lib/agent-perfil.ts
// El agente no tiene sesión de usuario. Para que lo que crea quede IDÉNTICO a lo
// que crea una persona en la UI (y por tanto editable por cualquier admin/productor),
// le atribuimos la autoría (created_by) a un perfil real: preferimos un admin;
// si no hay, el primer profile disponible. Orden estable por created_at + id.

import type { SupabaseClient } from '@supabase/supabase-js'

export type ResultadoPerfil =
  | { ok: true; id: string }
  | { ok: false; error: string }

/**
 * Devuelve el id de un perfil para usar como created_by del agente.
 * 1) Primer profile con rol='admin' (orden estable).
 * 2) Si no hay admin, el primer profile cualquiera.
 * 3) Si no hay ninguno → error (no se puede atribuir autoría).
 */
export async function resolverPerfilAgente(
  admin: SupabaseClient,
): Promise<ResultadoPerfil> {
  const { data: adminRow, error: eAdmin } = await admin
    .from('profiles')
    .select('id')
    .eq('rol', 'admin')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (eAdmin) return { ok: false, error: eAdmin.message }
  if (adminRow?.id) return { ok: true, id: adminRow.id as string }

  const { data: cualquiera, error: eAny } = await admin
    .from('profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (eAny) return { ok: false, error: eAny.message }
  if (cualquiera?.id) return { ok: true, id: cualquiera.id as string }

  return {
    ok: false,
    error:
      'No hay ningún perfil (profiles) para atribuir la autoría. Crea al menos un usuario admin antes de usar el agente.',
  }
}
