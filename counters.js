// Numbers that count up when they scroll into view. The page already holds the final number as text, so with no
// script, or with prefers-reduced-motion, the number is simply there; the animation only starts from 0 when allowed.

import { countAt, withCommas } from "./site-logic.js";

const DURATION_MS = 1100;

export function mountCounters(root = document) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nodes = [...root.querySelectorAll("[data-count]")];
  if (reduced || !("IntersectionObserver" in window)) return;
  const watcher = new IntersectionObserver((seen) => {
    for (const item of seen) {
      if (!item.isIntersecting) continue;
      watcher.unobserve(item.target);
      const target = Number(item.target.getAttribute("data-count"));
      const suffix = item.target.getAttribute("data-suffix") ?? "";
      const started = performance.now();
      const step = (now) => {
        const t = (now - started) / DURATION_MS;
        item.target.textContent = withCommas(countAt(target, t)) + suffix;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });
  nodes.forEach((node) => watcher.observe(node));
}
