// DOM rendering for the demo. Every dynamic string goes through textContent (node errors are untrusted text).

import { sameResult } from "./vendor/bnnx/index.js";
import { NETWORK, TX_GAS_CAP } from "./config.js";

const number = new Intl.NumberFormat("en-US");

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

export function formatGas(gas) {
  return gas.min === gas.max ? number.format(gas.min) : `${number.format(gas.min)}–${number.format(gas.max)}`;
}

export function showMessage(container, text, kind = "placeholder") {
  container.replaceChildren(el("p", { class: kind === "error" ? "status error" : kind, text }));
}

/** Draw uint8 HWC pixels (1 or 3 channels) onto a canvas at their native size. */
export function drawPixels(canvas, pixels, width, height, channels) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * channels];
    image.data[4 * i] = r;
    image.data[4 * i + 1] = channels === 3 ? pixels[i * 3 + 1] : r;
    image.data[4 * i + 2] = channels === 3 ? pixels[i * 3 + 2] : r;
    image.data[4 * i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

/** 28 x 28 bit grid: ink squares for 1, pale squares for 0. */
export function drawBits(canvas, bits) {
  const context = canvas.getContext("2d");
  const style = getComputedStyle(document.documentElement);
  const cell = Math.floor(canvas.width / 28);
  context.fillStyle = style.getPropertyValue("--paper").trim();
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 28 * 28; i++) {
    context.fillStyle = style.getPropertyValue(bits && bits[i] ? "--ink" : "--bit-off").trim();
    context.fillRect((i % 28) * cell + 1, Math.floor(i / 28) * cell + 1, cell - 1, cell - 1);
  }
}

function stamps(outcome, answers, reference) {
  const list = [];
  if (outcome.agree) list.push(el("span", { class: "stamp", text: `${outcome.total}/${outcome.total} nodes identical` }));
  else if (answers.length < outcome.total) list.push(el("span", { class: "stamp bad", text: `${answers.length}/${outcome.total} nodes answered` }));
  else list.push(el("span", { class: "stamp bad", text: "Nodes disagree" }));
  if (reference && answers.length) {
    const match = answers.every((answer) => sameResult(answer, reference));
    list.push(el("span", { class: match ? "stamp" : "stamp bad", text: match ? "= reference runtime" : "≠ reference runtime" }));
  } else {
    list.push(el("span", { class: "stamp quiet", text: "No reference output for your own input" }));
  }
  return el("div", { class: "stamps" }, ...list);
}

function diffTable(model, outcome, reference, label) {
  const [first, second] = outcome.calls;
  const scores = (call) => (call && call.ok ? call.scores : null);
  const base = scores(first) || scores(second) || [];
  const low = Math.min(...base);
  const span = Math.max(...base) - low || 1;
  const head = el("tr", {},
    el("th", { text: "class" }),
    el("th", { text: `${first.node} · ${first.ms} ms` }),
    el("th", { text: "" }),
    el("th", { text: second ? `${second.node} · ${second.ms} ms` : "" }),
    ...(reference ? [el("th", { text: "reference" })] : []),
    el("th", { class: "bar", text: "" }));
  const rows = model.classes.map((name, i) => {
    const a = scores(first)?.[i];
    const b = scores(second)?.[i];
    const both = a !== undefined && b !== undefined; // a node that did not answer is not a disagreement
    const same = both && a === b;
    const width = base.length ? ((base[i] - low) / span) * 100 : 0;
    return el("tr", { class: i === label ? "top" : "" },
      el("td", { text: name }),
      el("td", { text: a === undefined ? "—" : String(a) }),
      el("td", { class: same ? "eq" : both ? "ne" : "na", text: same ? "=" : both ? "≠" : "" }),
      el("td", { text: b === undefined ? "—" : String(b) }),
      ...(reference ? [el("td", { text: String(reference.scores[i]) })] : []),
      el("td", { class: "bar" }, el("span", { style: `width:${width.toFixed(1)}%` })));
  });
  // The wrapper scrolls if long node names still do not fit, so the page itself never scrolls sideways.
  const table = el("table", { class: "diff" }, el("thead", {}, head), el("tbody", {}, ...rows));
  return el("div", { class: "diff-wrap" }, table);
}

/** Render one classify outcome: verdict, stamps, the per-class diff of both nodes, errors and the cost line. */
export function showResult(container, model, outcome, { reference = null, note = "" } = {}) {
  const answers = outcome.calls.filter((call) => call.ok);
  if (!answers.length) {
    const reasons = outcome.calls.map((call) => `${call.node}: ${call.error}`).join("; ");
    showMessage(container, `Neither node answered (${reasons}). Check your connection and try again.`, "error");
    return;
  }
  const label = answers[0].label;
  const verdict = el("div", { class: "verdict" },
    el("span", { class: "verdict-label", text: "Prediction" }),
    el("span", { class: "verdict-value", text: model.classes[label] ?? String(label) }),
    el("span", { class: "verdict-note", text: note }));
  const errors = outcome.calls.filter((call) => !call.ok)
    .map((call) => el("p", { class: "node-error", text: `${call.node} did not answer: ${call.error}` }));
  const cap = model.gas.min > TX_GAS_CAP
    ? ` That is more than a whole transaction may use on ${NETWORK.name} (${number.format(TX_GAS_CAP)}), so this model only runs as a read-only call.`
    : "";
  const cost = el("p", { class: "status",
    text: `Cost of one call: about ${formatGas(model.gas)} gas (measured on ${NETWORK.name} for ${model.gas.samples} ` +
      `test images); free to you because eth_call is read-only.${cap}` });
  const block = el("div", { class: "print" }, verdict, stamps(outcome, answers, reference),
    diffTable(model, outcome, reference, label), ...errors, cost);
  container.replaceChildren(block);
}

/** One card per model: address, IR hash, facts, and the on-chain identity check (filled in later). */
export function showFacts(container, models) {
  const cards = Object.entries(models).map(([key, model]) => {
    const identity = el("dd", { id: `identity-${key}`, text: "checking…" });
    const link = el("a", { href: `${NETWORK.explorer}/address/${model.address}`, target: "_blank", rel: "noopener noreferrer",
      text: model.address });
    return el("article", { class: "fact" },
      el("h3", { text: `${model.title} · ${model.dataset}` }),
      el("dl", {},
        el("dt", { text: "contract" }), el("dd", {}, link),
        el("dt", { text: "IR hash" }), el("dd", { text: model.irHash }),
        el("dt", { text: "on chain" }), identity,
        el("dt", { text: "network" }), el("dd", { text: model.architecture }),
        el("dt", { text: "test accuracy" }), el("dd", { text: `${(model.testAccuracy * 100).toFixed(2)}% on 10,000 images` }),
        el("dt", { text: "gas per call" }),
        el("dd", { text: `${formatGas(model.gas)} (measured, ${model.gas.samples} test images)` })));
  });
  container.replaceChildren(...cards);
}

export function showIdentity(key, text, ok) {
  const node = document.getElementById(`identity-${key}`);
  if (node) {
    node.textContent = text;
    node.className = ok ? "check-ok" : "check-bad";
  }
}
