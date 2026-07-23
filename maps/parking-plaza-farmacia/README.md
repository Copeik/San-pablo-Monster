# Parking de la Plaza de la Farmacia

Mapa subterráneo independiente de 40×32 casillas. Se entra por la rampa de dos
carriles conectada a la carretera y se sale por el mismo punto. Los tabiques de
hormigón forman un recorrido laberíntico, pero mantienen corredores conectados
alrededor del pozo de luz central.

PixelLab generó la rampa ancha, el hueco circular y los grupos de pilares,
carros, cajas, conos y telarañas. El suelo, las plazas de aparcamiento y los
tabiques se componen en `base.svg`; las colisiones de esos tabiques están
declaradas con la misma geometría en `map.js`.
