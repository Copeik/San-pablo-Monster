# Auditoria y allowlist de assets

Este directorio contiene el primer limite reproducible entre los archivos que utiliza el juego y el material de trabajo. La auditoria no mueve ni elimina archivos.

## Uso

Generar los manifiestos:

    node tools/assets/audit-assets.mjs

Comprobar que los manifiestos versionados siguen representando el repositorio:

    node tools/assets/audit-assets.mjs --check

Ejecutar sus pruebas aisladas:

    node --test tests/assets-*.test.mjs

## Salidas

- asset-inventory-v0.json: inventario completo de assets/ y maps/, con SHA-256, tamano, metadatos visuales cuando se pueden obtener sin decodificar la imagen, clasificacion y duplicados exactos.
- runtime-files-v0.json: allowlist conservadora descubierta desde index.html y las reglas dinamicas declaradas.
- runtime-rules-v0.json: unicas excepciones para rutas que el JavaScript construye durante la ejecucion y que por ello no aparecen como literales completos.

Las salidas no incluyen fechas, rutas absolutas ni datos dependientes de la maquina. Con el mismo arbol de archivos siempre se produce exactamente el mismo JSON.

## Clasificaciones

- runtime: existe una referencia alcanzable desde el punto de entrada o una regla dinamica explicita.
- source: fuente editable, original, referencia o metadato de autoria.
- derived: previsualizacion, informe, mascara u otro derivado no alcanzado por el runtime.
- archive: ZIP u otro archivo de conservacion.
- candidate: no se ha descubierto en runtime ni encaja en las categorias anteriores.

Candidate significa pendiente de revision, no autorizacion para borrar. Antes de eliminar un lote hay que actualizar las reglas, ejecutar --check, probar todos los mapas y verificar visualmente el juego.

## Politica de integridad

El comando termina con error si detecta una referencia ausente, diferencias de mayusculas/minusculas, una fuente runtime ausente, patrones dinamicos sin coincidencias o manifiestos desactualizados. Los enlaces simbolicos se registran pero no se siguen.
