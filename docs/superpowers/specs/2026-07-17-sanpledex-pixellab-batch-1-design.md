# Diseño: animaciones PixelLab de la Sanpledex — lote 1

## Objetivo

Convertir las primeras diez criaturas de la Sanpledex en personajes pixel-art animados sin perder su diseño original. Cada criatura recibirá cuatro secuencias propias —espera frontal, espera trasera, ataque frontal y ataque trasero— que sustituirán los sprites de presentación en la Sanpledex y se reproducirán durante los combates.

Este documento es el primero de cuatro subproyectos consecutivos. Cada subproyecto cubre diez criaturas y debe quedar generado, integrado, probado y aprobado antes de comenzar el siguiente.

## Alcance del primer lote

El orden se toma directamente de `SANPLEDEX_IDS`:

1. Braspín (`4`)
2. Ascuero (`5`, linaje de la Brasa)
3. Volcazote (`6`)
4. Petrillo (`9001`)
5. Musgólem (`9002`)
6. Terravórdeo (`9003`)
7. Peyote (`9101`)
8. Prensalito (`9102`)
9. Criascama (`9201`)
10. Aliscama (`9202`)

Quedan fuera de este subproyecto Dracoscama y las treinta criaturas siguientes. Peyote conserva su personaje maestro PixelLab ya aprobado, con ID `9ce255c4-2070-40a5-bf55-533204b7d300`; sus animaciones pendientes se completan dentro de este lote.

## Principios visuales

- Los PNG frontal y trasero existentes son la autoridad sobre identidad, silueta, anatomía, paleta y accesorios.
- PixelLab no puede añadir miembros, alas, caras traseras, armas, ropa, proyectiles ni decoraciones ausentes en el diseño fuente.
- La animación puede exagerar pose, peso, expresión y ritmo, pero debe regresar a la silueta original.
- La vista frontal de combate corresponde a `south`; la trasera corresponde a `north`.
- Cada llamada direccional utiliza el PNG real de esa vista como `custom_start_frame_base64`, no una rotación inventada.
- La escala y el anclaje de los pies se mantienen estables entre espera y ataque.
- El fondo debe ser completamente transparente y el pixel art debe conservar bordes nítidos.

## Arquitectura

### Manifiesto declarativo

Un manifiesto independiente del motor contendrá, por criatura:

- ID, nombre y lote;
- rutas fuente frontal y trasera;
- ID del personaje PixelLab;
- descripción de identidad;
- descripción de espera;
- descripción de ataque;
- duración, fotograma de impacto y rutas de los cuatro activos finales;
- IDs y estados de los trabajos PixelLab;
- estado de validación e integración.

El juego leerá una proyección compacta de este manifiesto para decidir qué recurso mostrar. La generación y la integración no dependerán de editar manualmente cuatro tablas distintas en `script.js`.

### Pipeline de activos

Para cada criatura se ejecuta este flujo:

1. preparar copias frontal y trasera transparentes, contenidas en un lienzo cuadrado de hasta 256 px sin deformar el original;
2. crear el personaje maestro con `create_character(mode="v3", reference_image_base64=...)` a partir de la vista frontal;
3. comprobar que la vista `south` conserva identidad, paleta, extremidades y proporciones;
4. generar cuatro animaciones v3 independientes de doce fotogramas, usando exactamente una dirección y su PNG real como fotograma inicial;
5. descargar y conservar todos los fotogramas fuente;
6. normalizar cada secuencia a un lienzo transparente de 384 × 384 px con ancla inferior compartida;
7. exportar espera como WebP en bucle y ataque como WebP de una sola reproducción;
8. validar los cuatro activos;
9. activar simultáneamente los cuatro recursos en Sanpledex y combate.

Las operaciones son reanudables. El manifiesto impide volver a enviar un trabajo completado y permite continuar después de una interrupción.

## Dirección creativa del lote

### Braspín

- Espera: respiración vivaz de erizo joven; las púas de fuego ondulan en pequeñas oleadas y las patas realizan un rebote contenido.
- Ataque «Ariete brote»: baja el hocico, comprime las patas y ejecuta un cabezazo corto; las púas se peinan hacia atrás durante la aceleración y se abren al marcar el impacto.
- Invariantes: cuatro patas cortas, cuerpo de erizo, cara amable marrón y abanico de púas ígneas; las llamas forman parte del cuerpo y no se convierten en proyectiles.

### Ascuero

- Espera: postura baja y defensiva; el pecho respira bajo la coraza y el fuego dorsal pulsa lentamente entre las placas.
- Ataque: acumula fuerza en las patas traseras y embiste con hombro, frente y coraza como una bestia pesada.
- Invariantes: cuadrúpedo robusto, placas de roca marrón, garras grandes y fuego limitado a la cresta dorsal.

### Volcazote

- Espera: respiración volcánica profunda; el torso desciende, las grietas incandescentes laten y la corona de llamas se eleva con el calor.
- Ataque: clava las garras, recoge el cuerpo y libera una carga sísmica de muy corto recorrido culminada con un golpe de las patas delanteras.
- Invariantes: mole cuadrúpeda, caparazón de grandes rocas oscuras, grietas internas de magma, cuatro extremidades y fuego dorsal continuo.

### Petrillo

- Espera: balanceo curioso de su cuerpo redondo; el brote de dos hojas acompasa el movimiento y las cuatro patas de piedra reajustan el apoyo.
- Ataque «Ariete brote»: retrae ligeramente la cara negra dentro del aro pétreo y rueda medio impulso hacia delante para golpear con la corona de roca, recuperando después su apoyo.
- Invariantes: esfera oscura con dos ojos amarillos, boca pequeña, aro de rocas con musgo, brote de dos hojas y cuatro patas pétreas.

### Musgólem

- Espera: respiración de guardián; alterna el peso entre sus grandes brazos, las enredaderas se tensan y las flores oscilan con suavidad.
- Ataque «Martillo musgoso»: eleva ambos puños, carga el torso y descarga un martillazo doble frontal, sin desprender cristales ni rocas.
- Invariantes: dos brazos enormes, dos piernas, cara oscura, ojos amarillos, gema verde central, cristales laterales, musgo, enredaderas y pequeñas flores.

### Terravórdeo

- Espera: inmovilidad monumental con respiración lenta; hombros y enredaderas ascienden, mientras hojas y flores reaccionan con retraso por su enorme masa.
- Ataque «Puño sísmico»: atrasa un puño gigante, rota el torso y lanza un único golpe frontal pesado; el otro brazo permanece como contrapeso.
- Invariantes: gigante bípedo de roca y vegetación, dos brazos y dos piernas, gemas verdes de frente y brazos, rostro oscuro, cristales laterales y copa floral.

### Peyote

- Espera: baile feliz en el sitio, conservando el cuerpo cuadrado de adobe y el apoyo de sus cuatro patas.
- Ataque «Carga de adobe»: expresión frontal agresiva, preparación breve, carga recta de cuerpo completo, impacto contundente y regreso.
- Invariantes: se mantienen todas las condiciones del diseño aprobado en `2026-07-17-peyote-pixellab-combat-animations-design.md`; la espalda usa obligatoriamente `peyote-back.png`.

### Prensalito

- Espera: balanceo mínimo de fortaleza viviente; los grandes antebrazos soportan el peso y el cuerpo de mampostería sube y baja de forma apenas perceptible.
- Ataque «Prensa fortaleza»: abre el apoyo, eleva ligeramente el bloque central y cae hacia delante con ambos antebrazos en una compresión pesada.
- Invariantes: cuerpo cúbico de ladrillo y piedra, dos antebrazos columnares, ojos blancos, mandíbula de bloques, placa frontal romboidal con hoja y gemas doradas.

### Criascama

- Espera: energía de cría dragón; rebote sentado, aleteo corto de sus dos alas pequeñas y movimiento elástico de la cola.
- Ataque «Garra de cría»: pequeño salto hacia delante, apertura de alas para equilibrarse y zarpazo único antes de aterrizar.
- Invariantes: dragón verde juvenil, dos alas pequeñas, cuatro patas, vientre crema, cuernos y espinas doradas, cola curvada; no adquiere anatomía insectoide adulta.

### Aliscama

- Espera: suspensión ligera con batido alternado de sus cuatro alas; antenas, cola y sus cuatro extremidades compensan el vuelo sin cambiar de sitio.
- Ataque «Tajo de cuatro alas»: repliega las cuatro alas, acelera en diagonal corta y cruza ambas garras delanteras en un tajo antes de frenar con las alas abiertas.
- Invariantes: dragón insectoide verde y dorado, cuatro alas grandes translúcidas, dos antenas, dos brazos, dos piernas, cola segmentada y garras doradas.

## Formato de las animaciones

- Doce fotogramas por secuencia.
- Lienzo final RGBA de 384 × 384 px.
- Espera: bucle continuo de aproximadamente 0,9–1,2 segundos.
- Ataque: una reproducción de aproximadamente 0,75–1,1 segundos.
- El manifiesto define el instante de impacto entre el 55 % y el 72 % de cada ataque según su peso y alcance.
- Objetivo de peso: menos de 1,2 MB por WebP y menos de 4,8 MB por criatura.
- Se conservan los PNG de fotogramas para reexportar sin consumir nuevas generaciones.

## Integración en la Sanpledex

La ficha mostrará la espera animada frontal y trasera en lugar de los sprites estáticos. El botón de ataque reproducirá simultáneamente la secuencia frontal y trasera correspondiente, respetando duración e instante de impacto del manifiesto. Al finalizar restaurará la espera sin parpadeo.

Las miniaturas de lista y cadena evolutiva seguirán siendo estáticas para evitar cuarenta animaciones simultáneas y conservar legibilidad.

## Integración en combate

Cada combatiente tendrá estados visuales `idle` y `attack` por vista. Al ejecutar un movimiento:

1. se cambia de la espera al WebP de ataque de la vista activa;
2. se suspende la traslación CSS genérica para no duplicar el movimiento corporal;
3. los efectos existentes del movimiento siguen viajando hacia el defensor;
4. daño, partículas y sacudida se sincronizan con `impactMs`;
5. en una cláusula de limpieza se restaura siempre la espera.

Si una criatura no tiene el paquete completo validado, conserva todo el comportamiento estático actual. Con `prefers-reduced-motion`, el juego utiliza los PNG originales y el ataque genérico sin WebP animado.

## Archivos

Cada línea conservará sus fuentes y resultados bajo su carpeta actual:

```text
assets/pokemon/<linea>/pixellab-hq/<criatura>/
  master/front.png
  master/back.png
  frames/idle/front/
  frames/idle/back/
  frames/attack/front/
  frames/attack/back/
  pixellab-jobs.json
```

Los recursos de ejecución quedarán junto a los sprites existentes:

```text
<nombre>-idle-front-pixellab.webp
<nombre>-idle-back-pixellab.webp
<nombre>-attack-front-pixellab.webp
<nombre>-attack-back-pixellab.webp
```

Los PNG actuales no se sobrescriben: son fuentes de identidad, miniaturas y fallbacks.

## Errores y control de coste

- No se usa modo `pro`; todas las creaciones y animaciones serán v3.
- Un fallo técnico puede reenviarse una vez.
- Una deriva visual puede corregirse una vez con una descripción más restrictiva.
- Tras dos resultados inválidos, la criatura queda en fallback estático y el lote continúa.
- Nunca se activa una criatura con solo parte de sus cuatro animaciones.
- Los IDs, estados, URLs y errores se registran de inmediato en su archivo de trabajos.
- No se elimina ningún resultado PixelLab ni activo existente durante este subproyecto.

## Pruebas y validación

Las pruebas automatizadas comprobarán:

- cobertura exacta de las diez criaturas del lote en el manifiesto;
- existencia de cuatro activos por criatura validada;
- WebP animado con alfa, 384 × 384 px y doce fotogramas;
- espera en bucle y ataque de una sola reproducción;
- duración y peso dentro de límites;
- ausencia de integración parcial;
- selección correcta por ID, estado y vista;
- restauración de espera incluso ante error;
- fallback estático y movimiento reducido;
- sincronía de `impactMs` con efectos y daño;
- uso compartido de los mismos activos en Sanpledex y combate.

La validación visual en navegador cubrirá las veinte vistas de espera y los veinte ataques. Se comprobarán reconocimiento inmediato, anatomía, paleta, transparencia, estabilidad del ancla, continuidad del bucle, claridad del impacto y retorno limpio.

## Criterios de aceptación

El lote se considera terminado cuando:

1. las diez criaturas se reconocen inequívocamente como sus diseños fuente;
2. cada una posee cuatro animaciones distintas y coherentes con su anatomía;
3. la Sanpledex usa las esperas y previsualiza ambos ataques;
4. el combate usa espera y ataque con impacto sincronizado;
5. no hay fondos opacos, halos, miembros extra ni cambios de paleta graves;
6. los fallbacks, el movimiento reducido y todas las pruebas funcionan;
7. el lote se entrega para aprobación antes de iniciar las criaturas 11–20.
