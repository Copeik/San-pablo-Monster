Mapa de San Pablo · microteselas nativas 2x

Distribución: 5 columnas × 5 filas (25 bloques).
Área lógica habitual: 512 × 512 px; los bloques finales miden 460 px.
Resolución habitual: 1024 × 1024 px, dos texeles por píxel lógico.
Fuente: assets/maps/san-pablo-reference-hd.webp (5016 × 5016).
Formato: WebP calidad 100, sin ampliación ni cambio de geometría.
Solape: 2 px lógicos alrededor de cada bloque para evitar costuras al filtrar.

El juego decide qué bloques conservar mediante la intersección con la cámara.
La miniatura global no se utiliza como fondo del mundo jugable.

Regeneración:
python tools/generate-map-chunks.py
