# Plan maestro de optimización, normalización y cuarentena

- **Proyecto:** Pokémon Adventure
- **Fecha de auditoría:** 19 de julio de 2026
- **Estado:** infraestructura P0/P1 ejecutada; migración artística pendiente y bloqueada por el gate standard
- **Objetivo:** reducir peso, memoria, carga inicial y trabajo por fotograma; ordenar código, datos y recursos; fijar contratos verificables; y separar de forma reversible todo lo que no cumpla el estándar.

---

## 1. Resultado que debe producir este plan

### Estado de implementación a 19 de julio de 2026

- Inventario reproducible y allowlist de distribución activos: 3.817 recursos auditados, 572 incluidos por el runtime y cero rutas de autoría filtradas.
- Perfiles separados: `legacy` publicable sin editor, `legacy-dev` para diagnóstico y `standard` cerrado hasta completar todos los contratos.
- Los 48 NPC ya cumplen `npc-overworld-v1` en carpetas individuales, con catálogo, SHA, créditos y 48 celdas visibles; no queda ningún atlas fuente en runtime.
- El backlog de arte pendiente está enumerado por entidad: 90 Pokémon, 44 ataques y 110 assets de mundo aún no cumplen su pack final; Braspín, Ascuero y Volcazote (IDs 4, 5 y 6) ya cumplen el estándar Pokémon vigente.
- Carga ansiosa retirada para vídeos, terror, NPC y props no visibles; audio largo por streaming; mapas con caché acotada y actualización cuantizada; raycast Prisma migrado a DDA.
- Editor diferido y con ciclo de vida cerrado; HUD de perspectiva cacheado a 10 Hz; distribución minificada, versionada, precomprimida y servida con caché, validadores y rangos HTTP.

El resto del documento conserva el contrato objetivo y la secuencia necesaria para cerrar la deuda visual sin declarar como válido material heredado.

Al terminar la ejecución:

1. El juego se publicará desde un directorio de distribución cerrado, no desde la raíz del repositorio.
2. Sólo los archivos incluidos en un manifiesto de runtime podrán llegar al navegador.
3. Código, datos, recursos finales, fuentes de trabajo, previews, archivos históricos y cuarentena estarán físicamente separados.
4. Los 44 ataques tendrán un VFX pixel-art dedicado con el contrato técnico de Ascuas; ningún preset contará como resultado aceptado.
5. Cada Pokémon del dist standard tendrá exactamente seis animaciones WebP pixel-art: idle front/back, ataque físico front/back y ataque especial front/back. No habrá imágenes estáticas ni documentos dentro del pack, y Pokédex, combate, equipo y selector compartirán esos seis archivos.
6. Cada NPC tendrá el mismo sheet 384 × 512 y vivirá en una carpeta individual identificada por su nombre canónico.
7. Durante la migración, un recurso activo que no cumpla podrá seguir funcionando mediante una lista legacy explícita; Pokémon, VFX de ataques y NPC legacy nunca se considerarán aceptación final.
8. Un recurso inactivo, una copia redundante validada, un recurso sustituido o uno sólo de autoría quedará fuera de producción y dentro del almacén o la cuarentena correspondiente.
9. El render sólo recalculará aquello que haya cambiado, cargará recursos por escena y se detendrá cuando la pestaña no esté visible.
10. Las partidas existentes se migrarán por versión y nunca dependerán de renombrados masivos implícitos.
11. Cada fase deberá dejar tests, mediciones y una ruta de reversión.

Este documento no autoriza todavía movimientos masivos ni eliminación de archivos. Primero crea el sistema que permitirá hacerlo sin romper referencias, partidas, créditos o herramientas.

---

## 2. Principios no negociables

### 2.1 Seguridad

- No borrar ni mover un archivo sólo porque no aparezca en una búsqueda literal.
- Resolver antes las rutas dinámicas, manifiestos, fallbacks y herramientas offline.
- Toda cuarentena tendrá SHA-256, ruta original, motivo, referencias, destino y procedimiento de restauración.
- Cada movimiento será pequeño, versionado y validado.
- No reescribir el historial Git como parte de una optimización normal.
- Preservar los cambios locales ya existentes y trabajar en una rama o worktree aislado cuando empiece la implementación.

### 2.2 Compatibilidad

- Los ID de ataques actuales permanecen en lowerCamelCase. No se migrarán a kebab-case porque son claves funcionales y pueden existir en partidas o importaciones.
- Los nombres de archivo sí serán minúsculas y kebab-case.
- Las migraciones de Pokémon serán conscientes de la versión de la partida.
- El caso especial del ID 4 no se resolverá reordenando aliases: el ID actual corresponde a Braspín y una migración histórica lo asocia a 9501.
- Se conservará un adaptador temporal que exponga la forma de datos antigua mientras el runtime migra a registros normalizados.

### 2.3 Calidad visual y PixelLab

- Cualquier generación o regeneración de pixel art se hará exclusivamente mediante el MCP de PixelLab y siguiendo su guía oficial: https://api.pixellab.ai/mcp/docs
- El servidor MCP de PixelLab está configurado actualmente.
- Toda entrega runtime de Pokémon y VFX de ataque deberá superar una validación de pixel art; no basta con tener dimensiones o extensión correctas.
- Todo NPC deberá superar el perfil visual y de composición npc-overworld-v1.
- Un resize de una ilustración smooth no la convierte en pixel art conforme.
- Las conversiones deterministas de formato, compresión y validación se automatizarán, pero no sustituirán la revisión visual.
- Nunca se sustituirá una pieza visual defectuosa por otra generación automática sin aprobación visual.
- Los recursos con problemas se marcarán review-required hasta disponer de una corrección aceptada.

### 2.4 Rendimiento medido

- Cada optimización tendrá una medición anterior y posterior.
- No se aceptará reducir bytes si aumenta claramente el tiempo de decodificación, introduce artefactos o empeora la estabilidad.
- Los presupuestos de red, memoria, DOM y frame time serán puertas de CI, no recomendaciones informales.

---

## 3. Línea base auditada

Las cifras de esta sección son una fotografía histórica anterior a la adopción de `pokemon-animation-only-v1`. Describen el material que existía al auditar, no el contrato Pokémon vigente ni el estado de conformidad actual.

### 3.1 Tamaño del proyecto

La auditoría excluyó .git, node_modules, .pnpm-store, worktrees y temporales para medir el contenido real de trabajo.

| Métrica | Resultado actual |
|---|---:|
| Archivos de proyecto medidos | 3.821 |
| Peso de proyecto medido | 619,81 MiB |
| Assets + maps | 3.723 archivos / 615,51 MiB |
| Assets | 3.707 archivos / 614,98 MiB |
| Archivos seguidos por Git | 3.273 / 597,96 MiB |
| Directorio .git | 1.024,71 MiB |
| Basura temporal detectada en .git | 56,57 MiB |

Distribución principal:

| Área | Archivos | Peso |
|---|---:|---:|
| assets/pokemon | 3.113 | 319,08 MiB |
| assets/generated | 330 | 134,95 MiB |
| assets/maps | 77 | 121,82 MiB |
| assets/sprites | 112 | 17,89 MiB |
| Audio | 7 | 13,70 MiB |
| Vídeo | 2 | 5,72 MiB |

Distribución por formato:

| Formato | Archivos | Peso |
|---|---:|---:|
| PNG | 3.450 | 398,49 MiB |
| ZIP | 31 | 92,63 MiB |
| WebP | 128 | 74,17 MiB |
| GeoJSON | 8 | 28,11 MiB |
| MP3 | 4 | 13,46 MiB |
| MP4 | 2 | 5,72 MiB |

### 3.2 Lo que realmente alcanza producción

El grafo de referencias de producción resolvió rutas literales, chunks dinámicos, los 48 NPC y los packs dinámicos de los 11 Pokémon que tenían animaciones en aquella línea base.

| Resultado | Valor |
|---|---:|
| Rutas runtime existentes | 572 |
| Peso runtime inferido | 164,80 MiB |
| Rutas de archivo inferidas que faltan | 0 |
| Errores de mayúsculas/minúsculas | 0 |
| Candidatos no alcanzados por producción | 3.151 archivos / 450,71 MiB |

Los 450,71 MiB no alcanzados no son basura automática: incluyen fuentes, herramientas, documentación, revisiones, geodatos y artefactos de construcción. La primera gran reducción debe venir de excluirlos del paquete publicado, no de borrarlos. Esta comprobación de rutas no garantiza que todo ID de especie alcanzable produzca una ruta: los IDs 10, 19 y 43 son un contraejemplo y se tratan como P0.

### 3.3 Carga inicial observada

En una carga local del juego:

| Métrica | Resultado |
|---|---:|
| Nodos DOM | 4.354 |
| Etiquetas script | 26 |
| Hojas de estilo | 2 |
| Imágenes DOM | 115 |
| Recursos observados | 224 |
| Recursos únicos por ruta | 206 |
| Peso local de recursos alcanzados | aproximadamente 51,4 MiB |
| Vídeos creados al inicio | 2 |

El HTML incluye unas 589 piezas del editor aunque el jugador no lo abra. El editor además inicia catálogo, outliner, conexión SSE e intervalos. El movimiento de presencia puede emitir peticiones cada 50 ms incluso fuera de una sesión de edición.

### 3.4 Monolitos y entrada crítica

| Archivo | Tamaño | Líneas aproximadas | Situación |
|---|---:|---:|---|
| map-geography.js | 1,74 MiB | 100.436 | Cargado en index.html sin consumidor runtime localizado |
| script.js | 651 KiB | 11.863 | Datos, escenas, render, audio, guardado y combate mezclados |
| styles.css | 183 KiB | 3.192 | Estilos globales, escenas y editor mezclados |
| map-editor-standalone.js | 187 KiB | 3.270 | Lógica de editor en la ruta del juego |
| index.html | 74 KiB | 865 | UI de juego y editor en un único documento |

Los 26 scripts y 2 CSS suman aproximadamente 3.163 KiB sin comprimir y 495 KiB con gzip; el total se aproxima a 510 KiB al incluir index.html. map-geography.js aporta por sí solo unos 193 KiB gzip y script.js unos 152 KiB gzip.

### 3.5 Tests

Línea base de pnpm test:

- 216 tests ejecutados.
- 215 aprobados.
- 1 fallo.
- El fallo agrupa 1.506 divergencias de píxel en 32 de 48 NPC.
- Los validadores de jugador, voz NPC, prisma y perspectiva pasan.
- Hay suites Python relevantes que no están integradas en pnpm test.

No se podrá declarar una fase estable hasta separar fallos históricos conocidos de regresiones nuevas y, finalmente, dejar la suite principal en verde.

---

## 4. Hallazgos prioritarios

### P0. La persistencia de efectos puede destruir datos válidos

attack-effects.js sólo considera válido un ID completamente en minúsculas mediante un patrón equivalente a [a-z][a-z0-9_-]*. Sin embargo, 36 de los 44 ataques usan lowerCamelCase. Al normalizar o serializar un pack, sólo sobreviven:

- tackle
- scratch
- ember
- gust
- absorb
- lick
- confusion
- headbutt

Los otros 36 pueden desaparecer del pack al guardarlo. Antes de editar o migrar ataques:

1. Corregir el contrato para aceptar los ID existentes.
2. Añadir round-trip tests de los 44 ataques.
3. Hacer que el parser rechace versiones o kinds inválidos de forma explícita.
4. Conservar entradas desconocidas en un bloque de cuarentena/raw en lugar de descartarlas.
5. Probar importación, edición y exportación con un pack completo.

### P0. Los ataques no comparten semántica de entrega

32 de 44 ataques no declaran delivery. Una parte del runtime interpreta el valor ausente como melee y otra parte como projectile. Por tanto, el mismo registro puede producir lógica y efectos contradictorios.

Los 32 registros son:

waterGun, quickAttack, bugBite, poisonSting, thunderShock, absorb, lick, confusion, metalSound, moonGleam, dreamWhisper, astralGuard, shadowPrank, lanternDrain, eternalNight, sparkSnout, stormWing, nectarNeedle, bloodStinger, wingFeint, silkEscape, toxicThread, hallucinationDust, spiritDistill, aioliBlaze, toxicFume, darkPilfer, iceFist, mountainJab, citrusVolt, riverWhisker y forgeSlash.

Todos deberán declarar delivery explícito y pasar un test que compare combate, animación y editor.

### P0. El contrato de NPC está roto

Los 48 sprites runtime tienen inventario, ruta y dimensiones correctas: 384 × 512, rejilla 6 × 8, celdas de 64 × 64. Aun así:

- 31 NPC fallan sus 48 celdas.
- Doctor Potato falla 18 celdas.
- Total: 1.506 diferencias.
- IDs afectados: doctor-potato, npc-01 a npc-30 y npc-guide.

El contrato queda confirmado; falta localizar cada divergencia en la fuente, el conversor o la salida. Runtime y fuente permanecen enlazados en legacyDev hasta corregirse y no se moverán por separado.

### P0. Hay especies alcanzables que no resuelven sprites

El inventario de rutas no encontró archivos referenciados que falten, pero esa comprobación no cubre una especie que produce una cadena vacía en tiempo de ejecución. Los IDs 10, 19 y 43 están en PRISM_WEAK_EXIT_IDS, pueden llegar a ser encuentros/capturas/partidas y no tienen un pack animado front/back activo.

Antes de reorganizar datos:

1. Construir el conjunto de IDs alcanzables desde starters, encuentros, secretos, prisma, weak exits, equipo y migraciones.
2. Exigir `idle-front.webp` e `idle-back.webp` resolubles dentro de un pack de seis animaciones conforme para cada ID standard alcanzable.
3. Para 10, 19 y 43, decidir entre redirección versionada, retirada del encuentro o creación de assets.
4. No clasificarlos como legacy o quarantined mientras sigan siendo alcanzables.
5. Crear un fixture por cada uno de los 24 aliases históricos y por saveVersion, con atención especial al ID 4.

### P1. Frame lógico y chunk WebP se están confundiendo

Medición histórica del formato heredado: los 11 packs animados tenían sus 110 archivos presentes. En 18 de 66 WebP, el contenedor contenía menos de ocho chunks ANMF, pero esto no demostraba que faltaran frames: el constructor fusionaba poses consecutivas idénticas y conservaba su duración total. El test validaba un timeline equivalente a ocho frames.

Un chunk codificado:

- ascuero-idle-back-pixellab.webp
- volcazote-idle-back-pixellab.webp

Cinco chunks codificados:

- ascuero-attack-melee-front-pixellab.webp
- petrillo-attack-ranged-back-pixellab.webp

Seis chunks codificados:

- volcazote-attack-melee-back-pixellab.webp
- aliscama-attack-melee-front-pixellab.webp
- aliscama-attack-ranged-front-pixellab.webp
- criascama-attack-melee-back-pixellab.webp
- dracoscama-attack-melee-back-pixellab.webp
- terravordeo-attack-melee-back-pixellab.webp
- terravordeo-attack-ranged-back-pixellab.webp
- peyote-attack-melee-back-pixellab.webp
- peyote-attack-ranged-back-pixellab.webp

Siete chunks codificados:

- ascuero-attack-ranged-back-pixellab.webp
- criascama-attack-melee-front-pixellab.webp
- musgolem-attack-ranged-front-pixellab.webp
- petrillo-attack-ranged-front-pixellab.webp
- terravordeo-attack-melee-front-pixellab.webp

Los nombres `attack-melee-*` y `attack-ranged-*` de la lista anterior documentan únicamente aquella línea base. El contrato vigente usa `attack-physical-*` y `attack-special-*`.

El registro central debe separar sourceFrameCount, logicalFrameCount, encodedChunkCount, frameDurations y totalDurationMs. No se regenerará ni se degradará una animación sólo por tener menos chunks codificados. Sólo será review-required si falla el timeline, la duración, la identidad visual o el movimiento esperado.

### P1. Brecha respecto al contrato artístico confirmado

La decisión de producto deja un inventario exacto y permite medir la deuda:

- Pokémon, baseline histórico: existían 93 pares static front/back y 11 especies con seis animaciones heredadas idle/melee/ranged front/back. Esos recuentos no equivalen a conformidad con el contrato nuevo.
- Pokémon, estado vigente: Braspín, Ascuero y Volcazote (IDs 4, 5 y 6) cumplen `pokemon-animation-only-v1`; las otras 90 especies registradas están pendientes.
- Ataques: Ascuas es el único golden fixture completo; quedan 43 VFX dedicados por crear.
- NPC: existen 48 sheets en carpetas planas; 16 pasan todo el contrato y 32 tienen 1.506 divergencias. Además, varias identidades reutilizan la apariencia de otro NPC y ninguna está todavía migrada al árbol definitivo por nombre.

Hasta corregirlos, estos recursos pueden sostener el juego en legacyDev, pero no cuentan como contenido aceptado para standard.

### P1. Producción sirve demasiadas cosas

El servidor estático puede servir casi toda la raíz del proyecto. No hay un límite de distribución que impida publicar herramientas, fuentes, ZIP, previews o geodatos si se conoce la URL. Tampoco existen nombres con hash, Brotli preconstruido, ETag/Last-Modified robusto ni soporte Range/206 para medios.

La solución estructural es construir dist desde una allowlist. Ampliar una denylist no será suficiente.

### P1. El editor forma parte del juego normal

El editor añade markup, scripts, catálogos, filas del outliner, SSE e intervalos aunque no se abra. Debe ser una entrada independiente y cargarse sólo por ruta o activación explícita.

### P1. El bucle principal recalcula demasiado

El requestAnimationFrame continúa indefinidamente. En cada frame se realizan combinaciones de:

- reconstrucción de arrays, sets y ordenaciones;
- escaneo y ordenación de objetos del mundo;
- lecturas de layout mediante getBoundingClientRect;
- escrituras de dataset;
- repintado completo del minimapa;
- actualización de HTML y prompts;
- sincronización de canvas.

El mundo y el minimapa necesitan invalidación por suciedad, índices espaciales y cachés de capas estáticas.

### P1. La carga es ansiosa

En el arranque se preparan 16 suelos interiores, 48 NPC, mundo, previews, atlases, recursos de terror, audio y vídeos. Dos vídeos ocultos usan preload auto. El preview principal de 2508 × 2508 puede ocupar alrededor de 24 MiB decodificado para mostrarse en un minimapa pequeño.

Sólo cuatro conjuntos que siguen siendo ansiosos representan aproximadamente:

- 48 NPC: 5,3 MiB transferidos / 36 MiB decodificados.
- 24 sprites de mundo: 7 MiB / 25 MiB decodificados.
- Preview: 3,64 MiB / 24 MiB decodificados.
- Atlas de caminos: 4,2 MiB / 12 MiB decodificados.

Por eso diferir sólo vídeo y audio no basta para alcanzar el presupuesto de portada.

### P1. No hay un presupuesto global de memoria

Existe un LRU para chunks de aproximadamente 96 MiB, pero no gobierna sprites, audio ni texturas GPU. Estimaciones relevantes:

- 48 hojas NPC: aproximadamente 36 MiB decodificadas.
- 24 imágenes de escenario: aproximadamente 25 MiB.
- Preview grande: aproximadamente 24 MiB.
- Dos atlas de rutas: aproximadamente 12 MiB.
- Canvas máximo de mundo: aproximadamente 32 MiB.
- Overlay del editor 2508 × 4096: aproximadamente 39 MiB.
- Baseline histórico de 93 pares Pokémon estáticos: aproximadamente 435,93 MiB si todos se decodificaban a la vez; esos PNG no forman parte del estándar vigente.

### P2. Código y datos no tienen fronteras

script.js contiene registros de ataques y especies, carga de recursos, render, audio, guardado, escenas y combate. Esta mezcla hace difícil cargar por demanda, validar datos y medir responsabilidades.

### P2. Identidad y migraciones de Pokémon requieren limpieza

- Hay 116 especies definidas.
- 93 están activas en Sanpledex, agrupadas en 39 familias.
- 23 están fuera de Sanpledex y no tienen assets: 1, 7, 10, 13, 16, 19, 25, 43, 63, 81, 92, 96, 104, 133, 147, 149, 151, 248, 373, 376, 399, 445 y 635.
- PRISM_WEAK_EXIT_IDS contiene los IDs 10, 19 y 43, que no tienen sprites activos.
- LEGACY_MONSTER_REPLACEMENTS contiene 24 aliases que quedan sombreados porque el normalizador encuentra primero el ID actual.
- El nombre visible Ascuero está duplicado en los IDs 5 y 9813, ambos activos.
- Petrillo, Musgólem y Terravórdeo comparten baseHp 25 y catchRate 0,34 pese a ser una línea evolutiva; se debe revisar balance, no cambiarlo automáticamente.
- En la línea base, Braspín usaba el slug estático braspy y el slug animado braspin; la carpeta conforme actual usa braspin y no registra estáticos.

### P2. Fuentes y derivados ocupan el árbol público

La mayor parte del peso de Pokémon y mapas corresponde a workfiles, fuentes, revisiones y entradas de compilación:

- Workfiles pixellab-hq repartidos bajo assets/pokemon/{braspy,dracoscama,petrillo,peyote}-line/: 2.761 archivos / 222,97 MiB.
- 31 ZIP: 92,63 MiB.
- Fuentes y referencias generated: aproximadamente 100,93 MiB.
- 23 archivos de mapas fuera del runtime: 96,99 MiB.
- trees.geojson: 25,58 MiB.
- san-pablo-reference-hd.webp: 24,36 MiB.

Estos archivos pueden ser valiosos; deben salir del paquete web, no desaparecer.

---

## 5. Presupuestos objetivo

Los objetivos se confirmarán con una medición del primer piloto. Ninguna cifra autoriza degradación visual o funcional.

Carga fría significa transferSize con caché y service worker desactivados, desde navigationStart hasta que la portada está interactiva. Las peticiones de portada cuentan únicamente la ruta crítica; se vigilan junto a bytes, parseo y decodificación para no ganar la métrica creando bundles o atlas gigantes.

### 5.1 Red y distribución

| Métrica | Objetivo fase inicial | Objetivo final |
|---|---:|---:|
| Dist completo | ≤ 125 MiB | ≤ 90 MiB |
| Carga fría de portada | ≤ 6 MiB | ≤ 4 MiB |
| Peticiones de portada | ≤ 70 | ≤ 45 |
| JavaScript crítico Brotli | ≤ 200 KiB | ≤ 150 KiB |
| CSS crítico Brotli | ≤ 45 KiB | ≤ 30 KiB |
| Recursos no referenciados en dist | 0 | 0 |
| ZIP, fuentes HD y previews en dist | 0 | 0 |

### 5.2 Ejecución

| Métrica | Objetivo |
|---|---:|
| CPU update + render p95, escritorio 60 Hz | ≤ 12 ms |
| CPU update + render p99, escritorio 60 Hz | ≤ 16,7 ms |
| Frames que pierden vsync, escritorio | < 1 % |
| Frames mayores de 33 ms, escritorio | < 0,1 % |
| CPU update + render p95, equipo modesto | ≤ 14 ms |
| CPU update + render p99, equipo modesto | ≤ 20 ms |
| Frames que pierden vsync, equipo modesto | < 3 % |
| Long tasks mayores de 50 ms en 60 s de juego | 0 durante control normal |
| Long Animation Frames | 0 durante control normal |
| Trabajo rAF con pestaña oculta | 0 |
| Peticiones de presencia fuera del editor | 0 |
| Repintados de minimapa sin cambios | 0 |

Las puertas de tiempo se ejecutarán en navegador y máquina fijados, con escenario automatizado, calentamiento y al menos tres repeticiones. Un ruido aislado no cambia el contrato; una mediana o repetición consistente sí.

### 5.3 Memoria

| Área | High-water | Low-water tras expulsión | Límite duro |
|---|---:|---:|---:|
| Imágenes decodificadas CPU | 96 MiB | 72 MiB | 128 MiB |
| Canvas/backing buffers | 64 MiB | 48 MiB | 96 MiB |
| Audio decodificado | 24 MiB | 16 MiB | 32 MiB |
| Texturas GPU estimadas | 128 MiB | 96 MiB | 192 MiB |

Además:

- Crecimiento retenido tras 10 ciclos de escena: < 5 MiB, medido con GC controlado cuando el entorno lo permita y acompañado de contadores propios.
- Imágenes Pokémon decodificadas: sólo combatientes, equipo visible y caché pequeña.
- Recursos de una escena cerrada: refcount cero; todo byte retenido debe pertenecer a una caché con límite y motivo.
- Perfiles separados para juego y editor, por clase de dispositivo y DPR. Un DPR alto no puede multiplicar canvas sin comprobar el presupuesto.

### 5.4 Presupuestos por recorrido y DOM

Objetivos provisionales, a calibrar con el piloto:

| Recorrido | Transferencia incremental final |
|---|---:|
| Portada interactiva | ≤ 4 MiB |
| Entrada al primer mundo y conjunto visible de spawn | ≤ 12 MiB |
| Primer chunk vecino | ≤ 1,5 MiB |
| Primer combate | ≤ 5 MiB |
| Primera entrada a Prisma | ≤ 8 MiB |
| Shell del editor, sin thumbnails | ≤ 2 MiB |

Latencia p95 provisional:

| Interacción | Caché caliente | Caché fría en perfil de red fijado |
|---|---:|---:|
| Portada interactiva | ≤ 800 ms | ≤ 2.500 ms |
| Confirmar inicio → primer frame del mundo | ≤ 500 ms | ≤ 1.500 ms |
| Transición entre escenas | ≤ 300 ms | ≤ 900 ms |
| Acción → combate listo | ≤ 400 ms | ≤ 1.200 ms |

El perfil frío se fijará en CI —máquina, navegador, ancho de banda, RTT y caché— y medirá también importación, parseo, compilación y decodificación, no sólo transferencia.

| Recurso vivo | Presupuesto |
|---|---:|
| DOM de portada | ≤ 1.200 nodos |
| DOM de mundo | ≤ 2.200 nodos |
| DOM de editor con listas virtualizadas | ≤ 2.500 nodos |
| Canvas/backing pixels juego | ≤ 12 millones |
| Canvas/backing pixels editor | ≤ 16 millones |
| Timers/conexiones/listeners huérfanos tras cerrar escena | 0 |
| Autosave | sólo dirty, como máximo una escritura cada 5 s, con flush fiable |

### 5.5 Estructura y calidad

- 100 % de ataques con delivery explícito.
- 100 % de packs de efectos conservados en round trip.
- 100 % de Pokémon del dist standard con los seis WebP pixel-art obligatorios, sin imágenes estáticas ni documentos en su carpeta, con créditos/procedencia en el registro central y estado compatible.
- 44 de 44 ataques con un effect.webp pixel-art dedicado basado en move-pixel-v1.
- 100 % de las identidades NPC referenciadas bajo una carpeta individual por nombre y con npc-overworld-v1 exacto.
- 100 % de animaciones con source/logical/chunk counts y timeline fieles al archivo.
- 0 referencias activas a quarantine.
- 0 duplicados físicos exactos dentro de dist salvo excepción documentada.
- 0 diferencias de case entre manifiesto y disco.
- 0 archivos públicos fuera de la allowlist.
- Suite principal completamente verde.

### 5.6 Mapa de impacto esperado

Estas cifras no son aditivas: mezclan distribución, transferencia, memoria y árbol de trabajo.

| Acción | Magnitud auditada | Tipo de beneficio | Confianza |
|---|---:|---|---|
| Publicar allowlist en vez de la raíz | hasta 450,71 MiB no alcanzados fuera del deploy | Distribución/seguridad | Alta |
| Retirar map-geography.js si se confirma sin consumidor | 1,74 MiB raw / 193 KiB gzip | Carga/parseo inicial | Alta |
| Sacar editor de la entrada de juego | ~40 KiB HTML, 589 nodos y ~42 KiB gzip JS, además de SSE/timers | Red/DOM/CPU | Alta |
| Diferir NPC, props, preview y atlas no visibles | universo ansioso de ~20 MiB transferidos | Carga inicial | Alta; el ahorro exacto depende del spawn |
| Retirar las entregas estáticas heredadas al migrar las 90 especies pendientes al pack compartido de seis animaciones | elimina la duplicación de vistas estáticas; el baseline estimó 435,93 MiB para 93 pares decodificados simultáneamente | Memoria | Media; requiere regeneración/revisión artística |
| Consolidar duplicados SHA | 85,90 MiB teóricos; 4,27 MiB mixtos de primera revisión | Árbol de trabajo | Media/baja hasta resolver tooling |
| Sacar 31 ZIP de la raíz publicable | 92,63 MiB | Distribución/seguridad | Alta |
| Limitar chunks al mapa y anillo activos | universo total decodificado ~188,40 MiB | Memoria | Alta |
| Recodificar dos audios largos | 13,31 MiB de entrada | Red | Pendiente de A/B auditivo |
| Mantenimiento Git opcional | 56,57 MiB de basura temporal detectada | Almacenamiento local | Alta, pero fuera del runtime |

---

## 6. Arquitectura objetivo

La estructura final propuesta es:

    src/
      app/
        bootstrap/
        router/
        state/
      data/
        moves/
        species/
        encounters/
        maps/
        schemas/
        migrations/
      engine/
        assets/
        audio/
        render/
        timing/
      systems/
        battle/
        movement/
        interaction/
        save/
        streaming/
      scenes/
        title/
        world/
        interiors/
        prism/
        horror/
      compatibility/
        legacy-data-adapter.js
        legacy-save-migrations.js
      editor/
        app/
        data/
        server-client/
    public/
      assets/
        runtime/
          pokemon/
            {family-slug}/
              {pokemon-slug}/
                idle-front.webp
                idle-back.webp
                attack-physical-front.webp
                attack-physical-back.webp
                attack-special-front.webp
                attack-special-back.webp
          moves/
            {move-slug}/
              manifest.json
              credits.txt
              effect.webp
          npcs/
            {npc-name-slug}/
              manifest.json
              credits.txt
              overworld.png
          player/
          world/
          maps/
          interiors/
          portraits/
          scenes/
          audio/
          video/
          fonts/
    asset-vault/
      manifest/
      source/
        pokemon/
        moves/
        npcs/
          {npc-name-slug}/
      derived/
      archive/
      legacy-runtime/
        pokemon/
        moves/
        npcs/
          {npc-name-slug}/
      quarantine/
        npcs/
          {npc-name-slug}/
      reports/
    tools/
      assets/
      build/
      validation/
      migration/
    tests/
      unit/
      contracts/
      integration/
      visual/
      performance/
      fixtures/
    dist/
      standard/
      legacy-dev/

Reglas:

- src contiene código y datos fuente.
- public/assets/runtime contiene únicamente entradas aptas para entrega.
- Los packs Pokémon, movimiento y NPC tienen inventario cerrado: un archivo visual suelto nunca constituye un pack válido. Cada carpeta Pokémon contiene sólo sus seis WebP; su metadata, SHA, timeline, créditos y procedencia se registran fuera del pack.
- Los slugs de carpeta son kebab-case, legibles y únicos; el ID interno estable se conserva en el catálogo central para Pokémon y en manifest.json para los perfiles que sí lo admiten, y nunca se deriva de la ruta.
- Si dos NPC comparten nombre, el segundo recibe un sufijo semántico estable. No se usan números arbitrarios si existe un nombre canónico.
- asset-vault nunca se sirve.
- source conserva originales editables y referencias.
- derived conserva productos reproducibles que no necesita el navegador.
- archive conserva paquetes legítimos de autoría que no son runtime ni basura.
- legacy-runtime contiene activos necesarios durante la corrección. Sólo el build legacy/desarrollo puede incluirlos; el dist estándar final excluye Pokémon, VFX de movimientos y NPC legacy.
- quarantine contiene recursos inactivos o suspendidos con un manifiesto de restauración.
- review-required y compliance-blocked son estados de manifiesto, no carpetas de destino.
- reports contiene inventarios y resultados de validadores, no recursos del juego.
- dist se genera desde cero; sólo dist/standard sirve producción. dist/legacy-dev es local, explícito y temporal.

La migración será incremental. No se intentará mover script.js entero en una sola operación.

### 6.1 Estándar de código y formato

Se añadirá una capa de formato mecánico antes de la reestructuración grande:

- .editorconfig para encoding UTF-8, fin de línea, indentación y newline final.
- Un único formatter automático para JavaScript, CSS, HTML, JSON y Markdown.
- ESLint con configuración versionada, reglas de errores y una lista corta de excepciones temporales.
- Scripts check, format, lint, test, validate:assets, build y verify en package.json.
- Mismos comandos en local y CI.
- Nada generado se editará a mano; tendrá cabecera GENERATED y comando de regeneración.
- No mezclar cambios de formato masivos con cambios funcionales en el mismo lote.

Convenciones:

- Archivos y directorios: minúsculas y kebab-case.
- pokemon-slug y move-slug son claves semánticas estables; npc-name-slug se deriva del nombre canónico visible y queda congelado tras publicarse.
- Los IDs actuales de NPC, incluidos npc-01-nurse y el alias guide, se conservan como npcId/spriteId/aliases del manifiesto aunque cambie la carpeta.
- Variables y funciones: lowerCamelCase.
- Clases o tipos nominales: PascalCase.
- Constantes verdaderamente globales: UPPER_SNAKE_CASE.
- IDs funcionales existentes: conservar su formato estable aunque no coincida con el nombre de archivo.
- Un módulo tendrá una responsabilidad y una API explícita.
- Datos no accederán al DOM.
- Render no leerá localStorage.
- Carga de assets no decidirá reglas de combate.
- Todo listener, timer, observer, conexión o recurso adquirible devolverá o registrará su cleanup.
- Evitar estado global mutable nuevo; usar servicios o estado de escena con dueño claro.
- Los errores de carga incluirán assetId, escena, ruta resuelta y causa.
- Los comentarios explicarán decisiones y restricciones, no repetirán el código.

Límites orientativos, aplicados como warning y no como división artificial:

- Revisar módulos por encima de 400–500 líneas.
- Revisar funciones por encima de 50 líneas o con varias responsabilidades.
- Prohibir nuevos bloques de datos de dominio dentro de script.js.
- Prohibir nuevas URLs de assets dispersas si pueden registrarse en el manifiesto.
- Prohibir nuevos setInterval sin dueño y cleanup.

### 6.2 Extracción del monolito

Orden de extracción de menor a mayor acoplamiento:

| Contenido actual | Destino | Condición |
|---|---|---|
| Constantes y schemas | src/data/schemas | Sin DOM ni estado global |
| MOVES y efectos | src/data/moves | Registro único validado |
| POKEMON y evoluciones | src/data/species | IDs y migraciones estables |
| Resolución de rutas | src/engine/assets | Sólo assetId → URL/metadata |
| Guardado | src/systems/save | Sin lectura de layout |
| Audio | src/engine/audio | Lifecycle y abort explícitos |
| Combate | src/systems/battle | Depende de registros, no del DOM global |
| Movimiento/interacción | src/systems | Consultas espaciales |
| Render y minimapa | src/engine/render | Invalidación por suciedad |
| Escenas | src/scenes | load, enter, update, render, exit, dispose |
| Bootstrap | src/app/bootstrap | Sólo composición |

Cada extracción seguirá el patrón:

1. Crear tests caracterizadores del comportamiento actual.
2. Definir una interfaz pequeña.
3. Mover sin cambiar conducta.
4. Sustituir el acceso global por inyección o import.
5. Medir bundle y ejecución.
6. Eliminar el puente antiguo cuando no tenga consumidores.

### 6.3 Normalización de nombres y procedencia

La auditoría encontró 559 nombres no kebab-case fuera de README/CREDITS, 557 con guion bajo, 1.508 rutas dentro de revisiones download/contact/review versionadas, 40 rutas con el posible typo Braspn y 2.445 archivos llamados genéricamente frame-XX.

La estrategia será:

- No renombrar workfiles sólo por estética si una herramienta externa depende de ellos.
- Dar assetId semántico a cada runtime aunque la fuente mantenga un nombre histórico.
- Mantener aliases de ruta con fecha de retirada durante la migración.
- Guardar versión y hash en metadata, no en el nombre canónico.
- Requerir tool, jobId, source, license y creditFile para pasar a compliant.
- Generar un informe de procedencia. Actualmente hay 44 CREDITS.txt, pero sólo cinco contienen URL y tres mencionan una licencia explícita.

---

## 7. Contrato canónico de ataques

### 7.1 Identidad

- id: estable, lowerCamelCase y compatible con partidas. Ejemplo: waterGun.
- slug: minúsculas y kebab-case para archivos. Ejemplo: water-gun.
- name: nombre visible localizado. Ejemplo: Pistola Agua.
- schemaVersion: entero reconocido.
- Nunca derivar el ID funcional del nombre visible.

### 7.2 Campos obligatorios

Cada ataque tendrá de forma explícita:

    {
      "schemaVersion": 2,
      "id": "ember",
      "slug": "ember",
      "name": "Ascuas",
      "type": "Fuego",
      "power": 17,
      "accuracy": 94,
      "delivery": "ranged",
      "drain": false,
      "visual": {
        "profile": "move-pixel-v1",
        "assetId": "move-ember-effect"
      },
      "audio": null,
      "credits": {}
    }

Campos mínimos:

- id
- slug
- name
- type
- power
- accuracy
- delivery: melee, ranged, self o field
- drain: booleano explícito
- visual con profile y assetId dedicado
- audio, aunque sea null
- credits

Los campos opcionales de estado, prioridad, multiimpacto o balance deberán existir dentro de objetos tipados, no como propiedades sueltas.

### 7.3 Ascuas como estándar visual obligatorio

La implementación actual de Ascuas es el golden fixture de move-pixel-v1:

- ID ember.
- Nombre Ascuas.
- Tipo Fuego.
- power 17.
- accuracy 94.
- delivery ranged.
- asset ascuas-sol-explosivo.webp.
- Canvas lógico 128 × 128.
- 13 frames.
- Alpha.
- Duración real del medio: 1.060 ms.
- Impacto: 620 ms.
- Anchor aproximado: 0,28 / 0,50.
- Reproducción única.

El manifiesto visual debe separar:

    {
      "kind": "move-pixel-v1",
      "mode": "asset",
      "assetId": "move-ember-effect",
      "sourceFrameCount": 13,
      "logicalFrameCount": 13,
      "encodedChunkCount": 13,
      "mediaDurationMs": 1060,
      "holdMs": 0,
      "runtimeDurationMs": 1060,
      "impactMs": 620,
      "playCount": 1,
      "anchor": { "x": 0.28, "y": 0.50 },
      "logicalSize": { "width": 128, "height": 128 }
    }

Cada uno de los 44 ataques tendrá una carpeta y un asset exclusivos:

    moves/{move-slug}/
      manifest.json
      credits.txt
      effect.webp

Requisitos de move-pixel-v1:

- effect.webp animado y exclusivamente pixel art.
- WebP RGBA con transparencia efectiva.
- Canvas lógico fijo de 128 × 128.
- Reproducción finita, playCount 1.
- sourceFrameCount, logicalFrameCount, encodedChunkCount y duraciones declarados.
- mediaDurationMs, holdMs, runtimeDurationMs, impactMs y anchor declarados.
- Correspondencia 1:1: un ataque, una carpeta, un effect.webp; no se comparte el mismo VFX como arte final de dos ataques.
- Ascuas conserva 13 frames lógicos, 1.060 ms e impacto a 620 ms como fixture de referencia. Otros ataques pueden ajustar frames y timing si el movimiento lo exige, pero no el formato técnico ni el nivel pixel-art.
- Procedencia, job ID de PixelLab, licencia/crédito y SHA registrados.

Para VFX finitos se cumple runtimeDurationMs = mediaDurationMs + holdMs. impactMs debe quedar dentro de runtimeDurationMs y apuntar al evento esperado.

No existe mode preset dentro del contrato aceptado. Un preset genérico puede mantenerse sólo como deuda temporal en un build legacy/desarrollo durante la migración; nunca será compliant ni entrará en el dist final. Si un asset conforme falla inesperadamente al cargar, el runtime registra el error y continúa de forma segura, pero no lo disfraza como un VFX aprobado.

### 7.4 Estados de cumplimiento visual

- compliant: metadatos completos y asset dedicado aprobado.
- active-legacy: funciona temporalmente, pero carece de VFX dedicado o no cumple; queda excluido del dist final.
- review-required: hay contradicción de timing, frames, créditos o identidad.
- quarantined: no se puede usar en runtime.

Los 43 efectos que todavía no alcanzan el nivel de Ascuas se crearán por lotes pequeños usando exclusivamente PixelLab, con revisión individual antes de integrarlos.

### 7.5 Validadores

- ID reconocido y único.
- Slug único y kebab-case.
- delivery obligatorio.
- power y accuracy dentro del rango aprobado.
- Tipo reconocido.
- assetId dedicado, único y existente.
- Estructura exacta moves/{move-slug}/{manifest.json, credits.txt, effect.webp}.
- effect.webp es WebP RGBA animado, transparente, 128 × 128 lógico y pixel art aprobado.
- Frames, dimensiones, alpha y timing coinciden con el archivo.
- runtimeDurationMs satisface la ecuación con mediaDurationMs y holdMs.
- impactMs no supera runtimeDurationMs.
- Los 44 assetId son distintos y ningún ataque usa preset.
- El round trip conserva los 44 ataques y cualquier entrada futura desconocida.
- El editor y el combate consumen el mismo registro.

---

## 8. Contrato canónico de Pokémon

### 8.1 Registro de especie

    {
      "schemaVersion": 2,
      "id": 9001,
      "key": "petrillo",
      "slug": "petrillo",
      "status": "active",
      "name": "Petrillo",
      "types": ["Roca"],
      "baseHp": 25,
      "catchRate": 0.34,
      "moveIds": ["tackle"],
      "description": { "es": "Monstruo Semilla." },
      "familyId": "petrillo-line",
      "evolution": {},
      "assets": {
        "animationProfile": "pokemon-animation-only-v1"
      },
      "credits": {}
    }

Estados válidos:

- active
- encounter-only
- legacy
- review-required
- quarantined

El runtime no contendrá objetos de ataque embebidos en moves; almacenará moveIds y los resolverá contra el registro canónico. El adaptador de compatibilidad podrá reconstruir temporalmente la forma antigua.

description estará presente en los 116 registros como objeto localizado o null. Las 95 descripciones actuales deben sobrevivir intactas al round trip.

### 8.2 Pack runtime exacto

Cada Pokémon incluido en el runtime standard tendrá una carpeta individual:

    pokemon/{family-slug}/{pokemon-slug}/
      idle-front.webp
      idle-back.webp
      attack-physical-front.webp
      attack-physical-back.webp
      attack-special-front.webp
      attack-special-back.webp

Los seis recursos visuales son obligatorios, animados y exclusivamente pixel art. La carpeta de especie contiene exactamente esos seis WebP: cero imágenes estáticas, poses auxiliares, manifiestos, créditos u otros documentos. No se admiten recursos artísticos adicionales, nombres alternativos ni archivos sueltos como parte de un pack conforme.

Slots:

1. idle-front
2. idle-back
3. attack-physical-front
4. attack-physical-back
5. attack-special-front
6. attack-special-back

El catálogo central, fuera de la carpeta de especie, declara packId, entitySlug, speciesId, profile, cada slot, SHA, dimensiones, frames, timing, alpha, créditos y procedencia. Un poster técnico que necesite una herramienta se deriva automáticamente de su animación y se guarda fuera del pack; no es un séptimo slot ni una ilustración independiente.

Situación actual:

- Braspín, Ascuero y Volcazote (IDs 4, 5 y 6) ya tienen su carpeta exacta de seis WebP y cumplen `pokemon-animation-only-v1`.
- Las otras 90 especies registradas todavía carecen del pack estándar completo.
- Los 93 pares static front/back y los packs legacy melee/ranged pertenecen al baseline histórico; pueden servir temporalmente en legacy, pero nunca cuentan para standard.
- Toda especie adicional que se incorpore al alcance standard, incluidos los IDs 10, 19 y 43 si siguen siendo alcanzables sin redirección, deberá adoptar el mismo pack antes de activarse; no se incluye en el backlog cerrado actual de 90.

### 8.3 Perfil único pokemon-animation-only-v1

Fuente maestra:

- Original inmutable y lossless a dimensión nativa dentro de asset-vault/source.
- sourceFormat y sourceDimensions registrados.
- La fuente maestra nunca se reescala ni recomprime de forma acumulativa.

Entrega:

- Exactamente seis WebP animados: idle, attack-physical y attack-special, cada uno en front y back.
- Lienzo 384 × 384 RGBA transparente.
- Exclusivamente pixel art y render pixelated.
- Exactamente 8 frames lógicos por animación.
- sourceFrameCount, logicalFrameCount y encodedChunkCount declarados por separado.
- El WebP puede contener menos chunks cuando el encoder fusiona poses consecutivas idénticas, pero el timeline lógico sigue representando 8 frames.
- idle: 120 ms por frame, cycleDurationMs 960, loop infinito.
- attack: 90 ms por frame, mediaDurationMs 720, holdMs 120, runtimeDurationMs 840, impactMs 620 y una reproducción.
- Máximo blando de 225 KiB por WebP y aproximadamente 0,8 MiB por especie para las seis secuencias.
- No se aceptan PNG estáticos, pose PNG independientes, fallbacks artísticos ni documentos dentro del pack.

`pokemon-animation-only-v1` no admite otro número lógico de frames ni otra topología de carpeta. Una animación no se regenera sólo porque encodedChunkCount sea menor; sí se corrige si el timeline lógico, la identidad, el pixel art o el movimiento fallan.

Los PNG históricos, incluidas las 50 imágenes de 1254 × 1254 detectadas en el baseline, pueden conservarse como masters o legacy fuera del pack estándar. Nunca son una entrega runtime conforme ni un fallback para una especie migrada.

### 8.4 Consumo compartido

- Pokédex, combate, equipo y selector resuelven los seis archivos desde el mismo registro; queda prohibido crear copias, thumbnails artísticos o sprites alternativos por superficie.
- Pokédex, equipo y selector muestran la animación idle correspondiente, no una imagen estática independiente.
- El combate elige `attack-physical` o `attack-special` según la categoría del movimiento y conserva front/back según el lado. Esta categoría visual es distinta de la semántica de entrega melee/ranged del VFX de movimiento.
- Reduced motion congela un frame de una de las seis animaciones conformes; no añade un archivo al pack.

### 8.5 Evoluciones e identidad

- Evolution será una estructura única capaz de representar una ruta simple o ramas.
- Todas las referencias apuntarán a ID, no a nombre visible.
- No debe haber ciclos.
- La familia debe tener un ID estable.
- Las migraciones históricas se ejecutarán según saveVersion.
- Resolver expresamente el nombre Ascuero duplicado en IDs 5 y 9813.
- Resolver la discrepancia braspy/braspin con un slug canónico y aliases de ruta temporales.
- Revisar, sin cambios automáticos, el balance de Petrillo, Musgólem y Terravórdeo.
- Los 23 registros fuera de Sanpledex recibirán un estado de producto explícito. Los IDs 10, 19 y 43 no pueden declararse legacy o quarantined mientras PRISM_WEAK_EXIT_IDS los mantenga alcanzables.

### 8.6 Carga

- No precargar los packs completos de todas las especies.
- Cargar el oponente, equipo visible y candidatos inmediatos.
- Usar un ResourceManager con refcount, LRU y presupuesto global.
- Dejar refcount en cero y liberar de forma verificable ImageBitmap, URL temporal, buffers y canvas que no pertenezcan a una caché acotada cuando una escena se cierre.
- Predecir la siguiente necesidad sólo con límites estrictos.

---

## 9. Contratos de NPC, mundo y medios

### 9.1 NPC

Cada NPC tendrá una carpeta individual legible por su nombre canónico:

    npcs/{npc-name-slug}/
      manifest.json
      credits.txt
      overworld.png

Ejemplo:

    npcs/deportista-max/
      manifest.json
      credits.txt
      overworld.png

Reglas de identidad:

- npc-name-slug se deriva una sola vez mediante NFKD, minúsculas ASCII, eliminación de diacríticos, sustitución de separadores por guion y colapso de guiones. Después queda congelado.
- manifest.json distingue npcId —identidad lógica usada por mapas/diálogo— y spriteId —identidad del pack visual—.
- Los IDs internos existentes permanecen estables.
- IDs como npc-11-athlete y aliases como guide no determinan la carpeta; se conservan como id/aliases para no romper mapas, editor o partidas.
- Si dos nombres colisionan, se añade un sufijo semántico estable.
- Dos NPC con identidades distintas no comparten la carpeta de otro como resultado final. Las reutilizaciones actuales quedan shared-appearance-legacy hasta disponer de asset propio.
- Sources viven en asset-vault/source/npcs/{npc-name-slug}; activos incumplidores en asset-vault/legacy-runtime/npcs/{npc-name-slug}; previews en derived y reportes en reports. Source nunca es servible.

Perfil obligatorio npc-overworld-v1 para overworld.png:

- 384 × 512 RGBA.
- Rejilla 6 × 8.
- Celda 64 × 64.
- Seis frames por dirección.
- Orden de filas fijo: down, down-right, right, up-right, up, up-left, left, down-left.
- PNG transparente, no entrelazado y sin suavizado.
- Pixel art con render nearest-neighbour.
- Fuente, runtime y algoritmo de conversión enlazados.
- SHA de entrada y salida.
- Alpha y píxeles authored según el contrato. Una paleta sólo será gate si el perfil declara una paleta explícita; no se impondrá una paleta global inexistente.

manifest.json declara como mínimo npcId, spriteId, displayName, entitySlug, aliases, profile, slot overworld, dimensiones, grid, rowOrder, SHA, sourceAssetId y créditos.

Estado actual:

- Los 48 sheets cumplen PNG RGBA no entrelazado, 384 × 512, rejilla 6 × 8 y 48 celdas visibles.
- Cada identidad vive en una carpeta individual por nombre con exactamente `overworld.png`, `manifest.json` y `credits.txt`.
- Los 48 PNG conservaron su SHA al migrarse; no se regeneraron ni alteraron píxeles.
- IDs internos y aliases —incluido `guide`— se resuelven mediante un catálogo determinista.
- El atlas HGSS de autoría ya no se referencia desde runtime y queda fuera de la allowlist publicable.

La comparación destructiva contra fuentes 4 × 4 se retiró: el sheet 6 × 8 aprobado es el canonical y el material histórico sólo documenta procedencia. Cualquier cambio artístico futuro usa exclusivamente PixelLab y debe volver a superar el contrato completo.

### 9.2 Jugador

- Mantener el perfil 384 × 512, 6 × 8, ya validado.
- Usarlo como fixture positivo del contrato compartido.
- Añadir pruebas de límites, transparencia, orden de frames y escala.

### 9.3 Tiles y props

- Unidad lógica múltiplo de 32 px.
- Nombre runtime kebab-case.
- Atlas con columnas, filas, tamaño de celda, pivote, colisión y tags declarados.
- Separar source sheet, atlas compilado, preview y metadata.
- Un único canonical por contenido.
- Alias en manifiesto, no copias físicas.
- Probar seams y vecinos, no sólo dimensiones.

Los pares activos idénticos building-tower-tan-left/right y shop-grocery-left/right requieren revisión semántica: pueden ser simetrías válidas o faltar variantes.

### 9.4 Mapas

- Chunks WebP de aproximadamente 1024 × 1024 o el tamaño que gane el benchmark.
- Navegación como máscara compacta separada.
- Cargar únicamente el anillo visible y una precarga vecina limitada.
- Presupuesto comprimido orientativo por chunk: 500 KiB; excepciones justificadas.
- El preview del minimapa se generará a resolución de uso, no se decodificará una imagen 2508 × 2508 para mostrarla a tamaño pequeño.
- GeoJSON, bases HD, referencias rectificadas, overlays, walkability de trabajo y sector sheets quedarán fuera de dist.

Los 50 chunks actuales —25 por cada uno de los dos mapas— están completos y suman 17,70 MiB. Distribución total, mapa activo y máximo residente son métricas distintas; sólo el anillo del mapa activo debe permanecer decodificado. Los 50 juntos podrían ocupar unos 188,40 MiB.

### 9.5 VFX

Perfil move-pixel-v1:

- Una carpeta moves/{move-slug} y assetId estable por movimiento.
- effect.webp WebP RGBA animado, transparente y pixel art.
- Canvas lógico 128 × 128.
- sourceFrameCount, logicalFrameCount y encodedChunkCount cuando el formato pueda fusionarlos.
- frameMs o duraciones por frame declarados.
- Reproducción finita, playCount 1.
- pivot/anchor.
- blend.
- impactMs.
- política de fallo de carga sin sustitución visual genérica.
- alpha efectivo.
- créditos y procedencia.

Los seis recursos VFX runtime actuales pesan sólo unos 30 KiB, pero pertenecen a varios sistemas; sólo Ascuas es el golden fixture completo de movimiento. La prioridad es crear los otros 43 VFX dedicados y consistentes, no exprimir estos bytes.

### 9.6 Audio

- Música: Ogg/Opus (.opus; MIME audio/ogg; codecs=opus) como entrega principal; WebM/Opus sólo si aporta una ventaja en la matriz objetivo; MP3 como fallback únicamente si hace falta.
- Efectos cortos: codec/contenedor elegido por medición y compatibilidad, no por extensión ambigua.
- Codec, contenedor, bitrate, canales, sample rate, duración y MIME declarados.
- Normalización de loudness y picos con valores medidos.
- Loop points declarados.
- preload none o metadata salvo evidencia contraria.
- Streaming para pistas largas.
- Un único pipeline de fetch/decode por asset.
- AbortController al abandonar escena.
- Desconectar nodos y liberar referencias al terminar.
- Suspender timers y AudioContext cuando corresponda al ocultar la pestaña.

Prioridad:

- shadow-chase.mp3: 9,99 MiB, 4:21, 320 kbps.
- patata-de-barrio.mp3: 3,32 MiB, 2:33.

Ambos concentran aproximadamente el 97 % del audio.

### 9.7 Vídeo

- preload metadata o none.
- Carga sólo al entrar en la escena.
- Poster ligero.
- Resolución y bitrate adaptados a su tamaño real de presentación.
- Abort y liberación de src al cerrar.
- Mantener MP4 y añadir otra variante sólo si una matriz real de navegadores lo justifica.

### 9.8 Tipografía

El proyecto no descarga fuentes y usa pilas de sistema. Se mantendrá así salvo que el diseño exija métricas idénticas. Si se añade una fuente:

- WOFF2 licenciado.
- Subset de glifos.
- font-display swap.
- Fallback con métricas ajustadas.

---

## 10. Sistema de inventario y cuarentena

### 10.1 Dimensiones de clasificación

Cada recurso tendrá exactamente un role, un lifecycleState, un reviewState, un complianceState, un migrationState, un storageClass y runtimeIncluded por perfil de build. No se mezclará su función semántica, inclusión en el juego, revisión, cumplimiento y lugar de almacenamiento.

Roles:

- runtime
- source
- derived
- preview
- archive
- documentation

Lifecycle states:

- active
- active-legacy
- unwired
- superseded
- quarantined
- approved-for-removal

Review states:

- not-required
- review-required
- in-review
- approved
- rejected

Compliance states:

- unknown
- compliant
- compliance-blocked

Migration states:

- stable
- candidate
- planned
- moved
- restored

Storage classes:

- public-runtime
- vault-source
- vault-derived
- vault-archive
- vault-legacy-runtime
- vault-quarantine
- external-artifact

runtimeIncluded es una decisión explícita por perfil y es la fuente de cada allowlist. Ejemplo: un Peyote legacy puede tener lifecycleState active-legacy, reviewState review-required, runtimeIncluded.standard false, runtimeIncluded.legacyDev true y vivir en vault-legacy-runtime. Un PNG fuente con procedencia sin resolver conserva role source, puede tener complianceState compliance-blocked y vivir en vault-source. Quarantine no borra su identidad semántica.

### 10.2 Estructura

    asset-vault/
      manifest/
        assets-v1.json
        runtime-allowlist.json
        legacy-runtime-allowlist.json
      source/
        pokemon/
        moves/
        npcs/
          {npc-name-slug}/
        world/
        maps/
        audio/
      derived/
        contact-sheets/
        comparisons/
        previews/
      archive/
        pokemon/
        vfx/
        maps/
      legacy-runtime/
        pokemon/
        moves/
        npcs/
          {npc-name-slug}/
        world/
      quarantine/
        2026-07-19/
          npcs/
            {npc-name-slug}/
          superseded-unreferenced/
          orphaned-after-validation/
          unresolved-identity/
      reports/
        inventory/
        references/
        duplicates/
        review-required/
        compliance/
        validation/

### 10.3 Registro obligatorio

    {
      "schemaVersion": 1,
      "auditId": "assets-2026-07-19",
      "id": "stable-semantic-id",
      "kind": "pokemon-animation",
      "packId": "pokemon-example-runtime-pack",
      "entitySlug": "pokemon-example",
      "profile": "pokemon-animation-only-v1",
      "slot": "idle-front",
      "originalPath": "...",
      "currentPath": "...",
      "proposedPath": "...",
      "role": "runtime",
      "lifecycleState": "active",
      "reviewState": "approved",
      "complianceState": "compliant",
      "migrationState": "stable",
      "storageClass": "public-runtime",
      "runtimeIncluded": {
        "standard": true,
        "legacyDev": true
      },
      "sha256": "...",
      "bytes": 0,
      "format": "webp",
      "width": 384,
      "height": 384,
      "mode": "RGBA",
      "transparent": true,
      "sourceAssetId": "pokemon-example-idle-front-master",
      "references": {
        "runtime": [],
        "tooling": [],
        "tests": [],
        "documentation": [],
        "dynamicPatterns": []
      },
      "renditions": [],
      "animation": {
        "sourceFrameCount": 8,
        "logicalFrameCount": 8,
        "encodedChunkCount": 8,
        "frameDurationsMs": [120, 120, 120, 120, 120, 120, 120, 120],
        "totalDurationMs": 960,
        "playCount": 0
      },
      "audio": null,
      "canonicalOf": null,
      "violations": [],
      "replacement": null,
      "credits": {
        "tool": "",
        "jobId": "",
        "source": "",
        "license": "",
        "licenseStatus": "review-required",
        "creditFile": null
      },
      "restore": {
        "moveTransactionId": "",
        "gitCommit": "",
        "previousManifestVersion": "",
        "restorePath": "",
        "rewrittenReferences": [],
        "reversePatchPath": "",
        "verificationSha256": "",
        "notes": ""
      },
      "verifiedAt": "2026-07-19"
    }

Este registro y sus créditos viven en el catálogo global de assets. Nunca se materializan como `manifest.json`, `credits.txt` ni otro documento dentro de una carpeta Pokémon.

canonicalOf siempre apunta desde la copia o alias hacia el assetId canónico. Los bloques animation y audio podrán ser null según kind. Para audio, el bloque equivalente registrará codec, container, MIME, durationMs, channels, sampleRate, bitrate, loudness y loop points.

### 10.4 Algoritmo seguro de movimiento

1. Congelar y versionar el inventario.
2. Construir el grafo de referencias runtime, tooling, tests, documentación y patrones dinámicos.
3. Validar que la ruta no es activa o registrar su reemplazo.
4. Comprobar SHA y canonical.
5. Registrar créditos y procedencia.
6. Añadir la operación propuesta al manifiesto con moveTransactionId, restorePath, referencias a reescribir y reverse patch, sin mover aún.
7. Ejecutar tests de contrato, carga y partida.
8. Mover con una operación Git reversible en un lote pequeño.
9. Reescribir referencias mediante el registro, no por duplicación.
10. Reconstruir dist desde cero.
11. Verificar red: cero 404, cero rutas a quarantine y cero case mismatch.
12. Ejecutar comparación visual y una partida de humo.
13. Si el destino es quarantine, mantenerlo al menos durante una entrega; source, derived y archive no se confunden con cuarentena.
14. Sólo después marcar approved-for-removal.

### 10.5 Primeros candidatos

**Contenido exacto duplicado con canonical activo: 4,27 MiB**

- tileset-grass-dirt-source.png, idéntico a tileset-grass-dirt.png.
- tileset-road-sidewalk-source.png, idéntico a tileset-road-sidewalk.png.
- Tres copias no usadas por runtime de asphalt-sidewalk.png alrededor del canonical runtime.
- Tres copias no usadas por runtime de sidewalk-grass.png alrededor del canonical runtime.

No se enviarán los ocho directamente a quarantine. Al menos una copia asphalt-sidewalk está referenciada por assets/generated/san-pablo-barrio-c-pixellab/manifest.json. Primero se decidirá qué copia es runtime y cuál es source, se actualizarán manifiestos/herramientas y sólo se eliminará una copia física si la procedencia sigue representada.

**Medios de ataque no conectados: 15 / aproximadamente 3,00 MiB**

- Cuatro medios Braspín están documentados explícitamente como sustituidos.
- Ocho medios Dracoscama/Petrillo/Peyote tienen sustitución o legado identificable; se conservarán como source/legacy hasta validar el pack exacto y después saldrán del estándar.
- luminio-attack-front.png, lunaria-attack-front.png y lusdria-attack-front.png son archivos aislados: no completan ninguno de los seis slots obligatorios y quedan unwired hasta construir su pack.

**Runtime-named candidates: 29 / 4,57 MiB**

- Es un conjunto heterogéneo, no una categoría superseded.
- placement-preview.png.
- runtime-contact-sheet.png.
- grass-tall-atlas-alpha.png.
- Tiles separados tile-00 a tile-15 cuando el atlas canónico esté validado.
- Props y aliases antiguos después de resolver sus mappings.

**Archive**

- 31 ZIP, 92,63 MiB.
- Mantener en almacenamiento de artefactos o LFS si son necesarios para autoría.
- Nunca incluirlos en dist.

**Source**

- Workfiles pixellab-hq bajo las cuatro familias braspy, dracoscama, petrillo y peyote: 222,97 MiB.
- Fuentes/referencias de assets/generated.
- Fuentes cartográficas, GeoJSON, bases HD y overlays.

**Review-required**

- Los 32 NPC con divergencias.
- Cualquier WebP cuyo timeline lógico o duración falle; tener menos chunks codificados que frames lógicos no basta.
- building-tower-tan-left/right.
- shop-grocery-left/right.
- Los dos WebP legacy de Peyote de 32 frames hasta sustituirlos por los seis slots exactos de `pokemon-animation-only-v1`.
- Recursos sin licencia o procedencia suficiente reciben compliance-blocked; no se mueven automáticamente si siguen activos.

Review-required es un estado, no una carpeta física. En Pokémon, movimientos y NPC, un recurso en revisión sólo puede entrar en legacyDev; standard permanece false hasta que el pack completo sea approved y compliant.

**No mover aún**

- Cualquier recurso referenciado.
- Cualquier fallback cuya ruta de fallo no se haya probado.
- Fuentes necesarias para regenerar runtime.
- Créditos.
- Assets vinculados a pruebas visuales.

### 10.6 Duplicados

La auditoría encontró:

- 716 grupos SHA-256.
- 1.723 copias adicionales.
- 85,90 MiB potenciales.
- 710 grupos sólo entre candidatos no runtime: 81,39 MiB.
- 4 grupos con canonical activo y copias no usadas por runtime: 4,27 MiB.
- 2 grupos formados sólo por activos: 0,24 MiB.

La cifra es un máximo teórico del árbol de trabajo, no un ahorro seguro inmediato. Muchos frames iguales pueden ser pausas intencionales. No se deduplicará contenido animado sin conservar la semántica temporal.

---

## 11. Plan de ejecución por fases

Cada fase debe aterrizar en uno o varios cambios pequeños y revisables. No se mezclará una reestructuración de datos con una compresión masiva y un cambio de render en el mismo lote.

### Fase 0 — Congelar línea base y reparar contratos críticos

- **Prioridad:** P0
- **Dependencias:** ninguna
- **Tamaño relativo:** M

Trabajo:

1. Añadir scripts reproducibles de inventario, referencias, dimensiones, alpha, frames, SHA y peso.
2. Generar runtime-files-v0.json con las 572 rutas inferidas y sus patrones dinámicos; será la allowlist mínima de la fase 2, todavía sin semántica enriquecida.
3. Guardar resultados resumidos en asset-vault/reports.
4. Integrar suites Node y Python relevantes en un único comando.
5. Convertir el fallo NPC actual en una lista de deuda explícita para que una nueva divergencia sí falle de forma diferenciada.
6. Corregir el patrón de ID de attack-effects.
7. Hacer estrictos kind y schemaVersion.
8. Preservar entradas desconocidas.
9. Añadir round-trip de los 44 ataques.
10. Añadir round-trip de las 116 especies, incluidas las 95 descripciones existentes.
11. Añadir fixtures por saveVersion para cada uno de los 24 aliases históricos, especialmente el ID 4.
12. Construir el conjunto de especies alcanzables y exigir el pack compartido de seis animaciones front/back; resolver o bloquear explícitamente 10, 19 y 43.
13. Validar por separado sourceFrameCount, logicalFrameCount, encodedChunkCount y duración de las animaciones.
14. Añadir validate:pokemon-packs: carpeta individual con sólo seis WebP exactos, cero estáticos/documentos, pixel art, alpha, dimensiones y timeline.
15. Añadir validate:move-vfx: 44 carpetas, 44 effect.webp dedicados, move-pixel-v1 y cero presets.
16. Añadir validate:npc-folders: carpeta por nombre, inventario exacto y npc-overworld-v1.
17. Generar informes de gaps sin mover todavía los recursos incumplidores.
18. Medir carga inicial, heap, CPU por frame, frames perdidos, recursos, DOM, listeners, timers, AudioNodes y canvas con escenarios fijos.

Criterios de aceptación:

- Los 44 ataques sobreviven importación, normalización y exportación.
- Un kind o schemaVersion inválido produce error útil, no datos vacíos.
- Se conserva una entrada desconocida sin ejecutarla.
- Las 116 especies conservan todos sus campos, incluida description.
- Cada alias histórico tiene un resultado definido por saveVersion.
- Ningún ID alcanzable resuelve sprite vacío.
- El informe enumera por entidad cada slot Pokémon ausente, cada VFX no dedicado y cada NPC sin carpeta/formato conforme.
- Los tres validadores no permiten que aparezca una nueva entidad legacy sin quedar registrada.
- runtime-files-v0 reconstruye exactamente el conjunto permitido y no incluye fuentes, ZIP ni herramientas.
- La suite distingue deuda NPC existente de regresiones nuevas.
- El informe se regenera con un único comando.
- Ningún asset se ha movido todavía.

### Fase 1 — Quick wins sin cambio artístico

- **Prioridad:** P0/P1
- **Dependencias:** fase 0
- **Tamaño relativo:** M

Trabajo:

1. Confirmar por instrumentación que map-geography.js no tiene consumidor runtime y retirarlo de index.html.
2. Cambiar vídeos ocultos de preload auto a metadata/none.
3. Cargar audio largo sólo al entrar en su escena.
4. Unificar el fetch/decode duplicado de pistas de diálogo.
5. Desconectar MediaElementSource, PannerNode y GainNode; cancelar timeouts de terror al abandonar escena.
6. Suspender timers, audio y rAF al ocultar la pestaña y reiniciar el timestamp al reanudar para evitar delta acumulado.
7. Evitar construir interiores y recursos de terror al iniciar portada.
8. Cargar en la entrada al mundo sólo NPC, props y chunks visibles en spawn; diferir los otros NPC, 24 sprites de mundo, preview y atlas restantes.
9. Ejecutar generateMaze, renderStarters y overrides sólo cuando la escena/UI los necesita; llevar validaciones y BFS diagnósticas a tests o debug.
10. Desactivar por defecto la autoconexión, presencia, SSE e intervalos del editor en juego normal. La separación física de su entrada pertenece a fase 2.
11. Autosave con dirty flag, debounce, máximo una escritura cada 5 s y flush fiable en pagehide/visibilitychange.
12. Eliminar el forced layout durante autosave.
13. Ejecutar streaming sólo cuando cambia la firma cuantizada del conjunto de chunks visibles o se cruza un límite de prefetch; mover la cámara dentro del mismo conjunto no vuelve a ordenar ni reconstruir.
14. Cachear la capa estática del minimapa. La capa dinámica tendrá umbral de posición y frecuencia máxima, en lugar de repintarse por cambios subpíxel.
15. Sustituir getBoundingClientRect por ResizeObserver donde no cambie la conducta.
16. Eliminar escrituras dataset por frame o restringirlas al modo debug.
17. Añadir guards para no escribir DOM si el valor no cambió.

Criterios de aceptación:

- Cero peticiones de presencia en juego normal.
- Cero vídeo o pista larga descargada antes de necesitarse.
- Cero bucle de juego activo con pestaña oculta.
- map-geography.js no aparece en la red del juego o se documenta el consumidor que obliga a mantenerlo.
- Portada dentro del presupuesto inicial de 6 MiB y entrada al mundo limitada al conjunto visible de spawn.
- Streaming, minimapa y layout no ejecutan trabajo si su entrada no cambió.
- Guardar y cerrar inmediatamente no pierde progreso.
- Menos nodos y menos bytes en portada, medidos.
- Mismas partidas, combates y transiciones en smoke test.

### Fase 2 — Frontera de build y servidor de producción

- **Prioridad:** P1
- **Dependencias:** fases 0 y 1
- **Tamaño relativo:** L

Trabajo:

1. Elegir mediante un spike corto un bundler con módulos, code splitting, hashes y manifiesto; para este proyecto vanilla se prioriza una solución pequeña.
2. Extraer script, CSS, markup y recursos del editor a una entrada independiente.
3. Generar desde cero los perfiles standard y legacyDev.
4. Copiar únicamente assets incluidos por el perfil correspondiente. legacyDev mantiene el juego utilizable durante la corrección; standard jamás incluye Pokémon, VFX o NPC legacy.
5. Crear un manifiesto mínimo de mapas y cargar con import() sólo el mapa activo.
6. Separar CSS de portada, juego, escenas y editor.
7. Migrar scripts clásicos a módulos en lotes, preservando el orden de globals mediante una fachada de compatibilidad y smoke test por lote.
8. Dividir escenas de portada, mundo, combate, prisma, horror y editor en chunks bajo demanda.
9. Emitir nombres con hash para recursos construidos.
10. Precomprimir gzip y Brotli.
11. Servir sólo dist/standard en modo producción; dist/legacy-dev requiere modo local explícito.
12. Añadir ETag, Last-Modified, Cache-Control immutable para hashes y no-cache para HTML/manifiestos.
13. Añadir Range/206 para audio y vídeo.
14. Rechazar rutas a source, tools, tests, asset-vault y archivos de proyecto.

Criterios de aceptación:

- Una URL de source, ZIP, test o herramienta responde 404/403 en producción.
- dist se puede borrar y reconstruir de forma reproducible.
- El build informa con precisión por qué standard todavía no es publicable mientras falte cualquier pack obligatorio.
- El servidor de producción nunca puede seleccionar legacyDev; ese perfil exige flag local explícito.
- No hay rutas absolutas ni case mismatch.
- La recarga tras despliegue no mezcla HTML nuevo con chunks viejos.
- Audio y vídeo aceptan Range.
- Cumple el presupuesto inicial de dist. Cualquier excepción requiere responsable, aprobación, vencimiento y criterio de salida.

### Fase 3 — Registro único de datos

- **Prioridad:** P1
- **Dependencias:** fase 0; puede avanzar en paralelo con fase 2 si no toca los mismos archivos
- **Tamaño relativo:** L

Trabajo:

1. Definir schemas versionados para Move, MoveVisual, Species, Evolution, PokemonPack, NpcPack y AssetRef.
2. Extraer los 44 ataques de script.js.
3. Declarar delivery en los 32 incompletos tras revisión semántica.
4. Normalizar drain y visual en todos.
5. Mantener ID lowerCamelCase y slug kebab-case.
6. Extraer las 116 especies.
7. Sustituir objetos Move embebidos por moveIds.
8. Preservar description en las 95 especies que la tienen y declarar null/localización explícita en las demás.
9. Declarar status para las 93 de Sanpledex y las 23 externas. Mientras sigan en PRISM_WEAK_EXIT_IDS, 10, 19 y 43 serán encounter-only, no “no activas”.
10. Unificar evoluciones.
11. Crear un adaptador deep-frozen para el runtime antiguo.
12. Versionar migraciones de partida usando los fixtures creados en fase 0.
13. Resolver conscientemente ID 4, los 24 aliases, Ascuero duplicado y braspy/braspin.

Criterios de aceptación:

- Un único origen de verdad para cada ataque y especie.
- Cero referencia rota de ataque o evolución.
- Cero ciclo evolutivo.
- Partidas antiguas y nuevas cargan con fixtures.
- Los 116 registros superan round trip sin perder description ni campos desconocidos preservables.
- El adaptador puede retirarse por consumidores, no de golpe.
- El editor y el juego importan el mismo registro.

### Fase 4 — Manifiesto de assets y primera cuarentena

- **Prioridad:** P1
- **Dependencias:** fase 2 y contratos de fase 3
- **Tamaño relativo:** L

Trabajo:

1. Enriquecer runtime-files-v0 hasta assets-v1.json sin cambiar inicialmente su conjunto de entrega.
2. Asignar role, lifecycle/review/compliance/migration states, runtimeIncluded.standard/legacyDev, storageClass, packId, entitySlug, profile, slot, SHA, dimensiones, renditions, timeline, referencias y créditos.
3. Derivar runtime-allowlist y legacy-runtime-allowlist desde el manifiesto enriquecido.
4. Crear físicamente asset-vault fuera de la raíz servida.
5. Clasificar los ocho duplicados mixtos por role, actualizar manifiestos de herramientas y conservar un canonical por role antes de retirar una copia.
6. Mover previews y contact sheets reproducibles a derived. Sólo los obsoletos, sin consumidor y explícitamente descartables son candidatos de cuarentena; un derivado no reproducible se conserva en archive/source.
7. Mover ZIP a archive o almacenamiento externo, no a quarantine.
8. Mover workfiles a source sin romper herramientas.
9. Mover los cuatro medios Braspín explícitamente sustituidos sólo después de probar registro y fallbacks.
10. Clasificar los otros ocho medios con sustituto/legacy y mantener Luminio/Lunaria/Lusdria como unwired hasta una decisión de producto.
11. Revisar uno a uno los 29 runtime-named candidates antes de cualquier movimiento.
12. Mantener review-required de Pokémon, movimientos y NPC sólo en legacyDev; standard permanece false hasta aprobar el pack completo.
13. Hacer que las herramientas lean rutas desde manifiesto.

Criterios de aceptación:

- Cero referencia de runtime a quarantine.
- Cero copia física innecesaria del mismo SHA en dist.
- Todo movimiento tiene restauración.
- Source, derived y archive conservan su role; no se contabilizan falsamente como cuarentena.
- Herramientas de build siguen regenerando los recursos.
- Créditos y procedencia permanecen ligados al asset: en Pokémon viven exclusivamente en el catálogo central fuera de la carpeta; movimientos y NPC conservan su manifiesto/créditos de pack.
- La reducción del paquete se mide sin contar borrado de fuentes.

### Fase 5 — Packs Pokémon, VFX de ataques y carpetas NPC

- **Prioridad:** P1/P2
- **Dependencias:** fases 3 y 4
- **Tamaño relativo:** XL; dividir en tres líneas artísticas y después por familia/entidad

**Línea A — Pokémon**

1. Crear la guía pixel-art de escala, suelo, orientación, outline, paleta y animación.
2. Crear `pokemon/{family-slug}/{pokemon-slug}` con sólo los seis nombres canónicos antes de mover referencias; metadata y créditos quedan en el catálogo central.
3. Validar Braspín, Ascuero y Volcazote (IDs 4, 5 y 6) como fixtures conformes de `pokemon-animation-only-v1`.
4. Retirar del runtime standard los pares static front/back, poses PNG, documentos por especie y fallbacks artísticos; los masters aprobados permanecen en source fuera del pack.
5. Hacer que Pokédex, combate, equipo y selector resuelvan las mismas animaciones idle/physical/special mediante el registro central.
6. Construir mediante PixelLab los packs de las 90 especies pendientes, por familias y con aprobación visual.
7. Si 10, 19 y 43 siguen alcanzables y se incorporan al alcance standard, construir también sus seis animaciones antes de habilitarlos; no forman parte del backlog cerrado actual de 90.
8. Registrar source/logical/chunk counts y timings en el catálogo central sin confundir chunks WebP fusionados con frames ausentes.

**Línea B — ataques**

1. Migrar Ascuas a moves/ember como golden fixture sin cambiar su ID.
2. Crear manifest.json y credits.txt para los 44 movimientos.
3. Crear mediante PixelLab los 43 effect.webp dedicados restantes.
4. Validar WebP RGBA pixel-art, canvas 128 × 128, alpha, reproducción finita, timing, impacto y anchor.
5. Eliminar presets del perfil standard.

**Línea C — NPC**

1. Crear un manifiesto que distinga npcId y spriteId, mantenga IDs/aliases actuales y asigne npc-name-slug normalizado y legible.
2. Sustituir primero toda construcción manual de URL en juego y editor por resolveNpcSprite(spriteId), incluido el alias guide → npc-guide.
3. Probar el resolver con mapas, interiores, editor y partidas antes de mover un solo archivo.
4. Crear npcs/{npc-name-slug}/{manifest.json, credits.txt, overworld.png}.
5. Decidir y registrar por NPC cuál es la fuente visual canónica; no asumir que legacy 4 × 4 siempre prevalece sobre el 6 × 8.
6. Migrar los 16 sheets que ya pasan el contrato.
7. Corregir los 32 sheets desde su fuente aprobada; cualquier regeneración visual usa PixelLab.
8. Crear spriteId, carpeta y apariencia propios para cada identidad que hoy comparte el sprite de otro, actualizando mapas/editor atómicamente.
9. Retirar el atlas HGSS y las rutas planas cuando no tengan consumidores.
10. Mover sources 4 × 4 y maestros a asset-vault/source/npcs/{npc-name-slug}.

Criterios de aceptación Pokémon:

- Cada especie standard tiene exactamente los seis slots animados, sin arte adicional ni faltante.
- Los seis recursos son WebP pixel art transparentes, con dimensiones y naming exactos; la carpeta no contiene estáticos ni documentos.
- Cada animación tiene 8 frames lógicos y timeline conforme aunque el encoder fusione chunks.
- Pokédex, combate, equipo y selector consumen esos mismos seis archivos, sin copias específicas por superficie.
- Cero pack Pokémon legacy/review-required en standard.

Criterios de aceptación de ataques:

- 44 movimientos, 44 carpetas y 44 effect.webp distintos.
- Todos cumplen move-pixel-v1 y están aprobados visualmente contra Ascuas.
- Cero preset o VFX genérico en standard.

Criterios de aceptación NPC:

- Cada identidad referenciada tiene carpeta propia por nombre canónico.
- overworld.png cumple exactamente 384 × 512 RGBA, 6 × 8, 64 × 64, rowOrder y pixel art.
- Cero atlas compartido, archivo plano o apariencia compartida no declarada en standard.
- Cero NPC legacy/review-required en standard.

Criterios comunes:

- No hay halo, fondo opaco, cambio de identidad ni salto de suelo.
- El presupuesto de bytes sólo admite una excepción documentada; formato, pixel art, slots y estructura no admiten excepciones.
- Créditos, SHA y procedencia completos; para Pokémon residen fuera del pack, y job ID es obligatorio sólo cuando generator sea pixellab.
- Captura, combate, evolución, ataques físicos/especiales de Pokémon, entregas melee/ranged de movimientos, diálogo y movimiento probados.

### Fase 6 — Mundo, mapas y medios

- **Prioridad:** P2
- **Dependencias:** fases 2 y 4
- **Tamaño relativo:** L

Trabajo:

1. Separar runtime, source, derived y preview de assets/generated.
2. Revisar 29 runtime-named huérfanos.
3. Reemplazar aliases físicos por aliases de manifiesto.
4. Generar preview de minimapa a resolución apropiada.
5. Validar y optimizar chunks de mapa sin introducir seams.
6. Tratar los 50 chunks como 25 por cada uno de los dos mapas; importar sólo el mapa activo y mantener residente únicamente su anillo visible/predictivo.
7. Sacar geodatos, HD y fuentes cartográficas de dist.
8. Comprimir/convertir shadow-chase y patata-de-barrio con prueba auditiva.
9. Hacer streaming y Range.
10. Optimizar los dos vídeos según tamaño de presentación.
11. Completar procedencia y licencia.

Criterios de aceptación:

- Cero fuente o preview en dist.
- Cero seam nuevo en mapas.
- Reducción de audio medida y aprobada auditivamente.
- Navegación y colisiones idénticas.
- El minimapa no decodifica el preview HD.
- Los chunks del mapa inactivo no se importan y los abandonados se expulsan con la caché/dispose disponible en esta fase. El refcount formal se incorpora en fase 7.

### Fase 7 — Render, streaming y memoria

- **Prioridad:** P1/P2
- **Dependencias:** fase 1; se beneficia de fases 2 y 6
- **Tamaño relativo:** XL; dividir por sistema

Trabajo:

1. Crear ResourceManager global con estado unloaded/loading/ready/error.
2. Dedupe de promesas de carga.
3. Refcount, LRU y presupuestos separados para imágenes CPU, canvas/backing buffers, audio y estimación GPU, con high-water/low-water.
4. Añadir abort y dispose.
5. Separar capa estática y dinámica del mundo.
6. Cachear la capa estática en OffscreenCanvas o canvas secundario si el benchmark lo valida.
7. Actualizar sólo regiones sucias.
8. Renderizar la capa estática del minimapa sólo al cambiar mapa o zoom; limitar la capa dinámica por umbral de posición y frecuencia máxima.
9. Crear buckets o índice espacial para objetos, encuentros y prompts.
10. Sustituir sort global por listas visibles/preordenadas.
11. Mover getBoundingClientRect a ResizeObserver y eventos de resize.
12. Agrupar escrituras DOM y evitar innerHTML por frame.
13. Pausar simulación y render cuando la escena no está visible.
14. Evaluar timestep fijo e interpolación sólo si el perfilado demuestra variación lógica; no introducir este cambio de comportamiento como optimización mecánica.
15. Añadir contadores de recursos, draw calls, chunks, listeners, timers, AudioNodes, canvas pixels y tiempo por sistema.

Criterios de aceptación:

- CPU p95/p99, ratio de frames perdidos y LoAF dentro del presupuesto en los escenarios de referencia.
- Cero minimapa repintado si nada cambió.
- Cero lectura de layout en el hot path normal.
- Los objetos consultados por frame dependen de la zona visible, no del total.
- Recursos de escena alcanzan refcount cero y cualquier retención restante pertenece a una caché acotada.
- Crecimiento retenido menor de 5 MiB después de 10 ciclos.

### Fase 8 — Editor aislado y mantenible

- **Prioridad:** P2
- **Dependencias:** fase 2
- **Tamaño relativo:** L

Trabajo:

1. Partir de la ruta/entrada/markup ya separados en fase 2.
2. Dividir map-editor-standalone.js por responsabilidades.
3. Catálogo y outliner virtualizados.
4. Cargar previews bajo demanda.
5. SSE sólo mientras hay editor activo.
6. Presence con frecuencia limitada, agrupación y cierre fiable.
7. Herramientas consumen el mismo catálogo de assets.
8. Editor no puede seleccionar quarantine como runtime.
9. Editor muestra badge de active-legacy/review-required/compliance-blocked.
10. Añadir métricas propias de DOM, listeners, timers y canvas del editor.

Criterios de aceptación:

- El juego normal no descarga código ni markup del editor.
- Abrir/cerrar el editor no deja conexiones ni timers.
- El catálogo soporta el inventario sin miles de nodos permanentes.
- Los estados de cumplimiento son visibles.

### Fase 9 — Observabilidad, CI y puertas de calidad

- **Prioridad:** P1 continuo
- **Dependencias:** empezar en fase 0, completar tras fase 8
- **Tamaño relativo:** M

Pipeline:

1. Lint/formato.
2. Unit tests.
3. Contract tests de datos.
4. Validación de assets.
5. Partidas de compatibilidad.
6. Build limpio.
7. Escaneo de referencias y case.
8. Verificación de allowlist.
9. Visual regression en escenas clave.
10. Smoke test de navegador.
11. Presupuestos de bytes, peticiones, DOM y rendimiento.
12. Informe de licencias/créditos.

Toda excepción tendrá:

- responsable;
- motivo;
- métrica actual;
- límite temporal;
- enlace a incidencia;
- criterio de salida.

### Fase 10 — Mantenimiento Git opcional

- **Prioridad:** P3
- **Dependencias:** proyecto estable y copia de seguridad
- **Tamaño relativo:** variable

Acciones seguras:

1. Ejecutar git fsck.
2. Confirmar que no hay procesos Git activos.
3. Hacer copia del repositorio.
4. Limpiar temporales y ejecutar gc en una ventana controlada.
5. Medir antes/después.

La reescritura de historial para extraer binarios antiguos es un proyecto separado: cambia hashes, afecta clones y requiere autorización explícita. No forma parte de este plan por defecto.

---

## 12. Orden recomendado de cambios

| Lote | Contenido | Riesgo | Beneficio |
|---|---|---:|---:|
| 1 | Tests de round trip y fix de IDs de efectos | Bajo/medio | Evita pérdida de datos |
| 2 | Baseline, aliases, IDs alcanzables y deuda NPC explícita | Bajo/medio | Hace segura y medible la migración |
| 3 | Quitar carga no usada, preloads y trabajo hot-path redundante | Bajo/medio | Mejora rápida de inicio y fluidez |
| 4 | Aislar editor | Medio | Reduce DOM, red y CPU |
| 5 | Crear dist y allowlist | Medio/alto | Mayor reducción segura de entrega |
| 6 | Schemas Move/Species + adaptador | Alto | Orden estructural |
| 7 | Manifest de assets | Medio | Hace segura la cuarentena |
| 8 | Duplicados, previews, ZIP y workfiles | Medio | Gran reducción de distribución |
| 9 | Packs Pokémon de seis animaciones por familias | Alto/artístico | Uniformidad total Pokémon |
| 10 | 44 VFX dedicados tipo Ascuas | Alto/artístico | Uniformidad total de ataques |
| 11 | Carpetas NPC por nombre y corrección 6 × 8 | Alto/artístico | Orden y consistencia NPC |
| 12 | Mapas, audio y vídeo | Medio | Menor memoria y transferencia |
| 13 | Render e índices espaciales | Alto | Fluidez sostenida |
| 14 | Editor modular y virtualizado | Medio | Mantenibilidad |
| 15 | Puertas CI finales | Bajo/medio | Evita recaídas |

Los lotes 5, 6, 9, 10, 11 y 13 deben dividirse en varios PR o commits revisables.

---

## 13. Matriz mínima de pruebas

### Datos y partidas

- Cargar save sin versión.
- Cargar cada versión conocida.
- Guardar y recargar.
- Importar/exportar 44 ataques.
- Round trip de 116 especies y 95 descripciones actuales.
- Efecto desconocido preservado pero no ejecutado.
- Evolución simple y ramificada.
- Los 24 aliases por saveVersion, incluido el caso histórico ID 4.
- IDs 10, 19 y 43 desde PRISM_WEAK_EXIT_IDS con resultado explícito.
- Todo ID standard alcanzable resuelve un pack de seis animaciones completo.
- Alias braspy/braspin.
- Dos especies con nombre visible duplicado.

### Combate

- Delivery melee y ranged de los movimientos.
- Los 44 ataques resuelven 44 effect.webp dedicados; cero presets.
- VFX WebP RGBA pixel-art con canvas 128 × 128.
- Impacto temprano, tardío y duración completa.
- idle, ataque físico y ataque especial en front/back para cada Pokémon.
- Ocho frames lógicos conservados aunque WebP fusione chunks idénticos.
- Ecuación mediaDuration + hold = runtimeDuration.
- Reduced motion.
- Fallo de carga del asset.
- Reduced motion congela un frame del asset conforme, sin pose artística adicional.
- Captura y cambio de Pokémon.

### Mundo

- Cambio de chunk en ocho direcciones.
- Teletransporte.
- Interior/exterior.
- Colisión y navegación.
- Minimapa.
- Cambio de tamaño y DPR.
- Mapa sin caché y con caché.
- Pestaña oculta/visible.

### Recursos

- 404 controlado.
- Abort durante carga.
- Dos consumidores del mismo asset.
- Expulsión LRU.
- Presupuesto excedido.
- Restauración tras error.
- Range de audio/vídeo.
- Cierre de escena deja cero AudioNodes/timeouts huérfanos.
- Cache busting tras deploy.
- Cada carpeta Pokémon contiene exactamente los seis WebP animados canónicos y ningún otro archivo; el catálogo y los créditos quedan fuera del pack.
- Cada carpeta de movimiento contiene effect.webp, manifest.json y credits.txt.
- Cada carpeta NPC contiene overworld.png, manifest.json y credits.txt.
- npcId, spriteId y aliases resuelven la carpeta por nombre sin construir URLs manualmente.
- El alias guide resuelve npc-guide y las identidades antes compartidas resuelven su spriteId propio.

### Visual

- Portada.
- Overworld.
- Combate.
- Prisma.
- Terror.
- Interiores.
- Editor.
- NPC y jugador caminando.
- Una captura golden por familia Pokémon migrada.
- Comparación contra Ascuas para cada VFX aprobado.
- Revisión de los seis slots animados de cada Pokémon y de su reutilización en Pokédex, combate, equipo y selector.

### Rendimiento

- 60 s quieto.
- 60 s de desplazamiento continuo.
- Cruce repetido de chunks.
- 10 ciclos interior/exterior.
- 10 combates consecutivos.
- Apertura/cierre repetido de editor.
- Modo oculto durante 60 s.

---

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Mover un asset dinámico no detectado | Manifiesto, instrumentación de red, lote pequeño y restauración |
| Romper partidas por renombrar IDs | IDs estables, saveVersion y fixtures |
| Resolver mal el ID 4 | Migración consciente de versión, nunca simple reorder |
| Perder identidad al traducir masters HD a animaciones pixel art | Conservar master fuera del pack, regenerar sólo con PixelLab y aprobar frente a referencia |
| Confundir chunks WebP fusionados con frames ausentes | Separar sourceFrameCount, logicalFrameCount, encodedChunkCount y timeline |
| Frames duplicados intencionalmente | Validar semántica temporal antes de deduplicar |
| Fallo de carga sin preset genérico | Gate de build que impide assets ausentes y ruta runtime segura con error visible en diagnóstico |
| Cachear HTML o manifiesto viejo | no-cache para entradas; immutable sólo para hash |
| Compresión de audio perceptible | A/B auditivo y conservar master |
| Seams en chunks | Capturas de bordes y recorrido automatizado |
| Editor rompe el juego al separarlo | Entrada independiente con contrato compartido |
| ESM rompe el orden implícito de globals | Fachada de compatibilidad, extracción incremental y smoke test por lote |
| Un ID alcanzable devuelve sprite vacío | Grafo de IDs desde todas las entradas y test de los seis slots front/back |
| Pixel art inconsistente | Sólo PixelLab para generación y revisión humana |
| Volumen artístico de 90 packs, 43 VFX y NPC pendientes | Lotes pequeños por familia, presupuesto de PixelLab y aprobación antes del siguiente lote |
| Renombrar carpetas NPC rompe mapas o saves | Mantener IDs/aliases estables y resolver rutas exclusivamente desde manifiesto |
| Créditos incompletos | Gate de procedencia antes de compliant |
| Optimización sin efecto | Presupuesto y medición antes/después |
| Cambios locales preexistentes | Rama/worktree y no tocar archivos ajenos |
| Reescritura Git destructiva | Proyecto separado y autorización explícita |

---

## 15. Decisiones que requieren validación humana

1. Cuál de los dos Ascuero conserva el nombre y cómo se renombra el otro.
2. Si los 23 Pokémon fuera de Sanpledex son contenido futuro, histórico o eliminable.
3. Si los pares left/right idénticos son intencionales.
4. Qué licencias o permisos se atribuyen a recursos suministrados por el propietario.
5. Qué navegadores y dispositivos forman la matriz de rendimiento.
6. Dónde se almacenarán ZIP y fuentes pesadas: Git LFS, artefactos o almacenamiento externo.

La resolución runtime de 10, 19 y 43 y la elección de las máquinas de referencia sí forman parte de la fase 0. Las demás decisiones no bloquean los quick wins ni la creación de dist.

---

## 16. Definición de terminado

El proyecto sólo se considerará optimizado y normalizado cuando:

- dist/standard cumpla los presupuestos aprobados.
- Sólo dist/standard sea servible en producción; legacyDev permanezca local y explícito.
- El inventario cubra el 100 % de los recursos.
- Cada recurso tenga role, lifecycle/review/compliance/migration states, runtimeIncluded por perfil, storageClass, referencias y procedencia.
- No haya referencias runtime a quarantine.
- Los 44 ataques sobrevivan round trip y tengan un VFX dedicado move-pixel-v1, sin presets.
- Las especies compartan contrato y las partidas migren.
- Todo Pokémon standard alcanzable tenga exactamente seis WebP pixel-art animados válidos, sin imágenes estáticas ni documentos dentro del pack, compartidos por Pokédex, combate, equipo y selector.
- Todo NPC standard tenga carpeta por nombre y overworld.png npc-overworld-v1.
- No exista ningún Pokémon, VFX de movimiento o NPC legacy/review-required dentro del dist standard.
- Todos los WebP tengan timeline lógico validado aunque sus chunks estén fusionados.
- La suite completa esté verde.
- Los smoke tests de navegador no tengan errores ni 404.
- Los objetivos CPU p95/p99, frames perdidos, LoAF y memoria se cumplan en las máquinas de referencia.
- Abrir, jugar, combatir, guardar, cargar, cambiar de escena y editar no deje timers, conexiones ni recursos fuera de cachés acotadas.
- Una persona nueva pueda localizar código, datos, runtime, fuentes y cuarentena sin conocer la historia del repositorio.

---

## 17. Próximo bloque recomendado

El primer bloque de implementación debería limitarse a:

1. Corregir el bug de persistencia de attack-effects.
2. Añadir round-trip de los 44 ataques.
3. Añadir fixtures de los 24 aliases y test de sprites para todos los IDs alcanzables.
4. Implementar schemas y validadores pokemon-pack-v1, move-pixel-v1 y npc-overworld-v1.
5. Integrar el informe reproducible de assets y runtime-files-v0 con perfiles standard/legacyDev.
6. Separar deuda NPC existente de nuevas regresiones.
7. Retirar o justificar map-geography.js.
8. Desactivar preloads y procesos de editor durante el juego normal.
9. Limitar spawn a recursos visibles y aplicar las invalidaciones de bajo riesgo.
10. Medir el resultado.

Este bloque aporta seguridad y una mejora rápida sin mover todavía ningún recurso. Después debe ejecutarse la frontera dist + allowlist; sólo entonces empezará la cuarentena física.
