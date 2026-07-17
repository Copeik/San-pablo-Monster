# Informe de reconstrucción y transitabilidad de San Pablo

## Resultado ejecutivo

El mapa reconstruido conserva la estructura urbana del original —ejes norte-sur, calles residenciales del oeste, barrio oriental, diagonal de Tesalónica y parque sur—, pero ya no depende de una única imagen para decidir por dónde se camina. El terreno se compila desde geometría semántica y los edificios, árboles, farolas, bancos, setos y barreras se colocan como recursos reutilizables.

La superficie transitable final es **54,132 %** del mundo: aproximadamente **3.404.952 de 6.290.064 píxeles lógicos**. Es una medida de área después de restar todos los colliders; no debe confundirse con el porcentaje de calles conectadas. La conectividad se comprueba por separado y el validador confirma **47 corredores completos** y **16/16 puertas alcanzables**.

Vistas principales:

- [Mapa reconstruido completo](assets/maps/san-pablo-rebuilt-preview.webp)
- [Mapa con transitabilidad y colliders](assets/maps/san-pablo-rebuilt-walkability-v2.png)
- [Comparativa de los nueve sectores](assets/maps/san-pablo-rebuilt-sectors-v2.png)
- [Informe numérico del compilador](assets/maps/san-pablo-rebuilt-report-v2.json)

## Cómo leer la auditoría visual

- **Verde:** área incluida en la máscara transitable final.
- **Rojo:** bloqueo explícito o collider de un edificio, árbol, mueble, barrera, valla o borde.
- **Sin tinte verde:** no debe darse por transitable, aunque conserve el color del terreno base. El rojo destaca los bloqueos explícitos, pero no colorea necesariamente toda zona fuera de la red navegable.
- La hoja de sectores presenta, para cada zona, la vista limpia a la izquierda y la misma vista con la auditoría a la derecha.
- Los porcentajes se calculan después de restar los colliders de los suelos semánticamente transitables.

Esta convención es especialmente importante en tres lugares: el terreno marrón del huerto norte es deliberadamente no transitable; el césped del parque sur solo se cruza por sus senderos; y el campo de fútbol es transitable por dentro, pero su valla solo deja abierto el acceso inferior.

## Arquitectura del mapa y de los tiles

- Mundo lógico de **2508 × 2508 px**, renderizado a densidad 2 como base de **5016 × 5016 px**.
- Retícula visual de **32 px** y máscara de navegación compacta de **314 × 314 celdas**, con una celda de navegación cada **8 px**.
- Fuente declarativa única en [`map-layout.js`](map-layout.js): **17 carreteras**, **19 caminos/accesos**, **12 superficies rectangulares**, **2 polígonos**, **1 campo deportivo**, **5 barreras narrativas**, **5 tramos de valla** y **4 bordes de mundo**.
- **48 formas semánticas transitables**; la transitabilidad heredada de `map-data.js` está desactivada para evitar que la imagen y la colisión diverjan.
- Catálogo de **16 prototipos reutilizables** y **245 colocaciones**: 32 edificios, 151 árboles, 57 elementos de mobiliario y 5 barreras. Diez prototipos proceden de la familia AI derivada y seis de la reconstrucción nueva: hilera residencial, Campus Cívico, Banco San Pablo, edificio moderno, árbol caducifolio y barrera de espinas.
- El compilador [`tools/compile-san-pablo-map.py`](tools/compile-san-pablo-map.py) recorta los patrones de terreno AI, pinta la geometría, genera el campo y produce una base determinista. Los assets dinámicos se componen sobre la vista y se dibujan en runtime; los chunks contienen el terreno para no duplicar edificios.
- Streaming en una matriz **5 × 5**, con **25 chunks** de hasta 512 px lógicos y gutter de 2 px. La compilación usa semilla 1978 y WebP sin pérdida.

## Resumen de los nueve sectores

| Sector | Área transitable | Lectura principal |
|---|---:|---|
| Noroeste | 51,811 % | Entrada, viviendas y Centro de Salud |
| Norte Centro | 43,021 % | UNED, plaza y conexión con Galería Jazmín |
| Nordeste | 53,931 % | Parque norte, huerto y primeras hileras orientales |
| Oeste | 41,362 % | Malla residencial de hileras tan |
| Centro Cívico | 73,362 % | Plaza, Galería y campo de fútbol |
| Barrio Este | 52,065 % | Hileras orientales y transición al barrio rojo |
| Parque Sur | 34,396 % | Césped controlado por senderos y salida suroeste |
| Tesalónica | 64,294 % | Campus, diagonal y enlace entre parque y servicios |
| Distrito Moderno | 72,949 % | Banco, servicios y plazas del sureste |

## Análisis crítico por sector

### 1. Noroeste — 51,811 %

**Composición.** Reúne la entrada pavimentada, tres viviendas norteñas de módulo residencial en la transición con el sector vecino, el **Centro de Salud San Pablo**, arbolado perimetral, setos y farolas. El edificio sanitario conserva una silueta singular y no se confunde con las casas reutilizadas.

**Vías transitables.** La entrada de `ada-north`, el `northwest-link`, la parte occidental de `jerusalen`, la avenida vertical `ada` y el borde de `estambul` forman la red principal. `northwest-paved-entry`, `clinic-precinct` y `access-clinic` garantizan continuidad entre calzada, acera y puerta.

**Cierres visibles.** `blocker-north-exit` corta la continuación hacia el norte. El bosque y el borde del mundo cierran el perímetro, y los colliders del Centro de Salud, árboles, setos y farolas aparecen en rojo.

**Valoración crítica.** La proporción es equilibrada: hay una entrada clara y espacio suficiente alrededor del centro médico, pero las zonas verdes no se convierten en atajos invisibles. La barrera de espinas evita que el tramo gris superior prometa una salida inexistente.

### 2. Norte Centro — 43,021 %

**Composición.** La **UNED Sevilla** domina el sector, acompañada por una vivienda norteña, plaza frontal, setos y alumbrado. En el borde sur comienza visualmente el recinto de **Galería Jazmín**, que actúa como transición hacia el Centro Cívico.

**Vías transitables.** `jerusalen` cruza el sector de oeste a este; `jaffa` baja desde ella y `estambul` roza el límite inferior. `path-uned-west` conecta la zona norte con la plaza y la aproximación a la puerta de la UNED. El extremo del enlace noroeste entra en la franja occidental de la sección.

**Cierres visibles.** No hay una barrera narrativa propia. La huella de la UNED, los setos, farolas, árboles y el bosque superior son colliders explícitos.

**Valoración crítica.** Es el sector norte con menor porcentaje, debido al gran volumen institucional y a la franja de césped no declarada como circulación. Aun así, la fachada no queda aislada: su plaza y camino de acceso son verdes y el validador confirma una aproximación de puerta válida.

### 3. Nordeste — 53,931 %

**Composición.** Contiene el parque norte con bancos y árboles caducifolios, el huerto comunitario, la primera gran hilera de casas orientales y el bosque perimetral. La mezcla de parque abierto y bloque residencial evita una esquina vacía.

**Vías transitables.** `jerusalen`, el arranque de `miletos` y `ninive` articulan las calles. `path-north-park` y `path-north-park-branch` atraviesan el suelo marrón del parque, que sí está marcado como transitable.

**Cierres visibles.** `blocker-east-jerusalen` cierra la salida oriental. `blocker-north-farm` marca el límite del huerto. El rectángulo `north-farm-soil` es la única superficie de tierra declarada expresamente no transitable.

**Valoración crítica.** Es el caso visual más propenso a confusión: parque y huerto comparten una paleta marrón, pero solo el parque y sus caminos están verdes. La barrera de espinas del huerto es imprescindible y está correctamente asociada a una colisión sólida; sin ella, el jugador interpretaría ese suelo como camino.

### 4. Oeste — 41,362 %

**Composición.** Predominan las hileras residenciales tan, repetidas únicamente donde el patrón urbano es equivalente. Setos florales, farolas y árboles separan las fachadas de la calzada y dan ritmo a los bloques.

**Vías transitables.** La avenida `ada` distribuye el tráfico vertical; `memphis`, `persepolis` y `siracusa` forman los ejes horizontales. `estambul` afecta a la franja norte y `access-house-estambul` conecta una puerta con la calle.

**Cierres visibles.** No hay barreras narrativas dentro del sector. Las fachadas, setos, árboles y bases de farola recortan en rojo los bordes de las parcelas.

**Valoración crítica.** La cifra baja no implica calles estrechas: refleja la ocupación repetida por edificios y jardines. Los centros de las calles conservan corredores verdes continuos. La simplificación de viviendas funciona porque los módulos son muy parecidos y se alternan en dos hileras, sin reutilizar ese formato para los hitos singulares.

### 5. Centro Cívico — 73,362 %

**Composición.** Incluye la **Galería Jazmín**, varias hileras occidentales, la gran plaza cívica, el campo de fútbol y, en el borde sur, la transición visual al **Campus Cívico**. Bancos, farolas y un árbol puntual ocupan los márgenes, no el centro de paso.

**Vías transitables.** `jaffa` es el eje vertical. `memphis`, `persepolis` y `siracusa` conectan el barrio occidental con la plaza; la diagonal `tesalonica` solo roza la transición sudoriental. Son transitables `gallery-courtyard`, `football-pitch`, `field-south-plaza`, `central-civic-plaza`, `access-gallery` y `access-house-persepolis`.

**Cierres visibles.** El campo tiene cinco segmentos de valla: norte, oeste, este y dos tramos inferiores. Entre los dos tramos inferiores queda la puerta de **x=1660 a x=1715**. Edificios, setos y bancos conservan sus colliders rojos.

**Valoración crítica.** Es el sector más abierto y legible. El campo puede recorrerse, pero no atravesarse ignorando la valla; el acceso inferior mantiene una entrada inequívoca. La plaza amplia mejora la circulación alrededor de edificios grandes y evita embudos frente al Campus.

### 6. Barrio Este — 52,065 %

**Composición.** Combina hileras de casas tan, viviendas residenciales pequeñas y el comienzo del barrio tradicional de cubiertas rojas. El borde oriental mantiene bosque, árboles y setos, mientras el extremo del campo aparece en la transición occidental.

**Vías transitables.** `miletos`, `hebron` y `east-access` forman la retícula; `tesalonica` corta la esquina sur en diagonal. Los accesos `access-house-ninive`, `access-house-hebron` y `access-red-home` enlazan puertas con la red. El patio `red-quarter-courtyard` es tierra transitable.

**Cierres visibles.** No contiene una barrera narrativa propia. En el límite con el campo continúa su valla, y los colliders de viviendas, árboles, setos y mobiliario quedan marcados.

**Valoración crítica.** La transición entre arquitectura tan y roja se entiende bien y la diagonal rompe la rigidez de la cuadrícula. El porcentaje medio muestra que los patios transitables compensan una densidad edificada alta sin convertir los jardines y huecos del bosque en atajos.

### 7. Parque Sur — 34,396 %

**Composición.** Es el sector menos urbanizado: hileras residenciales en la parte alta, una gran pradera, árboles, bancos y el sistema de caminos del parque. La avenida occidental termina en una curva cerrada reconocible.

**Vías transitables.** `ada`, `residencial-sur-1`, `residencial-sur-2` y `southwest-extension` forman los ejes. `access-house-siracusa`, `south-park-main` y `south-park-loop` permiten cruzar el parque por tierra marrón claramente dibujada.

**Cierres visibles.** `blocker-southwest-road` clausura la prolongación diagonal en el borde inferior. `south-park-lawn` es césped no transitable: solo sus senderos son verdes. Árboles y bancos mantienen colliders individuales.

**Valoración crítica.** El **34,396 %**, mínimo del mapa, es coherente con un parque de recorrido dirigido, pero exige respetar la señal visual: caminos marrones transitables frente a césped no marcado. La salida suroeste dispone de una barrera visible, por lo que el jugador no choca contra un límite invisible al seguir la carretera.

### 8. Tesalónica — 64,294 %

**Composición.** Agrupa el **Campus Cívico**, su plaza, hileras residenciales occidentales, la casa del parque, el jardín de Tesalónica y el **Anexo Sur** junto al perímetro. Es el sector bisagra entre la trama residencial, el parque y los servicios modernos.

**Vías transitables.** `jaffa`, `residencial-sur-1`, `residencial-sur-2`, `tesalonica` y `southwest-extension` conectan los tres ámbitos. Los accesos `access-house-sidon`, `access-campus`, `access-park-house` y `access-route`, además de partes de `south-park-main` y `south-park-loop`, completan las conexiones peatonales. `tesalonica-garden` es tierra transitable.

**Cierres visibles.** No hay una barrera narrativa anclada dentro de este recorte. La parte occidental de `south-park-lawn` sigue siendo no transitable, y los colliders del Campus, anexo, casa, setos y arbolado definen los límites.

**Valoración crítica.** La diagonal funciona como columna vertebral y evita que el sur quede dividido en dos fondos de saco. El contraste entre la pradera restringida y la plaza pavimentada produce un porcentaje alto sin perder la sensación de parque. El Anexo queda muy próximo al borde inferior, por lo que la lectura de cierre depende también del bosque perimetral.

### 9. Distrito Moderno — 72,949 %

**Composición.** Contiene el **Banco San Pablo**, **Servicios del Sureste**, viviendas tradicionales rojas, cerezos, plazas claras y la parte oriental del jardín de Tesalónica. Los edificios modernos comparten lenguaje visual, pero banco y servicios conservan siluetas distintas.

**Vías transitables.** `tesalonica` llega en diagonal y `miletos` toca la franja superior. `access-red-home`, `access-route`, `access-bank` y `access-modern` conducen a puertas y plazas. `red-quarter-courtyard`, `bank-plaza`, `south-services-plaza` y la parte correspondiente de `tesalonica-garden` son transitables.

**Cierres visibles.** `blocker-south-complex` cierra la continuación inferior del complejo. El bosque y el borde sur completan el perímetro; edificios, cerezos, setos y bancos conservan colliders rojos.

**Valoración crítica.** Es el segundo sector más transitable. La amplitud de las plazas da espacio alrededor de edificios grandes y de sus accesos, mientras la barrera del complejo sur elimina la única prolongación que podría parecer una salida. La densidad de suelo claro es alta, pero las huellas rojas de los edificios impiden caminar por fachadas.

## Cinco bloqueos narrativos

Todos usan el asset visible `thornBarrier`, son sólidos, muestran el prompt exacto **«Examinar obstaculo»** y responden con **«Parece que necesito algo para avanzar»**.

| ID | Etiqueta | Ancla lógica | Función |
|---|---|---:|---|
| `blocker-north-exit` | Salida norte | (208, 158) | Cierra la continuación de la entrada norte |
| `blocker-east-jerusalen` | Salida este | (2410, 505) | Cierra Jerusalén en vertical junto al borde este |
| `blocker-southwest-road` | Prolongación suroeste | (690, 2465) | Cierra la carretera diagonal suroeste |
| `blocker-south-complex` | Acceso al complejo sur | (2050, 2460) | Cierra la prolongación inferior de servicios |
| `blocker-north-farm` | Huerto comunitario | (2320, 430) | Señala que el suelo marrón del huerto no es camino |

## Verificación registrada

- `node --check map-layout.js`, `node --check map-data.js` y `node --check script.js`: finalizan con código 0.
- `python -m py_compile tools/compile-san-pablo-map.py`: finaliza con código 0.
- `node --test tests/map-editor-layout.test.mjs tests/map-registry.test.mjs`: valida el catálogo, las colocaciones, las puertas y el registro jugable vigentes.
- El informe del compilador registra **0 fallos** en 10 sondas de bloqueo y **0 fallos** de aproximación en 16 puertas.
- Las 16 puertas tienen al menos una baldosa adyacente alcanzable. Ocho centros de puerta quedan bajo geometría sólida y ocho están abiertos en la máscara; esa división no es un fallo, porque la prueba de acceso se hace desde la baldosa adyacente.
- La máscara compacta existe con **314 columnas × 314 filas** y celda de 8 px.

La principal limitación de esta auditoría es que el porcentaje mide geometría, no la sensación del control al desplazarse. La prueba decisiva adicional es un recorrido manual en navegador por los cuatro extremos, la puerta del campo y las 16 aproximaciones de edificio.

## Artefactos generados

- [Base HD de terreno](assets/maps/san-pablo-rebuilt-base-hd.webp)
- [Vista final con assets](assets/maps/san-pablo-rebuilt-preview.webp)
- [Overlay de transitabilidad](assets/maps/san-pablo-rebuilt-walkability-v2.png)
- [Máscara de navegación del runtime](assets/maps/san-pablo-rebuilt-navigation-v2.png)
- [Hoja comparativa por sectores](assets/maps/san-pablo-rebuilt-sectors-v2.png)
- [Directorio de chunks 2×](assets/maps/san-pablo-rebuilt-chunks-2x)
- [Assets nuevos de la reconstrucción](assets/generated/san-pablo-rebuilt/runtime)
- [Assets AI reutilizados](assets/generated/san-pablo-derived/runtime)
- [Reporte JSON reproducible](assets/maps/san-pablo-rebuilt-report-v2.json)
