// The models page: one card per deployed model, and a button that asks two nodes whether the contract at that
// address is the model whose hash we publish.

import { GOMOKU, NETWORK } from "./config.js";
import { MODEL_LIST } from "./models-data.js";
import { el } from "./render.js";
import { DIFFERENT_HASH, checkSummary, gasLabel, restoreFocus, shortHex, tally } from "./site-logic.js";
import { checkModelInfo } from "./vendor/bnnx/index.js";

const NODES = GOMOKU.nodes;

/** Both languages as sibling spans: the stylesheet shows the one the page is in. */
function both(texts) {
  return [el("span", { lang: "en", text: texts.en }), el("span", { lang: "zh", text: texts.zh })];
}

function metric(label, value, small) {
  return el("div", {},
    el("dt", {}, ...both(label)),
    el("dd", {}, value, ...(small ? [el("small", {}, ...both(small))] : [])));
}

function card(model) {
  const result = el("ul", { class: "check-lines", id: `check-${model.name}`, "aria-live": "polite" });
  const button = el("button", { type: "button", class: "btn quiet", id: `check-btn-${model.name}` },
    ...both({ en: "Check on chain", zh: "上链核对" }));
  button.addEventListener("click", () => checkOne(model));
  const accuracy = model.accuracy
    ? metric({ en: "accuracy", zh: "准确率" }, model.accuracy.text, model.accuracy.what)
    : metric({ en: "accuracy", zh: "准确率" }, "—", { en: "not reported here", zh: "这里没有给出" });
  const link = el("a", { href: `${NETWORK.explorer}/address/${model.address}`, target: "_blank", rel: "noopener noreferrer",
    text: model.address });
  return el("li", { class: "model", id: model.name },
    el("div", { class: "model-head" },
      el("h3", {}, ...both(model.title)),
      el("span", { class: "kind" }, ...both(model.kind === "imported"
        ? { en: "imported from QONNX", zh: "从 QONNX 导入" } : { en: "trained with BNNX", zh: "用 BNNX 训练" }))),
    el("p", { class: "desc" }, ...both(model.desc)),
    el("dl", { class: "metrics" },
      accuracy,
      metric({ en: "gas per call", zh: "每次调用 gas" }, gasLabel(model.gas),
        { en: `measured, ${model.gas.samples} calls`, zh: `实测，${model.gas.samples} 次调用` }),
      metric({ en: "checked against the reference program", zh: "与参考程序比对" },
        `${model.checked.inputs} / ${model.checked.mismatches}`,
        { en: `inputs / differences, ${model.checked.date}`, zh: `输入数 / 差异数，${model.checked.date}` })),
    el("details", {},
      el("summary", {}, ...both({ en: "address and hash", zh: "地址和哈希" })),
      el("dl", {},
        el("dt", { text: "contract" }), el("dd", {}, link),
        el("dt", { text: "IR hash" }), el("dd", { text: model.irHash }),
        el("dt", { text: "dispatcher" }), el("dd", { text: model.dispatcher ?? "BnnxModel (v0 runner)" }),
        el("dt", { text: "nodes" }), el("dd", { text: model.checked.hosts.join(", ") }),
        el("dt", { text: "block" }), el("dd", { text: String(model.checked.block) }))),
    el("div", { class: "model-check" }, button, result));
}

function showCheck(model, summary) {
  const list = document.getElementById(`check-${model.name}`);
  const lines = summary.lines.map((line) => el("li", { class: line.ok ? "check-ok" : "check-bad",
    text: line.ok ? window.siteLang.pick({ en: `${line.node}: irHash ${shortHex(model.irHash)} confirmed`,
      zh: `${line.node}：irHash ${shortHex(model.irHash)} 已确认` })
      : `${line.node}: ${line.error === DIFFERENT_HASH
        ? window.siteLang.pick({ en: DIFFERENT_HASH, zh: "回答的 irHash 不同" }) : line.error}` }));
  list.replaceChildren(...lines);
}

async function checkOne(model) {
  const button = document.getElementById(`check-btn-${model.name}`);
  const focused = document.activeElement;
  button.disabled = true;
  try {
    const result = await checkModelInfo({ address: model.address, expectedIrHash: model.irHash, nodes: NODES });
    const summary = checkSummary(result);
    showCheck(model, summary);
    return summary;
  } finally {
    button.disabled = false;
    restoreFocus(button, focused);
  }
}

async function checkAll() {
  const button = document.getElementById("check-all");
  const summaryNode = document.getElementById("check-summary");
  const focused = document.activeElement;
  const list = document.getElementById("models");
  button.disabled = true;
  list.setAttribute("aria-busy", "true"); // fourteen result lists change at once: announce the one summary instead
  summaryNode.textContent = window.siteLang.pick({ en: "Asking the nodes…", zh: "正在询问节点……" });
  try {
    const summaries = await Promise.all(MODEL_LIST.map((model) => checkOne(model)));
    const { checked, passed, failed } = tally(summaries);
    summaryNode.textContent = window.siteLang.pick({
      en: `${passed} of ${checked} contracts confirmed by both nodes${failed ? `; ${failed} not confirmed` : ""}.`,
      zh: `${checked} 个合约中 ${passed} 个被两个节点确认${failed ? `，${failed} 个未确认` : ""}。`,
    });
  } finally {
    list.removeAttribute("aria-busy");
    button.disabled = false;
    restoreFocus(button, focused);
  }
}

document.getElementById("models").replaceChildren(...MODEL_LIST.map(card));
document.getElementById("check-all").addEventListener("click", checkAll);
