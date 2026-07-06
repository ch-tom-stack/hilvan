-- reuniones_web_confirmacion.sql
-- Feedback "atendida": el correo interno lleva un botón (link con token) que marca
-- la reunión como atendida en Hilván, sin que nadie tenga que entrar a la app.
-- La respuesta al visitante se manda aparte, desde el correo personal (Gmail compose).
-- Correr en el SQL Editor de Supabase.

alter table public.reuniones_web add column if not exists token text;
alter table public.reuniones_web add column if not exists confirmada boolean not null default false;
alter table public.reuniones_web add column if not exists confirmada_at timestamptz;
alter table public.reuniones_web add column if not exists meet_link text;  -- Meet único por reunión

create unique index if not exists reuniones_web_token_idx on public.reuniones_web (token);
