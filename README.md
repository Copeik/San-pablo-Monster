# Pokémon Adventure

Juego web sin framework, preparado para desarrollo local y para generar una distribución estática reproducible. El repositorio separa el código editable, los recursos de autoría, el catálogo ejecutable y los recursos que todavía no cumplen el estándar visual.

## Puesta en marcha

Requiere Node.js 20 o posterior y pnpm.

```powershell
pnpm install --frozen-lockfile
pnpm start
```

El servidor de desarrollo expone el juego y las funciones locales del editor. El editor se descarga únicamente cuando se abre.

## Verificación y publicación

```powershell
pnpm test
pnpm run assets:check
pnpm run build:legacy
pnpm run start:legacy
```

`build:legacy` genera `dist/legacy`, una versión desplegable sin el editor que conserva temporalmente los recursos visuales antiguos. Para subirla a un alojamiento estático, publica **el contenido** de esa carpeta, no el repositorio completo. `build:legacy-dev` genera aparte una variante de diagnóstico que sí conserva el editor.

```powershell
pnpm run build:standard
pnpm run start:prod
```

`build:standard` falla de forma intencionada mientras exista un Pokémon, ataque, NPC o recurso del mundo que no cumpla el contrato. Así se impide publicar accidentalmente arte incompleto o heredado.

## Contratos de recursos

- Pokémon: una carpeta por criatura con exactamente seis animaciones WebP pixel-art de 384×384 y 8 fotogramas lógicos: `idle-front.webp`, `idle-back.webp`, `attack-physical-front.webp`, `attack-physical-back.webp`, `attack-special-front.webp` y `attack-special-back.webp`. La carpeta no contiene imágenes estáticas, poses auxiliares, manifiestos, créditos ni ningún otro documento; Pokédex, combate, equipo y selector reutilizan esas mismas seis animaciones mediante el registro central.
- Ataques: una carpeta por ataque con un `effect.webp` pixel art de 128×128, siguiendo el contrato de Ascuas.
- NPC: una carpeta por personaje con `overworld.png` RGBA de 384×512, cuadrícula 6×8 de celdas 64×64, `manifest.json` y `credits.txt`.
- Mundo: una carpeta por asset con `asset.png`, `manifest.json` y `credits.txt`, identidad estable, tamaño lógico, pivote, colisiones y etiquetas declarados mediante `world-asset-v1`.
- Los identificadores son estables; los nombres legibles y aliases se resuelven mediante catálogos, no mediante rutas codificadas por todo el juego.

Braspín, Ascuero y Volcazote (IDs 4, 5 y 6) ya cumplen el contrato Pokémon; quedan 90 especies pendientes.

Los informes canónicos se regeneran con `pnpm run assets:audit`. Los recursos no conformes se enumeran en `asset-vault/legacy-runtime/nonstandard-assets-v0.json`; esa bóveda es un inventario de cuarentena, no una segunda ruta de carga del juego.

## Estructura

```text
assets/                 recursos ejecutables y fuentes organizadas
asset-vault/            inventario de recursos heredados/no conformes
maps/                   módulos de mapas reutilizables
tests/                  contratos y regresiones automáticas
tools/                  auditoría, validadores y empaquetado
dist/                   salida generada; nunca se edita ni versiona
index.html               entrada del juego
script.js                orquestación principal del runtime
server.mjs               servidor local y de distribución
```

Consulta [PLAN-MAESTRO-OPTIMIZACION.md](PLAN-MAESTRO-OPTIMIZACION.md) para las fases, presupuestos y criterios de aceptación completos.
