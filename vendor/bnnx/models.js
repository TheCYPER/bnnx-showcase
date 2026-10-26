// Model identity: find models in the zoo, and check that a deployed runner is the model you expect.

import { readModelInfo } from "./client.js";
import { ZOO } from "./zoo.js";

const MAX_ERROR_TEXT = 200;

/** The zoo entry for a model name (deep-frozen), or undefined. */
export function zooModel(name) {
  return ZOO.models.find((model) => model.name === name);
}

/** A zoo model's deployment on a chain id (for example 97, BSC testnet), or undefined. */
export function zooDeployment(name, chainId) {
  return zooModel(name)?.deployments.find((deployment) => deployment.chainId === chainId);
}

/**
 * Read modelInfo() from every node and compare its irHash with the one you expect (a zoo entry's irHash, say).
 * Resolves to { ok, nodes: [{ node, ok, irHash, name, inputLength, numClasses, error }] }. ok is true only when
 * there is at least one node, every node answered, and every answer names expectedIrHash.
 */
export async function checkModelInfo({ address, expectedIrHash, nodes, blockTag = "latest", fetchImpl, timeoutMs }) {
  const expected = String(expectedIrHash).toLowerCase();
  const answers = await Promise.all(nodes.map(async (node) => {
    try {
      const info = await readModelInfo({ address, node, blockTag, fetchImpl, timeoutMs });
      return { node: node.label, ok: info.irHash.toLowerCase() === expected, ...info };
    } catch (error) {
      return { node: node.label, ok: false, error: String(error.message || error).slice(0, MAX_ERROR_TEXT) };
    }
  }));
  return { ok: answers.length > 0 && answers.every((answer) => answer.ok), nodes: answers };
}
