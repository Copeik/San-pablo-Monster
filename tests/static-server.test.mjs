import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createAppServer } from "../server.mjs";

async function startStaticServer() {
  const staticRoot = await mkdtemp(path.join(tmpdir(), "pokemon-static-"));
  await writeFile(path.join(staticRoot, "index.html"), "<!doctype html><title>dist standard</title>");
  await writeFile(path.join(staticRoot, "sample.mp4"), Buffer.from("0123456789"));
  const server = createAppServer({
    env: { NODE_ENV: "production" },
    staticRoot,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(staticRoot, { recursive: true, force: true });
    },
  };
}

test("sirve únicamente la raíz estática configurada con validadores HTTP", async (context) => {
  const app = await startStaticServer();
  context.after(() => app.close());

  const response = await fetch(`${app.origin}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /dist standard/);
  assert.equal(response.headers.get("cache-control"), "no-cache");
  assert.ok(response.headers.get("etag"));
  assert.ok(response.headers.get("last-modified"));

  const notModified = await fetch(`${app.origin}/`, {
    headers: { "If-None-Match": response.headers.get("etag") },
  });
  assert.equal(notModified.status, 304);

  const traversal = await fetch(`${app.origin}/..%2Fserver.mjs`);
  assert.equal(traversal.status, 404);
});

test("responde rangos de bytes para medios sin comprimir el rango", async (context) => {
  const app = await startStaticServer();
  context.after(() => app.close());

  const response = await fetch(`${app.origin}/sample.mp4`, {
    headers: {
      Range: "bytes=2-5",
      "Accept-Encoding": "gzip, br",
    },
  });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "2345");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(response.headers.get("content-encoding"), null);
});
