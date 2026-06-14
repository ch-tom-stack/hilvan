# hilvan-mcp — servidor MCP local de Hilván

Expone las operaciones de Hilván (`/api/agent/*`) como herramientas para un agente
de Claude (Cowork / Claude Code). Corre **localmente** en tu máquina; solo reenvía
a la API HTTP autenticada de Hilván.

## Requisitos previos (una vez)
1. **Correr el SQL de auditoría** en Supabase: `sql/agente_acciones.sql` (habilita el log y `deshacer`).
2. **Definir el token** `HILVAN_AGENT_TOKEN` en Vercel (Hilván) con un valor secreto fuerte.
   El mismo valor se usa al configurar este MCP.

## Instalar
```bash
cd mcp-hilvan
npm install
```

## Probar
```bash
HILVAN_API_URL="https://app.casahiedra.com" \
HILVAN_AGENT_TOKEN="<tu-token>" \
node test-client.mjs
```
Debe listar las herramientas y traer las cuentas por cobrar.

## Conectar a Cowork / Claude Code
Agregar a la config de MCP del cliente (ejemplo genérico):
```json
{
  "mcpServers": {
    "hilvan": {
      "command": "node",
      "args": ["/ruta/abs/a/hilvan/mcp-hilvan/server.mjs"],
      "env": {
        "HILVAN_API_URL": "https://app.casahiedra.com",
        "HILVAN_AGENT_TOKEN": "<tu-token>"
      }
    }
  }
}
```

## Herramientas
- Lectura: `hilvan_por_cobrar`, `hilvan_buscar_cotizacion`, `hilvan_buscar_colaborador`, `hilvan_rendicion_mensual`, `hilvan_acciones`.
- Escritura (el agente debe **confirmar en el chat** antes de usarlas): `hilvan_crear_gasto_mensual`, `hilvan_crear_gasto_proyecto`, `hilvan_registrar_pago`, `hilvan_deshacer`.

## Seguridad
- El token da permisos de agente (leer + escribir vía API). Mantenerlo fuera de git (ya está en `.gitignore` para `.env.local`).
- Toda escritura queda en el log `agente_acciones` y es reversible con `hilvan_deshacer`.
- El agente debe pedir confirmación en el chat antes de cada escritura (es la barrera de seguridad acordada).
