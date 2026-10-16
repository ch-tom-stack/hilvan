# Trabajador del SII en el Mac

Hilván no lee el SII: la sesión y la clave tributaria de Casa Hiedra viven solo en el Mac de Tomás. El trabajador corre ahí en segundo plano, sin ventanas, y procesa los pedidos que deja Hilván.

```
Operador ── hilvan_sii_solicitar_importacion(periodo) ──▶ sii_solicitudes (Hilván)
Cron Vercel /api/cron/sii-semanal (lunes 8:00 Chile) ──▶  mes en curso (+ anterior hasta el día 15)
Mac (launchd, cada 5 min) ── POST /api/agent/sii-trabajador {accion:"tomar"} ──▶ latido + pedidos
   └─ sii auth login --keyring (si la sesión murió: UN intento headless con la clave del Llavero)
   └─ sii rcv … / sii bte … ──▶ POST /api/agent/sii-importar ──▶ sii_documentos + sii_importaciones
   └─ POST {accion:"reportar", estado: hecha | fallida}
Operador ── hilvan_sii_estado_importacion ──▶ "hecha" ──▶ hilvan_sii_sync / hilvan_sii_sync_ventas
```

## Piezas

| Dónde | Qué |
|---|---|
| `~/sii-ensayo/node_modules` | CLI `@albertomarturelo/sii-cli` 0.10.0 + Chromium de Playwright |
| `~/.sii/` | Sesión del SII (cookies), la escribe la CLI |
| Llavero de macOS, servicio `sii`, cuenta `77151117-1` | La clave tributaria de la empresa |
| `~/sii-ensayo/trabajador/` | **Copia** de `scripts/sii/importar.mjs` y `scripts/sii/trabajador.mjs`, `.env` (chmod 600) y `trabajador.log` |
| `~/Library/LaunchAgents/com.casahiedra.hilvan-sii.plist` | launchd: corre el trabajador cada 300 s |

El trabajador vive **fuera del repo** a propósito: macOS no deja que un proceso de launchd lea `~/Documents` sin permisos de disco completo. Si cambias `scripts/sii/*.mjs`, vuelve a copiarlos a `~/sii-ensayo/trabajador/`.

`.env` del trabajador:

```
HILVAN_AGENT_TOKEN=<el mismo de .env.local>
HILVAN_URL=https://app.casahiedra.com
SII_RUT=77151117-1
```

## Comandos

```bash
# Ver qué hizo (solo escribe cuando hubo pedidos)
tail -50 ~/sii-ensayo/trabajador/trabajador.log

# Correrlo ya, sin esperar los 5 min
launchctl kickstart gui/$(id -u)/com.casahiedra.hilvan-sii

# Pausarlo / reanudarlo
launchctl bootout gui/$(id -u)/com.casahiedra.hilvan-sii
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.casahiedra.hilvan-sii.plist
```

## Si queda BLOQUEADO

Pasa cuando el SII rechaza el login: el trabajador no lo vuelve a intentar (el SII bloquea la cuenta tras varios intentos) y el operador ve `bloqueado` en `hilvan_sii_estado_importacion`.

1. Revisa la clave en el SII (entra a mano a sii.cl). Si cambió, actualiza el Llavero:
   `security add-generic-password -U -s sii -a 77151117-1 -w`
2. Libera el trabajador: `cd ~/sii-ensayo/trabajador && node --env-file=.env trabajador.mjs --liberar`
3. Los pedidos fallidos no se reintentan solos: que el operador vuelva a pedir el período.

## Límites

- Si el Mac está dormido o apagado, los pedidos esperan en cola; el operador ve `fuera_de_linea` (sin latido hace más de 15 min).
- Un pedido `en_curso` por más de 30 min (el Mac se durmió a mitad) se vuelve a tomar en la siguiente corrida.
- Importar a mano sigue funcionando: `npm run sii:importar -- AAAA-MM` desde el repo.
