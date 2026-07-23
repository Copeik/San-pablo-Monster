# Pokémon no estándar

Hay 93 especies personalizadas registradas. Braspín, Ascuero y Volcazote (IDs 4, 5 y 6) ya cumplen `pokemon-animation-only-v1`; las otras 90 siguen pendientes.

Un pack Pokémon estándar contiene exactamente seis archivos WebP pixel-art animados de 384 × 384 y ocho frames lógicos: `idle-front.webp`, `idle-back.webp`, `attack-physical-front.webp`, `attack-physical-back.webp`, `attack-special-front.webp` y `attack-special-back.webp`. No contiene PNG estáticos, poses auxiliares, manifiestos, créditos ni otros documentos. Pokédex, combate, equipo y selector comparten esos mismos archivos a través del registro central.

Los pares PNG estáticos y las secuencias antiguas `melee`/`ranged` sólo forman parte del baseline heredado; no cuentan como slots conformes.

La lista por especie y por slot está en `../nonstandard-assets-v0.json`.
