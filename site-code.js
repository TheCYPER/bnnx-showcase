// Code windows in the render of the carbon.now.sh export the site copies (a11y-dark): a small tokenizer for the four
// languages the pages show, and the copy button. The tokenizer is pure, and every token list joins back to the text it
// was given, so colouring can never change what a reader copies. Text goes in with textContent, never as HTML.

const WORDS = {
  bash: ["export", "cd", "echo", "then", "fi", "do", "done"],
  python: ["import", "from", "as", "def", "class", "return", "for", "in", "if", "else", "elif", "with", "print", "True",
    "False", "None", "lambda", "not", "and", "or"],
  solidity: ["pragma", "solidity", "interface", "contract", "function", "external", "view", "returns", "calldata",
    "memory", "public", "immutable", "constructor", "address", "bytes", "bytes32", "uint256", "int256", "uint8", "bool",
    "string", "import", "is", "return", "require", "emit", "event", "struct", "mapping"],
  javascript: ["import", "from", "const", "let", "var", "await", "async", "function", "return", "export", "new", "of",
    "if", "else", "for", "true", "false", "null"],
  json: ["true", "false", "null"],
};

const COMMENTS = { bash: "#[^\\n]*", python: "#[^\\n]*", solidity: "//[^\\n]*|/\\*[\\s\\S]*?\\*/",
  javascript: "//[^\\n]*|/\\*[\\s\\S]*?\\*/", json: "(?!)" };

const STRINGS = {
  python: "\"\"\"[\\s\\S]*?\"\"\"|\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'",
  default: "\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'",
  javascript: "`(?:\\\\.|[^`\\\\])*`|\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'",
};

const NUMBER = "\\b0x[0-9a-fA-F]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b";

const cache = new Map();

function expressionFor(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const strings = STRINGS[lang] ?? STRINGS.default;
  const flag = lang === "bash" ? "|(?<p>(?<![\\w-])--?[A-Za-z][\\w-]*)" : "";
  const variable = lang === "bash" ? "|(?<v>\\$\\{?[A-Za-z_][\\w]*\\}?)" : "";
  const source = `(?<c>${COMMENTS[lang]})|(?<s>${strings})|(?<n>${NUMBER})${flag}${variable}|(?<w>[A-Za-z_][\\w]*)`;
  const expression = new RegExp(source, "g");
  cache.set(lang, expression);
  return expression;
}

/** Split `text` into [{ type, text }]: type is c comment, s string, n number, k keyword, f function, p flag or
 *  property, v variable, or null for everything else. The texts join back to `text` exactly. */
export function tokenize(lang, text) {
  const language = Object.hasOwn(COMMENTS, lang) ? lang : null;
  if (language === null) return [{ type: null, text }];
  const keywords = new Set(WORDS[language]);
  const expression = expressionFor(language);
  expression.lastIndex = 0;
  const tokens = [];
  let last = 0;
  const push = (type, piece) => {
    if (!piece) return;
    const previous = tokens[tokens.length - 1];
    if (previous && previous.type === type) previous.text += piece;
    else tokens.push({ type, text: piece });
  };
  for (const match of text.matchAll(expression)) {
    push(null, text.slice(last, match.index));
    const piece = match[0];
    const groups = match.groups;
    let type = null;
    if (groups.c !== undefined) type = "c";
    else if (groups.s !== undefined) type = "s";
    else if (groups.n !== undefined) type = "n";
    else if (groups.p !== undefined) type = "p";
    else if (groups.v !== undefined) type = "v";
    else if (keywords.has(piece)) type = "k";
    else {
      const rest = text.slice(match.index + piece.length);
      const atLineStart = /(^|\n)[ \t]*$/.test(text.slice(0, match.index));
      if (language === "bash" ? atLineStart : /^\s*\(/.test(rest)) type = "f";
    }
    push(type, piece);
    last = match.index + piece.length;
  }
  push(null, text.slice(last));
  return tokens;
}

/** Replace the text of a <pre> with coloured spans (textContent only). */
export function colour(pre) {
  const lang = pre.getAttribute("data-lang") ?? "";
  const text = pre.textContent.replace(/^\n+/, "").replace(/\s+$/, "");
  const nodes = tokenize(lang, text).map(({ type, text: piece }) => {
    if (type === null) return document.createTextNode(piece);
    const span = document.createElement("span");
    span.className = `tk-${type}`;
    span.textContent = piece;
    return span;
  });
  pre.replaceChildren(...nodes);
  pre.setAttribute("data-coloured", "true");
}

function copyLabel(button, copied) {
  const pick = window.siteLang?.pick ?? ((texts) => texts.en);
  button.textContent = copied ? pick({ en: "Copied", zh: "已复制" }) : pick({ en: "Copy", zh: "复制" });
}

function wireCopy(button, pre) {
  copyLabel(button, false);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent);
      copyLabel(button, true);
      setTimeout(() => copyLabel(button, false), 1600);
    } catch (error) {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });
  document.addEventListener("sitelangchange", () => copyLabel(button, false));
}

/** Colour every <pre class="code"> in `root` and wire the copy button of its window. */
export function enhance(root = document) {
  for (const window_ of root.querySelectorAll(".code-window")) {
    const pre = window_.querySelector("pre.code");
    if (!pre || pre.getAttribute("data-coloured")) continue;
    colour(pre);
    const button = window_.querySelector("button.copy");
    if (button) wireCopy(button, pre);
  }
}

if (typeof document !== "undefined") enhance();
