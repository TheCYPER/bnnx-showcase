// Demo wiring: drawing pad, photo picker, calls to both nodes, rendering.

import { MODELS, NETWORK } from "./config.js";
import * as render from "./render.js";
import { SAMPLES } from "./samples.js";
import {
  binarize, cifarFromRGBA, classifyOnChain, fromBase64, inkFromRGBA, mnistFromInk, readModelInfo,
} from "./vendor/bnnx/index.js";

const $ = (id) => document.getElementById(id);
const MAX_UPLOAD_SIDE = 1024;

const digits = { key: "d1-mnist", model: MODELS["d1-mnist"], pixels: null, reference: null, note: "", next: 0 };
const photos = { key: "d2-cifar10", model: MODELS["d2-cifar10"], pixels: null, reference: null, note: "" };

function specLine(model) {
  return `${model.dataset} · ${model.architecture} · ${(model.testAccuracy * 100).toFixed(2)}% on the test set · ` +
    `${render.formatGas(model.gas)} gas per call`;
}

async function classify(bench, output, buttons) {
  // Take the input together with its reference and note now: the photo picker and the drawing pad stay usable
  // while the nodes answer, and a reference must only ever sit next to the answer for its own test image.
  const { pixels, reference, note } = bench;
  if (!pixels || pixels.every((v) => v === 0)) {
    render.showMessage(output, bench === digits ? "Draw a digit first, or use a test digit." : "Pick a photo first.", "error");
    return;
  }
  const focused = document.activeElement;
  buttons.forEach((button) => { button.disabled = true; });
  render.showMessage(output, `Calling ${NETWORK.nodes.map((n) => n.label).join(" and ")}…`, "status");
  try {
    const outcome = await classifyOnChain({ address: bench.model.address, pixels, nodes: NETWORK.nodes });
    render.showResult(output, bench.model, outcome, { reference, note });
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
    // A disabled button drops keyboard focus; give it back so keyboard users stay where they were.
    if (buttons.includes(focused) && document.activeElement === document.body) focused.focus();
  }
}

// ------------------------------------------------------------------ digits

function setupDigits() {
  const pad = $("d1-pad");
  const bits = $("d1-bits");
  const output = $("d1-out");
  const context = pad.getContext("2d");
  let drawing = false;
  let pending = false;

  const blank = () => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, pad.width, pad.height);
  };
  const refresh = () => {
    pending = false;
    const image = context.getImageData(0, 0, pad.width, pad.height);
    digits.pixels = mnistFromInk(inkFromRGBA(image.data, pad.width, pad.height), pad.width, pad.height);
    render.drawBits(bits, binarize(digits.pixels));
  };
  const point = (event) => {
    const box = pad.getBoundingClientRect();
    return [(event.clientX - box.left) * (pad.width / box.width), (event.clientY - box.top) * (pad.height / box.height)];
  };

  pad.addEventListener("pointerdown", (event) => {
    drawing = true;
    pad.setPointerCapture(event.pointerId);
    digits.reference = null;
    digits.note = "Your drawing";
    const [x, y] = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.01, y);
    context.stroke();
  });
  pad.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const [x, y] = point(event);
    context.lineTo(x, y);
    context.stroke();
    if (!pending) {
      pending = true;
      requestAnimationFrame(refresh);
    }
  });
  const stop = () => {
    if (drawing) refresh();
    drawing = false;
  };
  pad.addEventListener("pointerup", stop);
  pad.addEventListener("pointercancel", stop);

  context.lineWidth = 20;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#fff";
  blank();
  render.drawBits(bits, null);

  $("d1-clear").addEventListener("click", () => {
    blank();
    digits.pixels = null;
    digits.reference = null;
    render.drawBits(bits, null);
    render.showMessage(output, "Draw a digit, then classify it on chain.");
  });

  $("d1-sample").addEventListener("click", () => {
    const samples = SAMPLES[digits.key].samples;
    const sample = samples[digits.next % samples.length];
    digits.next += 1;
    digits.pixels = fromBase64(sample.pixels);
    digits.reference = sample.reference;
    digits.note = `MNIST test image #${sample.testIndex} · true label ${sample.trueLabel}`;
    const small = document.createElement("canvas");
    render.drawPixels(small, digits.pixels, 28, 28, 1);
    context.imageSmoothingEnabled = true;
    context.drawImage(small, 0, 0, pad.width, pad.height);
    render.drawBits(bits, binarize(digits.pixels));
  });

  const buttons = [$("d1-run"), $("d1-sample"), $("d1-clear")];
  $("d1-run").addEventListener("click", () => classify(digits, output, buttons));
  render.showMessage(output, "Draw a digit, then classify it on chain.");
}

// ------------------------------------------------------------------ photos

function selectPhoto(pixels, reference, note, caption) {
  photos.pixels = pixels;
  photos.reference = reference;
  photos.note = note;
  render.drawPixels($("d2-preview"), pixels, 32, 32, 3);
  $("d2-caption").textContent = caption;
}

function setupPhotos() {
  const output = $("d2-out");
  const thumbs = $("d2-thumbs");
  const classes = photos.model.classes;
  const buttons = SAMPLES[photos.key].samples.map((sample) => {
    const pixels = fromBase64(sample.pixels);
    const canvas = document.createElement("canvas");
    render.drawPixels(canvas, pixels, 32, 32, 3);
    const button = render.el("button", { type: "button", class: "thumb", "aria-pressed": "false",
      "aria-label": `Test photo #${sample.testIndex}: ${classes[sample.trueLabel]}` }, canvas);
    button.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", "false"));
      button.setAttribute("aria-pressed", "true");
      selectPhoto(pixels, sample.reference, `CIFAR-10 test image #${sample.testIndex} · true label ${classes[sample.trueLabel]}`,
        `Test photo #${sample.testIndex} (${classes[sample.trueLabel]})`);
    });
    return button;
  });
  thumbs.replaceChildren(...buttons);
  buttons[0].click();

  $("d2-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = ""; // choosing the same file again must fire "change" again
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_UPLOAD_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      buttons.forEach((b) => b.setAttribute("aria-pressed", "false"));
      selectPhoto(cifarFromRGBA(image.data, canvas.width, canvas.height), null, `Your image: ${file.name}`,
        `Your image, shrunk to 32 × 32`);
      render.showMessage(output, "Ready. Classify it on chain.");
    } catch {
      render.showMessage(output, "This file could not be read as an image. Try a PNG or JPEG.", "error");
    }
  });

  $("d2-run").addEventListener("click", () => classify(photos, output, [$("d2-run")]));
  render.showMessage(output, "Pick a photo, then classify it on chain.");
}

// ------------------------------------------------------------------ facts

async function checkIdentity(key, model) {
  const infos = await Promise.allSettled(NETWORK.nodes.map((node) => readModelInfo({ address: model.address, node })));
  const answered = infos.filter((info) => info.status === "fulfilled").map((info) => info.value);
  const matching = answered.filter((info) => info.irHash.toLowerCase() === model.irHash.toLowerCase()).length;
  if (answered.length && matching === answered.length) {
    render.showIdentity(key, `IR hash confirmed by ${matching}/${NETWORK.nodes.length} nodes`, true);
  } else if (!answered.length) {
    render.showIdentity(key, "nodes did not answer; the hash could not be checked", false);
  } else {
    render.showIdentity(key, `IR hash differs on ${answered.length - matching} node(s)`, false);
  }
}

function setupFacts() {
  $("network-name").textContent = NETWORK.name;
  $("chain-id").textContent = String(NETWORK.chainId);
  $("node-hosts").textContent = NETWORK.nodes.map((node) => new URL(node.url).host).join(" and ");
  $("d1-spec").textContent = specLine(digits.model);
  $("d2-spec").textContent = specLine(photos.model);
  render.showFacts($("facts"), MODELS);
  $("cast-command").textContent =
    `cast call ${digits.model.address} "modelInfo()(bytes32,bytes32,uint256,uint256)" --rpc-url ${NETWORK.nodes[0].url}`;
  for (const [key, model] of Object.entries(MODELS)) checkIdentity(key, model);
}

setupFacts();
setupDigits();
setupPhotos();
