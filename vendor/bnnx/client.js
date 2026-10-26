// Client for BNNX model contracts: ABI encoding, JSON-RPC over fetch, and a multi-node classify that reports
// whether independent nodes returned identical results. No DOM, no dependencies (browsers and Node 20+).

export const VERSION = "0.1.0";

export const SELECTORS = Object.freeze({
  classify: "9f903bca", // classify(bytes) -> (uint256 label, int256[] scores)
  modelInfo: "4959e729", // modelInfo() -> (bytes32 name, bytes32 irHash, uint256 inputLength, uint256 numClasses)
});

// publicnode's eth_call cap, measured exactly with tools/rpc_gas_cap.py (2026-09-28); the CIFAR-class model needs 43.9M.
export const CALL_GAS = 50_000_000;

const WORD_HEX = 64;
const MAX_EXACT = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_ERROR_TEXT = 200;

function word(value) {
  return BigInt(value).toString(16).padStart(WORD_HEX, "0");
}

function toHex(bytes) {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function readWord(hex, index) {
  const start = index * WORD_HEX;
  if (start + WORD_HEX > hex.length) throw new Error("ABI data is truncated");
  return BigInt("0x" + hex.slice(start, start + WORD_HEX));
}

function signed(value) {
  return value >= 1n << 255n ? value - (1n << 256n) : value;
}

// Scores are small integers; anything a Number cannot hold exactly is garbage, and two different such values
// could round to the same Number and pass for agreement.
function exact(value) {
  if (value > MAX_EXACT || value < -MAX_EXACT) throw new Error("ABI value out of range for an exact comparison");
  return Number(value);
}

function strip(hex) {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("expected 0x-prefixed hex data");
  }
  return hex.slice(2).toLowerCase();
}

/** Calldata for classify(bytes pixels): selector, offset, length, pixels padded to 32 bytes. */
export function encodeClassify(pixels) {
  const bytes = pixels instanceof Uint8Array ? pixels : Uint8Array.from(pixels);
  const padding = "00".repeat((32 - (bytes.length % 32)) % 32);
  return "0x" + SELECTORS.classify + word(32) + word(bytes.length) + toHex(bytes) + padding;
}

/** (uint256 label, int256[] scores) -> { label, scores } as exact Numbers; throws on values beyond 2^53. */
export function decodeClassify(hex) {
  const data = strip(hex);
  const label = exact(readWord(data, 0));
  const offset = Number(readWord(data, 1)) / 32;
  const count = Number(readWord(data, offset));
  readWord(data, offset + count); // the last element must be present
  const scores = Array.from({ length: count }, (_, i) => exact(signed(readWord(data, offset + 1 + i))));
  return { label, scores };
}

/** modelInfo() -> { name, irHash, inputLength, numClasses }. */
export function decodeModelInfo(hex) {
  const data = strip(hex);
  const nameBytes = data.slice(0, WORD_HEX).match(/../g).map((b) => parseInt(b, 16));
  const end = nameBytes.indexOf(0) === -1 ? nameBytes.length : nameBytes.indexOf(0);
  return {
    name: new TextDecoder().decode(Uint8Array.from(nameBytes.slice(0, end))),
    irHash: "0x" + data.slice(WORD_HEX, 2 * WORD_HEX),
    inputLength: Number(readWord(data, 2)),
    numClasses: Number(readWord(data, 3)),
  };
}

/** One JSON-RPC request with a timeout; resolves to the result or throws with the node's message. */
export async function rpcCall(url, method, params, { timeoutMs = 60_000, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || JSON.stringify(payload.error));
    return payload.result;
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`no answer within ${timeoutMs / 1000} s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// A node that says it does not have the requested block yet (Python: bnnx.rpc.BEHIND_MARKERS, BEHIND_RETRY_DELAYS).
export const BEHIND_MARKERS = Object.freeze(["is less than", "header not found", "unknown block", "block not found",
  "could not be found", "no available upstreams"]);
export const BEHIND_RETRY_DELAYS_MS = Object.freeze([2000, 4000, 8000]);

export function isBehind(error) {
  const text = String(error?.message || error).toLowerCase();
  return BEHIND_MARKERS.some((marker) => text.includes(marker));
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * rpcCall for a read at a pinned block: a node that says it lacks that block yet is asked again after 2, 4 and 8 s
 * (as Python's hex_answer does); any other error, or the same one after the last delay, is thrown. With nullIsBehind,
 * a null answer counts as "behind" too (eth_getBlockByNumber on geth-style nodes).
 */
export async function rpcCallAtBlock(url, method, params, { fetchImpl, timeoutMs, delaysMs = BEHIND_RETRY_DELAYS_MS,
  sleep = pause, nullIsBehind = false } = {}) {
  for (const delay of [...delaysMs, null]) {
    try {
      const result = await rpcCall(url, method, params, { fetchImpl, timeoutMs });
      // geth-style nodes answer null, not an error, for a block they do not have yet
      if (nullIsBehind && result === null) throw new Error(`${method}: block not found`);
      return result;
    } catch (error) {
      if (delay === null || !isBehind(error)) throw error;
      await sleep(delay);
    }
  }
  throw new Error("unreachable");
}

export function sameResult(a, b) {
  return Boolean(a && b) && a.label === b.label && a.scores.length === b.scores.length &&
    a.scores.every((score, i) => score === b.scores[i]);
}

/**
 * Classify pixels on every node in parallel.
 * Resolves to { calls: [{ node, ok, label, scores, ms, error }], agree, agreeing, total }: agree is true only when
 * there is at least one node, every node answered and all answers are identical, label and every integer score.
 * Error texts come from the nodes (untrusted) and are cut to 200 characters.
 */
export async function classifyOnChain({ address, pixels, nodes, blockTag = "latest", fetchImpl, timeoutMs }) {
  const call = { to: address, data: encodeClassify(pixels), gas: "0x" + CALL_GAS.toString(16) };
  const calls = await Promise.all(nodes.map(async (node) => {
    const started = performance.now();
    try {
      const result = decodeClassify(await rpcCall(node.url, "eth_call", [call, blockTag], { fetchImpl, timeoutMs }));
      return { node: node.label, ok: true, ...result, ms: Math.round(performance.now() - started) };
    } catch (error) {
      const text = String(error.message || error).slice(0, MAX_ERROR_TEXT);
      return { node: node.label, ok: false, error: text, ms: Math.round(performance.now() - started) };
    }
  }));
  const answers = calls.filter((c) => c.ok);
  const agreeing = answers.filter((c) => sameResult(c, answers[0])).length;
  const agree = calls.length > 0 && answers.length === calls.length && agreeing === calls.length;
  return { calls, agree, agreeing, total: calls.length };
}

/** Read and decode modelInfo() from one node (at blockTag, default "latest"). */
export async function readModelInfo({ address, node, blockTag = "latest", fetchImpl, timeoutMs }) {
  const result = await rpcCall(node.url, "eth_call", [{ to: address, data: "0x" + SELECTORS.modelInfo }, blockTag],
    { fetchImpl, timeoutMs });
  return decodeModelInfo(result);
}

/** Decode a base64 string to bytes (browser and Node). */
export function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
