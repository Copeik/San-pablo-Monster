# Pradera Bifaz

## Resumen

Pradera Bifaz es una zona especial de plataformas con cambio de perspectiva. La escena comienza como un paisaje con profundidad, capas y construcciones volumétricas; al activar el giro, esas capas se alinean en un plano lateral jugable. El cambio no es un mero fundido: edificios, árboles, suelo y cámara tienen desplazamientos distintos para comunicar que el espacio se está reorganizando.

La identidad visual y las reglas son originales. La referencia de diseño se limita al principio abstracto de alternar perspectivas para revelar rutas; la composición, el ritmo, el lenguaje de formas, los obstáculos y las interacciones se diseñan específicamente para este proyecto. No se incorporan sprites ni assets raster generados en este paquete: el SVG es una ilustración vectorial ligera escrita para este respaldo y el runtime debe reutilizar recursos ya presentes o dibujar elementos de interfaz con CSS.

## Cómo acceder

- En San Pablo, ve al **Pabellón Bifaz**, en la zona sureste, casilla **C67 · F73**.
- La brújula flotante indica dirección y distancia; en el minimapa aparece como un rombo mitad cian y mitad dorado.
- Al llegar a la fachada señalizada, colócate ante la puerta y pulsa **E**.
- En modo edición, abre **Entradas** y usa **«Localizar Pabellón Bifaz existente»** para seleccionarla y centrar la cámara.

## Estado y alcance

Este paquete aporta:

- Registro independiente con ID `pradera-bifaz`.
- Descriptor de minijuego `perspective-platformer-v1`.
- Contrato de contenido `runtimeVersion: 2` y revisiones `2`, compatible con el mismo adaptador estable.
- Tamaño lógico exacto de `5400 × 624`, cuadrícula de referencia de `32 px` y aparición en `{ x: 160, y: 462, direction: "right" }`.
- Música existente `route-first`.
- Retorno a `san-pablo`, en el punto seguro validado `(2128, 2288)`, mirando hacia el pabellón.
- Integración diferida y segura con `PERSPECTIVE_ZONE_CORE.DEFAULT_LEVEL`.
- Datos de editor aislados y todos los arrays del contrato inicializados.
- Vista previa/fallback vectorial original y de bajo coste.

El paquete no duplica la geometría del nivel. La definición jugable vive exclusivamente en `PERSPECTIVE_ZONE_CORE.DEFAULT_LEVEL`; de ese modo las plataformas, criaturas, checkpoints y piezas escénicas no divergen entre el mapa y el runtime.

## Manifiesto verificable de 50 mejoras v2

`PERSPECTIVE_ZONE_CORE.FEATURES` (o su alias público `PERSPECTIVE_ZONE_CORE.PERSPECTIVE_FEATURES`) es la fuente verificable de este inventario. Debe contener exactamente los 50 ID únicos de las tablas siguientes: cada fila cuenta como una mejora, los encabezados no. Las cantidades de misiones, retos y fauna se comprueban además sobre `DEFAULT_LEVEL`, no mediante búsquedas de texto en esta guía.

### Giro (1–10)

| Nº | ID público | Mejora y comprobación |
| ---: | --- | --- |
| 1 | `flip-four-phases` | El giro declara y recorre cuatro fases ordenadas antes de devolver el control. |
| 2 | `flip-anticipation` | La anticipación avisa el cambio antes de alterar geometría o modo. |
| 3 | `flip-fold` | El pliegue transforma cámara, capas y edificios con progreso continuo. |
| 4 | `flip-crossing` | El cruce conmuta la colisión una sola vez y proyecta al personaje a una posición válida. |
| 5 | `flip-settle` | El asentamiento completa el modo, estabiliza la escena y libera el input. |
| 6 | `flip-cascade` | Edificios, hierba, fauna y partículas reciben retardos por profundidad para formar una cascada visible. |
| 7 | `flip-safe-projection` | Un destino sólido activa una búsqueda acotada de apoyo seguro o cancela el giro. |
| 8 | `flip-input-lock` | Peticiones incompatibles no crean un segundo giro mientras hay uno activo. |
| 9 | `flip-reduced-motion` | Movimiento reducido conserva las cuatro fases semánticas mediante una transición abreviada. |
| 10 | `flip-persistent-nodes` | El giro reutiliza entidades persistentes; no reconstruye el mundo en cada frame. |

### Mundo (11–20)

| Nº | ID público | Mejora y comprobación |
| ---: | --- | --- |
| 11 | `world-paper-layers` | El mundo de papel separa fondo, terreno, juego y primer plano en capas de profundidad. |
| 12 | `world-paper-buildings` | Fachada, canto y tejado hacen legible cada construcción como pieza de papel plegable. |
| 13 | `world-depth-parallax` | El desplazamiento de una capa depende de su profundidad y de la cámara. |
| 14 | `world-fold-pivots` | Las piezas transformables conservan pivotes declarativos anclados a su base. |
| 15 | `world-contact-shadows` | Las sombras de contacto mantienen suelo y plataformas visualmente unidos. |
| 16 | `world-reactive-grass` | La hierba cercana responde a personaje y giro por parches, sin cambiar colisiones. |
| 17 | `world-particles-leaves` | Hojas de papel aparecen en desplazamientos, aterrizajes y cadenas de giro. |
| 18 | `world-particles-dust` | Polvo y pequeñas fibras confirman cruces y apoyos sin ocultar bordes. |
| 19 | `world-silhouette-echo` | El eco de silueta previsualiza la superficie que quedará alineada. |
| 20 | `world-camera-culling` | La cámara sólo entrega entidades dentro del margen visible del tramo activo. |

### Fauna (21–30)

| Nº | ID público | Mejora y comprobación |
| ---: | --- | --- |
| 21 | `wildlife-grounded` | Todos los Pokémon ambientales están aterrizados; ningún registro usa `behavior: "float"`. |
| 22 | `wildlife-side-facing` | En perfil se dibujan de lado y su orientación sigue la dirección de paseo. |
| 23 | `wildlife-ground-y-config` | Cada especie puede fijar un `groundY` numérico cuando necesita una línea de apoyo propia. |
| 24 | `wildlife-grounding-config` | La configuración `grounding` permite resolver plataforma, offset y modo de apoyo sin constantes por especie. |
| 25 | `wildlife-lane-projection` | Al pasar a perfil, la fauna se proyecta a un carril seguro y estable. |
| 26 | `wildlife-stable-seed` | Semillas estables reproducen dirección, pausas y ritmo entre simulaciones iguales. |
| 27 | `wildlife-bounded-roam` | Toda patrulla respeta `minX`, `maxX` y una velocidad no negativa. |
| 28 | `wildlife-player-reaction` | La proximidad puede provocar mirada, pausa, salto o retirada sin empujar al jugador. |
| 29 | `wildlife-distance-lod` | Los actores lejanos conservan estado con una frecuencia de actualización reducida. |
| 30 | `wildlife-nonblocking` | La fauna nunca forma parte de la geometría sólida ni bloquea rutas críticas. |

### Personaje (31–40)

| Nº | ID público | Mejora y comprobación |
| ---: | --- | --- |
| 31 | `player-coyote-time` | El tiempo de gracia admite saltar brevemente tras abandonar un borde. |
| 32 | `player-jump-buffer` | Un salto pulsado antes de aterrizar se consume una vez en el siguiente apoyo. |
| 33 | `player-variable-jump` | Soltar el botón antes reduce la altura sin invalidar el salto. |
| 34 | `player-fixed-step-input` | Los flancos de salto, giro y reinicio sobreviven hasta el siguiente paso fijo. |
| 35 | `player-fall-speed-cap` | La velocidad terminal limita caídas y conserva margen de corrección. |
| 36 | `player-moving-platform-carry` | Una plataforma móvil transfiere su delta al personaje mientras está apoyado. |
| 37 | `player-fast-respawn` | Caer restaura pronto el último punto seguro sin recargar el nivel. |
| 38 | `player-checkpoints` | Checkpoints con ID estable conservan posición, profundidad y progreso compatible. |
| 39 | `player-flip-preview` | Una pista previa muestra el apoyo previsto antes de aceptar un giro arriesgado. |
| 40 | `player-accessibility-assist` | La asistencia amplía tolerancias y pistas sin cambiar los objetivos principales. |

### Misiones y rendimiento (41–50)

| Nº | ID público | Mejora y comprobación |
| ---: | --- | --- |
| 41 | `mission-chain-five-steps` | `DEFAULT_LEVEL.missionSteps` materializa una cadena de cinco pasos: orientar, plegar, cruzar, enlazar y coronar. |
| 42 | `mission-chain-progress` | Cada misión tiene ID y condición estable para avanzar en orden y reanudar el paso activo. |
| 43 | `mission-three-challenges` | `DEFAULT_LEVEL.challenges` declara al menos tres retos opcionales, independientes de la salida. |
| 44 | `mission-optional-objectives` | Sellos, fauna y tiempo pueden aportar objetivos secundarios sin bloquear la cadena base. |
| 45 | `mission-reward-celebration` | Completar cadena y retos alimenta una celebración graduada sin alterar la dificultad. |
| 46 | `persistence-versioned` | El snapshot incluye versión y descarta de forma segura datos incompatibles. |
| 47 | `persistence-checkpoint` | Checkpoint, misión, retos, coleccionables y mejor tiempo se restauran mediante datos serializables. |
| 48 | `performance-spatial-culling` | Plataformas, edificios, fauna y efectos se consultan por ventana espacial visible. |
| 49 | `performance-pooled-particles` | Las partículas reutilizan un cupo acotado y se eliminan al vencer su vida útil. |
| 50 | `performance-frame-budget` | Paso fijo, límite de delta, subpasos máximos y LOD evitan trabajo proporcional a los `5400 px`. |

## Plan de diversión v2.1 aplicado

### Objetivos

- Premiar el movimiento enlazado sin convertir el recorrido principal en una contrarreloj.
- Dar una lectura inmediata del ritmo mediante Flujo, cadena de estilo y señales sonoras breves.
- Añadir decisiones de ruta con muelles y aterrizajes de precisión, manteniendo reintentos rápidos.
- Hacer que los retos opcionales valoren variedad real: plataformas y bisagras distintas, no repetición inmóvil.
- Conservar la salida voluntaria, la asistencia, la persistencia v2 y el presupuesto de rendimiento existente.

### Cambios concretos

1. **Medidor de Flujo.** El HUD muestra `paperFlow` de `0` a `100` en una barra compacta.
2. **Cuatro tiers legibles.** `CALMA`, `RITMO`, `PLIEGUE` y `PAPER RUSH` cambian color, etiqueta y cadencia.
3. **Paper Rush temporal.** Alcanzar el umbral activa un estado corto con latch y descenso antes de poder reactivarlo.
4. **Cadena de estilo.** `styleChain` hace visible cuántas acciones variadas se han enlazado.
5. **Mejor cadena.** `bestStyleChain` conserva la mejor marca entre checkpoints y sesiones.
6. **Muelles de papel.** Los springs impulsan rutas alternativas y producen un rebote sonoro propio.
7. **Aterrizajes con peso.** `land` diferencia contacto suave, firme y perfecto mediante impacto y velocidad.
8. **Giro en cuatro golpes.** Anticipación, fold, cruce y settle tienen tonos separados y siguen los `360 ms` del core.
9. **Negación explicada.** `flip-denied` comunica si falta bisagra, suelo, pulso o una proyección segura.
10. **HUD sin crecimiento notable.** Flujo ocupa una sola franja de unos `34 px` y cuatro badges comparten una fila.
11. **Accesibilidad sin spam.** La barra actualiza `aria-valuenow`/`aria-valuetext`; sólo cambios de tier y Paper Rush se anuncian en vivo.
12. **Reto Virtuoso.** Una activación de Paper Rush concede la cuarta insignia y un bono único de `100 ₱` tras completar la ruta.
13. **Origamista variado.** Exige plegar en tres bisagras distintas, registradas por `flipComboAnchorIds`.
14. **Acróbata verificable.** Exige tres aterrizajes de precisión únicos, registrados por `precisionLandingIds`.
15. **Checkpoint post-wall.** La recuperación posterior al muro reduce repetición antes de la carrera final.
16. **Ventana de combo amable.** La cadena admite aproximadamente `8 s` para enlazar la siguiente acción con intención.
17. **Persistencia tolerante.** Flujo, cadenas, Rushes y arrays de IDs se normalizan, migran y filtran contra el nivel real.
18. **Feedback priorizado.** Toast, jingle y anuncio compiten por prioridad y se coalescen a una presentación por frame.

### Reglas de Flujo

| Tier | Rango o activación | Lectura | Regla de juego |
| --- | ---: | --- | --- |
| `calm` | `0–24` | `CALMA` | Estado base; permite aprender y recuperarse sin penalización adicional. |
| `rhythm` | `25–54` | `RITMO` | Acciones variadas sostienen el medidor y empiezan a construir cadena. |
| `fold` | `55–84` | `PLIEGUE` | El jugador ha enlazado salto, giro, muelle o aterrizaje con continuidad. |
| `rush` | desde `85` | `PAPER RUSH` | Se activa temporalmente; el latch y el descenso impiden retrigger inmediato. |

El Flujo sube por acciones útiles y variadas, no por mantener una tecla ni repetir en el sitio. La cadena se rompe o decae al perder ritmo, caer o agotar la ventana; el mejor valor y el número de Rushes sí quedan en snapshot. Los contadores antiguos de combo y aterrizajes siguen siendo compatibles con partidas v2.

### Springs y feedback

Los springs son plataformas de impulso, no teletransportes: conservan lectura de trayectoria, producen un tono ascendente y desembocan en superficies visibles. Un aterrizaje `firm` o `perfect` añade un golpe corto; los contactos suaves permanecen silenciosos. Cada `flip-stage` usa una altura distinta, Paper Rush usa un arpegio de tres notas y `flip-denied` un descenso grave. Si coinciden varios eventos, prevalecen finalización y Rush, después insignias, checkpoints, aterrizajes y señales de bajo nivel.

### Presupuestos v2.1

| Recurso | Presupuesto aplicado |
| --- | --- |
| HUD | Una franja nueva de `≈34 px`; en apaisado el panel conserva `max-height: 62dvh` y scroll interno. |
| Audio/toast | Como máximo una presentación priorizada por frame; springs y tierras repetidas tienen cooldown. |
| ARIA live | Tier nuevo o Paper Rush; los cambios numéricos de Flujo sólo actualizan el `progressbar`. |
| Persistencia | No se guarda cada pulso de `flow`; sí Rush, insignia, checkpoint, ocultación y salida. |
| Partículas | Se reutiliza el pool acotado del core; no se añaden assets ni emisores sin límite. |
| Movimiento | Animaciones de HUD sincronizadas a `360 ms`; con movimiento reducido quedan anuladas. |
| Rendimiento | La actualización sigue limitada al paso fijo y la presentación a entidades visibles. |

## Objetivos de experiencia

1. **Un giro legible.** El jugador debe entender qué cambió, dónde aterrizará y por qué se abrió una ruta.
2. **Plataformeo amable, no trivial.** Respuesta rápida, margen de recuperación y retos que mezclan salto con lectura espacial.
3. **Paisaje vivo.** Hierba reactiva, criaturas deambulando y detalles secundarios hacen que atravesar la zona siga siendo entretenido entre retos.
4. **Sorpresa con reglas consistentes.** Cada novedad reutiliza el mismo vocabulario: profundidad, silueta, alineación y ritmo.
5. **Reintento inmediato.** Caer devuelve al último punto seguro; no hay vidas limitadas ni pantallas de carga intermedias.
6. **Rendimiento estable.** La longitud del nivel no implica actualizar ni pintar los `5400 px` a la vez.

## Recorrido y ritmo

El nivel global se puede repartir en siete actos. Los límites son guías de autoría, no paredes técnicas.

| Tramo lógico | Nombre | Enseñanza o reto | Elemento memorable |
| --- | --- | --- | --- |
| `0–720` | Umbral de la pradera | Movimiento, salto y primer giro sin peligro | Una construcción se pliega y deja ver el primer paso |
| `720–1520` | Lomas paralelas | Saltos cortos, plataformas escalonadas y lectura de sombra | Dos caminos aparentes se convierten en uno |
| `1520–2420` | Aldea acordeón | Alternar perspectiva para usar tejados y balcones | Fachadas con pivotes distintos forman una escalera |
| `2420–3300` | Claro de los paseantes | Respiro, hierba reactiva, criaturas y coleccionables opcionales | Las criaturas anticipan con su mirada qué capa es segura |
| `3300–4260` | Barranco de canto | Precisión vertical y plataformas móviles | Siluetas lejanas encajan como puentes al girar |
| `4260–5000` | Carrera bifaz | Secuencia fluida que combina todo sin detener la marcha | Cadena de alineaciones con recompensa por ritmo |
| `5000–5400` | Mirador de salida | Resolución, celebración y retorno voluntario | Panorama final que recupera la profundidad completa |

La dificultad debe crecer por combinación, no por castigo. Primero se presenta una regla en terreno seguro, luego se pide usarla con un salto y finalmente se mezcla con movimiento escénico. Cada secuencia exigente debe ir seguida de entre cuatro y ocho segundos de respiración.

## Mecánicas

### Cambio de perspectiva

El giro es una transición de estado transaccional. Una solicitud sólo se acepta si el jugador está vivo, no está saliendo del mapa, no hay diálogo modal y el cooldown ha terminado.

Secuencia visual recomendada:

1. **Anticipación, `0–90 ms`.** El personaje frena levemente, aparece una línea de horizonte y las sombras se tensan hacia sus pivotes.
2. **Despliegue, `90–470 ms`.** La cámara modifica inclinación y escala. Las capas lejanas se desplazan menos que las cercanas. Los edificios giran alrededor de su base, con un pequeño retardo entre fachada, tejado y lateral.
3. **Cruce, alrededor del 50 %.** Se activa la nueva geometría de colisión en un único paso. La posición se proyecta a un punto seguro antes de devolver el control.
4. **Asentamiento, `470–620 ms`.** Hay un rebote corto de escala, la hierba recupera su dirección y se confirma el modo con color, sonido y forma, no sólo con texto.

El giro inverso usa los mismos hitos en orden contrario. No se debe reconstruir el árbol de elementos durante la animación: basta con alternar clases/estado y transformar nodos persistentes. Las construcciones necesitan pivotes declarativos y coeficientes de profundidad diferentes para evitar que toda la escena parezca una única tarjeta.

Reglas de seguridad:

- Comprobar el destino antes de iniciar la transición.
- Si el punto proyectado queda dentro de un sólido, buscar primero hacia arriba y después hacia los lados dentro de una distancia acotada.
- Cancelar el giro con una señal suave si no existe destino seguro.
- Ignorar solicitudes repetidas durante la transición.
- Con movimiento reducido, reemplazar la rotación por un fundido breve y un cambio de silueta de `80–120 ms`.

### Plataforma y salto

La sensación de control tiene prioridad sobre una simulación física estricta:

- Aceleración horizontal rápida y frenado algo más suave para permitir correcciones.
- Salto variable: soltar el botón pronto reduce la altura.
- Tiempo de gracia al abandonar un borde (coyote time) de unos `100–120 ms`.
- Búfer de salto de unos `120–150 ms` antes de tocar suelo.
- Enclavar los flancos de salto, pliegue y reinicio hasta el siguiente paso fijo para no perder pulsaciones en pantallas de `144/240 Hz`.
- Velocidad de caída limitada para que las correcciones sigan siendo útiles.
- Plataformas atravesables desde abajo sólo cuando su lectura visual sea inequívoca.
- Las plataformas móviles trasladan al jugador con su delta por paso, conservando su posición relativa mientras permanezca apoyado.
- Checkpoint automático antes de cada combinación nueva y después de cada tramo largo.
- Recuperación de caída rápida, sin restablecer coleccionables ya obtenidos en la sesión.

El jugador nunca debería tener que ejecutar un giro durante un salto ciego. Cuando esa combinación aparezca en fases avanzadas, la posición final debe estar señalada por una sombra, una línea de hierba, una criatura que mira hacia el destino o un contorno de alto contraste.

### Edificios y piezas escénicas

Las construcciones tienen tres funciones simultáneas: decorar, enseñar profundidad y convertirse en plataformas. Para que el movimiento tenga peso:

- La base es el pivote principal y permanece visualmente anclada al suelo.
- Fachada, tejado y lateral pueden tener desfases de `20–60 ms`.
- Los elementos altos recorren más distancia aparente que los bajos.
- Una sombra de contacto permanece estable para impedir sensación de flotación accidental.
- La colisión cambia una sola vez en el punto de cruce, no acompaña cada frame de la animación.
- Los elementos puramente decorativos no entran en el grafo de colisiones.

Las casas no deben formar una barrera continua. Se alternan volúmenes, huecos y miradores para mantener el horizonte legible y dejar visibles las criaturas del fondo.

### Hierba reactiva

La hierba cumple funciones de ambientación y señalización:

- Se inclina cerca de los pies del personaje y recupera su posición con amortiguación.
- Una banda más clara puede señalar una plataforma segura o la proyección de una ruta oculta.
- Durante el giro, grupos próximos reaccionan en cascada; no se anima cada brizna de forma independiente.
- Los parches fuera de cámara permanecen inactivos.
- La respuesta visual no debe modificar la colisión ni ocultar bordes de salto.

### Criaturas deambulando

Las criaturas son habitantes ambientales y guías silenciosos. Se reutilizan sprites existentes del proyecto y se mantienen fuera de la geometría crítica.

- Cada una tiene una zona de paseo acotada, velocidad baja, pausas y una semilla estable.
- Cerca del jugador puede mirar, saltar o apartarse; lejos sólo actualiza una posición simplificada.
- En el modo lateral se proyecta a un carril seguro y nunca bloquea un salto.
- En profundidad puede cruzar entre capas decorativas, reforzando el efecto espacial.
- Al girar, anticipa el cambio con una pausa o una mirada para que la escena parezca consciente del jugador.
- El número de actores plenamente activos debe limitarse por distancia a cámara; el resto conserva estado sin animación.

Una interacción opcional puede otorgar una marca de exploración por encontrar a todos los paseantes. Esa recompensa no bloquea la salida ni requiere capturarlos.

### Ideas novedosas compatibles con el sistema

- **Eco de silueta.** Antes de girar, durante un instante se dibuja el contorno de la superficie que quedará alineada. Sirve de pista y premia la observación.
- **Rastro bifaz.** Completar varias alineaciones sin caer deja una estela de hojas y mejora la celebración final, sin afectar a la dificultad.
- **Arquitectura tímida.** Algunas ventanas se abren únicamente cuando el edificio queda de perfil y revelan un atajo visual o un objeto opcional.
- **Coro de la pradera.** Los habitantes cercanos producen pequeños acentos sincronizados con `route-first`; se emplean sonidos ya disponibles o síntesis del sistema, nunca reproducción continua por actor.
- **Ruta de regreso expresiva.** Al finalizar, el panorama recupera profundidad por capas desde el fondo hasta el primer plano antes de regresar a San Pablo.

## Controles y comunicación

Contrato recomendado para teclado:

| Acción | Teclas | Consideraciones |
| --- | --- | --- |
| Mover | `A/D` o flechas izquierda/derecha | En profundidad se puede ampliar a las cuatro direcciones si el runtime lo permite |
| Saltar | `Espacio` (`W` o flecha arriba en perfil) | Mantener para mayor altura; admite búfer |
| Cambiar perspectiva | `Q` o `F` | Disponible sólo cuando la señal de giro está activa |
| Cambiar de capa | `W/S` o flechas arriba/abajo en diorama | Permite rodear fachadas y alcanzar sellos de profundidad |
| Salir | Botón `SALIR` | Devuelve al punto declarado de San Pablo |
| Pausa | `Escape` | Detiene simulación y audio del minijuego |

Los controles reales deben leerse del sistema general y mostrarse con sus bindings actuales. No se deben codificar textos de tecla si el juego admite remapeo. La interfaz debe explicar el giro una vez y después usar una señal compacta junto al personaje.

## Arquitectura

### Separación de responsabilidades

```text
map-registry
  └─ maps/pradera-bifaz/editor-data.js
       └─ maps/pradera-bifaz/map.js
            ├─ config y metadatos de retorno
            ├─ layout vacío y seguro para herramientas genéricas
            └─ getter diferido de nivel

PERSPECTIVE_ZONE_CORE
  ├─ FEATURES / PERSPECTIVE_FEATURES (manifiesto exacto de 50 mejoras)
  ├─ DEFAULT_LEVEL (fuente única de geometría y contenido)
  ├─ MISSION_STEPS y OPTIONAL_CHALLENGES (progreso declarativo)
  ├─ simulación, colisiones y checkpoints
  └─ adaptación/render de la perspectiva

integrador del juego
  ├─ detecta runtime perspective-platformer-v1
  ├─ entra/suspende/reanuda/sale
  └─ aplica el retorno declarado en config.perspective
```

`map.js` puede cargarse antes que el core. `config.perspective.level` es un getter no enumerable que devuelve `PERSPECTIVE_ZONE_CORE.DEFAULT_LEVEL` cuando existe y `null` antes de ello. Al no ser enumerable, `JSON.stringify(config.perspective)` persiste únicamente:

```json
{
  "returnMap": "san-pablo",
  "returnX": 2128,
  "returnY": 2288,
  "returnDirection": "down",
  "runtimeVersion": 2
}
```

Esto evita una copia temprana igual a `null` y evita serializar o clonar un nivel grande.

### Contrato del mapa

| Campo | Valor | Uso |
| --- | --- | --- |
| `id` | `pradera-bifaz` | Registro, guardado y URL |
| `kind` | `minigame` | Impide tratarlo como una ciudad convencional |
| `runtime` | `perspective-platformer-v1` | Selecciona el adaptador |
| `width × height` | `5400 × 624` | Espacio lógico del nivel |
| `tileSize` | `32` | Editor y compatibilidad con herramientas |
| `spawn` | `160, 462, right` | Entrada al runtime |
| `music` | `route-first` | Pista ya incluida |
| `perspective.runtimeVersion` | `2` | Negociación del contrato de contenido v2 |
| `config.revision` | `2` | Revisión del descriptor de mapa |
| `layout.revision` | `2` | Revisión del layout para inspectores y editor |
| `previewImage` | `maps/pradera-bifaz/base.svg` | Preview y fallback, no fuente de colisiones |

Los arrays genéricos (`npcs`, `events`, `entrances`, `encounters`, `worldObjects`, superficies, barreras y demás) existen aunque estén vacíos. Esto permite que inspectores, editor y código compartido iteren sin comprobaciones especiales ni valores `undefined`.

El valor de `runtime` conserva `perspective-platformer-v1` porque identifica el adaptador ya instalado, no la revisión de datos. La compatibilidad se negocia con `perspective.runtimeVersion`: un core `VERSION >= 2` acepta el descriptor v2 y los guardados anteriores siguen pasando por su migración o fallback, sin renombrar rutas ni romper entradas existentes.

### Ciclo de vida

Estados mínimos del adaptador:

1. `inactive`: el mapa no consume frames ni listeners.
2. `entering`: monta o reactiva nodos, resuelve `DEFAULT_LEVEL`, prepara checkpoint y música.
3. `playing-depth` o `playing-side`: acepta input y actualiza la simulación.
4. `flipping`: bloquea solicitudes incompatibles, conserva input seguro y realiza el cambio transaccional.
5. `paused`: conserva estado sin avanzar física ni actores.
6. `exiting`: desuscribe listeners, devuelve control al juego y aplica coordenadas de retorno.

Los listeners globales deben instalarse una vez y retirarse al destruir el runtime, o permanecer detrás de una bandera de actividad. Entrar y salir varias veces no puede duplicar eventos.

### Guardado

El guardado general sólo necesita el ID del mapa y el punto de retorno. Para reanudar dentro del minijuego se puede conservar un bloque versionado separado con checkpoint, modo actual y coleccionables opcionales. Si la versión no coincide, se vuelve al spawn o al último checkpoint compatible; nunca se intenta ejecutar geometría serializada antigua.

## Optimización

### Actualización

- Un único `requestAnimationFrame` es dueño del bucle.
- Limitar `delta` tras volver de una pestaña inactiva para evitar atravesar plataformas.
- Separar simulación estable de presentación interpolada si la física lo necesita.
- Usar partición espacial sencilla por tramos para consultar plataformas próximas.
- Actualizar con detalle sólo actores dentro de la cámara más un margen.
- Suspender por completo cuando el minijuego no está activo o la página está oculta.
- Evitar asignaciones por frame: reutilizar vectores temporales, resultados de colisión y nodos de partículas.

### Render

- Transformar con `translate3d`, `rotate`, `scale` y variables CSS; evitar propiedades que fuerzan layout.
- No leer medidas del DOM después de escribir estilos en el mismo frame.
- Suavizar la cámara con el tiempo simulado transcurrido, no con un `1/60` fijo por render, para igualar su respuesta a `30/60/120 Hz`.
- Mantener nodos escénicos y alternar estado, en lugar de recrearlos durante cada giro.
- Aplicar `will-change` sólo mientras dura la transición y retirarlo después.
- Usar `contain` en capas independientes cuando no rompa el overflow visual.
- Agrupar hierba y partículas; máximo acotado y pool reutilizable.
- El SVG de `base.svg` comparte símbolos con `<use>`, no contiene imágenes embebidas ni filtros costosos.
- El fondo panorámico es sólo fallback. El runtime debe mostrar únicamente el tramo visible y un margen razonable.

### Audio

- Una sola fuente musical para `route-first`.
- Efectos cortos con límite de concurrencia y reutilización de nodos/voices.
- Silenciar o pausar al perder visibilidad según las preferencias globales.
- No crear un nodo de audio permanente por brizna, criatura o edificio.

### Presupuestos orientativos

- `60 fps` como objetivo; degradación estable a `30 fps` en equipos modestos.
- Menos de `4 ms` de scripting por frame en el recorrido normal.
- Sin crecimiento de nodos DOM después de cinco recorridos completos.
- Máximo de criaturas con animación completa definido por cámara, no por total del nivel.
- Sin imágenes nuevas de resolución panorámica; el SVG actual debe seguir siendo un fallback ligero.

## Accesibilidad

- Respetar `prefers-reduced-motion`: sin rotación de cámara, parallax fuerte, rebote ni sacudidas; el pliegue usa corte de geometría cubierto por un fundido breve.
- Ofrecer reducción de destellos y no usar flashes de pantalla completa.
- Mantener foco visible y navegación completa por teclado en pausa, ayuda y salida.
- No depender sólo del color para indicar el modo: cambiar silueta, icono y texto breve.
- Contraste suficiente en bordes de plataformas, especialmente sobre hierba.
- Señal sonora opcional al completar la proyección, acompañada siempre de señal visual.
- Texto de ayuda conciso anunciado sólo ante eventos discretos; el reloj queda fuera de la región viva para no saturar lectores de pantalla.
- Reintento rápido y sin penalización acumulativa.
- Opción de asistencia: ralentizar piezas móviles, ampliar coyote/búfer y mostrar permanentemente el eco de silueta.
- Pausar física cuando el foco está en un diálogo o control de interfaz.
- Áreas táctiles grandes si se añade control móvil, sin ocultar al personaje ni el destino del salto.

## Plan de implementación y verificación

### Fase 1 — Contrato y paquete

- Registrar el mapa y sus aliases.
- Declarar dimensiones, música, spawn y retorno.
- Inicializar estructuras genéricas de forma segura.
- Aislar datos del editor.
- Añadir preview SVG sin dependencias.

### Fase 2 — Runtime base

- Detectar `perspective-platformer-v1` al activar el mapa.
- Resolver `config.perspective.level` después de cargar el core.
- Implementar ciclo de vida, cámara lateral, movimiento, salto, colisión y checkpoints.
- Garantizar una salida idempotente a las coordenadas declaradas.

### Fase 3 — Giro escénico

- Modelar capas y pivotes de edificios.
- Implementar los cuatro hitos de la transición.
- Cambiar colisión en un único punto seguro.
- Añadir modo de movimiento reducido.
- Validar entradas repetidas, pausa durante giro y pérdida de foco.

### Fase 4 — Contenido vivo

- Añadir parches de hierba agrupados.
- Conectar criaturas a sprites ya existentes.
- Definir zonas de paseo, culling y comportamientos de observación.
- Introducir pistas de silueta y coleccionables opcionales sin bloquear progreso.

### Fase 5 — Pulido y rendimiento

- Perfilar scripting, layout, paint y memoria.
- Ajustar coyote time, búfer, aceleración y checkpoints con pruebas de juego.
- Verificar controles remapeados, reducción de movimiento y contraste.
- Hacer cinco ciclos de entrada/salida y confirmar que no quedan listeners, timers ni nodos duplicados.

## Criterios de aceptación

### Automáticos

- `GAME_MAP_REGISTRY.get("pradera-bifaz")` devuelve el paquete.
- `config.kind === "minigame"`.
- `config.runtime === "perspective-platformer-v1"`.
- `config.perspective.runtimeVersion`, `config.revision` y `layout.revision` valen `2`; `PERSPECTIVE_ZONE_CORE.VERSION >= 2`.
- `FEATURES` o `PERSPECTIVE_FEATURES` contiene exactamente los 50 ID únicos documentados en esta guía.
- `DEFAULT_LEVEL.missionSteps` contiene al menos cinco misiones con ID único y `DEFAULT_LEVEL.challenges`, al menos tres retos con ID único.
- Ningún registro de fauna usa `behavior: "float"`; todos declaran apoyo configurable o se resuelven a un `groundY` finito mediante `resolveWildlifeGroundY`.
- Dimensiones, `tileSize`, spawn, música y retorno coinciden exactamente con el contrato.
- Todos los campos iterables del mapa y layout son arrays, aunque estén vacíos.
- Cargar `map.js` sin el core no falla y `config.perspective.level === null`.
- Instalar después `PERSPECTIVE_ZONE_CORE.DEFAULT_LEVEL` hace que el getter devuelva esa misma referencia.
- `JSON.stringify(config.perspective)` no incluye `level`.
- `editorData.mapSize` es `169 × 20`, el techo de las dimensiones lógicas dividido por `32`.
- `base.svg` es XML válido, no referencia recursos externos y conserva `viewBox="0 0 5400 624"`.
- Las acciones de salto, pliegue y reinicio sobreviven a dos medios frames de `1/240 s` y se consumen una sola vez en el siguiente paso fijo.

### Manuales de jugabilidad

- El primer giro se entiende sin ensayo y error mortal.
- Los edificios muestran movimientos diferenciados y permanecen anclados visualmente.
- La colisión nunca cambia gradualmente ni deja al jugador dentro de un sólido.
- Cada salto crítico tiene una pista previa visible.
- Caer recupera el control con rapidez en el último checkpoint.
- Las criaturas no bloquean, empujan ni tapan plataformas.
- El final permite explorar antes de salir y devuelve exactamente a San Pablo.
- Cinco entradas y salidas consecutivas mantienen un solo bucle, una sola música y un único conjunto de controles.

### Matriz mínima

- Ventana ancha y estrecha.
- Teclado con WASD y flechas.
- Sonido activado y desactivado.
- Pestaña oculta y recuperada en salto, giro y pausa.
- `prefers-reduced-motion: reduce`.
- Escala del navegador de `80 %`, `100 %`, `125 %` y `200 %`.
- Partida nueva, reentrada tras completar y guardado incompatible simulado.

## Cómo ampliar la zona

1. Modificar o versionar el nivel en `PERSPECTIVE_ZONE_CORE`, no copiarlo dentro de `map.js`.
2. Mantener IDs estables para plataformas, checkpoints, criaturas y coleccionables persistentes.
3. Añadir contenido por tramos con límites espaciales claros para conservar el culling.
4. Registrar pivote, profundidad y geometría lateral de cada pieza que participe en el giro.
5. Reutilizar sprites existentes. Si un futuro cambio exige arte nuevo, debe seguir el flujo PixelLab configurado para el repositorio y añadir sus créditos; este paquete no contiene generación nueva de sprites ni pixel art.
6. Aumentar `runtimeVersion` sólo si cambia el contrato entre mapa e integrador, no por ajustes de balance.
7. Conservar una migración o fallback para guardados de la versión anterior.
8. Añadir pruebas de destino seguro por cada nuevo punto de giro.
9. Medir coste con el tramo más poblado visible, no sólo desde el spawn.
10. Actualizar esta guía cuando cambien controles, retorno, accesibilidad o presupuestos.

Para cambiar únicamente el lugar de regreso se editan los cinco metadatos de `config.perspective`. Para cambiar el paisaje de preview se modifica `base.svg`; eso nunca debe alterar colisiones. Para cambiar plataformas o habitantes se modifica el nivel del core y sus pruebas, manteniendo este descriptor como frontera de integración pequeña y estable.

## Referencias consultadas

- [Manual oficial de Super Paper Mario (Nintendo)](https://csassets.nintendo.com/noaext/image/private/t_KA_PDF/Wii_Super_Paper_Mario?_a=DATC1RAAZAA0): referencia funcional para que el cambio de perspectiva revele recorridos y no sea sólo decorativo.
- [Entrevista oficial sobre Super Paper Mario (Nintendo)](https://www.nintendo.com/en-gb/News/2007/Interview-Super-Paper-Mario-249673.html): referencia de intención y legibilidad del salto entre dimensiones.
- [Optimización de Canvas (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas): base para culling, enteros de pantalla y reducción de trabajo por fotograma.
- [`prefers-reduced-motion` (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion): adaptación del giro para jugadores sensibles al movimiento.
