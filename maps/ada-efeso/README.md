# Distrito Ada-Efeso

Mapa exterior independiente de 72x96 casillas (2304x3072 px), construido a
partir del croquis aportado por el usuario.

La composición conserva los elementos estructurales del plano:

- Avenida Ada en el lateral oeste, con cuatro carriles: dos por sentido.
- Tres calles peatonales residenciales, cada una formada por tres plazoletas
  cuadradas y flanqueada por bloques blancos de cuatro plantas con acentos
  amarillos. Las puertas de ambas hileras miran hacia las plazoletas; ninguna
  entrada residencial da a los aparcamientos.
- Aparcamientos con mediana alternados entre las tres calles residenciales.
- Paseo Efeso como eje peatonal norte-sur que une las tres calles.
- Campus al este con dos edificios universitarios blancos y valla blanca.
- Parque infantil y dos aparcamientos en el extremo sur.

## Arte PixelLab

Todo el arte visible procede de recursos generados expresamente mediante el MCP
oficial de PixelLab. La base `base-pixellab-borderless.png` se ensambla exclusivamente con
las 16 teselas PixelLab continuas del paquete urbano, generadas sin marcos negros;
no contiene edificios, coches ni
objetos decorativos. El verificador `tools/build-ada-efeso-pixellab-map.py
--check` confirma que cada bloque de 32×32 píxeles es una copia exacta de una
tesela original.

Los bloques residenciales, facultades, coches, árboles, bancos, farolas, vallas
y demás objetos se cargan por separado como PNG transparentes. Esto conserva el
orden de profundidad y las colisiones y evita que puedan quedar pintados en el
suelo.

La valla del campus usa dos recursos cenitales distintos: uno horizontal y otro
vertical. Ningún tramo lateral se obtiene girando un alzado frontal.

El mapa se abre con `?map=ada-efeso` y aparece como `Distrito Ada-Efeso` en el
selector del editor.

## Secuencia inicial

Al comenzar una partida en este mapa, el protagonista aparece inconsciente en
la Avenida Ada. El fundido pasa de negro a la imagen normal mientras se muestra
la animación PixelLab `fainted-lying` orientada al suroeste. A continuación se
reproduce `getting-up-from-fainted` y el protagonista termina de pie con su
postura jugable normal.

Tres NPC rodean al protagonista y representan el robo de la cartera, el móvil
y las llaves. Cuando termina de levantarse, saltan y huyen hacia izquierda,
derecha y sur. Sus destinos están centralizados como `provisionalHide` dentro de
`openingSequence.thieves` en `map.js`; se sustituirán por las posiciones finales
que indique el usuario sin modificar el motor de la cinemática.
