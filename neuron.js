// A binary neuron you can play with: eight inputs and eight weights, each +1 or -1. The neuron multiplies them,
// adds the products and outputs +1 when the sum reaches zero. This is the whole arithmetic of a binarised layer,
// and why it needs only integers. Everything runs in the page; nothing is sent anywhere.

import { el } from "./render.js";
import { binaryNeuron } from "./site-logic.js";

const SIZE = 8;
const START_INPUTS = [1, -1, 1, 1, -1, -1, 1, -1];
const START_WEIGHTS = [1, 1, -1, 1, -1, 1, 1, -1];

const symbol = (value) => (value === 1 ? "+1" : "−1");
const say = (texts) => window.siteLang.pick(texts);

function toggleRow(values, label, onChange) { // label() is read at every repaint, so a language switch reaches the names
  const buttons = values.map((_, i) => el("button", { type: "button", class: "bit", "aria-pressed": "true" }));
  const paint = () => buttons.forEach((button, i) => {
    button.textContent = symbol(values[i]);
    button.setAttribute("aria-pressed", String(values[i] === 1));
    button.setAttribute("aria-label", `${label()} ${i + 1}: ${symbol(values[i])}`);
  });
  buttons.forEach((button, i) => button.addEventListener("click", () => {
    values[i] = -values[i];
    paint();
    onChange();
  }));
  paint();
  return { buttons, paint };
}

export function mountNeuron(root) {
  const inputs = [...START_INPUTS];
  const weights = [...START_WEIGHTS];
  const productCells = Array.from({ length: SIZE }, () => el("span", { class: "product" }));
  const readout = el("p", { class: "neuron-readout", "aria-live": "polite" });

  const update = () => {
    const result = binaryNeuron(inputs, weights, 0);
    result.products.forEach((value, i) => {
      productCells[i].textContent = symbol(value);
      productCells[i].classList.toggle("match", value === 1);
    });
    readout.textContent = say({
      en: `${result.matches} of ${SIZE} agree, so the sum is 2 × ${result.matches} − ${SIZE} = ${result.sum}. ` +
        `The output is ${symbol(result.output)}.`,
      zh: `${SIZE} 个里有 ${result.matches} 个相同，所以和是 2 × ${result.matches} − ${SIZE} = ${result.sum}。输出是 ${symbol(result.output)}。`,
    });
  };

  const inputRow = toggleRow(inputs, () => say({ en: "Input", zh: "输入" }), update);
  const weightRow = toggleRow(weights, () => say({ en: "Weight", zh: "权重" }), update);
  const labelled = (en, zh, nodes) => el("div", { class: "neuron-row" },
    el("span", { class: "neuron-label" }, el("span", { lang: "en", text: en }), el("span", { lang: "zh", text: zh })), ...nodes);

  const random = el("button", { type: "button" }, el("span", { lang: "en", text: "Shuffle" }), el("span", { lang: "zh", text: "随机" }));
  random.addEventListener("click", () => {
    for (const values of [inputs, weights]) values.forEach((_, i) => { values[i] = Math.random() < 0.5 ? 1 : -1; });
    inputRow.paint();
    weightRow.paint();
    update();
  });

  root.replaceChildren(
    labelled("inputs", "输入", inputRow.buttons),
    labelled("weights", "权重", weightRow.buttons),
    labelled("products", "相乘", productCells),
    readout,
    el("div", { class: "controls" }, random));
  update();
  document.addEventListener("sitelangchange", () => {
    update();
    inputRow.paint();
    weightRow.paint();
  });
}
