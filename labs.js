// The demo wall's two labs: one input, several deployed networks at once. The digit lab sends one handwritten
// digit to five networks, the photo lab one small photo to three. Each network is a contract on BSC testnet; every
// call is a free read-only eth_call to two independent nodes. A network that came from QONNX reads its input
// through a 256-entry table first (input-transform.json), which the page applies exactly as the Python reference
// does. "= reference runtime" is shown only for the embedded test images, whose reference outputs were computed
// offline (references.json); a drawing or an uploaded photo has no reference and says so.

import { GOMOKU, MODELS } from "./config.js";
import { MODEL_LIST } from "./models-data.js";
import { REFERENCES } from "./references-data.js";
import { drawPixels, el } from "./render.js";
import { SAMPLES } from "./samples.js";
import { agreement, gasLabel, restoreFocus } from "./site-logic.js";
import {
  applyInputLut, binarize, cifarFromRGBA, classifyOnChain, fromBase64, inkFromRGBA, mnistFromInk, sameResult,
} from "./vendor/bnnx/index.js";

const NODES = GOMOKU.nodes;
const MAX_UPLOAD_SIDE = 1024;
const say = (texts) => window.siteLang.pick(texts);
const both = (en, zh) => [el("span", { lang: "en", text: en }), el("span", { lang: "zh", text: zh })];

const LABS = {
  digits: {
    samples: "d1-mnist",
    size: [28, 28, 1],
    classes: MODELS["d1-mnist"].classes,
    networks: [
      ["d1-mnist", "binary MLP 784–512–512–10", "二值 MLP 784–512–512–10"],
      ["tutorial-digits", "binary MLP, one hidden layer of 256", "二值 MLP，一个 256 的隐藏层"],
      ["mnist-lfc", "binary MLP, 3 × 1024, 21 chunks", "二值 MLP，3 × 1024，21 个数据块"],
      ["lfc-w1a1-qonnx", "imported: Brevitas LFC, 1-bit", "导入：Brevitas LFC，1 位"],
      ["tfc-w1a2-qonnx", "imported: Brevitas TFC, 2-bit activations", "导入：Brevitas TFC，2 位激活"],
    ],
  },
  photos: {
    samples: "d2-cifar10",
    size: [32, 32, 3],
    classes: MODELS["d2-cifar10"].classes,
    networks: [
      ["d2-cifar10", "6 binary convolutions + 3 dense", "6 层二值卷积 + 3 层全连接"],
      ["cifar10-mb", "int8 convolutions, 4-bit activations", "int8 卷积，4 位激活"],
      ["cnv-w1a1-qonnx", "imported: Brevitas CNV, 1-bit", "导入：Brevitas CNV，1 位"],
    ],
  },
};

/** An accessible name in both languages: set now and again whenever the visitor switches language. */
function named(node, texts) {
  const apply = () => node.setAttribute("aria-label", say(texts));
  apply();
  document.addEventListener("sitelangchange", apply);
  return node;
}

const byName = new Map(MODEL_LIST.map((model) => [model.name, model]));

/** The bytes a network reads for these raw pixels: through its input-transform table when it has one. */
export function networkInput(name, pixels) {
  const lut = REFERENCES.models[name]?.inputTransform;
  return lut ? applyInputLut(pixels, lut) : pixels;
}

function networkCard(lab, name, architecture, architectureZh) {
  const model = byName.get(name);
  const body = el("div", { class: "net-body" });
  const card = el("li", { class: "net", "data-state": "idle", id: `net-${name}` },
    el("div", { class: "net-head" },
      el("h4", { class: "net-name" }, ...both(model.title.en, model.title.zh)),
      ...(model.kind === "imported" ? [el("span", { class: "chip" }, ...both("imported", "导入"))] : [])),
    el("p", { class: "net-arch" }, ...both(architecture, architectureZh)),
    body,
    el("p", { class: "net-meta", text: `${gasLabel(model.gas)} gas${model.accuracy ? ` · ${model.accuracy.text}` : ""}` }));
  return { card, body, model };
}

function showIdle(entry) {
  entry.card.dataset.state = "idle";
  entry.body.replaceChildren(el("p", { class: "net-idle" }, ...both("waiting for an input", "等待输入")));
}

function showCalling(entry) {
  entry.card.dataset.state = "calling";
  entry.body.replaceChildren(el("div", { class: "net-wait" }, el("span", { class: "net-spinner" }),
    el("span", {}, ...both("asking two nodes…", "正在询问两个节点……"))));
}

function showResult(entry, lab, outcome, reference) {
  const answered = outcome.calls.filter((call) => call.ok);
  if (!answered.length) {
    entry.card.dataset.state = "error";
    entry.body.replaceChildren(el("p", { class: "net-error", text: outcome.calls.map((call) => `${call.node}: ${call.error}`).join(" · ") }));
    return null;
  }
  const first = answered[0];
  const stamps = [el("span", { class: outcome.agree ? "stamp" : "stamp bad" }, ...(outcome.agree
    ? both(`${outcome.total}/${outcome.total} nodes identical`, `${outcome.total}/${outcome.total} 个节点一致`)
    : both(`${answered.length}/${outcome.total} · nodes differ or missing`, `${answered.length}/${outcome.total} · 节点不一致或缺少回答`)))];
  if (reference) {
    const match = answered.every((call) => sameResult(call, reference));
    stamps.push(el("span", { class: match ? "stamp" : "stamp bad" }, ...(match
      ? both("= reference runtime", "= 参考程序") : both("≠ reference runtime", "≠ 参考程序"))));
  } else {
    stamps.push(el("span", { class: "stamp quiet" }, ...both("no reference for your own input", "你自己的输入没有参考结果")));
  }
  const times = answered.map((call) => `${call.node} ${call.ms} ms`).join(" · ");
  entry.card.dataset.state = outcome.agree ? "done" : "warn";
  entry.body.replaceChildren(
    el("p", { class: "net-class", text: lab.classes[first.label] ?? String(first.label) }),
    el("div", { class: "stamps" }, ...stamps),
    el("p", { class: "net-times", text: times }));
  // A network counts as having answered only when every node did and all of them said the same thing.
  return outcome.agree ? first.label : null;
}

function summary(lab, labels, total) {
  const result = agreement(labels.map((label, i) => ({ name: i, label })));
  if (!result.answered) return say({ en: "No network was confirmed by both nodes. Check your connection and try again.", zh: "没有网络被两个节点共同确认。检查网络后再试。" });
  const name = lab.classes[result.label] ?? String(result.label);
  if (result.unanimous) return say({ en: `All ${total} networks say “${name}”.`, zh: `${total} 个网络全都认为是“${name}”。` });
  return say({ en: `${result.votes} of ${total} networks say “${name}”${result.answered < total ? `; ${total - result.answered} not confirmed by both nodes` : "; the others disagree"}.`,
    zh: `${total} 个网络中有 ${result.votes} 个认为是“${name}”${result.answered < total ? `，${total - result.answered} 个没有被两个节点共同确认` : "，其余意见不同"}。` });
}

/** Run every network of a lab on one set of raw pixels; cards update as each network answers. */
async function runAll(lab, entries, pixels, referenceIndex, status, current) {
  entries.forEach(showCalling);
  status.textContent = say({ en: `Asking ${entries.length} contracts on BSC testnet…`, zh: `正在询问 BSC 测试网上的 ${entries.length} 个合约……` });
  const labels = await Promise.all(entries.map(async (entry) => {
    let outcome;
    try {
      outcome = await classifyOnChain({ address: entry.model.address, pixels: networkInput(entry.model.name, pixels), nodes: NODES });
    } catch (error) {
      outcome = { calls: [{ node: "page", ok: false, error: String(error.message || error).slice(0, 160), ms: 0 }], agree: false, total: 1 };
    }
    if (!current()) return null; // the input changed while the nodes were answering: these answers belong to an older input
    const reference = referenceIndex === null ? null : REFERENCES.models[entry.model.name]?.references[referenceIndex] ?? null;
    return showResult(entry, lab, outcome, reference);
  }));
  if (!current()) return;
  status.textContent = summary(lab, labels, entries.length);
}

// ------------------------------------------------------------------ digit lab

function mountPad(canvas, bitsCanvas, onInk) {
  const context = canvas.getContext("2d");
  let drawing = false;
  let pending = false;
  const blank = () => { context.fillStyle = "#000"; context.fillRect(0, 0, canvas.width, canvas.height); };
  const refresh = () => {
    pending = false;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = mnistFromInk(inkFromRGBA(image.data, canvas.width, canvas.height), canvas.width, canvas.height);
    drawBits(bitsCanvas, binarize(pixels));
    onInk(pixels);
  };
  const point = (event) => {
    const box = canvas.getBoundingClientRect();
    return [(event.clientX - box.left) * (canvas.width / box.width), (event.clientY - box.top) * (canvas.height / box.height)];
  };
  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const [x, y] = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.01, y);
    context.stroke();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const [x, y] = point(event);
    context.lineTo(x, y);
    context.stroke();
    if (!pending) { pending = true; requestAnimationFrame(refresh); }
  });
  const stop = () => { if (drawing) refresh(); drawing = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  context.lineWidth = 20;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#fff";
  blank();
  return {
    clear() { blank(); drawBits(bitsCanvas, null); },
    drawSample(pixels) {
      const small = document.createElement("canvas");
      drawPixels(small, pixels, 28, 28, 1);
      context.imageSmoothingEnabled = true;
      context.drawImage(small, 0, 0, canvas.width, canvas.height);
      drawBits(bitsCanvas, binarize(pixels));
    },
  };
}

function drawBits(canvas, bits) {
  const context = canvas.getContext("2d");
  const style = getComputedStyle(document.documentElement);
  const cell = Math.floor(canvas.width / 28);
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 28 * 28; i++) {
    context.fillStyle = style.getPropertyValue(bits && bits[i] ? "--code-text" : "--bit-off").trim();
    context.beginPath();
    context.roundRect((i % 28) * cell + 1, Math.floor(i / 28) * cell + 1, cell - 1, cell - 1, 2);
    context.fill();
  }
}

export function mountDigitLab(root) {
  const lab = LABS.digits;
  const entries = lab.networks.map(([name, architecture, zh]) => networkCard(lab, name, architecture, zh));
  const status = el("p", { class: "lab-status", "aria-live": "polite" });
  const pad = named(el("canvas", { class: "pad", width: "280", height: "280", role: "img" }),
    { en: "Drawing pad: draw one digit with a mouse, pen or finger, or pick a test digit",
      zh: "手写板：用鼠标、笔或手指画一个数字，或者选一个测试数字" });
  const bits = named(el("canvas", { class: "bits", width: "196", height: "196", role: "img" }),
    { en: "The 784 bits the first layer sees", zh: "第一层看到的 784 个二进制位" });
  const thumbs = el("div", { class: "thumbs" });
  const state = { pixels: null, index: null };
  const ticket = { id: 0 }; // bumped whenever the input changes, so answers to an older input are dropped
  const run = el("button", { type: "button", class: "primary" }, ...both(`Run on all ${lab.networks.length} networks`, `发给全部 ${lab.networks.length} 个网络`));
  const clear = el("button", { type: "button" }, ...both("Clear", "清除"));

  /** The input changed: the cards no longer describe it, so they go back to waiting. */
  function reset() {
    ticket.id += 1;
    if (entries.some((entry) => entry.card.dataset.state !== "idle")) entries.forEach(showIdle);
    status.textContent = "";
  }
  const surface = mountPad(pad, bits, (pixels) => { state.pixels = pixels; state.index = null; markPicked(null); reset(); });
  const buttons = SAMPLES[lab.samples].samples.map((sample, index) => {
    const pixels = fromBase64(sample.pixels);
    const canvas = document.createElement("canvas");
    drawPixels(canvas, pixels, 28, 28, 1);
    const button = named(el("button", { type: "button", class: "thumb", "aria-pressed": "false" }, canvas),
      { en: `Test digit #${sample.testIndex}, a ${sample.trueLabel}`, zh: `测试数字 #${sample.testIndex}，真实是 ${sample.trueLabel}` });
    button.addEventListener("click", () => {
      state.pixels = pixels;
      state.index = index;
      surface.drawSample(pixels);
      markPicked(index);
      reset();
    });
    return button;
  });
  function markPicked(index) { buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index))); }
  thumbs.replaceChildren(...buttons);
  clear.addEventListener("click", () => {
    surface.clear();
    state.pixels = null;
    state.index = null;
    markPicked(null);
    entries.forEach(showIdle);
    reset();
  });
  run.addEventListener("click", async () => {
    if (!state.pixels || state.pixels.every((v) => v === 0)) {
      status.textContent = say({ en: "Draw a digit first, or pick a test digit.", zh: "先画一个数字，或者选一个测试数字。" });
      return;
    }
    const mine = ++ticket.id;
    const focused = document.activeElement;
    run.disabled = true;
    try { await runAll(lab, entries, state.pixels, state.index, status, () => ticket.id === mine); } finally {
      run.disabled = false;
      restoreFocus(run, focused);
    }
  });

  entries.forEach(showIdle);
  surface.clear();
  buttons[0].click();
  root.replaceChildren(
    el("div", { class: "lab-input" },
      el("div", { class: "pads" }, el("figure", {}, pad, el("figcaption", {}, ...both("draw a digit", "画一个数字"))),
        el("figure", {}, bits, el("figcaption", {}, ...both("what the first layer sees", "第一层看到的"))) ),
      el("p", { class: "picker-label" }, ...both("or pick a test digit", "或者选一个测试数字")),
      thumbs,
      el("div", { class: "controls" }, run, clear),
      status),
    el("ul", { class: "nets" }, ...entries.map((entry) => entry.card)));
}

// ------------------------------------------------------------------ photo lab

export function mountPhotoLab(root) {
  const lab = LABS.photos;
  const entries = lab.networks.map(([name, architecture, zh]) => networkCard(lab, name, architecture, zh));
  const status = el("p", { class: "lab-status", "aria-live": "polite" });
  const preview = named(el("canvas", { class: "pad pixelated", width: "32", height: "32", role: "img" }),
    { en: "The 32 by 32 photo that will be classified", zh: "将被分类的 32 × 32 照片" });
  const caption = el("figcaption", {});
  const thumbs = el("div", { class: "thumbs" });
  const state = { pixels: null, index: null, caption: null };
  const ticket = { id: 0 };
  const showCaption = () => { caption.textContent = state.caption ? say(state.caption) : ""; };
  document.addEventListener("sitelangchange", showCaption);
  const run = el("button", { type: "button", class: "primary" }, ...both(`Run on all ${lab.networks.length} networks`, `发给全部 ${lab.networks.length} 个网络`));
  const file = el("input", { type: "file", accept: "image/*" });
  const upload = el("label", { class: "upload" }, file, el("span", {}, ...both("Upload your own", "上传自己的图片")));

  function select(pixels, index, texts) {
    ticket.id += 1;
    state.pixels = pixels;
    state.index = index;
    state.caption = texts;
    drawPixels(preview, pixels, 32, 32, 3);
    showCaption();
    buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    entries.forEach(showIdle);
    status.textContent = "";
  }
  const buttons = SAMPLES[lab.samples].samples.map((sample, index) => {
    const pixels = fromBase64(sample.pixels);
    const canvas = document.createElement("canvas");
    drawPixels(canvas, pixels, 32, 32, 3);
    const name = lab.classes[sample.trueLabel];
    const button = named(el("button", { type: "button", class: "thumb", "aria-pressed": "false" }, canvas),
      { en: `Test photo #${sample.testIndex}: ${name}`, zh: `测试照片 #${sample.testIndex}：${name}` });
    button.addEventListener("click", () => select(pixels, index, {
      en: `CIFAR-10 test photo #${sample.testIndex} · true label ${name}`,
      zh: `CIFAR-10 测试照片 #${sample.testIndex} · 真实标签 ${name}` }));
    return button;
  });
  thumbs.replaceChildren(...buttons);

  file.addEventListener("change", async (event) => {
    const chosen = event.target.files[0];
    event.target.value = "";
    if (!chosen) return;
    try {
      const bitmap = await createImageBitmap(chosen);
      const scale = Math.min(1, MAX_UPLOAD_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      select(cifarFromRGBA(image.data, canvas.width, canvas.height), null, { en: "Your image, shrunk to 32 × 32", zh: "你的图片，缩成 32 × 32" });
    } catch {
      status.textContent = say({ en: "This file could not be read as an image. Try a PNG or JPEG.", zh: "这个文件读不成图片。换一个 PNG 或 JPEG。" });
    }
  });

  run.addEventListener("click", async () => {
    const mine = ++ticket.id;
    const focused = document.activeElement;
    run.disabled = true;
    try { await runAll(lab, entries, state.pixels, state.index, status, () => ticket.id === mine); } finally {
      run.disabled = false;
      restoreFocus(run, focused);
    }
  });

  entries.forEach(showIdle);
  buttons[0].click();
  root.replaceChildren(
    el("div", { class: "lab-input" },
      el("div", { class: "pads" }, el("figure", {}, preview, caption)),
      el("p", { class: "picker-label" }, ...both("CIFAR-10 test photos", "CIFAR-10 测试照片")),
      thumbs,
      el("div", { class: "controls" }, run, upload),
      status),
    el("ul", { class: "nets" }, ...entries.map((entry) => entry.card)));
}
