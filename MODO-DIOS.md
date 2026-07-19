# Modo Dios / Editor del mundo

El editor modifica datos v3 compatibles con los archivos `editor-data.js`. La interfaz y todas las rutas de escritura existen solo en desarrollo; producción responde `404` y no muestra el botón.

El selector **Mapa** abre el paquete registrado que se desea editar. San Pablo persiste en `map-editor-data.js`; los mapas nuevos persisten en `maps/<map-id>/editor-data.js`, con revisiones, conflictos y bandejas locales independientes. Consulta `MAPAS.md` para crear paquetes con `npm run map:new`.

## Arranque

```powershell
npm start
```

Abre la URL mostrada, entra en el mundo y pulsa `G` o el botón `✦`. El foco entra en la herramienta activa; al cerrar vuelve al control que abrió el editor.

Para trabajar con otra persona:

```powershell
npm run start:collab
```

El anfitrión conserva el único archivo canónico. Comparte únicamente el enlace privado que imprime el servidor: contiene un token temporal y requiere la misma red local o VPN. Para fijar uno conocido:

```powershell
$env:GAME_EDITOR_TOKEN = "un-token-largo-y-privado"
npm run start:collab
```

## Espacio de trabajo

La barra superior conserva siempre herramienta, estado de guardado, deshacer/rehacer, revisión y colaboradores. El mismo estado de guardado aparece sobre el mapa aunque el inspector esté cerrado:

- **Guardado:** el servidor confirmó todos los lotes.
- **Pendiente:** el cambio está protegido localmente y espera envío. Mientras un formulario conserva el foco, el mensaje indica expresamente que aún debe confirmarse saliendo del campo.
- **Sincronizando:** hay un lote en vuelo.
- **Sin conexión:** el lote sigue en la bandeja local.
- **Conflicto:** servidor y cambio local tocaron la misma clave.
- **Error:** la validación o persistencia falló; cerrar el panel no lo oculta.

El botón **Ocultar menú lateral** reduce el inspector a un único botón flotante y retira el oscurecimiento del mapa, de modo que toda la zona que quedaba detrás continúa siendo editable. El mismo botón vuelve a mostrarlo. En móvil el inspector es una hoja inferior y conserva este comportamiento; el botón de expansión permite dedicar toda la pantalla a diálogos o formularios largos.

## Navegación y selección

- Rueda o gesto de pinza: zoom; `100%` restablece la escala.
- `Espacio` + arrastrar o botón central: desplazar la cámara sin mover al jugador.
- **Centrar**, **Ver todo**, salto a columna/fila y clic en minimapa permiten llegar a contenido fuera de pantalla.
- El outliner busca por nombre, ID, clase o casilla, filtra por tipo y permite centrar, ocultar temporalmente o bloquear.
- `Alt` + clic alterna objetos solapados.
- `Shift` + clic añade o quita objetos; `Shift` + arrastre en vacío crea una caja de selección.
- La selección múltiple puede alinearse, distribuirse, bloquearse o agruparse. Un grupo se mueve como una unidad durante la sesión.
- Los tiradores blancos escalan desde la esquina y rotan desde el control superior; el inspector mantiene edición numérica exacta.

El catálogo de objetos ofrece miniaturas, categorías, búsqueda, recientes y favoritos. El selector de identificador queda disponible como opción avanzada.

## Herramientas

### Objetos

Colocar, mover, escalar, rotar, renombrar, duplicar, copiar/pegar, voltear, agrupar, bloquear, ocultar o eliminar edificios y decorado. Las puertas base vinculadas siguen a su edificio.

### Interiores de casas

Entra en cualquier casa, centro, tienda o laboratorio y pulsa `G`. El editor cambia automáticamente a **Decorar interior** y habilita **Objetos**, **Suelo**, **NPC**, **Entradas** y **Eventos**; **Terreno** permanece desactivado porque la geometría de paredes pertenece a la sala. El catálogo de objetos incluye 20 muebles PixelLab: camas, literas, armario, estanterías y escritorios frontales/laterales, mesas, sofás, alfombras, escalera, puerta decorativa, chimenea, cocina, planta y lavabo.

Todas las salas empiezan vacías: no se crean muebles ni NPC automáticos. Se conservan únicamente suelo, paredes y una salida de seguridad en la zona inferior. Esa salida desaparece en cuanto la escena contiene una entrada personalizada, de modo que las puertas definitivas quedan completamente bajo control del editor. Para volver al exterior, asigna a una entrada la acción **Salir del interior** (`exit`).

Cada edificio posee una escena estable e independiente. Objetos, NPC, entradas y eventos guardan su identificador `scene`; el suelo pintado se guarda por escena en `interiorGroundOverrides`. Por ello nada colocado en una casa aparece en otra ni contamina el exterior. La paleta de suelo ofrece 16 acabados PixelLab de madera, parquet, cerámica, terracota, piedra, laboratorio, clínica, cocina y moqueta. Se aplican con lápiz, rectángulo o relleno y **Original** recupera la baldosa base.

Las alfombras se dibujan bajo personajes y muebles sin bloquear el paso; los demás objetos usan colisiones ajustadas a la base y profundidad por coordenada Y. Los PNG y su procedencia están documentados en `assets/interiors/pixellab-house/README.md`.

### Terreno

Lápiz, **Original** (borrador), cuentagotas, rectángulo y relleno conectado. `Shift` dibuja una línea recta. Hay pinceles 1×1, 3×3, 5×5, 7×7 y 9×9, con huella previa y recorte seguro en los bordes. Un trazo completo —aunque toque muchas casillas— ocupa un único paso de historial.

### NPC

Plantillas de diálogo o patrulla, preview del sprite y dirección, líneas de diálogo independientes y ruta dibujada. En un interior, el NPC se guarda en esa escena, se dibuja con el mismo renderer del exterior, bloquea el paso y responde a `E` con su diálogo. No se guarda una patrulla fuera del mapa o que atraviese casillas bloqueadas. **Probar** muestra el diálogo sin persistir estado del jugador.

### Entradas

Interiores, transiciones, salidas y acciones locales están diferenciadas. Se muestran origen, flecha y destino de aparición cuando pertenece al mapa actual. En una sala, **Salir del interior** llama a la salida real y devuelve al punto desde el que se entró. Los selectores aceptan mapas y edificios conocidos o un identificador avanzado. Destinos locales fuera del mundo bloquean el guardado; IDs de mapas futuros generan una advertencia.

### Eventos

Diálogo, pensamiento, vibración, teletransporte y transición, activados al interactuar o pisar. En interiores también hay plantillas para **PC**, **carta**, **objeto recogible**, **descanso/curación**, **interruptor** y **sonido**. Los eventos de interacción se ejecutan mirando hacia ellos y pulsando `E`; los objetos solo se recogen una vez y los interruptores pueden activar o desactivar una bandera persistente.

Las condiciones avanzadas permiten mostrar un evento únicamente cuando una bandera tenga el valor elegido. Así se pueden encadenar acciones, abrir secretos o cambiar una habitación después de usar un interruptor. Los iconos diferencian el trigger; se avisa de solapamientos e inaccesibilidad y se bloquean mensajes vacíos, objetos incompletos o destinos inválidos. **Probar** restaura posición y estado después de la previsualización.

### Overlays

Cuadrícula, coordenadas, colisiones, NPC, entradas, eventos y rutas pueden activarse por separado. Cada herramienta activa solo sus capas relevantes por defecto. Las coordenadas aparecen únicamente con zoom suficiente.

## Historial, recuperación y conflictos

Trazos, arrastres, repeticiones de teclado y una sesión de formulario foco→salida son transacciones con conjuntos `before/after`. `Ctrl+Z` deshace una transacción y `Ctrl+Shift+Z` la rehace.

Antes de enviar, los lotes se guardan en IndexedDB (con respaldo local si no está disponible) y se separan por sesión para que dos pestañas no sobrescriban sus bandejas; el token colaborativo nunca entra en ellas. Recargar, cerrar o volver a la pestaña confirma la transacción activa, recupera y reintenta los cambios. El navegador solo avisa al salir si existe un cambio que todavía no ha conseguido protección duradera.

La sincronización usa SSE sin polling periódico. En movimiento la presencia se limita a unas 8–10 actualizaciones por segundo; en reposo hay un heartbeat cada 12 segundos y el servidor deduplica estados iguales.

Si dos editores cambian la misma clave, el panel compara versión local y servidor. Se puede:

- **Conservar servidor:** retirar explícitamente el lote local rechazado.
- **Reaplicar mi cambio:** actualizar la base y reenviar la copia durable.
- **Cancelar:** no hacer nada; el lote recuperable permanece local y el comparador sigue disponible para decidir después.

Deshacer también se detiene si otra persona cambió después la misma entidad. La selección de otro colaborador aparece como bloqueo suave visible y evita arrastrarla accidentalmente.

## Teclado

- `G`: abrir/cerrar editor.
- Flechas: mover la selección; `Shift` + flecha mueve una casilla completa.
- `Ctrl/Cmd+C`, `Ctrl/Cmd+V`: copiar/pegar objetos.
- `Ctrl/Cmd+D`: duplicar; `Supr`: ocultar/eliminar con confirmación.
- `Ctrl/Cmd+S`: sincronizar ahora.
- `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`: deshacer/rehacer.
- Pestañas: `←`, `→`, `Home` y `End` cambian de herramienta.
- `Espacio` + arrastre: pan independiente.

Todos los controles principales conservan foco visible y el canvas tiene nombre accesible. Las plantillas y herramientas activas exponen su estado seleccionado.

## Seguridad y datos de prueba

- `NODE_ENV=production` oculta completamente interfaz y rutas.
- `GAME_EDITOR_ENABLED=0` deshabilita el editor expresamente.
- La colaboración remota acepta solo red privada y puede exigir token.
- La escritura del anfitrión sigue siendo atómica y conserva conflictos por clave.
- Para pruebas destructivas puede indicarse otro archivo sin tocar el canónico:

```powershell
$env:GAME_EDITOR_DATA_PATH = "$env:TEMP\pokemon-editor-test\map-editor-data.js"
npm start
```

No publiques ni reenvíes el enlace con token fuera del equipo de desarrollo.
