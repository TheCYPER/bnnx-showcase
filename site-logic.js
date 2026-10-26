// Small pure helpers for the site pages (no DOM, so Node can test them).

/** How many of `rows` rows the scan has passed after `elapsedMs` of `totalMs` (0 … rows). */
export function scanRows(elapsedMs, totalMs, rows) {
  if (!(totalMs > 0)) return rows;
  const done = Math.floor((Math.max(0, elapsedMs) / totalMs) * rows);
  return Math.min(rows, done);
}

/** 1_045_749 → "1.05M", 44_306_686 → "44.3M", 389_174 → "389k", 950 → "950". */
export function formatGasShort(gas) {
  if (!Number.isFinite(gas) || gas < 0) throw new RangeError(`not a gas amount: ${gas}`);
  if (gas >= 10_000_000) return `${(gas / 1e6).toFixed(1)}M`;
  if (gas >= 1_000_000) return `${(gas / 1e6).toFixed(2)}M`;
  if (gas >= 1_000) return `${Math.round(gas / 1e3)}k`;
  return String(gas);
}

/** "0x4fd07609d9…c6d" style abbreviation of a 0x-hex string; short strings come back unchanged. */
export function shortHex(hex, head = 10, tail = 6) {
  const text = String(hex);
  return text.length <= head + tail + 1 ? text : `${text.slice(0, head)}…${text.slice(-tail)}`;
}

/** Percentage with two decimals from a fraction: 0.9786 → "97.86%". */
export function percent(fraction) {
  return `${(fraction * 100).toFixed(2)}%`;
}

/** The error text of a node that answered, but with another irHash than the one we publish. */
export const DIFFERENT_HASH = "answered a different irHash";

/**
 * Turn a checkModelInfo() result into one line per node plus a verdict. ok only when there is at least one node
 * line and every node answered with the expected irHash; a node that did not answer is never a pass.
 */
export function checkSummary(result) {
  const lines = (result?.nodes ?? []).map((node) => ({
    node: node.node,
    ok: node.ok === true,
    error: node.ok === true ? null : (node.error ?? DIFFERENT_HASH),
  }));
  return { ok: lines.length > 0 && lines.every((line) => line.ok), lines };
}

/** Tally the node verdicts of several model checks: { checked, passed, failed }. */
export function tally(summaries) {
  const passed = summaries.filter((summary) => summary.ok).length;
  return { checked: summaries.length, passed, failed: summaries.length - passed };
}

/**
 * One binary neuron: inputs and weights are +1 or -1, the sum of the products is the dot product, and the output
 * is +1 when it reaches the threshold. `matches` is how many positions agree (popcount of XNOR): sum = 2·matches − n.
 */
export function binaryNeuron(inputs, weights, threshold = 0) {
  if (inputs.length !== weights.length) throw new RangeError("inputs and weights differ in length");
  for (const value of [...inputs, ...weights]) {
    if (value !== 1 && value !== -1) throw new RangeError(`not a binary value: ${value}`);
  }
  const products = inputs.map((value, i) => value * weights[i]);
  const sum = products.reduce((total, value) => total + value, 0);
  const matches = products.filter((value) => value === 1).length;
  return { products, sum, matches, output: sum >= threshold ? 1 : -1 };
}

/**
 * What several networks said about one input: `answers` is [{ name, label }] for those that answered (label null
 * for one that did not). Returns how many answered, the label most of them chose, and whether they all chose it.
 * A network that did not answer is not counted as agreeing with anything.
 */
export function agreement(answers) {
  const given = answers.filter((answer) => answer.label !== null && answer.label !== undefined);
  const counts = new Map();
  for (const answer of given) counts.set(answer.label, (counts.get(answer.label) ?? 0) + 1);
  let top = null;
  let best = 0;
  for (const [label, count] of counts) {
    if (count > best) { top = label; best = count; }
  }
  return { asked: answers.length, answered: given.length, label: top, votes: best,
    unanimous: given.length === answers.length && given.length > 0 && counts.size === 1 };
}

/** 1350 → "1,350"; used where Intl may be missing. */
export function withCommas(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Ease-out value of a count-up: 0 at t = 0, `target` at t >= 1. */
export function countAt(target, t) {
  const clamped = Math.min(1, Math.max(0, t));
  return Math.round(target * (1 - (1 - clamped) ** 3));
}

/** "1.05M" for a call whose gas range rounds to one figure, else "1.05M–1.06M". */
export function gasLabel(gas) {
  const low = formatGasShort(gas.min);
  const high = formatGasShort(gas.max);
  return low === high ? high : `${low}–${high}`;
}

/**
 * After a button was disabled while its work ran, give keyboard focus back to it: a disabled button drops focus to the
 * page, so a keyboard user would have to tab from the top again. Takes the button and what was focused before.
 */
export function restoreFocus(button, wasFocused, doc = document) {
  if (wasFocused === button && doc.activeElement === doc.body) button.focus();
}
