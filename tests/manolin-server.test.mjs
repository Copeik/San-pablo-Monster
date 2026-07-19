import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import { cleanMiniMaxReply, createAppServer, isRepetitiveReply, isUsableCharacterReply, replySimilarity, sanitizeConversation, varyReplyOpening } from "../server.mjs";

let app;
let upstream;
let origin;
let receivedPayloads = [];
let upstreamReplies = [];

before(async () => {
  upstream = createAppServerForMiniMax();
  await listen(upstream);
  const upstreamAddress = upstream.address();
  app = createAppServer({
    env: {
      MINIMAX_API_KEY: "test-only-secret",
      MINIMAX_BASE_URL: `http://127.0.0.1:${upstreamAddress.port}/v1`,
      MINIMAX_MODEL: "MiniMax-M3",
    },
  });
  await listen(app);
  origin = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await Promise.all([close(app), close(upstream)]);
});

beforeEach(() => {
  receivedPayloads = [];
  upstreamReplies = ["<think>razonamiento privado</think> Quillo, tu calva discute mejor que tú, pero esa barriga le tapa los argumentos."];
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function createAppServerForMiniMax() {
  return createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    receivedPayloads.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const reply = upstreamReplies.length > 1 ? upstreamReplies.shift() : upstreamReplies[0];
    const body = JSON.stringify({
      model: "MiniMax-M3",
      choices: [{ finish_reason: "stop", message: { content: reply } }],
    });
    response.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    response.end(body);
  });
}

test("limpia razonamiento, conserva seis intercambios y mide similitud", () => {
  assert.equal(cleanMiniMaxReply("<think>oculto</think> Hola   figura"), "Hola figura");
  const sanitized = sanitizeConversation([
    { role: "system", content: "ignorar" },
    ...Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `m${index}` })),
  ]);
  assert.deepEqual(sanitized.map((entry) => entry.content), Array.from({ length: 12 }, (_, index) => `m${index + 2}`));
  assert.ok(replySimilarity("Quillo, esa calva parece un faro", "Quillo, tu calva parece un faro") > 0.62);
  assert.equal(isRepetitiveReply("Quillo, esa calva parece un faro", [{ role: "assistant", content: "Quillo, tu calva parece un faro" }]), true);
  assert.equal(isRepetitiveReply("Quillo, tu cinturón necesita vacaciones después de rodear esa barriga.", [{ role: "assistant", content: "Quillo, esa coronilla deslumbra hasta al árbitro." }]), true);
  assert.equal(isRepetitiveReply("Miarma, tu cinturón necesita vacaciones después de rodear esa barriga.", [{ role: "assistant", content: "Quillo, esa coronilla deslumbra hasta al árbitro." }]), false);
  assert.equal(isRepetitiveReply("Dice que su coche corre, pero esa papada lo frena.", [{ role: "assistant", content: "Dice que gana al FIFA, pero su calva deslumbra." }]), true);
  assert.equal(varyReplyOpening("Quillo, esa papada frena el coche.", [
    { role: "assistant", content: "Quillo, primera pulla." },
    { role: "assistant", content: "Illó, segunda pulla." },
  ]), "Miarma, esa papada frena el coche.");
  assert.equal(isUsableCharacterReply("Quillo, ¿", "length"), false);
  assert.equal(isUsableCharacterReply("Miarma, tu calva alumbra el camino mientras esa barriga llega media hora antes que tú."), true);
});

test("comprime recursos estáticos grandes cuando el navegador acepta gzip", async () => {
  const compressed = await fetch(`${origin}/script.js`, { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(compressed.status, 200);
  assert.equal(compressed.headers.get("content-encoding"), "gzip");
  assert.equal(compressed.headers.get("vary"), "Accept-Encoding");
  assert.equal(compressed.headers.get("content-length"), null);
  assert.match(await compressed.text(), /function|const|let/);

  const identity = await fetch(`${origin}/script.js`, { headers: { "Accept-Encoding": "identity" } });
  assert.equal(identity.status, 200);
  assert.equal(identity.headers.get("content-encoding"), null);
  assert.ok(Number(identity.headers.get("content-length")) > 0);
});

test("mantiene la clave en servidor y devuelve solo la pulla", async () => {
  const response = await fetch(`${origin}/api/manolin/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Manolín, ven aquí", history: [] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    reply: "Quillo, tu calva discute mejor que tú, pero esa barriga le tapa los argumentos.",
    model: "MiniMax-M3",
    variationRetry: false,
  });
  const payload = receivedPayloads[0];
  assert.equal(payload.model, "MiniMax-M3");
  assert.equal(payload.messages.at(-1).content, "Manolín, ven aquí");
  assert.match(payload.messages[0].content, /andaluz natural/);
  assert.match(payload.messages[0].content, /gordo y calvo/);
  assert.match(payload.messages[0].content, /TEMA ACTUAL OBLIGATORIO/);
  assert.equal(payload.reasoning_split, true);
  assert.equal(payload.max_completion_tokens, 2048);
  assert.equal(JSON.stringify(payload).includes("test-only-secret"), false);
});

test("regenera una respuesta repetida y conserva el tema del jugador", async () => {
  const repeated = "Quillo, tu calva parece un faro y tu barriga una rotonda.";
  const different = "Miarma, presumes del coche mientras tu cinturón hace más kilómetros rodeando esa barriga que el motor.";
  upstreamReplies = [repeated, different];
  const response = await fetch(`${origin}/api/manolin/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Mi coche corre más que tú",
      history: [{ role: "user", content: "No me alcanzas" }, { role: "assistant", content: repeated }],
    }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: different, model: "MiniMax-M3", variationRetry: true });
  assert.equal(receivedPayloads.length, 2);
  assert.equal(receivedPayloads[1].messages.at(-1).content, "Mi coche corre más que tú");
  assert.match(receivedPayloads[1].messages[0].content, /VARIEDAD OBLIGATORIA/);
  assert.match(receivedPayloads[1].messages[0].content, /ARRANQUES PROHIBIDOS/);
  assert.match(receivedPayloads[1].messages[0].content, /faro/);
});

test("descarta una salida cortada antes de enseñársela al jugador", async () => {
  const complete = "Picha, vienes corriendo y tu barriga ya había llegado mientras tu calva pedía paso en la puerta.";
  upstreamReplies = ["Quillo, ¿", complete];
  const response = await fetch(`${origin}/api/manolin/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "He entrado corriendo por la puerta", history: [] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: complete, model: "MiniMax-M3", variationRetry: true });
  assert.equal(receivedPayloads.length, 2);
  assert.match(receivedPayloads[1].messages[0].content, /Quillo, ¿/);
});
