// tube.jic.io 多语言（抄自 b.jic.io）:接 jic.io 全站通道 —— 同一个 localStorage 键 jic_lang、同样 8 种语言、同样的选择器。
// 做法:界面文案以简体中文为键,t('中文') 查当前语言的词典;繁体由简繁字表自动转(vendor/s2t.js);
// 其他语言查 /locales/<lang>.json,没有的条目退回英文,再退回中文。笔记、书名等用户内容不翻译。
(function () {
  'use strict';
  var LANGS = [
    { code: 'zh-Hans', label: '简体中文' }, { code: 'zh-Hant', label: '繁體中文' }, { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' }, { code: 'es', label: 'Español' }, { code: 'ja', label: '日本語' }, { code: 'ko', label: '한국어' }, { code: 'hi', label: 'हिन्दी' },
  ];
  var codes = LANGS.map(function (l) { return l.code; });
  var dicts = { 'zh-Hans': {} };
  var current = detect();

  function detect() {
    var saved = '';
    try { saved = localStorage.getItem('jic_lang') || ''; } catch (e) {}
    if (codes.indexOf(saved) >= 0) return saved;
    if (saved === 'zh') return 'zh-Hans';
    var b = (navigator.language || 'zh').toLowerCase();
    if (b.indexOf('zh') === 0) return /zh-(tw|hk|mo|hant)/.test(b) ? 'zh-Hant' : 'zh-Hans';
    for (var i = 0; i < codes.length; i++) if (b.indexOf(codes[i].toLowerCase()) === 0) return codes[i];
    return 'en';
  }

  var s2tMap = null;
  function s2t(str) {
    if (!s2tMap) return str;
    var out = '';
    for (var i = 0; i < str.length; i++) { var c = str[i]; out += s2tMap[c] || c; }
    return out;
  }

  function t(key) {
    if (current === 'zh-Hans') return key;
    if (current === 'zh-Hant') { var zt = dicts['zh-Hant'] && dicts['zh-Hant'][key]; return zt || s2t(key); }
    var d = dicts[current];
    if (d && d[key]) return d[key];
    var en = dicts.en;
    return (en && en[key]) || key;
  }

  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function load(lang) {
    if (lang === 'zh-Hans') return Promise.resolve();
    var jobs = [];
    if (lang === 'zh-Hant' && !s2tMap) jobs.push(loadScript('/vendor/s2t.js').then(function () { s2tMap = window.JPJIC_S2T || {}; }).catch(function () { s2tMap = {}; }));
    if (lang !== 'zh-Hant' && !dicts.en) jobs.push(fetch('/locales/en.json').then(function (r) { return r.ok ? r.json() : {}; }).then(function (j) { dicts.en = j; }).catch(function () { dicts.en = {}; }));
    if (lang !== 'en' && !dicts[lang]) jobs.push(fetch('/locales/' + lang + '.json').then(function (r) { return r.ok ? r.json() : {}; }).then(function (j) { dicts[lang] = j; }).catch(function () { dicts[lang] = {}; }));
    return Promise.all(jobs);
  }

  function applyStatic() {
    document.documentElement.lang = current;
    document.querySelectorAll('[data-i18n]').forEach(function (el) { var k = el.getAttribute('data-i18n'); el.textContent = t(k); });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) { var k = el.getAttribute('data-i18n-html'); el.innerHTML = t(k); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) { var k = el.getAttribute('data-i18n-placeholder'); el.placeholder = t(k); });
    var sel = document.getElementById('lang-select'); if (sel) sel.value = current;
  }

  function setLang(code) {
    if (codes.indexOf(code) < 0) return Promise.resolve();
    current = code;
    try { localStorage.setItem('jic_lang', code); } catch (e) {}
    return load(code).then(function () { applyStatic(); window.dispatchEvent(new CustomEvent('jic:lang', { detail: { lang: code } })); });
  }

  function mountSelector() {
    var sel = document.getElementById('lang-select'); if (!sel) return;
    LANGS.forEach(function (l) { var o = document.createElement('option'); o.value = l.code; o.textContent = l.label; sel.appendChild(o); });
    sel.value = current;
    sel.onchange = function () { setLang(sel.value); };
  }

  window.t = t;
  window.JIC_I18N = { LANGS: LANGS, get lang() { return current; }, setLang: setLang, ready: load(current).then(function () { mountSelector(); applyStatic(); }) };
})();
