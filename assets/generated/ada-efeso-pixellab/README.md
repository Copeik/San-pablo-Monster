# Recursos PixelLab — Distrito Ada-Efeso

Paquete de arte específico para `maps/ada-efeso`.

| Recurso | Trabajo PixelLab | Uso |
| --- | --- | --- |
| Bloque residencial blanco/amarillo | `fefe1d2c-e71b-4600-af96-d9bb92a2113f` | Módulos norte y sur de las tres calles de plazoletas; sus entradas miran siempre hacia la zona peatonal |
| Edificio universitario blanco | `46e625ea-0590-4612-890e-49d5bcd6c07e` | Dos facultades dentro del Campus Efeso |
| Parque infantil | `fe9df507-f0de-4b48-9e92-37f1de7de4e3` | Zona de juegos entre los aparcamientos del extremo sur |
| Terreno urbano de 16 teselas | `0bfd2ba8-ecd1-40d4-82ce-931b808db19f` | Césped, asfalto, aceras, adoquines, carriles, pasos de peatones, aparcamientos y medianas |
| Colección de 16 objetos transparentes | `975dc6a3-7bc4-4fb9-8f1d-982a6bc5f8e2` | Coches, árboles, bancos, farolas, vallas, jardineras, bolardos, flores, papelera, señal y fuente |
| Trasera residencial sin puertas | `0450063c-d397-4712-9b4f-8b2b4266940a` | Variante de la hilera sur: acceso exclusivo por el lado norte de la plazoleta y fachada de aparcamiento sin entradas |
| Terreno urbano continuo sin marcos | `c887083b-e2f9-4185-bf0a-2e16cba95de3` | Sustituye el primer terreno: modo de segmentación, bordes continuos y ninguna cuadrícula negra |
| Vallas cenitales horizontal y vertical | `89f363f8-0d3f-4f49-9a4c-b68154d46f12` | Valla blanca vista desde arriba con carril superior y orientación propia para cada lado del campus |

Todos los recursos fueron solicitados mediante el MCP oficial de PixelLab; no se
ha usado ningún generador alternativo. `maps/ada-efeso/base-pixellab-borderless.png` se
ensambla mecánicamente con `tools/build-ada-efeso-pixellab-map.py`: cada celda
de 32×32 es una copia exacta de una tesela PixelLab, sin dibujo, texto ni
recoloración añadidos.

Los edificios, coches y demás objetos elevados no se hornean en esa imagen de
suelo. Se cargan como PNG RGBA independientes desde `map.js`, de modo que
conservan transparencia, orden de profundidad y colisiones propias.
