// The contract wall: every model deployed on BSC testnet, one tile each. When it scrolls into view each tile asks two
// nodes what the contract at its address says it is (modelInfo()) and compares the irHash with the one published
// here. A tile lights up only when both nodes answered with that hash; a node that does not answer never counts.

import { GOMOKU, NETWORK } from "./config.js";
import { ALL_MODELS } from "./models-data.js";
import { el } from "./render.js";
import { DIFFERENT_HASH, checkSummary, restoreFocus, shortHex, tally } from "./site-logic.js";
import { checkModelInfo } from "./vendor/bnnx/index.js";

const NODES = GOMOKU.nodes;
const say = (texts) => window.siteLang.pick(texts);

function tile(model) {
  const link = el("a", { href: `${NETWORK.explorer}/address/${model.address}`, target: "_blank", rel: "noopener noreferrer",
    text: shortHex(model.address, 8, 4), class: "tile-address" });
  return el("li", { class: "tile", "data-state": "idle", id: `tile-${model.name}` },
    el("span", { class: "tile-dot", "aria-hidden": "true" }),
    el("span", { class: "tile-name", text: model.name }),
    link,
    el("span", { class: "tile-status", text: "" }));
}

function paint(model, summary, ms) {
  const node = document.getElementById(`tile-${model.name}`);
  node.dataset.state = summary.ok ? "ok" : "bad";
  const failed = summary.lines.find((line) => !line.ok);
  const reason = !failed ? say({ en: "no node to ask", zh: "没有可问的节点" })
    : failed.error === DIFFERENT_HASH ? say({ en: "a node answered another irHash", zh: "有节点回答了不同的 irHash" })
      : failed.error;
  node.querySelector(".tile-status").textContent = summary.ok
    ? `${summary.lines.length}/${summary.lines.length} · ${ms} ms`
    : reason;
}

export function mountWall(root, status, again) {
  const tiles = ALL_MODELS.map(tile);
  root.replaceChildren(...tiles);
  let running = false;
  let started = false;

  async function run() {
    if (running) return;
    running = true;
    const focused = document.activeElement;
    again.disabled = true;
    status.textContent = say({ en: `Asking two nodes about ${ALL_MODELS.length} contracts…`, zh: `正在向两个节点询问 ${ALL_MODELS.length} 个合约……` });
    ALL_MODELS.forEach((model) => { document.getElementById(`tile-${model.name}`).dataset.state = "asking"; });
    try {
      const summaries = await Promise.all(ALL_MODELS.map(async (model, i) => {
        await new Promise((resolve) => setTimeout(resolve, i * 70)); // a ripple, not a burst
        const began = performance.now();
        const result = await checkModelInfo({ address: model.address, expectedIrHash: model.irHash, nodes: NODES });
        const summary = checkSummary(result);
        paint(model, summary, Math.round(performance.now() - began));
        return summary;
      }));
      const { checked, passed } = tally(summaries);
      status.textContent = say({
        en: `${passed} of ${checked} contracts confirmed by both nodes.`,
        zh: `${checked} 个合约中 ${passed} 个被两个节点确认。`,
      });
    } finally {
      running = false;
      again.disabled = false;
      restoreFocus(again, focused);
    }
  }

  again.addEventListener("click", run);
  const watcher = new IntersectionObserver((seen) => {
    if (!started && seen.some((item) => item.isIntersecting)) {
      started = true;
      watcher.disconnect();
      run();
    }
  }, { threshold: 0.25 });
  watcher.observe(root);
  return { run };
}
