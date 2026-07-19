# Plaza de la Farmacia

Mapa exterior independiente de 40×30 casillas (1280×960 px), inspirado en el
entorno de Calle Jerusalén 35 de San Pablo C. La composición está pensada como
una entrada desde la carretera:

1. calzada y paso de peatones en el borde inferior;
2. plaza pavimentada con árboles, bancos y terrazas en el centro;
3. bares, farmacia, banco y tienda cerrando el fondo superior;
4. bloques residenciales como segunda línea urbana.

La distribución es una síntesis jugable basada en fotografías y cartografía;
no afirma el orden exacto de cada negocio real.

## Conexión

- `plaza-farmacia-access`, en San Pablo, es un evento de interacción que carga
  este paquete y coloca al jugador abajo mirando hacia la plaza.
- `plaza-farmacia-return-san-pablo`, al pisar el umbral inferior, devuelve al
  jugador a Calle Jerusalén.

Los dos sentidos usan transición con fundido y guardan el mapa y la posición.
El mapa aparece como `Plaza de la Farmacia` en el selector del editor; objetos,
NPC, entradas y eventos se guardan en `editor-data.js` sin mezclarse con San
Pablo.

