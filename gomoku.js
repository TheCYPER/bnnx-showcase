// Gomoku rules for the page, the same as examples/gomoku/rules.py and GomokuGame.sol (tests/vectors/gomoku.json pins
// all three): 15 x 15, black first, five or more in a row wins, no forbidden moves, a full board is a draw.
// Games are immutable: every function returns a new value.

export const SIZE = 15;
export const CELLS = SIZE * SIZE;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const STONE = 255; // byte value of a stone in the model input
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]]; // [dCol, dRow]
const COLUMNS = "ABCDEFGHIJKLMNO";

export const other = (colour) => (colour === BLACK ? WHITE : BLACK);
export const index = (row, col) => SIZE * row + col;

/** "H8": column letter A–O, row number 15 (top) to 1 (bottom). */
export function pointName(point) {
  return `${COLUMNS[point % SIZE]}${SIZE - Math.floor(point / SIZE)}`;
}

export function newGame() {
  return Object.freeze({ cells: new Uint8Array(CELLS), moves: Object.freeze([]), status: "playing" });
}

export function toMove(game) {
  return game.moves.length % 2 === 0 ? BLACK : WHITE;
}

function runLength(cells, point, colour, dCol, dRow) {
  const row = Math.floor(point / SIZE);
  const col = point % SIZE;
  let total = 1;
  for (const sign of [-1, 1]) {
    let r = row + sign * dRow;
    let c = col + sign * dCol;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && cells[index(r, c)] === colour) {
      total += 1;
      r += sign * dRow;
      c += sign * dCol;
    }
  }
  return total;
}

/** Is the stone of `colour` at `point` part of five or more in a row? */
export function makesFive(cells, point, colour) {
  return DIRECTIONS.some(([dCol, dRow]) => runLength(cells, point, colour, dCol, dRow) >= 5);
}

/** The game after the side to move plays `point`; throws for a finished game or an occupied or off-board point. */
export function play(game, point) {
  if (game.status !== "playing") throw new Error("the game is over");
  if (!Number.isInteger(point) || point < 0 || point >= CELLS) throw new Error(`point ${point} is off the board`);
  if (game.cells[point] !== EMPTY) throw new Error(`point ${pointName(point)} is occupied`);
  const colour = toMove(game);
  const cells = Uint8Array.from(game.cells);
  cells[point] = colour;
  const moves = Object.freeze([...game.moves, point]);
  let status = "playing";
  if (makesFive(cells, point, colour)) status = colour === BLACK ? "black" : "white";
  else if (moves.length === CELLS) status = "draw";
  return Object.freeze({ cells, moves, status });
}

export function replay(moves) {
  return moves.reduce((game, point) => play(game, point), newGame());
}

/** The model input: 450 bytes, point-major, two bytes per point: `colour`'s stone first, then the other side's. */
export function encode(game, colour) {
  const bytes = new Uint8Array(2 * CELLS);
  for (let p = 0; p < CELLS; p++) {
    if (game.cells[p] === colour) bytes[2 * p] = STONE;
    else if (game.cells[p] !== EMPTY) bytes[2 * p + 1] = STONE;
  }
  return bytes;
}

/** The empty point with the highest score; ties go to the lowest index (the contracts do the same). */
export function pick(scores, game) {
  if (scores.length !== CELLS) throw new Error(`need ${CELLS} scores, got ${scores.length}`);
  let best = -1;
  for (let p = 0; p < CELLS; p++) {
    if (game.cells[p] !== EMPTY) continue;
    if (best < 0 || scores[p] > scores[best]) best = p;
  }
  if (best < 0) throw new Error("the board is full");
  return best;
}
