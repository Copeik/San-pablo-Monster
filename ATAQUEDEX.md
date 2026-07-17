# Ataquedex y editor de efectos

La Ataquedex reúne todos los movimientos definidos en `MOVES` y permite personalizar su presentación sin cambiar potencia, precisión ni balance de combate.

## Uso

- Abre la Ataquedex con el botón **A** de la barra superior o la tecla **K**.
- Busca por nombre o filtra por tipo.
- Selecciona un movimiento y edita efecto, impacto pixel art, color, ancho, alto, desplazamiento X/Y, duración, partículas, ondas, temblor y escala del golpe.
- La vista previa se actualiza mientras editas. **Guardar ataque** aplica el perfil tanto al equipo como a los rivales que usen ese movimiento.
- **Restaurar** elimina solo la personalización del movimiento seleccionado y recupera el efecto automático de su tipo.

Los perfiles se guardan fuera de la partida, en `localStorage` bajo la clave `pokemon-city-attack-effects-v1`. Reiniciar una aventura no borra el laboratorio de efectos.

## Importar y exportar

**Exportar JSON** descarga un paquete portable. **Importar JSON** combina las entradas válidas del archivo con las personalizaciones locales. Los movimientos desconocidos se ignoran y todos los valores numéricos se limitan a rangos seguros.

Formato mínimo:

```json
{
  "schemaVersion": 1,
  "kind": "pokemon-city-attack-effects",
  "effects": {
    "ember": {
      "enabled": true,
      "preset": "fire",
      "impact": "fire",
      "color": "#ff6b2c",
      "width": 30,
      "height": 30,
      "offsetX": 0,
      "offsetY": 0,
      "duration": 470,
      "particles": 9,
      "rings": 0,
      "shake": 0.65,
      "impactScale": 3.45,
      "trail": true
    }
  }
}
```

## Opciones de mejora exploradas

Las siguientes ampliaciones encajan con el modelo actual, en este orden recomendado:

1. Editor por capas y línea de tiempo: varios proyectiles, impactos y retrasos dentro del mismo movimiento.
2. Biblioteca de audio: seleccionar sonido, tono, volumen y sincronización con el golpe.
3. Estados de combate: vincular capas visuales con quemadura, veneno, drenaje, curación o cambios de estadísticas.
4. Presets compartidos: guardar un perfil con nombre y aplicarlo a varios movimientos sin duplicar valores.
5. Importación de spritesheets: declarar imagen, tamaño de fotograma, fotogramas y velocidad desde la propia Ataquedex.
6. Historial y comparación: deshacer/rehacer, duplicar perfiles y vista previa lado a lado.

La siguiente mejora de mayor valor sería la línea de tiempo por capas: el render actual ya centraliza la configuración usada por vista previa y combate, por lo que puede crecer sin crear un segundo sistema de animación.
