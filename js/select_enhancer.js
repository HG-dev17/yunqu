(function () {
  'use strict';

  var MAX_VISIBLE_OPTIONS = 5;
  var DROPDOWN_MAX_HEIGHT = 260;
  var observers = [];

  function ensureStyles() {
    if (document.getElementById('selectx-styles')) return;
    var style = document.createElement('style');
    style.id = 'selectx-styles';
    style.textContent = ''
      + '.selectx{position:relative;display:inline-block;min-width:180px;width:auto;}'
      + '.selectx select{display:none!important;}'
      + '.selectx-display{display:flex;align-items:center;justify-content:space-between;gap:10px;'
      + 'padding:12px 15px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;'
      + 'font-size:1rem;user-select:none;min-height:44px;}'
      + '.selectx-display:focus{outline:none;border-color:#3498db;box-shadow:0 0 0 2px rgba(52,152,219,.15);}'
      + '.selectx-caret{opacity:.7;font-size:.9rem;}'
      + '.selectx-panel{position:absolute;left:0;right:0;top:calc(100% + 6px);background:#fff;border:1px solid rgba(0,0,0,.12);'
      + 'border-radius:10px;box-shadow:0 12px 26px rgba(0,0,0,.14);padding:10px;z-index:9999;display:none;}'
      + '.selectx.open .selectx-panel{display:block;}'
      + '.selectx-search{width:100%;padding:10px 12px;border:1px solid rgba(0,0,0,.15);border-radius:8px;'
      + 'font-size:0.95rem;outline:none;margin-bottom:8px;}'
      + '.selectx-search:focus{border-color:#3498db;box-shadow:0 0 0 2px rgba(52,152,219,.12);}'
      + '.selectx-list{list-style:none;margin:0;padding:0;max-height:' + DROPDOWN_MAX_HEIGHT + 'px;overflow:auto;}'
      + '.selectx-item{padding:9px 10px;border-radius:8px;cursor:pointer;line-height:1.3;}'
      + '.selectx-item:hover{background:rgba(52,152,219,.08);}'
      + '.selectx-item[aria-selected="true"]{background:rgba(52,152,219,.14);font-weight:600;}'
      + '.selectx-empty{padding:10px;color:#7f8c8d;font-size:.92rem;}';
    document.head.appendChild(style);
  }

  function optionCount(select) {
    // 只统计可选项（排除 disabled + 空）
    var n = 0;
    for (var i = 0; i < select.options.length; i++) {
      var opt = select.options[i];
      if (!opt) continue;
      if (opt.disabled) continue;
      n++;
    }
    return n;
  }

  function getSelectedText(select) {
    var opt = select.options[select.selectedIndex];
    return opt ? (opt.textContent || opt.label || opt.value || '') : '';
  }

  function dispatchNativeChange(select) {
    try {
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      // 兼容旧浏览器
      var evt = document.createEvent('Event');
      evt.initEvent('change', true, true);
      select.dispatchEvent(evt);
    }
  }

  function build(select) {
    if (!select || select.dataset && select.dataset.selectxReady === '1') return;
    if (select.multiple) return;
    if (select.size && Number(select.size) > 1) return;
    if (select.dataset && select.dataset.noSelectSearch === '1') return;

    if (optionCount(select) <= MAX_VISIBLE_OPTIONS) return;

    ensureStyles();

    var wrapper = document.createElement('div');
    wrapper.className = 'selectx';

    // 保留原 select 参与表单与业务逻辑
    select.dataset.selectxReady = '1';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    var display = document.createElement('div');
    display.className = 'selectx-display';
    display.tabIndex = 0;

    var label = document.createElement('div');
    label.className = 'selectx-label';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.whiteSpace = 'nowrap';

    var caret = document.createElement('div');
    caret.className = 'selectx-caret';
    caret.textContent = '▾';

    display.appendChild(label);
    display.appendChild(caret);
    wrapper.appendChild(display);

    var panel = document.createElement('div');
    panel.className = 'selectx-panel';

    var search = document.createElement('input');
    search.className = 'selectx-search';
    search.type = 'text';
    search.placeholder = '搜索选项...';
    search.autocomplete = 'off';

    var list = document.createElement('ul');
    list.className = 'selectx-list';

    panel.appendChild(search);
    panel.appendChild(list);
    wrapper.appendChild(panel);

    function renderList(filterText) {
      var ft = (filterText || '').trim().toLowerCase();
      list.innerHTML = '';

      var found = 0;
      for (var i = 0; i < select.options.length; i++) {
        var opt = select.options[i];
        if (!opt || opt.disabled) continue;
        var text = (opt.textContent || opt.label || opt.value || '').trim();
        if (!text) continue;
        if (ft && text.toLowerCase().indexOf(ft) === -1) continue;

        var li = document.createElement('li');
        li.className = 'selectx-item';
        li.textContent = text;
        li.setAttribute('data-value', opt.value);
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
        list.appendChild(li);
        found++;
      }

      if (found === 0) {
        var empty = document.createElement('div');
        empty.className = 'selectx-empty';
        empty.textContent = '没有匹配的选项';
        list.appendChild(empty);
      }
    }

    function syncLabel() {
      label.textContent = getSelectedText(select) || '请选择';
    }

    function open() {
      wrapper.classList.add('open');
      syncLabel();
      renderList('');
      search.value = '';
      setTimeout(function () { search.focus(); }, 0);
    }

    function close() {
      wrapper.classList.remove('open');
    }

    function toggle() {
      if (wrapper.classList.contains('open')) close();
      else open();
    }

    display.addEventListener('click', function (e) {
      e.preventDefault();
      toggle();
    });

    display.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape') {
        close();
      }
    });

    search.addEventListener('input', function () {
      renderList(search.value);
    });

    list.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('selectx-item')) return;
      var v = t.getAttribute('data-value');
      if (v == null) return;
      if (select.value !== v) {
        select.value = v;
        dispatchNativeChange(select);
      }
      syncLabel();
      close();
      display.focus();
    });

    document.addEventListener('click', function (e) {
      if (!wrapper.classList.contains('open')) return;
      if (wrapper.contains(e.target)) return;
      close();
    });

    document.addEventListener('keydown', function (e) {
      if (!wrapper.classList.contains('open')) return;
      if (e.key === 'Escape') close();
    });

    // 外部 JS 变更 select 时同步显示
    select.addEventListener('change', function () {
      syncLabel();
    });

    // 初始
    syncLabel();
  }

  function watch(select) {
    if (!select || select.dataset && select.dataset.selectxWatch === '1') return;
    if (select.dataset && select.dataset.noSelectSearch === '1') return;
    if (!('MutationObserver' in window)) return;

    select.dataset.selectxWatch = '1';
    var obs = new MutationObserver(function () {
      // 选项动态变化后再尝试 build
      build(select);
    });

    obs.observe(select, { childList: true, subtree: true });
    observers.push(obs);
  }

  function init() {
    var selects = document.querySelectorAll('select');
    for (var i = 0; i < selects.length; i++) {
      build(selects[i]);
      watch(selects[i]);
    }
  }

  // 给动态页面/手动调用留一个入口
  window.SelectEnhancer = window.SelectEnhancer || {};
  window.SelectEnhancer.refresh = function () {
    init();
  };

  document.addEventListener('DOMContentLoaded', init);
})();

