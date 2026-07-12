# Economía de tokens sin pérdida de calidad

## Índice

1. Principio de no inferioridad
2. Orden de optimización
3. Enrutado de esfuerzo
4. Contexto y herramientas
5. Compactación segura
6. Prohibiciones útiles
7. Configuración del harness
8. Antipatrones

## 1. Principio de no inferioridad

Optimizar coste sujeto a calidad, no calidad sujeta a un límite arbitrario. Mantener una reducción solo si conserva la tasa de éxito, la evidencia requerida y la seguridad. Medir tokens junto con resultados.

No ordenar “piensa menos” como estrategia general. Reducir repetición, contexto irrelevante, salidas de herramientas y texto visible antes de reducir el esfuerzo necesario para resolver.

## 2. Orden de optimización

Aplicar en este orden:

1. Acortar instrucciones siempre activas y cargar detalles bajo demanda.
2. Enrutar tareas simples a un camino corto.
3. Recuperar solo contexto relevante.
4. Agrupar operaciones independientes y filtrar salidas.
5. Compactar el estado acumulado entre fases.
6. Ajustar parámetros de razonamiento y salida por tipo de tarea.

Las primeras cuatro medidas suelen eliminar desperdicio sin tocar la capacidad de resolución.

## 3. Enrutado de esfuerzo

| Perfil | Condición | Proceso | Salida predeterminada |
|---|---|---|---|
| Bajo | Clara, reversible, un paso | Sin plan; una comprobación | 1–4 frases |
| Medio | Varias etapas o incertidumbre | Plan corto; prueba directa; un caso límite | Resultado + evidencia |
| Alto | Alto impacto, irreversible o incierta | Evidencia independiente; revisión adversarial | Lo necesario para decidir |

Escalar cuando aparezca un fallo inexplicado, evidencia contradictoria, una dependencia oculta o un riesgo mayor del previsto. Desescalar después de resolver la incertidumbre principal.

## 4. Contexto y herramientas

- Buscar nombres, símbolos o patrones antes de leer archivos completos.
- Leer alrededor de los hallazgos; ampliar cuando las dependencias lo exijan.
- No volcar directorios, logs o documentos completos si bastan fragmentos relevantes.
- Pedir a las herramientas filtros, límites, campos y rangos concretos.
- Ejecutar en paralelo consultas independientes cuando el harness lo permita.
- Reutilizar resultados válidos mientras el estado subyacente no haya cambiado.
- Guardar artefactos grandes en archivos y referenciarlos; no reinsertarlos en cada turno.
- Mantener un solo agente por defecto. Delegar solo subtareas realmente independientes cuyo ahorro supere el contexto duplicado.
- Cerrar una rama de investigación cuando una prueba la refute; conservar únicamente conclusión y evidencia.

## 5. Compactación segura

Compactar al finalizar una fase, antes de cambiar de subproblema o cuando el historial dificulte recuperar el estado. Producir un memento autosuficiente:

```text
META: resultado y criterio de terminado
RESTRICCIONES: permisos, alcance y requisitos vigentes
DECISIONES: elección + motivo breve
EVIDENCIA: hechos exactos, fuentes, rutas, cifras, fórmulas, comandos y resultados
PENDIENTES: incógnitas y riesgos abiertos
SIGUIENTE: una acción comprobable
```

### Preservar literalmente

- requisitos y negaciones del usuario;
- nombres, identificadores, rutas y versiones;
- cantidades, unidades, fórmulas y límites;
- errores aún activos y comandos que los produjeron;
- resultados de pruebas y fecha/estado de fuentes;
- decisiones irreversibles, permisos y riesgos.

### Eliminar

- narración cronológica;
- duplicados y reformulaciones;
- salidas irrelevantes de herramientas;
- planes sustituidos;
- ramas fallidas, salvo causa y lección reutilizable;
- cortesía o explicaciones que no afecten al trabajo futuro.

Comprobar el memento contra el estado original antes de descartar contexto. La compresión de una sola pasada puede omitir fórmulas o valores; si el riesgo es medio/alto, verificar explícitamente los campos preservados.

## 6. Prohibiciones útiles

Usar pocas prohibiciones, ligadas a fallos reales y con reemplazo concreto:

| Prohibición | Reemplazo |
|---|---|
| No releer contenido sin cambios | Reutilizar el resultado anterior o leer solo el rango modificado |
| No repetir un intento idéntico | Formular una hipótesis nueva u obtener un dato discriminante |
| No explorar después de cumplir el criterio | Ejecutar la verificación final y entregar |
| No volcar salidas extensas | Extraer líneas decisivas y guardar el resto fuera del contexto |
| No planificar una tarea de un paso | Actuar y comprobar |
| No ofrecer múltiples soluciones sin petición | Elegir la mejor y mencionar una alternativa solo si cambia la decisión |
| No usar una herramienta de escritura para investigar | Empezar con acceso de solo lectura |

Aplicar permisos reales en el harness mediante allowlists, denylists y confirmaciones. Un texto de sistema no sustituye controles de acceso.

## 7. Configuración del harness

Si el proveedor lo permite:

- Establecer `verbosity: low` como salida predeterminada; permitir que una petición explícita la eleve.
- Usar esfuerzo mínimo/bajo en extracción, clasificación, transformaciones simples y consultas directas.
- Usar esfuerzo medio en programación y análisis normales.
- Reservar esfuerzo alto para problemas difíciles, alto riesgo o un fallo tras evidencia nueva.
- Fijar `max_output_tokens` con margen: un corte prematuro puede desperdiciar toda la llamada.
- Mantener instrucciones estables al principio del prompt para aprovechar prompt caching.
- Usar la función nativa de compaction/context editing cuando exista; conservar el memento y los elementos que el proveedor requiera para continuar razonando.
- Limitar las herramientas disponibles a las pertinentes para reducir errores de selección y texto de esquemas.
- Registrar tokens de entrada, salida, herramientas, reintentos y tasa de éxito por perfil.

## 8. Antipatrones

- Pedir cadenas de pensamiento breves: intenta controlar una señal interna y puede reducir calidad o monitorabilidad.
- Imponer un número fijo de pasos a toda tarea.
- Añadir muchas reglas negativas sin prioridad ni acción alternativa.
- Resumir repetidamente una conversación corta.
- Compactar mientras se investiga el error actual.
- Ahorrar una consulta barata y sustituirla por una suposición costosa.
- Usar subagentes o revisores en tareas que un único pase puede comprobar.
- Medir solo tokens y no exactitud, seguridad, latencia y reintentos.
