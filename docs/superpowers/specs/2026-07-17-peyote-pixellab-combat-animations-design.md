# Diseño: animaciones de combate de Peyote con PixelLab MCP

## Objetivo

Crear una versión de Peyote en pixel art de mayor resolución y cuatro animaciones de combate dirigidas por el usuario:

- espera frontal: Peyote baila feliz;
- espera trasera: el mismo baile visto desde atrás;
- ataque frontal: Peyote adopta una expresión agresiva, carga hacia delante, marca un golpe contundente y vuelve a su posición;
- ataque trasero: la misma carga vista desde atrás.

La generación se realizará mediante el MCP de PixelLab. No se añadirán movimientos, objetos, proyectiles ni efectos ambientales no solicitados.

## Alcance

El trabajo incluye:

1. crear un nuevo personaje maestro en PixelLab a partir de `peyote-front.png`;
2. usar `peyote-back.png` como referencia obligatoria y pose inicial real de todas las animaciones traseras;
3. validar las referencias frontal y trasera antes de animar;
4. generar las cuatro animaciones indicadas;
5. descargar y conservar los fotogramas PNG con transparencia;
6. producir WebP animados optimizados para el navegador;
7. integrar el estado de espera y el estado de ataque en los combates;
8. mantener fallbacks estáticos y soporte para movimiento reducido;
9. actualizar créditos y pruebas automatizadas.

Quedan fuera de alcance las animaciones de las otras seis direcciones, efectos de impacto sobre el rival, nuevos movimientos de combate y cambios a Prensalito.

## Fuente y personaje maestro

Las fuentes de identidad serán `assets/pokemon/peyote-line/peyote-front.png` y `assets/pokemon/peyote-line/peyote-back.png`. Se preparará una copia transparente de 256 × 256 px de cada una. Los originales no se modificarán.

La copia se enviará a `create_character` con:

- `mode="v3"`;
- `size=256`;
- `reference_image_base64` con la copia preparada;
- una descripción limitada a preservar el cuerpo rectangular de adobe, las capas de piedra, las cuatro patas, la cara, la paleta marrón y el medallón de peyote.

PixelLab generará ocho direcciones para establecer el personaje y su esqueleto, pero la dirección `north` generada automáticamente no será la fuente visual de la espalda. Para este alcance se usará `south` como vista frontal de rival y se pasará la copia de `peyote-back.png` como `custom_start_frame` de cada llamada `north`. Así se conserva el panel trasero cuadrado con la hoja, la mampostería sin cara y la anatomía trasera suministrada por el usuario.

Antes de animar se comprobará que ambas vistas conservan:

- silueta rectangular y proporciones;
- cuatro patas y garras de piedra;
- estratos de adobe y roca;
- paleta cálida marrón;
  - ojos, boca y medallón circular en el frente;
  - ausencia de cara y panel cuadrado con hoja en la espalda;
- fondo transparente.

Si la identidad deriva de forma significativa, se detendrá el flujo y se consultará al usuario antes de repetir una generación.

## Animaciones PixelLab

Cada animación tendrá 12 fotogramas generados en modo v3. Las llamadas usarán `keep_first_frame=false` para obtener exactamente 12 fotogramas. Como PixelLab exige exactamente una dirección cuando se proporciona `custom_start_frame`, se harán cuatro llamadas separadas: idle `south` con `peyote-front.png`, idle `north` con `peyote-back.png`, ataque `south` con `peyote-front.png` y ataque `north` con `peyote-back.png`.

### Espera: baile feliz

La descripción enviada a PixelLab pedirá un baile feliz en el sitio, con expresión alegre, movimiento rítmico y retorno exacto a la pose inicial para formar un bucle continuo. No incluirá escenario, accesorios ni efectos.

La animación se reproducirá en bucle. Los 12 fotogramas se normalizarán a un lienzo transparente fijo de 384 × 384 px con los pies anclados en la misma línea.

### Ataque: carga agresiva

La descripción enviada a PixelLab pedirá esta secuencia:

1. pose inicial;
2. expresión agresiva en la vista frontal;
3. preparación breve;
4. carga recta hacia delante con todo el cuerpo;
5. pose clara de impacto contundente;
6. retroceso breve;
7. regreso a la pose inicial.

La vista trasera conservará la misma mecánica corporal, el panel cuadrado con la hoja y la mampostería real de `peyote-back.png`, sin inventar rasgos faciales visibles desde atrás. No se solicitarán proyectiles, rocas, polvo ni otros efectos.

La animación se reproducirá una sola vez por ataque. Sus fotogramas también se normalizarán a 384 × 384 px y compartirán ancla con la espera.

## Archivos generados

Los resultados de trabajo se conservarán aislados en:

```text
assets/pokemon/peyote-line/pixellab-hq/
  master/
    front.png
    back.png
  frames/
    idle/front/
    idle/back/
    attack/front/
    attack/back/
```

Los archivos finales serán:

```text
assets/pokemon/peyote-line/peyote-idle-front-pixellab.webp
assets/pokemon/peyote-line/peyote-idle-back-pixellab.webp
assets/pokemon/peyote-line/peyote-attack-front-pixellab.webp
assets/pokemon/peyote-line/peyote-attack-back-pixellab.webp
```

Los activos actuales no se sobrescribirán. Seguirán disponibles como fallback hasta que los nuevos hayan pasado la validación visual y automatizada.

## Integración en combate

La configuración de activos de Peyote distinguirá dos estados por vista:

- `idle.front` y `idle.back`;
- `attack.front` y `attack.back`.

Al entrar en combate se precargarán los cuatro WebP y se mostrará la animación `idle` correspondiente. Cuando Peyote ataque:

1. se cambiará temporalmente la fuente de la imagen al WebP `attack` de la vista activa;
2. se evitará aplicar simultáneamente la traslación genérica de ataque para no duplicar la carga;
3. se mantendrán los efectos de impacto existentes sobre el defensor;
4. al terminar la animación, incluso si ocurre un error, se restaurará el WebP `idle`.

Si un WebP de ataque no carga, el combate continuará con la animación genérica actual. Con `prefers-reduced-motion`, Peyote usará los PNG estáticos frontal y trasero existentes.

## Optimización

Los WebP finales usarán transparencia y un lienzo de 384 × 384 px:

- espera: bucle infinito, 12 fotogramas y aproximadamente 0,9–1,2 segundos por ciclo;
- ataque: una reproducción, 12 fotogramas y aproximadamente 0,7–1,0 segundos;
- objetivo de tamaño: menos de 1,2 MB por archivo y menos de 4,8 MB para los cuatro combinados.

Los fotogramas PNG originales se conservarán para permitir una futura reexportación sin volver a consumir generaciones.

## Control de errores y coste

Las operaciones de PixelLab son asíncronas. Cada trabajo se consultará por estado hasta `completed` o `failed`, con tiempo máximo explícito. No se enviará una segunda generación automáticamente después de un fallo visual o técnico.

El flujo se divide en dos puertas de coste:

1. generar y validar el personaje maestro;
2. solo después, generar las cuatro animaciones.

Si PixelLab solicita una confirmación de coste adicional o presenta un coste distinto al esperado, el trabajo se detendrá para pedir autorización al usuario.

## Pruebas y validación

Las pruebas automatizadas comprobarán:

- formato WebP animado con alfa;
- lienzo de 384 × 384 px;
- exactamente 12 fotogramas por archivo;
- bucle infinito solo en los WebP de espera;
- duración dentro de los intervalos definidos;
- límite individual de 1,2 MB y combinado de 4,8 MB;
- existencia de los cuatro activos y sus fallbacks;
- uso de la animación de ataque solo durante la acción;
- restauración de la espera tras el ataque;
- fallback genérico ante error de carga;
- fallback estático con movimiento reducido.

La validación visual en navegador cubrirá las vistas frontal y trasera como rival y compañero. Se verificará continuidad del baile, lectura clara de la expresión agresiva, sensación de impacto, retorno sin salto y ausencia de halos o fondos opacos.

## Criterios de aceptación

El trabajo se considera aceptado cuando:

1. Peyote se reconoce como el mismo diseño en ambas vistas;
2. el pixel art es nítido al tamaño de combate;
3. la espera muestra un baile feliz y continuo;
4. el ataque muestra expresión agresiva, carga frontal, impacto y retorno;
5. no aparecen efectos ni elementos no solicitados;
6. los cuatro WebP son transparentes, ligeros y reproducibles;
7. el combate cambia entre espera y ataque sin parpadeos ni saltos;
8. los fallbacks y todas las pruebas pasan.
