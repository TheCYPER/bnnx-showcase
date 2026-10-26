// Language switch for the BNNX site. A classic script in <head>, so the page never flashes the wrong language.
// <html data-lang="en|zh">: ?lang=zh or ?lang=en in the address wins (a bare #zh or #en still works), then the browser's
// language. A page that is English only (the demo pages) loads this with data-fixed="en". Nothing is stored anywhere;
// the choice lives in the address, and every internal link carries it once it has been made.
(function () {
  "use strict";
  var script = document.currentScript;
  var fixed = script && script.getAttribute("data-fixed");
  var explicit = false;
  var chosen = null; // the language the visitor picked (address), also on a page that is fixed to English

  function fromAddress() {
    var wanted = new URLSearchParams(location.search).get("lang");
    if (wanted === "zh" || wanted === "en") { explicit = true; chosen = wanted; return wanted; }
    var bare = location.hash.replace("#", "");
    if (bare === "zh" || bare === "en") { explicit = true; chosen = bare; return bare; }
    return (navigator.language || "").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
  }

  var fromUrl = fromAddress();
  var lang = fixed || fromUrl;
  var root = document.documentElement;
  root.setAttribute("data-lang", lang);
  root.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");

  /** Pick the text for the current language: pick({ en: "…", zh: "…" }). */
  function pick(texts) {
    return texts[root.getAttribute("data-lang")] || texts.en;
  }

  function keepLanguageInLinks() {
    if (!explicit) return;
    // a fixed page shows its own language but passes the visitor's choice on, so the way back keeps it
    var current = fixed ? chosen : root.getAttribute("data-lang");
    Array.prototype.forEach.call(document.querySelectorAll("a[data-site-link]"), function (link) {
      var parts = link.getAttribute("href").split("#");
      var path = parts[0].split("?")[0];
      link.setAttribute("href", path + "?lang=" + current + (parts.length > 1 ? "#" + parts.slice(1).join("#") : ""));
    });
  }

  function set(next) {
    explicit = true;
    chosen = next;
    root.setAttribute("data-lang", next);
    root.setAttribute("lang", next === "zh" ? "zh-CN" : "en");
    try {
      var url = new URL(location.href);
      url.searchParams.set("lang", next);
      if (url.hash === "#zh" || url.hash === "#en") url.hash = "";
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch (error) { /* an address that cannot be rewritten still switches the page */ }
    keepLanguageInLinks();
    document.dispatchEvent(new CustomEvent("sitelangchange", { detail: next }));
  }

  window.siteLang = { pick: pick, set: set };

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("lang-toggle");
    if (toggle && !fixed) {
      toggle.addEventListener("click", function () {
        set(root.getAttribute("data-lang") === "zh" ? "en" : "zh");
      });
    }
    keepLanguageInLinks();
  });

  window.addEventListener("hashchange", function () {
    var bare = location.hash.replace("#", "");
    if (!fixed && (bare === "zh" || bare === "en") && bare !== root.getAttribute("data-lang")) set(bare);
  });
})();
