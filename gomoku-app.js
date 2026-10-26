// The gomoku page: a free game against the on-chain model (read-only calls, two nodes, receipts) and the replay of a
// game played on chain through GomokuGame. Every dynamic string goes through textContent (render.el).

import { GOMOKU, NETWORK } from "./config.js";
import {
  BLACK, CELLS, EMPTY, SIZE, WHITE, encode, newGame, other, pick, play, pointName, replay, toMove,
} from "./gomoku.js";
import { el, formatGas, showMessage } from "./render.js";
import { classifyWithReceipt, nodeLabel, readModelInfo, rpcCall } from "./vendor/bnnx/index.js";

const $ = (id) => document.getElementById(id);
const GAME_SELECTOR = "cddbe729"; // keccak256("game(uint256)")[:4]; tests/test_demo.py checks it
const COLOUR = { [BLACK]: "black", [WHITE]: "white" };
const number = new Intl.NumberFormat("en-US");

// ------------------------------------------------------------------ the board widget

function makeBoard(container, { onPlace = null, label }) {
  const cells = [];
  let focus = Math.floor(CELLS / 2);
  for (let p = 0; p < CELLS; p++) {
    const cell = el("button", { type: "button", class: "cell", tabindex: p === focus ? "0" : "-1",
      "data-point": String(p) });
    cell.addEventListener("click", () => onPlace?.(p));
    cell.addEventListener("keydown", (event) => {
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -SIZE, ArrowDown: SIZE };
      if (event.key in moves) {
        const next = p + moves[event.key];
        const sameRow = Math.floor(next / SIZE) === Math.floor(p / SIZE);
        if (next >= 0 && next < CELLS && (Math.abs(moves[event.key]) === SIZE || sameRow)) moveFocus(next);
        event.preventDefault();
      }
    });
    cells.push(cell);
  }
  function moveFocus(p) {
    cells[focus].tabIndex = -1;
    focus = p;
    cells[p].tabIndex = 0;
    cells[p].focus();
  }
  container.replaceChildren(...cells);
  container.setAttribute("aria-label", label);
  return {
    show(game, { last = null, playable = false } = {}) {
      cells.forEach((cell, p) => {
        const stone = game.cells[p];
        cell.className = `cell${stone === BLACK ? " black" : stone === WHITE ? " white" : ""}${p === last ? " last" : ""}`;
        const what = stone === EMPTY ? "empty" : `${COLOUR[stone]} stone${p === last ? ", last move" : ""}`;
        cell.setAttribute("aria-label", `${pointName(p)}, ${what}`);
        // occupied or not your turn: aria-disabled only, so the arrow keys can still move across stones
        const open = playable && stone === EMPTY;
        cell.setAttribute("aria-disabled", open ? "false" : "true");
        cell.classList.toggle("closed", !open);
      });
    },
  };
}

// ------------------------------------------------------------------ play

const state = { game: newGame(), ai: WHITE, busy: false, moves: [], board: null, stopped: false };

function statusText(game, ai) {
  if (state.stopped) return "Stopped: the AI's move could not be read.";
  if (game.status === "draw") return "Draw: the board is full.";
  if (game.status !== "playing") return COLOUR[ai] === game.status ? "The AI won." : "You won.";
  return toMove(game) === ai ? "The AI is thinking…" : `Your move (${COLOUR[other(ai)]}).`;
}

const receiptUrls = [];

function receiptLink(receipt, n) {
  const blob = new Blob([JSON.stringify(receipt, null, 1) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  receiptUrls.push(url);
  return el("a", { href: url, download: `gomoku-move-${n}-receipt.json`, text: "save receipt" });
}

function showPlay(note = "") {
  const out = $("play-out");
  const last = state.game.moves.at(-1) ?? null;
  state.board.show(state.game, { last, playable: !state.busy && state.game.status === "playing" &&
    toMove(state.game) !== state.ai });
  const rows = state.moves.map((m, i) => el("li", {},
    el("span", { class: "move-point", text: `${i + 1}. AI ${pointName(m.point)}` }),
    el("span", { class: "move-meta", text: ` score ${m.score} · ${m.receipt.nodes.length}/${m.receipt.nodes.length} ` +
      `nodes identical · block ${number.format(m.receipt.block.number)} · ` }),
    receiptLink(m.receipt, i + 1)));
  $("play-announce").textContent = statusText(state.game, state.ai);
  out.replaceChildren(
    el("p", { class: "game-status", text: statusText(state.game, state.ai) }),
    ...(note ? [el("p", { class: "status error", text: note })] : []),
    ...(state.stopped ? [retryButton()] : []),
    el("ol", { class: "move-log" }, ...rows),
    el("p", { class: "status", text: `Each AI move: one classify call, about ${formatGas(GOMOKU.model.gas)} gas ` +
      `(measured on ${NETWORK.name}); free to you because eth_call is read-only. Played through GomokuGame in a ` +
      "transaction, a move costs its sender about 5.5 million gas." }));
}

function retryButton() {
  const button = el("button", { type: "button", text: "Ask the nodes again" });
  button.addEventListener("click", () => { state.stopped = false; aiMove(); });
  return button;
}

async function aiMove() {
  state.busy = true;
  showPlay();
  try {
    const receipt = await classifyWithReceipt({ address: GOMOKU.model.address, pixels: encode(state.game, state.ai),
      nodes: GOMOKU.nodes, lag: GOMOKU.lag });
    if (!receipt.agree) throw new Error("the nodes returned different scores; the move was not played");
    if (receipt.irHash !== GOMOKU.model.irHash) throw new Error(`the contract reports irHash ${receipt.irHash}`);
    const point = pick(receipt.output.scores, state.game);
    state.game = play(state.game, point);
    state.moves = [...state.moves, { point, score: receipt.output.scores[point], receipt }];
    state.busy = false;
    showPlay();
  } catch (error) {
    state.busy = false;
    state.stopped = true;
    showPlay(`The AI could not move: ${String(error.message || error).slice(0, 200)}. Ask the nodes again, or start a ` +
      "new game.");
  }
}

function place(point) {
  if (state.busy || state.game.status !== "playing" || toMove(state.game) === state.ai) return;
  if (state.game.cells[point] !== EMPTY) return;   // the focused cell stays enabled for the keyboard
  state.game = play(state.game, point);
  showPlay();
  if (state.game.status === "playing") aiMove();
}

function start(aiFirst) {
  if (state.busy) return;
  state.game = newGame();
  state.ai = aiFirst ? BLACK : WHITE;
  state.moves = [];
  state.stopped = false;
  receiptUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  showPlay();
  if (aiFirst) aiMove();
}

// ------------------------------------------------------------------ replay of the chain game

function word(data, i) {
  return BigInt("0x" + data.slice(64 * i, 64 * (i + 1)));
}

function decodeGame(hex) {
  const data = hex.slice(2);
  if (data.length < 64 * 5) throw new Error("the node returned no game (no GomokuGame at this address, or no such id)");
  const start = Number(word(data, 3)) / 32;
  const count = Number(word(data, start));
  return { player: "0x" + data.slice(24, 64), aiIsBlack: word(data, 1) === 1n, status: Number(word(data, 2)),
    moves: Array.from({ length: count }, (_, i) => Number(word(data, start + 1 + i))) };
}

async function setUpReplay() {
  const board = makeBoard($("replay-board"), { label: "The recorded game's board" });
  const out = $("replay-out");
  const buttons = ["replay-first", "replay-back", "replay-next", "replay-last"].map($);
  const game = GOMOKU.game;
  board.show(newGame());
  if (!game) {
    buttons.forEach((b) => { b.disabled = true; });
    $("replay-spec").textContent = "not played yet";
    showMessage(out, "The recorded game appears here once GomokuGame is deployed and a whole game is played on " +
      `${NETWORK.name}.`);
    return;
  }
  $("replay-spec").textContent = `GomokuGame ${game.address} · game ${game.id}`;
  let moves;
  try {
    const data = "0x" + GAME_SELECTOR + BigInt(game.id).toString(16).padStart(64, "0");
    const answers = await Promise.all(GOMOKU.nodes.map((n) => rpcCall(n.url, "eth_call",
      [{ to: game.address, data }, "latest"])));
    const read = answers.map(decodeGame);
    const same = read.every((r) => r.moves.join() === game.moves.join() && r.status === game.status &&
      r.aiIsBlack === game.aiIsBlack);
    if (!same) throw new Error("a node returned another game than the recorded one");
    moves = read[0].moves;
  } catch (error) {
    buttons.forEach((b) => { b.disabled = true; });
    showMessage(out, `Could not read game(${game.id}) from both nodes, so the recorded game is not shown: ` +
      `${String(error.message || error).slice(0, 200)}. Reload the page to try again.`, "error");
    return;
  }
  let shown = moves.length;
  const txOf = (ply) => game.transactions.find((t) => t.plies.includes(ply));
  const render = () => {
    const position = replay(moves.slice(0, shown));
    board.show(position, { last: shown ? moves[shown - 1] : null });
    const tx = shown ? txOf(shown - 1) : null;
    const who = shown ? ((shown - 1) % 2 === 0) === game.aiIsBlack ? "AI" : "human" : "";
    out.replaceChildren(
      el("p", { class: "game-status", text: shown ? `Move ${shown} of ${moves.length}: ${who} ` +
        `${pointName(moves[shown - 1])}` : "Start position" }),
      ...(tx ? [el("p", { class: "status" }, el("span", { text: "Transaction " }),
        el("a", { href: `${NETWORK.explorer}/tx/${tx.hash}`, target: "_blank", rel: "noopener noreferrer",
          text: `${tx.hash.slice(0, 10)}…` }),
        el("span", { text: ` · block ${number.format(tx.block)} · ${number.format(tx.gasUsed)} gas` }))] : []),
      el("p", { class: "status", text: `Both nodes return these ${moves.length} stones from game(${game.id}); every AI ` +
        "stone was re-checked with the reference runtime (examples/gomoku/game_chain.py check)." }));
  };
  const step = { "replay-first": () => 0, "replay-back": () => Math.max(0, shown - 1),
    "replay-next": () => Math.min(moves.length, shown + 1), "replay-last": () => moves.length };
  buttons.forEach((b) => b.addEventListener("click", () => { shown = step[b.id](); render(); }));
  render();
}

// ------------------------------------------------------------------ facts

async function showFacts() {
  const model = GOMOKU.model;
  const identity = el("dd", { text: "checking…" });
  const link = (address) => el("a", { href: `${NETWORK.explorer}/address/${address}`, target: "_blank",
    rel: "noopener noreferrer", text: address });
  const cards = [el("article", { class: "fact" },
    el("h3", { text: `The model · ${model.name}` }),
    el("dl", {},
      el("dt", { text: "contract" }), el("dd", {}, link(model.address)),
      el("dt", { text: "IR hash" }), el("dd", { text: model.irHash }),
      el("dt", { text: "on chain" }), identity,
      el("dt", { text: "network" }), el("dd", { text: model.architecture }),
      el("dt", { text: "gas per call" }), el("dd", { text: `${formatGas(model.gas)} (measured, ${model.gas.samples} positions)` })))];
  if (GOMOKU.game) {
    cards.push(el("article", { class: "fact" },
      el("h3", { text: "The game contract · GomokuGame" }),
      el("dl", {},
        el("dt", { text: "contract" }), el("dd", {}, link(GOMOKU.game.address)),
        el("dt", { text: "plays" }), el("dd", { text: "the human stone, then the model's best empty point, in one transaction" }))));
  }
  $("facts").replaceChildren(...cards);
  $("cast-command").textContent = `cast call ${model.address} "modelInfo()(string,bytes32,uint256,uint256)" ` +
    `--rpc-url ${GOMOKU.nodes[0].url}`;
  try {
    const info = await readModelInfo({ address: model.address, node: GOMOKU.nodes[0] });
    const ok = info.irHash === model.irHash && info.inputLength === 2 * CELLS && info.numClasses === CELLS;
    identity.textContent = ok ? `modelInfo() confirms the IR hash (${GOMOKU.nodes[0].label})` :
      `modelInfo() reports ${info.irHash}`;
    identity.className = ok ? "check-ok" : "check-bad";
  } catch (error) {
    identity.textContent = `could not read modelInfo(): ${String(error.message || error).slice(0, 120)}`;
    identity.className = "check-bad";
  }
}

// ------------------------------------------------------------------ start

$("network-name").textContent = NETWORK.name;
$("node-hosts").textContent = GOMOKU.nodes.map((n) => nodeLabel(n.url)).join(" and ");
$("model-spec").textContent = `${GOMOKU.model.name} · ${formatGas(GOMOKU.model.gas)} gas per AI move`;
state.board = makeBoard($("play-board"), { onPlace: place, label: "Board, 15 by 15. Use the arrow keys to move and Enter to place a stone." });
$("new-black").addEventListener("click", () => start(false));
$("new-white").addEventListener("click", () => start(true));
start(false);
setUpReplay();
showFacts();
