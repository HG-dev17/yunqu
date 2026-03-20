// 外部CSV数据源：
// - data/semesters.csv：学期索引（key,name,start_date,end_date,file）
// - data/<semester>.csv：每学期一个记录CSV（建议字段：id,type,person,detail,datetime,admin,method,points,status）
// 为兼容 Android 4.4：本文件使用 ES5 语法 + XHR（不使用 fetch/Promise/async/await）
var semesterConfig = {};
var selectedSemesterKey = 'all';

// 全局数据存储
var allPraiseData = [];
var allCriticismData = [];
var filteredPraiseData = [];
var filteredCriticismData = [];

// 获取DOM元素
var praiseList = document.getElementById('praiseList');
var criticismList = document.getElementById('criticismList');
var praiseCount = document.getElementById('praiseCount');
var criticismCount = document.getElementById('criticismCount');
var searchInput = document.getElementById('searchInput');
var searchBtn = document.getElementById('searchBtn');
var filterType = document.getElementById('filterType');
var dateFilter = document.getElementById('dateFilter');
var semesterFilter = document.getElementById('semesterFilter');
var pauseBtn = document.getElementById('pauseBtn');
var resetBtn = document.getElementById('resetBtn');
var statusDot = document.getElementById('statusDot');
var statusText = document.getElementById('statusText');
var currentTimeElement = document.getElementById('currentTime');
var loadDataBtn = document.getElementById('loadDataBtn');
var showCurrentSemesterBtn = document.getElementById('showCurrentSemesterBtn');
var semesterInfoDisplay = document.getElementById('semesterInfoDisplay');
var announcementBar = document.getElementById('announcementBar');
var announcementText = document.getElementById('announcementText');

// 滚动相关变量
var isScrolling = true;
var praiseScrollPosition = 0;
var criticismScrollPosition = 0;
var scrollInterval = null;
var scrollSpeed = 30;

function setTranslateY(el, px) {
    if (!el) return;
    var v = 'translateY(' + px + 'px)';
    el.style.transform = v;
    // Android 4.4 兼容：部分内置浏览器只认 webkit 前缀
    el.style.webkitTransform = v;
}

function showError(message, detail) {
    detail = detail || '';
    var html = ''
        + '<div class="no-data">'
        + '  <i class="fas fa-triangle-exclamation"></i>'
        + '  <p>' + escapeHtml(message) + '</p>'
        + (detail ? ('<p style="font-size:0.9rem; opacity:0.8;">' + escapeHtml(detail) + '</p>') : '')
        + '</div>';
    praiseList.innerHTML = html;
    criticismList.innerHTML = html;
    praiseCount.textContent = '';
    criticismCount.textContent = '';
}

function stripBOM(s) {
    return s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function escapeHtml(s) {
    s = String(s == null ? '' : s);
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function hasOwn(obj, k) {
    return Object.prototype.hasOwnProperty.call(obj, k);
}

function strIncludes(hay, needle) {
    hay = String(hay == null ? '' : hay);
    needle = String(needle == null ? '' : needle);
    return hay.indexOf(needle) !== -1;
}

// 支持引号与逗号的简单CSV解析
function parseCSV(csvText) {
    var text = stripBOM(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
        var c = text.charAt(i);
        var next = text.charAt(i + 1);

        if (inQuotes) {
            if (c === '"' && next === '"') {
                field += '"';
                i++;
            } else if (c === '"') {
                inQuotes = false;
            } else {
                field += c;
            }
            continue;
        }

        if (c === '"') {
            inQuotes = true;
            continue;
        }

        if (c === ',') {
            row.push(field.trim());
            field = '';
            continue;
        }

        if (c === '\n') {
            row.push(field.trim());
            field = '';
            var any = false;
            for (var k = 0; k < row.length; k++) {
                if (row[k] !== '') { any = true; break; }
            }
            if (any) rows.push(row);
            row = [];
            continue;
        }

        field += c;
    }

    // last line
    row.push(field.trim());
    var any2 = false;
    for (var k2 = 0; k2 < row.length; k2++) {
        if (row[k2] !== '') { any2 = true; break; }
    }
    if (any2) rows.push(row);

    if (rows.length === 0) return [];
    var headers = [];
    for (var hi = 0; hi < rows[0].length; hi++) headers.push(String(rows[0][hi] || '').trim());
    var data = [];
    for (var r = 1; r < rows.length; r++) {
        var values = rows[r];
        var obj = {};
        for (var j = 0; j < headers.length; j++) {
            obj[headers[j]] = String((values && values[j] != null) ? values[j] : '').trim();
        }
        data.push(obj);
    }
    return data;
}

function fetchText(url, cb) {
    // Android 4.4 无 fetch，改用 XHR
    try {
        var xhr = new XMLHttpRequest();
        // 添加多个随机参数确保不使用缓存
        var cacheBuster = '?t=' + new Date().getTime() + '&r=' + Math.random();
        xhr.open('GET', url + cacheBuster, true);
        // 多重缓存控制
        xhr.setRequestHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        xhr.setRequestHeader('Pragma', 'no-cache');
        xhr.setRequestHeader('Expires', '0');
        xhr.setRequestHeader('If-Modified-Since', 'Sat, 1 Jan 2000 00:00:00 GMT');
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
                cb(null, xhr.responseText);
            } else {
                cb(new Error('HTTP ' + xhr.status + ' ' + (xhr.statusText || '')));
            }
        };
        xhr.send(null);
    } catch (e) {
        cb(e);
    }
}

function normalizeDateTime(dt) {
    // 允许：YYYY-MM-DD / YYYY-MM-DD HH:mm / YYYY-MM-DD HH:mm:ss / YYYYMMDDHHmm / YYYYMMDD
    if (!dt) return '';
    var s = String(dt).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
    if (/^\d{8}(\d{2}(\d{2})?)?$/.test(s)) {
        var y = s.slice(0, 4);
        var m = s.slice(4, 6);
        var d = s.slice(6, 8);
        var hh = s.length >= 10 ? s.slice(8, 10) : '00';
        var mm = s.length >= 12 ? s.slice(10, 12) : '00';
        var ss = s.length >= 14 ? s.slice(12, 14) : '00';
        return y + '-' + m + '-' + d + ' ' + hh + ':' + mm + ':' + ss;
    }
    return s;
}

function toDate(dt) {
    // Android 4.4 对 `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` 解析存在时区偏移差异，
    // 这里统一“手动按本地时间”解析，保证不同设备显示一致。
    var norm = normalizeDateTime(dt);
    if (!norm) return null;

    norm = String(norm).trim();
    // 兼容可能的 T 分隔符
    norm = norm.replace('T', ' ');

    // 支持：
    // 1) YYYY-MM-DD
    // 2) YYYY-MM-DD HH:mm
    // 3) YYYY-MM-DD HH:mm:ss
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(norm);
    if (!m) {
        // 最后兜底：尝试原生解析（可能仍有平台差异，但用于非常规输入）
        var fallback = new Date(norm);
        return (!isNaN(fallback.getTime())) ? fallback : null;
    }

    var year = parseInt(m[1], 10);
    var month = parseInt(m[2], 10) - 1;
    var day = parseInt(m[3], 10);
    var hours = m[4] != null ? parseInt(m[4], 10) : 0;
    var minutes = m[5] != null ? parseInt(m[5], 10) : 0;
    var seconds = m[6] != null ? parseInt(m[6], 10) : 0;

    return new Date(year, month, day, hours, minutes, seconds);
}

function isDateOnlyString(dt) {
    var norm = normalizeDateTime(dt);
    if (!norm) return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(String(norm).trim());
}

function toEndOfDay(dt) {
    var d = toDate(dt);
    if (!d) return null;
    d.setHours(23, 59, 59, 999);
    return d;
}

function formatDate(dateString) {
    var d = toDate(dateString);
    if (!d) return dateString || '';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function getTodayKeyByRange() {
    var now = new Date();
    for (var key in semesterConfig) {
        if (!hasOwn(semesterConfig, key)) continue;
        var sem = semesterConfig[key];
        var s2 = toDate(sem.start_date);
        var e2 = toDate(sem.end_date);
        if (isDateOnlyString(sem.end_date)) e2 = toEndOfDay(sem.end_date);
        if (s2 && e2 && now >= s2 && now <= e2) return key;
    }
    return null;
}

// 初始化学期选择器
function initSemesterFilter() {
    semesterFilter.innerHTML = '<option value="all">全部学期</option>';
    
    for (var key in semesterConfig) {
        if (!hasOwn(semesterConfig, key)) continue;
        var semester = semesterConfig[key];
        var option = document.createElement('option');
        option.value = key;
        option.textContent = semester.name;
        semesterFilter.appendChild(option);
    }
}

function loadSemesterConfig(cb) {
    fetchText('data/semesters.csv', function (err, csv) {
        if (err) return cb(err);
        var rows = parseCSV(csv);
        var cfg = {};
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (!r || !r.key) continue;
            cfg[r.key] = {
                key: r.key,
                name: r.name || r.key,
                start_date: r.start_date || '',
                end_date: r.end_date || '',
                file: r.file || ''
            };
        }
        semesterConfig = cfg;
        cb(null);
    });
}

function loadAnnouncementCsv(cb) {
    if (!announcementBar || !announcementText) {
        if (cb) cb();
        return;
    }

    fetchText('data/announcement.csv', function (err, csvText) {
        if (err) {
            console.warn('公告栏加载失败:', err);
            announcementBar.style.display = 'none';
            if (cb) cb(err);
            return;
        }

        var rows = parseCSV(csvText);
        var row0 = (rows && rows.length > 0) ? rows[0] : {};
        var text = row0.text || row0.announcement || row0.content || '';
        text = (text == null) ? '' : String(text);

        announcementText.textContent = text.trim() ? text : '暂无公告';
        announcementBar.style.display = 'block';

        if (cb) cb(null);
    });
}

function loadSemesterRecords(semesterKey, cb) {
    var sem = semesterConfig[semesterKey];
    if (!sem || !sem.file) return cb(new Error('学期配置缺少file：' + semesterKey));
    fetchText('data/' + sem.file, function (err, csv) {
        if (err) return cb(err);
        var parsed = parseCSV(csv);
        var rows = [];
        for (var i = 0; i < parsed.length; i++) {
            var r = parsed[i] || {};
            rows.push({
                id: r.id || '',
                type: r.type || '',
                person: r.person || '',
                detail: r.detail || '',
                datetime: normalizeDateTime(r.datetime || r.date || ''),
                admin: r.admin || r.teacher || '',
                method: r.method || '',
                points: r.points || '',
                status: r.status || '',
                semester: semesterKey,
                semesterName: sem.name
            });
        }

        // 分流：奖/惩（兼容英文）
        allPraiseData = [];
        allCriticismData = [];
        for (var j = 0; j < rows.length; j++) {
            var item = rows[j];
            var t = (item.type || '');
            var tl = (t && t.toLowerCase) ? t.toLowerCase() : t;
            if (t === '奖' || tl === 'praise') allPraiseData.push(item);
            else if (t === '惩' || tl === 'criticism') allCriticismData.push(item);
        }
        cb(null);
    });
}

// 初始化
function init() {
    loadSemesterConfig(function (err) {
        if (err) {
            console.error(err);
            showError('外部数据加载失败', '请用本地HTTP服务器打开（不要直接 file://）。Android 4.4 也需要通过 HTTP 才更稳定。');
            return;
        }

        initSemesterFilter();
        loadAnnouncementCsv(function () { /* 不阻塞后续数据加载 */ });

        var todayKey = getTodayKeyByRange() || 'current_semester';
        var firstKey = null;
        for (var k in semesterConfig) { if (hasOwn(semesterConfig, k)) { firstKey = k; break; } }
        selectedSemesterKey = semesterConfig[todayKey] ? todayKey : (firstKey || 'all');
        semesterFilter.value = selectedSemesterKey;

        loadSemesterRecords(selectedSemesterKey, function (err2) {
            if (err2) {
                console.error(err2);
                showError('外部数据加载失败', err2.message || String(err2));
                return;
            }

            applyFilters();
            startAutoScroll();
            updateCurrentTime();
            setInterval(updateCurrentTime, 1000);
        });
    });

    // 事件监听（不依赖数据加载）
    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keyup', function (event) {
        var key = event && (event.key || event.keyCode);
        if (key === 'Enter' || key === 13) handleSearch();
    });

    filterType.addEventListener('change', handleFilter);
    dateFilter.addEventListener('change', handleFilter);
    semesterFilter.addEventListener('change', function () {
        var key = semesterFilter.value;
        if (key === 'all') {
            alert('index页按单学期加载数据；如需查看全部学期，请点击“汇总所有学期”。');
            semesterFilter.value = selectedSemesterKey;
            return;
        }
        selectedSemesterKey = key;
        loadSemesterRecords(selectedSemesterKey, function (err) {
            if (err) {
                console.error(err);
                alert('加载失败：' + (err.message || String(err)));
                return;
            }
            applyFilters();
        });
    });

    pauseBtn.addEventListener('click', toggleScroll);
    resetBtn.addEventListener('click', resetScroll);
    loadDataBtn.addEventListener('click', reloadData);
    showCurrentSemesterBtn.addEventListener('click', showCurrentSemesterInfo);
}

// 渲染列表
function renderLists() {
    // 清空列表
    praiseList.innerHTML = '';
    criticismList.innerHTML = '';
    
    // 更新计数
    praiseCount.textContent = '(' + filteredPraiseData.length + '条记录)';
    criticismCount.textContent = '(' + filteredCriticismData.length + '条记录)';
    
    // 如果无数据
    if (filteredPraiseData.length === 0) {
        praiseList.innerHTML = ''
            + '<div class="no-data">'
            + '  <i class="far fa-smile"></i>'
            + '  <p>暂无表彰记录</p>'
            + '</div>';
    }
    
    if (filteredCriticismData.length === 0) {
        criticismList.innerHTML = ''
            + '<div class="no-data">'
            + '  <i class="far fa-frown"></i>'
            + '  <p>暂无批评记录</p>'
            + '</div>';
    }
    
    // 渲染表彰列表（奖）
    for (var pi = 0; pi < filteredPraiseData.length; pi++) {
        var item = filteredPraiseData[pi];
        var card = document.createElement('div');
        card.className = 'card praise-card praise';
        card.innerHTML = ''
            + '<div class="card-header">'
            + '  <div class="student-name">' + escapeHtml(item.person) + '</div>'
            + '  <div class="date">' + escapeHtml(formatDate(item.datetime)) + '</div>'
            + '</div>'
            + '<div class="card-body">'
            + '  <div class="reason">' + escapeHtml(item.detail) + '</div>'
            + '</div>'
            + '<div class="card-footer">'
            + '  <div class="semester-info"><i class="fas fa-calendar"></i><span>' + escapeHtml(item.semesterName || item.semester) + '</span></div>'
            + '  <div class="teacher-info"><i class="fas fa-user-shield"></i><span>' + escapeHtml(item.admin || '-') + '</span></div>'
            + '  <div class="teacher-info"><i class="fas fa-tag"></i><span>' + escapeHtml(item.method || '-') + '</span></div>'
            + '</div>';
        praiseList.appendChild(card);
    }
    
    // 渲染批评列表（惩）
    for (var ci = 0; ci < filteredCriticismData.length; ci++) {
        var item2 = filteredCriticismData[ci];
        var card2 = document.createElement('div');
        card.className = 'card criticism-card criticism';
        card2.innerHTML = ''
            + '<div class="card-header">'
            + '  <div class="student-name">' + escapeHtml(item2.person) + '</div>'
            + '  <div class="date">' + escapeHtml(formatDate(item2.datetime)) + '</div>'
            + '</div>'
            + '<div class="card-body">'
            + '  <div class="reason">' + escapeHtml(item2.detail) + '</div>'
            + '</div>'
            + '<div class="card-footer">'
            + '  <div class="semester-info"><i class="fas fa-calendar"></i><span>' + escapeHtml(item2.semesterName || item2.semester) + '</span></div>'
            + '  <div class="teacher-info"><i class="fas fa-user-shield"></i><span>' + escapeHtml(item2.admin || '-') + '</span></div>'
            + '  <div class="teacher-info"><i class="fas fa-tag"></i><span>' + escapeHtml(item2.method || '-') + '</span></div>'
            + '</div>';
        criticismList.appendChild(card2);
    }
    
    // 重置滚动位置
    praiseScrollPosition = 0;
    criticismScrollPosition = 0;
    setTranslateY(praiseList, praiseScrollPosition);
    setTranslateY(criticismList, criticismScrollPosition);
}

// 更新当前时间
function updateCurrentTime() {
    var now = new Date();
    function pad2(n) { return n < 10 ? ('0' + n) : String(n); }
    var y = now.getFullYear();
    var m = pad2(now.getMonth() + 1);
    var d = pad2(now.getDate());
    var hh = pad2(now.getHours());
    var mm = pad2(now.getMinutes());
    var ss = pad2(now.getSeconds());
    currentTimeElement.textContent = y + '-' + m + '-' + d + ' ' + hh + ':' + mm + ':' + ss;
}

// 处理搜索
function handleSearch() {
    applyFilters();
}

// 处理筛选
function handleFilter() {
    applyFilters();
}

// 应用筛选
function applyFilters() {
    var typeFilterValue = filterType.value;
    var dateFilterValue = dateFilter.value;
    var semesterFilterValue = semesterFilter.value;
    var searchTerm = (searchInput.value || '').trim().toLowerCase();
    
    // 初始化筛选结果
    var filteredPraise = allPraiseData.slice();
    var filteredCriticism = allCriticismData.slice();
    
    // 应用搜索筛选
    if (searchTerm !== '') {
        var p2 = [];
        for (var i = 0; i < filteredPraise.length; i++) {
            var item = filteredPraise[i];
            var ok = strIncludes((item.person || '').toLowerCase(), searchTerm)
                || strIncludes((item.detail || '').toLowerCase(), searchTerm)
                || strIncludes((item.admin || '').toLowerCase(), searchTerm)
                || strIncludes((item.method || '').toLowerCase(), searchTerm)
                || strIncludes((item.status || '').toLowerCase(), searchTerm);
            if (ok) p2.push(item);
        }
        filteredPraise = p2;

        var c2 = [];
        for (var j = 0; j < filteredCriticism.length; j++) {
            var itemc = filteredCriticism[j];
            var okc = strIncludes((itemc.person || '').toLowerCase(), searchTerm)
                || strIncludes((itemc.detail || '').toLowerCase(), searchTerm)
                || strIncludes((itemc.admin || '').toLowerCase(), searchTerm)
                || strIncludes((itemc.method || '').toLowerCase(), searchTerm)
                || strIncludes((itemc.status || '').toLowerCase(), searchTerm);
            if (okc) c2.push(itemc);
        }
        filteredCriticism = c2;
    }
    
    // 应用类型筛选
    if (typeFilterValue === 'praise') {
        filteredCriticism = [];
    } else if (typeFilterValue === 'criticism') {
        filteredPraise = [];
    }
    
    // 应用学期筛选
    // index页数据本身已按 selectedSemesterKey 加载；这里保留兼容
    if (semesterFilterValue !== 'all') {
        var p3 = [];
        for (var pi = 0; pi < filteredPraise.length; pi++) if (filteredPraise[pi].semester === semesterFilterValue) p3.push(filteredPraise[pi]);
        filteredPraise = p3;
        var c3 = [];
        for (var ci = 0; ci < filteredCriticism.length; ci++) if (filteredCriticism[ci].semester === semesterFilterValue) c3.push(filteredCriticism[ci]);
        filteredCriticism = c3;
    }
    
    // 应用时间筛选
    if (dateFilterValue !== 'all') {
        var now = new Date();
        var startDate = new Date(0);
        var endDate = new Date('9999-12-31');
        
        if (dateFilterValue === 'week') {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
        } else if (dateFilterValue === 'month') {
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 1);
        } else if (dateFilterValue === 'current_semester' && semesterConfig.current_semester) {
            startDate = toDate(semesterConfig.current_semester.start_date);
            endDate = toDate(semesterConfig.current_semester.end_date);
            if (isDateOnlyString(semesterConfig.current_semester.end_date)) endDate = toEndOfDay(semesterConfig.current_semester.end_date);
        } else if (dateFilterValue === 'last_semester' && semesterConfig.last_semester) {
            startDate = toDate(semesterConfig.last_semester.start_date);
            endDate = toDate(semesterConfig.last_semester.end_date);
            if (isDateOnlyString(semesterConfig.last_semester.end_date)) endDate = toEndOfDay(semesterConfig.last_semester.end_date);
        }

        var p4 = [];
        for (var pi2 = 0; pi2 < filteredPraise.length; pi2++) {
            var d1 = toDate(filteredPraise[pi2].datetime);
            if (d1 && d1 >= startDate && d1 <= endDate) p4.push(filteredPraise[pi2]);
        }
        filteredPraise = p4;

        var c4 = [];
        for (var ci2 = 0; ci2 < filteredCriticism.length; ci2++) {
            var d2 = toDate(filteredCriticism[ci2].datetime);
            if (d2 && d2 >= startDate && d2 <= endDate) c4.push(filteredCriticism[ci2]);
        }
        filteredCriticism = c4;
    }
    
    // 按日期排序 (最新的在前)
    filteredPraise.sort(function (a, b) {
        var tb = toDate(b.datetime); tb = tb ? tb.getTime() : 0;
        var ta = toDate(a.datetime); ta = ta ? ta.getTime() : 0;
        return tb - ta;
    });
    filteredCriticism.sort(function (a, b) {
        var tb = toDate(b.datetime); tb = tb ? tb.getTime() : 0;
        var ta = toDate(a.datetime); ta = ta ? ta.getTime() : 0;
        return tb - ta;
    });
    
    // 更新全局筛选数据
    filteredPraiseData = filteredPraise;
    filteredCriticismData = filteredCriticism;
    
    // 渲染筛选后的列表
    renderLists();
}

// 开始自动滚动
function startAutoScroll() {
    clearInterval(scrollInterval);
    
    scrollInterval = setInterval(function () {
        if (!isScrolling) return;
        
        // 获取列表高度
        var praiseListHeight = praiseList.scrollHeight;
        var criticismListHeight = criticismList.scrollHeight;
        
        // 获取容器高度
        var container = document.querySelector('.column-content');
        var containerHeight = container ? container.offsetHeight : 0;
        
        // 更新滚动位置
        praiseScrollPosition -= 1;
        criticismScrollPosition -= 1;
        
        // 如果滚动到末尾，回到顶部
        if (Math.abs(praiseScrollPosition) >= praiseListHeight - containerHeight) {
            praiseScrollPosition = 0;
        }
        
        if (Math.abs(criticismScrollPosition) >= criticismListHeight - containerHeight) {
            criticismScrollPosition = 0;
        }
        
        // 应用滚动
        setTranslateY(praiseList, praiseScrollPosition);
        setTranslateY(criticismList, criticismScrollPosition);
    }, scrollSpeed);
    
    // 更新状态显示
    statusDot.classList.remove('paused');
    statusText.textContent = '自动滚动中';
    pauseBtn.innerHTML = '<i class="fas fa-pause"></i> 暂停滚动';
}

// 切换滚动状态
function toggleScroll() {
    isScrolling = !isScrolling;
    
    if (isScrolling) {
        startAutoScroll();
    } else {
        clearInterval(scrollInterval);
        statusDot.classList.add('paused');
        statusText.textContent = '滚动已暂停';
        pauseBtn.innerHTML = '<i class="fas fa-play"></i> 继续滚动';
    }
}

// 重置滚动位置
function resetScroll() {
    praiseScrollPosition = 0;
    criticismScrollPosition = 0;
    setTranslateY(praiseList, praiseScrollPosition);
    setTranslateY(criticismList, criticismScrollPosition);
    
    // 如果滚动暂停，重置后自动开始
    if (!isScrolling) {
        isScrolling = true;
        startAutoScroll();
    }
}

// 重新加载数据
function reloadData() {
    // 清空现有数据
    allPraiseData = [];
    allCriticismData = [];
    filteredPraiseData = [];
    filteredCriticismData = [];
    
    loadSemesterConfig(function (err) {
        if (err) {
            console.error(err);
            alert('重新加载失败：' + (err.message || String(err)));
            return;
        }
        loadSemesterRecords(selectedSemesterKey, function (err2) {
            if (err2) {
                console.error(err2);
                alert('重新加载失败：' + (err2.meta ? err2.meta.message : err2.message || String(err2)));
                return;
            }
            initSemesterFilter();
            semesterFilter.value = selectedSemesterKey;
            applyFilters();
            alert('数据已重新加载！\n奖: ' + allPraiseData.length + ' 条\n惩: ' + allCriticismData.length + ' 条');
        });
    });
}

// 显示当前学期信息
function showCurrentSemesterInfo() {
    var currentSemester = semesterConfig[selectedSemesterKey] || semesterConfig.current_semester;
    if (currentSemester) {
        semesterInfoDisplay.innerHTML = ''
            + '<h3><i class="fas fa-info-circle"></i> 当前学期信息</h3>'
            + '<p><strong>学期名称:</strong> ' + escapeHtml(currentSemester.name) + '</p>'
            + '<p><strong>开始时间:</strong> ' + escapeHtml(currentSemester.start_date) + '</p>'
            + '<p><strong>结束时间:</strong> ' + escapeHtml(currentSemester.end_date) + '</p>'
        semesterInfoDisplay.style.display = 'block';
        
        // 3秒后自动隐藏
        setTimeout(function () {
            semesterInfoDisplay.style.display = 'none';
        }, 5000);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);