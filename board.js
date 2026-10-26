// A small gomoku board that replays the game recorded on BSC testnet (GomokuGame, 15 transactions, config.js GOMOKU.game).
// The moves are the recorded ones; nothing is simulated. It plays through, rests on the final position, and starts
// again. With prefers-reduced-motion it shows the final position only.

import { GOMOKU } from "./config.js";

const SIZE = 15;
const STEP_MS = 420;
const REST_MS = 3200;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function draw(canvas, moves, count) {
  const context = canvas.getContext("2d");
  const cell = canvas.width / SIZE;
  context.fillStyle = "#d9b97a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#6b5330";
  context.lineWidth = 1;
  for (let i = 0; i < SIZE; i++) {
    const at = (i + 0.5) * cell;
    context.beginPath();
    context.moveTo(0.5 * cell, at);
    context.lineTo(canvas.width - 0.5 * cell, at);
    context.moveTo(at, 0.5 * cell);
    context.lineTo(at, canvas.height - 0.5 * cell);
    context.stroke();
  }
  for (let ply = 0; ply < count; ply++) {
    const point = moves[ply];
    const x = ((point % SIZE) + 0.5) * cell;
    const y = (Math.floor(point / SIZE) + 0.5) * cell;
    context.beginPath();
    context.arc(x, y, cell * 0.42, 0, Math.PI * 2);
    context.fillStyle = ply % 2 === 0 ? "#17191e" : "#f8f8f4"; // black moves first
    context.fill();
    if (ply % 2 === 1) { context.strokeStyle = "#5d636d"; context.stroke(); }
    if (ply === count - 1) {
      context.beginPath();
      context.arc(x, y, cell * 0.14, 0, Math.PI * 2);
      context.fillStyle = css("--code-keyword") || "#00e0e0";
      context.fill();
    }
  }
}

export function mountBoard(canvas, label) {
  const moves = GOMOKU.game.moves;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let shown = moves.length;
  const describe = () => {
    canvas.setAttribute("aria-label", window.siteLang.pick({
      en: "A gomoku board replaying the game recorded on BSC testnet",
      zh: "一块五子棋棋盘，回放 BSC 测试网上记录的那一盘",
    }));
    const count = shown;
    label.textContent = window.siteLang.pick({
      en: `Recorded game on BSC testnet: move ${count} of ${moves.length}`,
      zh: `BSC 测试网上记录的一整盘：第 ${count} 手，共 ${moves.length} 手`,
    });
  };
  const show = (count) => {
    shown = count;
    draw(canvas, moves, count);
    describe();
  };
  document.addEventListener("sitelangchange", describe);
  show(moves.length);
  if (reduced) return;
  let count = 0;
  let timer = null;
  const tick = () => {
    count += 1;
    show(count);
    if (count >= moves.length) { count = 0; timer = setTimeout(tick, REST_MS); } else timer = setTimeout(tick, STEP_MS);
  };
  const watcher = new IntersectionObserver((seen) => {
    const visible = seen.some((item) => item.isIntersecting);
    if (visible && timer === null) { count = 0; show(0); timer = setTimeout(tick, STEP_MS); }
    if (!visible && timer !== null) { clearTimeout(timer); timer = null; show(moves.length); }
  }, { threshold: 0.3 });
  watcher.observe(canvas);
}
