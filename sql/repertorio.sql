-- Repertorio — CH-10. Lo que Casa Hiedra ya hizo, con links vivos.
--
-- Qué resuelve: la regla de credenciales de los correos de captación pide
-- SIEMPRE dos referencias, una grande que reconozcan y una chica del porte del
-- prospecto. Hoy esas referencias son seis nombres quemados a mano en un
-- archivo de memoria (Falabella, Aldo, Wrangler, Lee, Asia Skincare, OZ
-- Cranberry Lab). Acá pasan a ser una consulta: "una grande y una chica de
-- belleza, con link vivo".
--
-- Por eso `rubro` y `escala` no son decorativos: son las dos dimensiones por
-- las que se busca. Sin ellas esto sería un portafolio, no munición.
--
-- OJO con el nombre: la "Biblioteca de contactos" (/crm/biblioteca) es otra
-- cosa — estadística empírica de toques. Esta es el cuerpo de obra.

CREATE TABLE IF NOT EXISTS public.repertorio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  marca       text NOT NULL,
  -- Libre a propósito: aparecen rubros nuevos y un CHECK obligaría a migrar
  -- cada vez. Convención: minúsculas y singular — moda, belleza, retail,
  -- electrodomesticos, educacion, alimentos, deporte, inmobiliaria, banca.
  rubro       text,

  -- La escala es la que hace funcionar la regla de credenciales: una grande
  -- que reconozcan + una chica del porte del prospecto. Para una marca chica,
  -- mostrarle sólo gigantes se lee como "son muy grandes para mí".
  escala      text CHECK (escala IN ('grande', 'chica')),

  anio        int,
  formato     text CHECK (formato IN ('banco', 'lookbook', 'spot', 'otro')),
  descripcion text,

  -- [{ url, titulo?, plataforma?, estado: vivo|muerto|sin_revisar, revisado_en }]
  -- Un link roto en un correo de captación es peor que ningún link, así que el
  -- estado se guarda por link y no por trabajo.
  links       jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Trabajo que no queremos mostrar (lo viejo del canal de YouTube que se
  -- decidió dejar fuera). Se conserva como contexto, no se ofrece como credencial.
  mostrable   boolean NOT NULL DEFAULT true,
  notas       text,

  -- Cuándo se revisó por última vez que los links siguieran vivos.
  revisado_en date,

  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repertorio_rubro  ON public.repertorio (rubro, escala);
CREATE INDEX IF NOT EXISTS repertorio_marca  ON public.repertorio (lower(marca));

-- Una marca puede tener varios trabajos, pero no dos veces el mismo trabajo:
-- el operador corre la actualización más de una vez y no debe duplicar.
--
-- NULLS NOT DISTINCT porque formato y anio son opcionales, y con la regla
-- default de Postgres dos filas con NULL se consideran distintas — el índice
-- no atajaría nada justo en las filas a medio llenar.
--
-- Es red de seguridad, no el mecanismo: la deduplicación real la hace el
-- endpoint, que busca sin distinguir mayúsculas ("Falabella" vs "falabella")
-- antes de escribir. Este índice sólo cubre el empate exacto.
CREATE UNIQUE INDEX IF NOT EXISTS repertorio_marca_formato_anio
  ON public.repertorio (marca, formato, anio) NULLS NOT DISTINCT;

ALTER TABLE public.repertorio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.repertorio;
CREATE POLICY "admin full access" ON public.repertorio FOR ALL USING (true) WITH CHECK (true);

-- Toda tabla nueva necesita GRANTs explícitos (ver sql/grants.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repertorio TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repertorio TO service_role;
