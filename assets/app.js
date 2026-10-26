/* 押韵 ZONE 网页版 — 押韵匹配引擎 + 界面逻辑 */
(function () {
  'use strict';

  var DATA = window.RHYME_DATA || { c: {}, w: [], e: [] };

  /* ================= 拼音解析 ================= */

  var INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];

  // 十三辙韵部
  var GROUPS = {
    a: '发花', ia: '发花', ua: '发花',
    o: '梭波', uo: '梭波', e: '梭波',
    ie: '乜斜', ve: '乜斜',
    i: '一七', v: '一七', er: '一七',
    u: '姑苏',
    ai: '怀来', uai: '怀来',
    ei: '灰堆', uei: '灰堆',
    ao: '遥条', iao: '遥条',
    ou: '由求', iou: '由求',
    an: '言前', ian: '言前', uan: '言前', van: '言前',
    en: '人辰', in: '人辰', uen: '人辰', vn: '人辰',
    ang: '江阳', iang: '江阳', uang: '江阳',
    eng: '中东', ing: '中东', ueng: '中东', ong: '中东', iong: '中东'
  };

  function parseSyl(raw) {
    var m = /^([a-zü]+)([1-5])?$/.exec(raw.toLowerCase());
    if (!m) return null;
    var base = m[1].replace('ü', 'v');
    var tone = m[2] ? parseInt(m[2], 10) : 0;

    var initial = '';
    for (var i = 0; i < INITIALS.length; i++) {
      if (base.indexOf(INITIALS[i]) === 0) { initial = INITIALS[i]; break; }
    }
    var fin = base.slice(initial.length);

    // 正字法还原为规范韵母
    if (initial === 'y') {
      if (fin === 'u') fin = 'v';
      else if (fin === 'ue') fin = 've';
      else if (fin === 'uan') fin = 'van';
      else if (fin === 'un') fin = 'vn';
      else if (fin === 'e') fin = 'ie';
    } else if (initial === 'w') {
      if (fin === 'o') fin = 'uo';
    } else if ((initial === 'j' || initial === 'q' || initial === 'x') && fin.charAt(0) === 'u') {
      fin = 'v' + fin.slice(1);
    }
    if (initial !== 'y' && initial !== 'w') {
      if (fin === 'iu') fin = 'iou';
      else if (fin === 'ui') fin = 'uei';
      else if (fin === 'un') fin = 'uen';
    }

    return {
      raw: raw.toLowerCase(),
      base: base,
      initial: initial,
      fin: fin,
      tone: tone,
      group: GROUPS[fin] || GROUPS[fin.replace(/^v/, 'v')] || '其他'
    };
  }

  /* 声调数字 → 调号 */
  var TONE_MAP = {
    a: ['a', 'ā', 'á', 'ǎ', 'à'], e: ['e', 'ē', 'é', 'ě', 'è'], i: ['i', 'ī', 'í', 'ǐ', 'ì'],
    o: ['o', 'ō', 'ó', 'ǒ', 'ò'], u: ['u', 'ū', 'ú', 'ǔ', 'ù'], v: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ']
  };

  function toneMark(raw) {
    var m = /^([a-zü]+)([1-5])?$/.exec(raw.toLowerCase());
    if (!m) return raw;
    var base = m[1].replace('ü', 'v');
    var tone = m[2] ? parseInt(m[2], 10) : 0;
    if (!tone || tone === 5) return base.replace(/v/g, 'ü');
    var idx = base.search(/[aoe]/);
    if (idx === -1) {
      var last = base.lastIndexOf('i');
      var lu = base.lastIndexOf('u');
      var lv = base.lastIndexOf('v');
      idx = Math.max(last, Math.max(lu, lv));
    }
    var ch = base.charAt(idx);
    return base.slice(0, idx) + TONE_MAP[ch][tone] + base.slice(idx + 1).replace(/v/g, 'ü');
  }

  /* ================= 查询词分析 ================= */

  var isAscii = function (s) { return /^[a-zA-Z\s'-]+$/.test(s); };

  function analyzeChinese(text) {
    var chars = text.replace(/[^一-鿿]/g, '').split('');
    var syls = [];
    for (var i = 0; i < chars.length; i++) {
      var py = DATA.c[chars[i]];
      if (!py) continue;
      var s = parseSyl(py);
      if (s) { s.ch = chars[i]; syls.push(s); }
    }
    return syls;
  }

  // 英文韵脚单元：元音组+尾辅音，由右向左切分
  function engUnits(word) {
    var w = word.toLowerCase().replace(/[^a-z]/g, '');
    var m = w.match(/[aeiouy]+[^aeiouy]*/g);
    return m ? m.reverse() : [w];
  }

  /* ================= 词库索引 ================= */

  var INDEX = []; // {word, syls, units, idx, len}

  function buildIndex() {
    DATA.w.forEach(function (item, i) {
      var parts = item.split('|');
      var word = parts[0];
      var syls = (parts[1] || '').split(' ').map(parseSyl).filter(Boolean);
      if (!syls.length) return;
      INDEX.push({ word: word, syls: syls, units: null, idx: i, len: syls.length });
    });
    DATA.e.forEach(function (word, i) {
      INDEX.push({ word: word, syls: null, units: engUnits(word), idx: DATA.w.length + i, len: engUnits(word).length });
    });
  }

  /* ================= 押韵匹配 ================= */

  // mode: 'tail' 尾音押韵(十三辙) | 'final' 精准韵母 | 'full' 全押
  function pairMatch(cand, query, mode, toneStrict) {
    if (toneStrict && cand.tone !== query.tone) return false;
    if (mode === 'full') return cand.base === query.base;
    if (mode === 'final') return cand.fin === query.fin;
    return cand.group === query.group;
  }

  function search(opts) {
    var text = opts.text.trim();
    if (!text) return { hits: [], hint: '' };

    if (isAscii(text)) {
      return searchEnglish(text, opts);
    }

    var qSyls = analyzeChinese(text);
    if (!qSyls.length) return { hits: [], hint: '', error: '无法识别输入内容，请输入中文或英文。' };

    var wantN = opts.count === 'mix' ? 3 : opts.count;
    var n = Math.min(wantN, qSyls.length);
    var hint = (n < wantN) ? ('查询词只有 ' + qSyls.length + ' 个音节，已按 ' + n + ' 押匹配。') : '';
    var qTail = qSyls.slice(qSyls.length - n);

    var hits = [];
    INDEX.forEach(function (entry) {
      if (entry.syls === null) return;
      if (entry.len < n) return;

      if (opts.count === 'mix') {
        for (var k = n; k >= 1; k--) {
          if (matchTail(entry.syls, qSyls, k, opts.mode, opts.toneStrict)) {
            hits.push({ entry: entry, matchLen: k });
            return;
          }
        }
        return;
      }
      if (matchTail(entry.syls, qSyls, n, opts.mode, opts.toneStrict)) {
        hits.push({ entry: entry, matchLen: n });
      }
    });

    return {
      hits: hits,
      hint: hint,
      query: text,
      queryInfo: qTail.map(function (s) { return { ch: s.ch, raw: s.raw, group: s.group, fin: s.fin }; })
    };
  }

  function matchTail(candSyls, qSyls, k, mode, toneStrict) {
    var c = candSyls.slice(candSyls.length - k);
    var q = qSyls.slice(qSyls.length - k);
    for (var i = 0; i < k; i++) {
      if (!pairMatch(c[i], q[i], mode, toneStrict)) return false;
    }
    return true;
  }

  function searchEnglish(text, opts) {
    var units = engUnits(text);
    if (!units.length) return { hits: [], hint: '' };
    var wantN = opts.count === 'mix' ? 2 : Math.min(opts.count, 2);
    var n = Math.min(wantN, units.length);
    var hint = (n < wantN) ? ('英文按发音单元匹配，已按 ' + n + ' 押匹配。') : '';
    var qTail = units.slice(0, n);

    var hits = [];
    INDEX.forEach(function (entry) {
      if (entry.units === null) return;
      if (entry.units.length < n) return;
      var c = entry.units.slice(0, n);
      for (var i = 0; i < n; i++) {
        if (c[i] !== qTail[i]) return;
      }
      hits.push({ entry: entry, matchLen: n });
    });

    return {
      hits: hits,
      hint: hint + ' 英文模式按词尾发音单元（元音+尾辅音）匹配。',
      query: text,
      queryInfo: [{ ch: text.trim(), raw: '-' + units[0], group: '尾韵 -' + units[0], fin: units[0] }]
    };
  }

  /* ================= 排序 ================= */

  function sortHits(hits, mode) {
    var arr = hits.slice();
    if (mode === 'len') {
      arr.sort(function (a, b) { return a.entry.len - b.entry.len || a.entry.idx - b.entry.idx; });
    } else if (mode === 'pinyin') {
      arr.sort(function (a, b) {
        var pa = a.entry.syls ? a.entry.syls.map(function (s) { return s.base; }).join('') : a.entry.word;
        var pb = b.entry.syls ? b.entry.syls.map(function (s) { return s.base; }).join('') : b.entry.word;
        return pa < pb ? -1 : pa > pb ? 1 : 0;
      });
    } else {
      arr.sort(function (a, b) {
        return (b.matchLen - a.matchLen) || (a.entry.idx - b.entry.idx);
      });
    }
    return arr;
  }

  /* ================= 界面 ================= */

  var $ = function (sel) { return document.querySelector(sel); };
  var state = {
    count: 1,        // 1单押 2双押 3三押 4多押 'mix'混押
    mode: 'tail',    // tail | final | full
    toneStrict: false,
    sort: 'freq',
    lastResult: null
  };

  var COUNT_LABEL = { 1: '单押', 2: '双押', 3: '三押', 4: '多押', mix: '混押' };
  var MODE_LABEL = { tail: '尾音押韵', final: '精准韵母', full: '全押' };

  function bindPills() {
    document.querySelectorAll('.pill-group').forEach(function (group) {
      group.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.pill');
        if (!btn) return;
        group.querySelectorAll('.pill').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var key = group.getAttribute('data-key');
        var val = btn.getAttribute('data-val');
        if (key === 'count') state.count = val === 'mix' ? 'mix' : parseInt(val, 10);
        else if (key === 'mode') state.mode = val;
        else if (key === 'tone') state.toneStrict = val === 'strict';
        if (state.lastResult) doSearch(false);
      });
    });
  }

  function doSearch(pushRecent) {
    var text = $('#searchInput').value;
    var result = search({
      text: text,
      count: state.count,
      mode: state.mode,
      toneStrict: state.toneStrict
    });
    state.lastResult = result;
    render(result);
    if (pushRecent && result.hits && result.hits.length) pushRecentSearch(text.trim());
  }

  function pinyinLabel(entry) {
    if (entry.syls) return entry.syls.map(function (s) { return toneMark(s.raw); }).join(' ');
    return '/' + entry.units.slice().reverse().join('') + '/';
  }

  function render(result) {
    var box = $('#results');
    var head = $('#resultMeta');

    if (result.error) {
      head.innerHTML = '<span class="meta-warn">' + result.error + '</span>';
      box.innerHTML = '';
      return;
    }
    if (!result.query) {
      head.innerHTML = '';
      box.innerHTML = emptyState();
      return;
    }

    var sorted = sortHits(result.hits, state.sort);
    var shown = sorted.slice(0, 300);

    var qInfo = (result.queryInfo || []).map(function (q) {
      return '<span class="q-chip"><b>' + q.ch + '</b><i>' + toneMark(q.raw) + '</i><em>' + q.group + '</em></span>';
    }).join('');

    head.innerHTML =
      '<div class="meta-row">' +
      '  <div class="meta-text">找到 <b class="count">' + result.hits.length + '</b> 个韵脚' +
      '    <span class="tags"><span class="tag">' + COUNT_LABEL[state.count] + '</span>' +
      '    <span class="tag">' + MODE_LABEL[state.mode] + '</span>' +
      '    <span class="tag">声调' + (state.toneStrict ? '一致' : '不限') + '</span></span>' +
      '  </div>' +
      '  <div class="meta-actions">' +
      '    <button class="btn-ghost" id="copyAll">复制全部</button>' +
      '    <select id="sortSelect2" class="sort-select">' +
      '      <option value="freq"' + (state.sort === 'freq' ? ' selected' : '') + '>常用优先</option>' +
      '      <option value="len"' + (state.sort === 'len' ? ' selected' : '') + '>字数最少</option>' +
      '      <option value="pinyin"' + (state.sort === 'pinyin' ? ' selected' : '') + '>拼音排序</option>' +
      '    </select>' +
      '  </div>' +
      '</div>' +
      '<div class="q-info">查询：' + qInfo + (result.hint ? '<span class="hint">' + result.hint + '</span>' : '') + '</div>';

    var sel2 = $('#sortSelect2');
    if (sel2) sel2.addEventListener('change', function () {
      state.sort = this.value;
      render(state.lastResult);
    });
    var copyBtn = $('#copyAll');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var words = shown.map(function (h) { return h.entry.word; }).join(' ');
      copyText(words, '已复制 ' + shown.length + ' 个韵脚');
    });

    if (!shown.length) {
      box.innerHTML = emptyState(true);
      return;
    }

    var html = shown.map(function (h) {
      var e = h.entry;
      var word = e.word;
      var tailLen = 0;
      if (e.syls) {
        for (var i = 0; i < h.matchLen; i++) tailLen++;
        var chars = word.split('');
        var hlFrom = chars.length - tailLen;
        var headPart = chars.slice(0, hlFrom).join('');
        var tailPart = chars.slice(hlFrom).join('');
        word = headPart + '<mark>' + tailPart + '</mark>';
      } else {
        word = '<mark>' + word + '</mark>';
      }
      var badge = (state.count === 'mix') ? '<span class="badge">' + h.matchLen + '押</span>' : '';
      return '<button class="card" data-word="' + e.word + '" title="点击复制">' +
        '<span class="card-py">' + pinyinLabel(e) + '</span>' +
        '<span class="card-word">' + word + '</span>' + badge +
        '</button>';
    }).join('');

    box.innerHTML = html;
    box.querySelectorAll('.card').forEach(function (card) {
      card.addEventListener('click', function () {
        copyText(card.getAttribute('data-word'), '已复制「' + card.getAttribute('data-word') + '」');
      });
    });
  }

  function emptyState(noResult) {
    if (noResult) {
      return '<div class="empty">' +
        '<p class="empty-title">没有找到匹配的韵脚</p>' +
        '<p class="empty-sub">试试切换押韵方式（尾音押韵匹配更宽松），或把押韵字数改为单押。</p>' +
        '</div>';
    }
    return '<div class="empty">' +
      '<p class="empty-title">输入词语，开始找韵脚</p>' +
      '<p class="empty-sub">支持中文和英文输入，回车或点击 SEARCH 开始搜索。</p>' +
      '<div class="skeleton"><span></span><span></span><span></span><span></span><span></span></div>' +
      '</div>';
  }

  function copyText(text, msg) {
    var done = function () { toast(msg); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text); done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1600);
  }

  /* -------- 最近搜索 -------- */

  function recentList() {
    try { return JSON.parse(localStorage.getItem('rhyme-recent') || '[]'); }
    catch (e) { return []; }
  }

  function pushRecentSearch(word) {
    if (!word) return;
    var list = recentList().filter(function (w) { return w !== word; });
    list.unshift(word);
    list = list.slice(0, 8);
    try { localStorage.setItem('rhyme-recent', JSON.stringify(list)); } catch (e) { /* ignore */ }
    renderRecent();
  }

  function renderRecent() {
    var box = $('#recentRow');
    var list = recentList();
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<span class="row-label">最近</span>' + list.map(function (w) {
      return '<button class="chip chip-recent" data-word="' + w + '">' + w + '</button>';
    }).join('') + '<button class="chip chip-clear" id="clearRecent">清空</button>';
    box.querySelectorAll('.chip-recent').forEach(function (c) {
      c.addEventListener('click', function () {
        $('#searchInput').value = c.getAttribute('data-word');
        doSearch(false);
      });
    });
    $('#clearRecent').addEventListener('click', function () {
      try { localStorage.removeItem('rhyme-recent'); } catch (e) { /* ignore */ }
      renderRecent();
    });
  }

  /* -------- 搜索触发 -------- */

  function bindSearch() {
    $('#searchBtn').addEventListener('click', function () { doSearch(true); });
    $('#searchInput').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') doSearch(true);
    });
  }

  /* ================= 启动 ================= */

  buildIndex();
  bindPills();
  bindSearch();
  renderRecent();
  render({ query: '' });
})();
