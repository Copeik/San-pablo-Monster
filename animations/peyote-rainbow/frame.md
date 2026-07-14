---
colors:
  sky_deep: "#203b50"
  sky_mid: "#5e8e98"
  sun: "#ffd89b"
  cloud_light: "#f6e9cf"
  cloud_shadow: "#879d9b"
  earth: "#8e5c37"
  stone_dark: "#3a2417"
  rainbow: ["#cc695b", "#df914a", "#dec05a", "#78a071", "#529493", "#5a76a2", "#886d97"]
typography:
  display_family: "none"
spacing:
  safe_margin: 60
components:
  shadow_style: "soft contact shadow plus warm rim light"
---

# Peyote Rainbow 3D Frame

## Intent

Una escena breve después de la lluvia. Peyote descubre un arcoíris, inclina su cuerpo volumétrico hacia el cielo y sostiene una sonrisa tranquila. Debe sentirse como una ilustración del mismo bestiario convertida en un pequeño diorama 3D.

## Character contract

- Modelo WebGL procedural con cuerpo redondeado, ladrillos en relieve, cuatro patas, remates superiores, ojos brillantes, sonrisa, medallón frontal y placa posterior.
- La vista frontal canónica `assets/peyote.png` y la vista trasera `assets/peyote-back-reference.png` son referencias de forma, color y detalle; no se usan como simples cartones planos.
- La silueta sigue siendo cúbica, pesada y adorable. Nada de anatomía humana, extremidades añadidas o rediseño.

## Environment

- Cielo azul petróleo aclarado por luz dorada tras la lluvia.
- Arcoíris SVG de siete bandas apagadas, revelado mediante trazo.
- Nubes pictóricas en tres profundidades, gotas residuales, colina terrosa y motas cálidas.
- Sin texto, interfaz, marcas, música ni recursos de pago.

## Motion

Tres segundos a 30 fps. Las nubes se abren, el arcoíris aparece, el torso 3D pivota desde la base de las patas, los reflejos de los ojos suben hacia el arco y Peyote realiza un pequeño rebote feliz antes del plano final.

## Quality constraints

El personaje debe tocar el suelo, conservar cuatro patas coherentes y mostrar profundidad real en bordes, ladrillos y cara. El arcoíris nunca debe tapar el rostro. Los frames 0, 18, 36, 54, 68 y 89 deben ser visualmente distintos y legibles.
