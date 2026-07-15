import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const server = fs.readFileSync(path.join(root, "server.mjs"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(script.includes("const VOICE_NPC_ENABLED = false"), "Manolín no está desactivado mediante la bandera de la función.");
check(script.includes("const MICROPHONE_ACCESS_ENABLED = false"), "El acceso global al micrófono no está desactivado.");
check(script.includes('if (!MICROPHONE_ACCESS_ENABLED)') && script.includes('return "movement";'), "El juego todavía puede solicitar el micrófono en vez de usar el control por movimiento.");
check(script.includes('permission: VOICE_NPC_ENABLED ? "idle" : "disabled"'), "El estado inicial de Manolín no queda desactivado.");
check(script.includes("if (VOICE_NPC_ENABLED) window.setTimeout(() => requestVoiceNpcAccess(), 0)"), "El permiso del micrófono todavía puede solicitarse al cargar.");
check(script.includes("if (VOICE_NPC_ENABLED) requestVoiceNpcAccess();"), "Nueva partida o continuar aún pueden pedir el micrófono con Manolín desactivado.");
check(script.includes("if (!VOICE_NPC_ENABLED) { voiceNpc.positionReady = false; return false; }"), "Manolín todavía puede colocarse en el mapa.");
check(script.includes("if (!VOICE_NPC_ENABLED) return null;"), "Manolín todavía puede ofrecer interacción.");
check(html.includes('id="voiceNpcHud" class="voice-npc-hud hidden" data-state="disabled"'), "El HUD de Manolín no arranca oculto.");
check(script.includes("const VOICE_NPC_SILENCE_MS = 3000"), "La implementación conservada perdió su límite de tres segundos.");
check(script.includes("/\\bmanoli+n\\b/"), "El activador no admite Manolín/Manoliiin.");
check(script.includes("window.SpeechRecognition || window.webkitSpeechRecognition"), "Falta reconocimiento de voz compatible con Chrome.");
check(script.includes("recognition.continuous = true"), "La escucha no es continua.");
check(script.includes("requestMicrophoneAccess().then"), "La escucha no reutiliza el permiso de micrófono del juego.");
check(script.includes("fetch(\"/api/manolin/chat\""), "El cliente no consulta el proxy seguro de Manolín.");
check(script.includes("voiceNpc.history.slice(-12)"), "El cliente no conserva seis intercambios de contexto.");
check(script.includes("VOICE_NPC_WAKE_REPLIES") && script.includes("VOICE_NPC_SILENCE_REPLIES"), "Los saludos o cierres de Manolín siguen siendo una frase fija.");
check(script.includes("updateVoiceNpc(deltaSeconds)"), "El NPC no se actualiza dentro del bucle del juego.");
check(script.includes("npcRosterSheets.get(\"doctor-potato\")"), "Manolín no usa el modelo visual del Doctor Potato.");
check(script.includes("simulateVoiceManolin"), "Falta el punto de prueba local para simular frases.");
check(html.includes('id="voiceNpcHud"') && html.includes('id="voiceNpcRetry"'), "Falta el HUD accesible o el reintento del micrófono.");
check(styles.includes('.voice-npc-hud[data-state="active"]'), "Falta el estado visual de persecución.");
check(server.includes("process.env") && server.includes("MINIMAX_API_KEY"), "El servidor no lee la clave MiniMax desde el entorno.");
check(server.includes('url.pathname === "/api/manolin/chat"'), "Falta el endpoint de chat de Manolín.");
check(server.includes("MINIMAX_MODEL || \"MiniMax-M3\""), "MiniMax-M3 no es el modelo predeterminado.");
check(server.includes("andaluz natural") && server.includes("gordo y calvo"), "Falta la personalidad andaluza o el contexto físico solicitado.");
check(server.includes("isRepetitiveReply") && server.includes("VARIEDAD OBLIGATORIA"), "El servidor no regenera respuestas repetidas.");
check(!script.includes("MINIMAX_API_KEY") && !html.includes("MINIMAX_API_KEY"), "El cliente contiene una referencia a la clave secreta.");
check(packageJson.scripts?.start === "node server.mjs", "npm start no arranca el servidor seguro.");

if (failures.length) {
  console.error(`Validación de Manolín fallida (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("OK: Manolín de voz está desactivado; no solicita micrófono, no aparece y no bloquea ni persigue al jugador.");
}
