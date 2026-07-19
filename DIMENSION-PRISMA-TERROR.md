# Dimensión Prisma: 50 mejoras de terror y experiencia

Contrato de implementación de la experiencia. La numeración es deliberadamente cerrada: son exactamente 50 mejoras verificables.

## Atmósfera visual

1. Paleta del laberinto oscurecida hacia negros violáceos con menos saturación segura.
2. Niebla de distancia que borra referencias al fondo de los pasillos.
3. Rejilla del suelo deformada por la perspectiva para reforzar la profundidad.
4. Facetas verticales irregulares en las paredes Prisma.
5. Arañazos procedurales que cambian según la celda observada.
6. Grietas luminosas en el techo que parecen extenderse sobre el jugador.
7. Motas de polvo flotantes con deriva independiente.
8. Bandas de bruma baja que cruzan el suelo a distinta velocidad.
9. Halo cromático cian/rojo en los bordes cuando sube el peligro.
10. Capa de scanlines integrada en la vista Prisma.
11. Grano animado que se intensifica con la tensión.
12. Viñeta dinámica que reduce la visión periférica cerca de la Sombra.
13. Pulso rojo de persecución sincronizado con el estado de peligro.
14. Balanceo de cámara semejante a una respiración contenida.
15. Cabeceo de cámara distinto al andar y al correr.
16. Temblor orgánico del cono de la linterna.
17. Fallos y parpadeos breves de luz, más probables bajo presión.
18. Apariciones periféricas que desaparecen cuando el jugador se mueve.
19. Siluetas 3D propias para cada salida falsa, visibles con oclusión correcta.
20. Iluminación roja inequívoca para el Mercado Negro y su zona segura.

## Interfaz y accesibilidad

21. HUD Prisma rediseñado como un dispositivo dañado y no como un panel de ciudad.
22. Medidor de tensión continuo con estados estable, media, alta y crítica.
23. Indicador de ruido con umbrales cromáticos más legibles.
24. Cuatro niveles de alteración que resumen la intensidad del laberinto.
25. Pulso de proximidad que busca el umbral más cercano sin dibujar un GPS.
26. Ayuda de controles progresiva que se retira tras aprender a moverse.
27. Botón táctil específico para la luz Prisma en pantallas pequeñas.
28. Avisos ARIA para persecución, peligro crítico y la orden de no moverse.
29. Alternativa de movimiento reducido sin grano, sacudidas ni apariciones animadas.
30. HUD compacto y controles reajustados para móvil sin tapar la acción.

## Sonido, presión y comportamiento

31. Pasos sintetizados diferentes al caminar y correr.
32. Pasos alternados en estéreo para dar peso a la marcha.
33. Latido doble cuya cadencia responde a la proximidad y a la tensión.
34. Susurros ambientales espaciados que advierten sin explicar el mapa.
35. Gruñidos posicionales que cruzan de un canal al otro.
36. Volumen de persecución escalado por el tiempo pasado dentro.
37. Vibración breve en peligro crítico, luz defensiva y linterna vacía.
38. Presión temporal: cuanto más dura la incursión, mayor es la tensión base.
39. Velocidad de la Sombra escalada gradualmente, sin salto brusco de dificultad.
40. La Sombra titubea cuando el jugador la mantiene en el centro de la vista.
41. Gracia temporal tras reaparecer para impedir capturas encadenadas injustas.
42. El refugio del Mercado anula persecución, tensión y apariciones.
43. El checkpoint conserva al menos una carga sin regalar una recarga completa.
44. El evento de silencio comunica si la Sombra pasa de largo o ha oído al jugador.
45. La linterna vacía ofrece sonido, vibración y mensaje propios en lugar de fallar en silencio.

## Salidas y rejugabilidad

46. Tres salidas adicionales se colocan proceduralmente en ramales separados y alcanzables.
47. Salida de Poción Caducada: entrega un objeto pocho que solo cura 1 PS y expulsa del laberinto.
48. Salida de Baya Mohosa: entrega un objeto pocho que solo cura 2 PS y expulsa del laberinto.
49. Salida del guardián débil: inicia un combate de nivel bajo y expulsa al ganar, capturar, huir o perder.
50. Registro persistente de los cuatro desenlaces: Pokémon raro, Poción Caducada, Baya Mohosa y guardián débil.

