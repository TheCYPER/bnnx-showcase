// Result receipts (bnnx-receipt, version 1): the same file `bnnx call --receipt` writes, so `bnnx replay` can check a
// receipt made in a browser. A receipt records which nodes answered what at one pinned block; it is not a proof.

import { CALL_GAS, SELECTORS, VERSION, decodeClassify, decodeModelInfo, encodeClassify, rpcCall, rpcCallAtBlock } from
  "./client.js";

export const INLINE_INPUT_LIMIT = 4096; // inputs up to this many bytes are stored in the receipt itself

function toHex(bytes) {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** scheme://host[:port] of an RPC URL, like the Python side: URLs can carry API keys in the path or query. */
export function nodeLabel(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? ":" + parsed.port : ""}`;
}

/** SHA-256 of bytes as lowercase hex (Web Crypto: browsers and Node 20+). */
export async function sha256Hex(bytes) {
  return toHex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)));
}

/**
 * A block every node has (their lowest head minus lag) and its hash, which every node must report.
 * Throws when the nodes are on different chains or disagree on the hash (one of them is on another fork).
 */
export async function pinBlock({ nodes, lag = 0, fetchImpl, timeoutMs, sleep }) {
  if (nodes.length === 0) throw new Error("no nodes");
  const options = { fetchImpl, timeoutMs };
  const chains = await Promise.all(nodes.map((node) => rpcCall(node.url, "eth_chainId", [], options)));
  const chainIds = new Set(chains.map((id) => Number(BigInt(id))));
  if (chainIds.size !== 1) throw new Error(`nodes are on different chains: ${[...chainIds].join(", ")}`);
  const heads = await Promise.all(nodes.map((node) => rpcCall(node.url, "eth_blockNumber", [], options)));
  const block = Math.min(...heads.map((head) => Number(BigInt(head)))) - lag;
  if (block < 0) throw new Error("lag is larger than the chain height");
  const tag = "0x" + block.toString(16);
  const headers = await Promise.all(nodes.map((node) => rpcCallAtBlock(node.url, "eth_getBlockByNumber", [tag, false],
    { ...options, sleep, nullIsBehind: true })));
  const hashes = new Set(headers.map((header) => header?.hash));
  if (hashes.size !== 1 || !headers[0]?.hash) throw new Error(`nodes disagree on the hash of block ${block}`);
  return { chainId: [...chainIds][0], block, blockHash: headers[0].hash };
}

/**
 * Read modelInfo() and classify(pixels) from every node at one pinned block and build a bnnx-receipt.
 * Throws when a node fails or the model reads a different input length; `agree` says whether every node gave the
 * same label, scores and irHash.
 */
export async function classifyWithReceipt({ address, pixels, nodes, lag = 0, fetchImpl, timeoutMs, sleep,
  now = () => new Date() }) {
  const bytes = pixels instanceof Uint8Array ? pixels : Uint8Array.from(pixels);
  const { chainId, block, blockHash } = await pinBlock({ nodes, lag, fetchImpl, timeoutMs, sleep });
  const tag = "0x" + block.toString(16);
  const options = { fetchImpl, timeoutMs, sleep };   // reads at the pinned block: rpcCallAtBlock retries a lagging node
  const call = { to: address, data: encodeClassify(bytes), gas: "0x" + CALL_GAS.toString(16) };
  const answers = await Promise.all(nodes.map(async (node) => {
    const info = decodeModelInfo(await rpcCallAtBlock(node.url, "eth_call",
      [{ to: address, data: "0x" + SELECTORS.modelInfo }, tag], options));
    if (info.inputLength !== bytes.length) {
      throw new Error(`the model reads ${info.inputLength} input bytes; this input has ${bytes.length}`);
    }
    const { label, scores } = decodeClassify(await rpcCallAtBlock(node.url, "eth_call", [call, tag], options));
    return { host: nodeLabel(node.url), label, scores, ir_hash: info.irHash };
  }));
  const [first] = answers;
  const agree = answers.every((a) => a.label === first.label && a.ir_hash === first.ir_hash &&
    a.scores.length === first.scores.length && a.scores.every((score, i) => score === first.scores[i]));
  return {
    format: "bnnx-receipt",
    version: 1,
    chainId,
    address,
    irHash: first.ir_hash,
    block: { number: block, hash: blockHash },
    input: { length: bytes.length, sha256: await sha256Hex(bytes),
      hex: bytes.length <= INLINE_INPUT_LIMIT ? "0x" + toHex(bytes) : null },
    output: { label: first.label, scores: first.scores },
    nodes: answers,
    agree,
    tool: { name: "bnnx-js", version: VERSION },
    created: now().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}
