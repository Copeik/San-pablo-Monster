#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasIntegrityErrors,
  runAssetAudit,
  writeOrCheckManifests,
} from "./lib/asset-inventory.mjs";

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(toolDirectory, "../..");

function usage() {
  return [
    "Uso: node tools/assets/audit-assets.mjs [opciones]",
    "",
    "  --check                 No escribe; falla si los manifiestos no coinciden.",
    "  --root <ruta>           Raiz del repositorio (por defecto, la detectada).",
    "  --config <ruta>         Reglas JSON relativas a la raiz.",
    "  --inventory-out <ruta> Salida del inventario completo.",
    "  --runtime-out <ruta>   Salida de la allowlist runtime.",
    "  --quiet                 Muestra solo errores.",
    "  --help                  Muestra esta ayuda.",
  ].join("\n");
}

export function parseArguments(argv) {
  const options = {
    check: false,
    quiet: false,
    root: defaultRoot,
    config: "tools/assets/runtime-rules-v0.json",
    inventoryOut: "tools/assets/asset-inventory-v0.json",
    runtimeOut: "tools/assets/runtime-files-v0.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--quiet") options.quiet = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (["--root", "--config", "--inventory-out", "--runtime-out"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${argument}.`);
      index += 1;
      if (argument === "--root") options.root = path.resolve(value);
      else if (argument === "--config") options.config = value;
      else if (argument === "--inventory-out") options.inventoryOut = value;
      else options.runtimeOut = value;
    } else throw new Error(`Opcion desconocida: ${argument}`);
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) { console.log(usage()); return 0; }
  const configPath = path.resolve(options.root, options.config);
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const manifests = await runAssetAudit(options.root, config);
  const drift = await writeOrCheckManifests(options.root, manifests, options);
  const integrity = manifests.runtime.integrity;
  if (!options.quiet) {
    const action = options.check ? "comprobados" : "generados";
    console.log(`Manifiestos ${action}: ${manifests.inventory.summary.files} archivos auditados.`);
    console.log(`Runtime: ${manifests.runtime.summary.files} archivos, ${manifests.runtime.summary.bytes} bytes.`);
    console.log(`Candidatos fuera de runtime: ${manifests.inventory.summary.byClassification.candidate.files}.`);
    console.log(`Duplicados exactos: ${manifests.inventory.summary.exactDuplicateGroups} grupos, ${manifests.inventory.summary.exactDuplicateReclaimableBytes} bytes recuperables teoricos.`);
  }
  if (drift.length) console.error(`ERROR: manifiestos desactualizados: ${drift.join(", ")}`);
  if (hasIntegrityErrors(integrity)) {
    console.error(`ERROR: integridad: ${integrity.missingSources.length} fuentes ausentes, ${integrity.missingReferences.length} referencias ausentes, ${integrity.caseMismatches.length} diferencias de mayusculas y ${integrity.unmatchedPatterns.length} patrones sin coincidencias.`);
  }
  return drift.length || hasIntegrityErrors(integrity) ? 1 : 0;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => { process.exitCode = exitCode; }).catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
