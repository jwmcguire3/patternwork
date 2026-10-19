import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Agent, fetch } from "undici";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const delayMilliseconds = 3000;
const shortTimeoutMilliseconds = 1000;
const longTimeoutMilliseconds = 8000;
const outcomes = {};
const agents = [];
const server = createServer((_request, response) => {
  const socket = response.socket;
  socket.write("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nX-Slow: ");
  setTimeout(() => {
    if (!socket.destroyed) socket.end(`complete\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok`);
  }, delayMilliseconds);
});

let result;
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/delayed-headers`;

  const shortAgent = new Agent({
    connections: 1,
    allowH2: false,
    headersTimeout: shortTimeoutMilliseconds,
    bodyTimeout: 8000,
  });
  agents.push(shortAgent);
  const shortStartedAt = Date.now();
  try {
    const response = await fetch(url, { dispatcher: shortAgent });
    outcomes.shortTimeoutStatus = response.status;
    outcomes.shortTimeoutBody = await response.text();
  } catch (error) {
    const chain = [];
    let current = error;
    while (current && chain.length < 6) {
      chain.push({ name: current.name, code: current.code ?? null, message: current.message });
      current = current.cause;
    }
    outcomes.shortTimeoutError = chain;
    outcomes.shortTimeoutRejectedForHeadersTimeout = chain.some((entry) => entry.code === "UND_ERR_HEADERS_TIMEOUT");
  }
  outcomes.shortTimeoutElapsedMilliseconds = Date.now() - shortStartedAt;

  const longAgent = new Agent({
    connections: 1,
    allowH2: false,
    headersTimeout: longTimeoutMilliseconds,
    bodyTimeout: longTimeoutMilliseconds,
  });
  agents.push(longAgent);
  const longStartedAt = Date.now();
  const response = await fetch(url, { dispatcher: longAgent });
  const body = await response.text();
  outcomes.longTimeoutStatus = response.status;
  outcomes.longTimeoutBody = body;
  outcomes.longTimeoutElapsedMilliseconds = Date.now() - longStartedAt;

  assert.equal(outcomes.shortTimeoutRejectedForHeadersTimeout, true, "short Agent must reject incomplete headers");
  assert.equal(outcomes.longTimeoutStatus, 200, "long Agent must accept the same delayed headers");
  assert.equal(outcomes.longTimeoutBody, "ok");
  result = { status: "passed" };
} catch (error) {
  result = { status: "failed", error: error instanceof Error ? error.message : String(error) };
} finally {
  await Promise.allSettled(agents.map((agent) => agent.close()));
  if (server.listening) {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

const artifact = {
  schemaVersion: "PATTERNWORK-UNDICI-HEADER-TIMEOUT-SMOKE-V2",
  status: result.status,
  error: result.error ?? null,
  execution: "local loopback only; no provider request or credential used",
  undiciVersion: "7.28.0",
  delayedPartialHeaderMilliseconds: delayMilliseconds,
  shortAgentHeadersTimeoutMilliseconds: shortTimeoutMilliseconds,
  longAgentHeadersTimeoutMilliseconds: longTimeoutMilliseconds,
  outcomes,
};
await writeFile(path.join(runDir, "UNDICI_TIMEOUT_SMOKE.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(artifact, null, 2));
if (artifact.status !== "passed") process.exitCode = 1;
