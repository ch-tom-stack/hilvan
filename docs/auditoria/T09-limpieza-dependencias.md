# T09 — Limpieza de dependencias y archivos muertos

**Prioridad:** P3 · **Modelo:** Haiku 4.5 · **Riesgo:** bajo

## Qué hacer

1. **Desinstalar `resend`** (`npm uninstall resend`) — la app migró a nodemailer/Gmail. Verificar antes con grep que no hay imports en `app/`, `lib/`, `components/` (los hits en `.claude/worktrees/` no cuentan).
2. **Verificar `jszip`**: grep imports en código fuente. Si solo lo usa `docx` internamente como dependencia transitiva, quitarlo de `package.json` (junto con `@types/jszip`). Si hay import real, dejarlo y anotar dónde.
3. **`xlsx` 0.18.5 (vulnerable — prototype pollution/ReDoS)**: se usa en `lib/exportar-contador.ts` y posiblemente en santander-export. `exceljs` (ya instalado) cubre lectura/escritura. Migrar los usos de `xlsx` a `exceljs` y desinstalar `xlsx`. Si la migración de `exportar-contador.ts` no es trivial, hacerla igual — el formato de salida debe ser idéntico (verificar abriendo el archivo generado).
4. **Archivos muertos en la raíz**: mover `setup-equipos.sh`, `setup-hilvan.sh`, `setup-maletas.sh` y `RENTAL_CONTEXT.md` a `docs/archivo/` (no borrar — son referencia histórica). Actualizar cualquier mención en docs.
5. `npm run build` (o `npx tsc --noEmit` + `next build` si hay env vars) debe pasar al final.

## Criterios de aceptación

- `package.json` sin `resend` ni `xlsx` (ni `jszip` si era transitiva).
- Export del contador y export Santander generan archivos válidos que abren en Excel.
- Raíz del repo sin scripts de setup sueltos.
