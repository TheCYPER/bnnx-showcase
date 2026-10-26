// The hero window: a real call, typed out like a terminal. One digit's 784 bits are scanned row by row while an
// eth_call goes to two nodes; what is printed afterwards is what the nodes answered, nothing else. With
// prefers-reduced-motion the typing and the scan are skipped and the result simply appears.

import { GOMOKU, MODELS } from "./config.js";
import { el } from "./render.js";
import { SAMPLES } from "./samples.js";
import { formatGasShort, restoreFocus, scanRows, shortHex, withCommas } from "./site-logic.js";
import { binarize, classifyOnChain, fromBase64, sameResult } from "./vendor/bnnx/index.js";

const MODEL = MODELS["d1-mnist"];
const SAMPLE_LIST = SAMPLES["d1-mnist"].samples;
const NODES = GOMOKU.nodes; // the two nodes that answered from the most networks (see config.js)
const CELL = 11;
const SCAN_MS = 800;
const TYPE_MS = 16;

const $ = (id) => document.getElementById(id);
const say = (texts) => window.siteLang.pick(texts);
const state = { index: 0, running: false };

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function drawScan(canvas, bits, scanned) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 28 * 28; i++) {
    const row = Math.floor(i / 28);
    const x = (i % 28) * CELL;
    const y = row * CELL;
    context.fillStyle = bits[i] ? css(row < scanned ? "--code-keyword" : "--code-text") : css("--bit-off");
    context.beginPath();
    context.roundRect(x + 1, y + 1, CELL - 2, CELL - 2, 3);
    context.fill();
  }
  if (scanned >= 0 && scanned < 28) {
    context.fillStyle = "rgba(0, 224, 224, 0.22)";
    context.fillRect(0, scanned * CELL, canvas.width, CELL);
  }
}

function currentSample() {
  return SAMPLE_LIST[state.index % SAMPLE_LIST.length];
}

function currentBits() {
  return binarize(fromBase64(currentSample().pixels));
}

function showSample() {
  drawScan($("hero-scan"), currentBits(), 28);
  const sample = currentSample();
  $("hero-scan").setAttribute("aria-label", say({
    en: "The 28 by 28 bits of a handwritten test digit, as the contract's first layer sees them",
    zh: "一个手写测试数字的 28 × 28 个二进制位，也就是合约第一层看到的样子",
  }));
  $("hero-note").textContent = say({
    en: `MNIST test image #${sample.testIndex}. The grid is the 784 bits the contract's first layer sees.`,
    zh: `MNIST 测试图 #${sample.testIndex}。网格是合约第一层看到的 784 个二进制位。`,
  });
}

function scan(canvas, bits) {
  if (reduced()) return Promise.resolve();
  return new Promise((resolve) => {
    const started = performance.now();
    const step = (now) => {
      const rows = scanRows(now - started, SCAN_MS, 28);
      drawScan(canvas, bits, rows);
      if (rows >= 28) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** One terminal row built from [type, text] parts; the parts are typed one character at a time. */
async function typeRow(term, parts) {
  const row = el("div", { class: "term-row" });
  term.append(row);
  for (const [type, text] of parts) {
    const span = el("span", type ? { class: `tk-${type}` } : {});
    row.append(span);
    if (reduced()) { span.textContent = text; continue; }
    for (const char of text) {
      span.textContent += char;
      await pause(TYPE_MS);
    }
  }
  return row;
}

function printRow(term, parts) {
  const row = el("div", { class: "term-row" });
  for (const [type, text] of parts) row.append(el("span", type ? { class: `tk-${type}`, text } : { text }));
  term.append(row);
  return row;
}

function scoreParts(scores, label) {
  return scores.flatMap((score, i) => [[i === label ? "f" : null, String(score)], [null, " "]]).slice(0, -1);
}

async function run() {
  if (state.running) return;
  state.running = true;
  const buttons = [$("hero-run"), $("hero-next")];
  const focused = document.activeElement;
  buttons.forEach((button) => { button.disabled = true; });
  const term = $("hero-term");
  term.replaceChildren();
  term.setAttribute("aria-busy", "true"); // typed one character at a time: announce the finished lines, not the typing
  const sample = currentSample();
  const bits = currentBits();
  try {
    const request = typeRow(term, [["c", "$ "], ["k", "eth_call"], [null, "  "], ["s", shortHex(MODEL.address, 8, 4)],
      [null, "  classify("], ["n", "784"], [null, " bytes)"]]);
    const call = classifyOnChain({ address: MODEL.address, pixels: fromBase64(sample.pixels), nodes: NODES });
    const [outcome] = await Promise.all([call, request, scan($("hero-scan"), bits)]);
    for (const answer of outcome.calls) {
      printRow(term, answer.ok
        ? [["s", "✓ "], [null, answer.node.padEnd(11)], ["c", `${answer.ms} ms`]]
        : [["p", "✗ "], [null, answer.node.padEnd(11)], ["p", answer.error]]);
    }
    const answered = outcome.calls.filter((answer) => answer.ok);
    if (answered.length) {
      const first = answered[0];
      printRow(term, [["c", "scores  "], ...scoreParts(first.scores, first.label)]);
      printRow(term, [["c", "class   "], ["f", MODEL.classes[first.label] ?? String(first.label)],
        ["c", `   (true label ${sample.trueLabel})`]]);
      const matches = answered.every((answer) => sameResult(answer, sample.reference));
      printRow(term, outcome.agree
        ? [["s", `✓ ${outcome.total}/${outcome.total} nodes identical`], ...(matches ? [["s", "  ✓ = reference runtime"]] : [["p", "  ✗ differs from reference runtime"]])]
        : [["p", `✗ ${answered.length}/${outcome.total} nodes answered, or they differ`]]);
      printRow(term, [["c", "gas     "], ["n", `${withCommas(MODEL.gas.min)}–${withCommas(MODEL.gas.max)}`],
        ["c", `  (${formatGasShort(MODEL.gas.max)}, measured; the call is free)`]]);
    } else {
      printRow(term, [["p", say({ en: "Neither node answered. Offline reference, not from the chain:",
        zh: "两个节点都没有回答。下面是离线参考结果，不是链上返回的：" })]]);
      printRow(term, [["c", "scores  "], ...scoreParts(sample.reference.scores, sample.reference.label)]);
    }
  } catch (error) {
    // a call that failed before any node answered: say so; never leave an empty terminal that looks like success
    printRow(term, [["p", `✗ ${String(error.message || error).slice(0, 160)}`]]);
  } finally {
    term.removeAttribute("aria-busy");
    drawScan($("hero-scan"), bits, 28);
    state.running = false;
    buttons.forEach((button) => { button.disabled = false; });
    // A disabled button drops keyboard focus; give it back so keyboard users stay where they were.
    if (buttons.includes(focused)) restoreFocus(focused, focused);
  }
}

function next() {
  if (state.running) return;
  state.index += 1;
  showSample();
  run();
}

export function mountHero() {
  showSample();
  $("hero-run").addEventListener("click", run);
  $("hero-next").addEventListener("click", next);
  document.addEventListener("sitelangchange", () => { if (!state.running) showSample(); });
  setTimeout(run, 600); // the first call starts by itself: the page is the demo
}
