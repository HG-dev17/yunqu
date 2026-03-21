// 为兼容 Android 4.4：本文件使用 ES5 语法 + XHR（不使用 fetch/Promise/async/await）
var semesterConfig = {};
var allRecords = [];
var filteredRecords = [];

var globalSearchInput = document.getElementById('globalSearchInput');
var globalSearchBtn = document.getElementById('globalSearchBtn');
var gradeFilterAll = document.getElementById('gradeFilterAll');
var typeFilter = document.getElementById('typeFilter');
var semesterFilterAll = document.getElementById('semesterFilterAll');
var adminFilter = document.getElementById('adminFilter');
var methodFilter = document.getElementById('methodFilter');
var statusFilter = document.getElementById('statusFilter');
var startDateInput = document.getElementById('startDate');
var endDateInput = document.getElementById('endDate');
var resetFiltersBtn = document.getElementById('resetFiltersBtn');
var recordsTbody = document.getElementById('recordsTbody');
var totalCount = document.getElementById('totalCount');
var filteredCount = document.getElementById('filteredCount');

function stripBOM(s) {
    return s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function hasOwn(obj, k) {
    return Object.prototype.hasOwnProperty.call(obj, k);
}

function strIncludes(hay, needle) {
    hay = String(hay == null ? '' : hay);
    needle = String(needle == null ? '' : needle);
    return hay.indexOf(needle) !== -1;
}

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
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Cache-Control', 'no-cache');
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
    var norm = normalizeDateTime(dt);
    var isoLike = strIncludes(norm, ' ') ? norm.replace(' ', 'T') : norm;
    var d = new Date(isoLike);
    return isNaN(d.getTime()) ? null : d;
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderTable(records) {
    if (!records || records.length === 0) {
        recordsTbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">无匹配记录</td></tr>';
        return;
    }

    var html = '';
    for (var i = 0; i < records.length; i++) {
        var r = records[i];
        var dt = normalizeDateTime(r.datetime);
        var grade = r.grade || '';
        html += ''
            + '<tr>'
            + '<td>' + escapeHtml(grade) + '</td>'
            + '<td>' + escapeHtml(r.semesterName || r.semester) + '</td>'
            + '<td>' + escapeHtml(r.type) + '</td>'
            + '<td>' + escapeHtml(r.person) + '</td>'
            + '<td style="max-width:420px;">' + escapeHtml(r.detail) + '</td>'
            + '<td>' + escapeHtml(dt) + '</td>'
            + '<td>' + escapeHtml(r.admin) + '</td>'
            + '<td>' + escapeHtml(r.method) + '</td>'
            + '<td>' + escapeHtml(r.points) + '</td>'
            + '<td>' + escapeHtml(r.status) + '</td>'
            + '</tr>';
    }
    recordsTbody.innerHTML = html;
}

function setSelectOptions(selectEl, values, defaultLabel) {
    var current = selectEl.value;
    selectEl.innerHTML = '<option value="all">' + escapeHtml(defaultLabel) + '</option>';
    for (var i = 0; i < values.length; i++) {
        var v = values[i];
        var opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    }
    // 尽量保留已有选择
    var keep = false;
    for (var oi = 0; oi < selectEl.options.length; oi++) {
        if (selectEl.options[oi].value === current) { keep = true; break; }
    }
    if (keep) selectEl.value = current;
}

function refreshDynamicFilters() {
    var adminsMap = {};
    var methodsMap = {};
    var statusesMap = {};

    for (var i = 0; i < allRecords.length; i++) {
        var r = allRecords[i];
        if (r.admin) adminsMap[r.admin] = true;
        if (r.method) methodsMap[r.method] = true;
        if (r.status) statusesMap[r.status] = true;
    }

    function keysSorted(map) {
        var arr = [];
        for (var k in map) if (hasOwn(map, k)) arr.push(k);
        arr.sort();
        return arr;
    }

    setSelectOptions(adminFilter, keysSorted(adminsMap), '全部管理员/处理人');
    setSelectOptions(methodFilter, keysSorted(methodsMap), '全部奖惩方式');
    setSelectOptions(statusFilter, keysSorted(statusesMap), '全部状态');
}

function applyFilters() {
    var q = (globalSearchInput.value || '').trim().toLowerCase();
    var grade = gradeFilterAll.value;
    var type = typeFilter.value;
    var sem = semesterFilterAll.value;
    var admin = adminFilter.value;
    var method = methodFilter.value;
    var status = statusFilter.value;
    var start = startDateInput.value ? new Date(startDateInput.value) : null;
    var end = endDateInput.value ? new Date(endDateInput.value) : null;

    var arr = allRecords.slice();

    if (grade !== 'all') {
        var g2 = [];
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].grade === grade) {
                g2.push(arr[i]);
            }
        }
        arr = g2;
    }

    if (type !== 'all') {
        var t2 = [];
        for (var i = 0; i < arr.length; i++) if (arr[i].type === type) t2.push(arr[i]);
        arr = t2;
    }
    if (sem !== 'all') {
        var s2 = [];
        for (var j = 0; j < arr.length; j++) if (arr[j].semester === sem) s2.push(arr[j]);
        arr = s2;
    }
    if (admin !== 'all') {
        var a2 = [];
        for (var k = 0; k < arr.length; k++) if (arr[k].admin === admin) a2.push(arr[k]);
        arr = a2;
    }
    if (method !== 'all') {
        var m2 = [];
        for (var m = 0; m < arr.length; m++) if (arr[m].method === method) m2.push(arr[m]);
        arr = m2;
    }
    if (status !== 'all') {
        var st2 = [];
        for (var n = 0; n < arr.length; n++) if (arr[n].status === status) st2.push(arr[n]);
        arr = st2;
    }

    if (start || end) {
        var dArr = [];
        for (var x = 0; x < arr.length; x++) {
            var d = toDate(arr[x].datetime);
            if (!d) continue;
            if (start && d < start) continue;
            if (end) {
                var end2 = new Date(end);
                end2.setHours(23, 59, 59, 999);
                if (d > end2) continue;
            }
            dArr.push(arr[x]);
        }
        arr = dArr;
    }

    if (q) {
        var q2 = [];
        for (var y = 0; y < arr.length; y++) {
            var r = arr[y];
            var hay = (String(r.person || '') + ' ' + String(r.detail || '') + ' ' + String(r.admin || '') + ' ' + String(r.method || '') + ' ' + String(r.status || '') + ' ' + String(r.semesterName || '')).toLowerCase();
            if (strIncludes(hay, q)) q2.push(r);
        }
        arr = q2;
    }

    arr.sort(function (a, b) {
        var tb = toDate(b.datetime); tb = tb ? tb.getTime() : 0;
        var ta = toDate(a.datetime); ta = ta ? ta.getTime() : 0;
        return tb - ta;
    });

    filteredRecords = arr;
    renderTable(filteredRecords);
    filteredCount.textContent = '筛选后：' + filteredRecords.length + ' 条';
}

function loadAll(cb) {
    fetchText('data/semesters.csv', function (err, semCsv) {
        if (err) return cb(err);

        var semRows = parseCSV(semCsv);
        semesterConfig = {};
        for (var i = 0; i < semRows.length; i++) {
            var r = semRows[i];
            if (!r || !r.key) continue;
            semesterConfig[r.key] = {
                key: r.key,
                name: r.name || r.key,
                start_date: r.start_date || '',
                end_date: r.end_date || '',
                file: r.file || ''
            };
        }

        // 填充学期下拉
        semesterFilterAll.innerHTML = '<option value="all">全部学期</option>';
        for (var key in semesterConfig) {
            if (!hasOwn(semesterConfig, key)) continue;
            var sem = semesterConfig[key];
            var opt = document.createElement('option');
            opt.value = key;
            opt.textContent = sem.name;
            semesterFilterAll.appendChild(opt);
        }

        // 逐个加载每个学期 CSV（回调计数，不依赖 Promise）
        var semList = [];
        for (var k in semesterConfig) {
            if (!hasOwn(semesterConfig, k)) continue;
            if (semesterConfig[k] && semesterConfig[k].file) semList.push(semesterConfig[k]);
        }

        allRecords = [];
        if (semList.length === 0) {
            totalCount.textContent = '总计：0 条';
            refreshDynamicFilters();
            applyFilters();
            return cb(null);
        }

        var remaining = semList.length;
        var anyErr = null;
        for (var si = 0; si < semList.length; si++) {
            (function (sem) {
                fetchText('data/' + sem.file, function (err2, csv) {
                    if (err2 && !anyErr) anyErr = err2;
                    if (!err2) {
                        var rows = parseCSV(csv);
                        for (var j = 0; j < rows.length; j++) {
                            var rr = rows[j] || {};
                            var grade = rr.grade || '';
                            allRecords.push({
                                id: rr.id || '',
                                type: rr.type || '',
                                person: rr.person || '',
                                detail: rr.detail || '',
                                datetime: normalizeDateTime(rr.datetime || rr.date || ''),
                                admin: rr.admin || rr.teacher || '',
                                method: rr.method || '',
                                points: rr.points || '',
                                status: rr.status || '',
                                grade: grade,
                                semester: sem.key,
                                semesterName: sem.name
                            });
                        }
                    }

                    remaining--;
                    if (remaining === 0) {
                        if (anyErr) return cb(anyErr);
                        totalCount.textContent = '总计：' + allRecords.length + ' 条';
                        refreshDynamicFilters();
                        applyFilters();
                        cb(null);
                    }
                });
            })(semList[si]);
        }
    });
}

function bindEvents() {
    globalSearchBtn.addEventListener('click', applyFilters);
    globalSearchInput.addEventListener('keyup', function (e) {
        var key = e && (e.key || e.keyCode);
        if (key === 'Enter' || key === 13) applyFilters();
    });
    [gradeFilterAll, typeFilter, semesterFilterAll, adminFilter, methodFilter, statusFilter, startDateInput, endDateInput]
        .forEach(function (el) { el.addEventListener('change', applyFilters); });

    resetFiltersBtn.addEventListener('click', function () {
        globalSearchInput.value = '';
        gradeFilterAll.value = 'all';
        typeFilter.value = 'all';
        semesterFilterAll.value = 'all';
        adminFilter.value = 'all';
        methodFilter.value = 'all';
        statusFilter.value = 'all';
        startDateInput.value = '';
        endDateInput.value = '';
        applyFilters();
    });
}

function init() {
    bindEvents();
    loadAll(function (err) {
        if (!err) return;
        console.error(err);
        recordsTbody.innerHTML = ''
            + '<tr>'
            + '  <td colspan="9" style="text-align:center; padding:20px;">'
            + '    外部CSV加载失败。建议用本地HTTP服务器打开（不要直接 file://）。'
            + '  </td>'
            + '</tr>';
    });
}

document.addEventListener('DOMContentLoaded', init);

