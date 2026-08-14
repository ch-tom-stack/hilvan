-- Políticas de Storage para el bucket `reconocimientos`.
--
-- POR QUÉ HACE FALTA. El bucket se creó con la clave de servicio, pero la
-- subida la hace la sesión de la persona: `storage.objects` tiene su propio
-- RLS y sin políticas deniega todo, aunque el bucket sea público. "Público"
-- sólo significa que los archivos se pueden LEER por URL, no que se puedan
-- escribir.

-- Leer: cualquiera con la URL. Las menciones son públicas del equipo y las
-- imágenes viajan en la página, así que no hay nada que esconder acá.
DROP POLICY IF EXISTS "reconocimientos lectura" ON storage.objects;
CREATE POLICY "reconocimientos lectura" ON storage.objects
  FOR SELECT USING (bucket_id = 'reconocimientos');

-- Escribir: sólo con sesión. Quién puede escribir una mención se valida en la
-- server action (sólo admin); acá se corta el acceso anónimo, que es lo que
-- esta capa puede garantizar.
DROP POLICY IF EXISTS "reconocimientos escritura" ON storage.objects;
CREATE POLICY "reconocimientos escritura" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'reconocimientos');

DROP POLICY IF EXISTS "reconocimientos borrado" ON storage.objects;
CREATE POLICY "reconocimientos borrado" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'reconocimientos');
