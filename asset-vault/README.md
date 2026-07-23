# Asset vault

Material de autoría, derivados y recursos heredados que nunca se publica con el juego estándar.

- `legacy-runtime/`: índice de recursos que el modo compatible todavía necesita, pero que no cumplen el contrato final.
- `reports/`: informes reproducibles de inventario, referencias y conformidad.
- `source/`: destino de originales editables cuando su procedencia esté confirmada.
- `derived/`: destino de previsualizaciones, hojas de contacto y otros resultados regenerables.
- `archive/`: destino de paquetes históricos que deban conservarse fuera del runtime.

Los recursos activos no se mueven físicamente hasta que exista un reemplazo y se reescriban sus referencias. El empaquetador mantiene cerrado `dist/standard`; `dist/legacy` los incluye sin herramientas de edición y `dist/legacy-dev` añade el editor únicamente para diagnóstico local.
