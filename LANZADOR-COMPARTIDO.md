# Lanzador de edición compartida

Abre `PokemonAdventureCompartido.exe` desde la carpeta principal del juego.

## Host

1. Pulsa **Soy host**.
2. El lanzador inicia el servidor, busca un puerto libre y abre el juego en el navegador.
3. Copia el **código para invitados** y envíaselo únicamente a las personas que participarán.
4. Mantén el lanzador abierto durante toda la sesión.

Si hay acceso a Internet y el túnel SSH de Windows está disponible, el código funciona desde otra red. Si el acceso público falla, el lanzador indica **solo red local** y los participantes deben estar conectados a la misma red que el host.

## Invitado

1. Abre el mismo ejecutable; no necesitas tener el proyecto ni Node.js.
2. Pulsa **Soy invitado**.
3. Pega el código que te dio el host y pulsa **Entrar a la sesión**.

El código contiene la URL y el token privado de la sesión. Caduca cuando el host detiene o cierra el lanzador.

## Volver a compilar

Desde PowerShell, en la carpeta del proyecto:

```powershell
.\tools\build-shared-launcher.ps1
```

El host necesita Node.js para ejecutar `server.mjs`. El invitado solo necesita Windows y un navegador.
