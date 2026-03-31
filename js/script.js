// 外部CSV数据源：
// - data/semesters.csv：学期索引（key,name,start_date,end_date,file）
// - data/<semester>.csv：每学期一个记录CSV（建议字段：id,type,person,detail,datetime,admin,method,points,status）
// 为兼容 Android 4.4：本文件使用 ES5 语法 + XHR（不使用 fetch/Promise/async/await）

// 简单的Android 4.4兼容性处理
if (!Array.prototype.forEach) {
    Array.prototype.forEach = function(callback, thisArg) {
        var T, k;
        if (this == null) {
            throw new TypeError(' this is null or not defined');
        }
        var O = Object(this);
        var len = O.length >>> 0;
        if (typeof callback !== "function") {
            throw new TypeError(callback + ' is not a function');
        }
        if (arguments.length > 1) {
            T = thisArg;
        }
        k = 0;
        while (k < len) {
            var kValue;
            if (k in O) {
                kValue = O[k];
                callback.call(T, kValue, k, O);
            }
            k++;
        }
    };
}

if (!String.prototype.trim) {
    String.prototype.trim = function() {
        return this.replace(/^\s+|\s+$/g, '');
    };
}
var semesterConfig = {};
var selectedSemesterKey = 'all';

// 全局数据存储
var allPraiseData = [];
var allCriticismData = [];
var filteredPraiseData = [];
var filteredCriticismData = [];
var filteredCombinedData = []; // 用于存储合并后的筛选结果

// 获取DOM元素
var combinedList = document.getElementById('combinedList');
var combinedCount = document.getElementById('combinedCount');
var searchInput = document.getElementById('searchInput');
var searchBtn = document.getElementById('searchBtn');
var gradeFilter = document.getElementById('gradeFilter');
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
var announcementList = document.getElementById('announcementList');
var announcementColumn = document.querySelector('.content-area .column');
var announcementGradeFilter = document.getElementById('announcementGradeFilter');
var allAnnouncements = [];
var countdownDisplay = document.getElementById('countdownDisplay');
var countdownConfig = {}; // 倒计时配置
var countdownInterval = null; // 倒计时定时器

// 滚动相关变量
var isScrolling = true;
var combinedScrollOffset = 0; // 单栏滚动偏移量
var announcementScrollOffset = 0; // 公告栏滚动偏移量
var scrollInterval = null;
var scrollSpeed = 30;
var announcementScrollInterval = null; // 公告栏滚动定时器
var isAnnouncementScrolling = true; // 公告栏滚动状态

function applyVerticalTransform(el, px) {
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
    if (combinedList) {
        combinedList.innerHTML = html;
        combinedCount.textContent = '';
    }
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
    // Android 4.4.4 的 XHR 兼容性极差，需要进行特殊处理
    var xhr = new XMLHttpRequest();
    
    // 增强的缓存破坏机制：使用时间戳+随机数+页面刷新计数
    var cacheBuster = '?nocache=' + new Date().getTime() + '&rand=' + Math.random().toString(36).substring(7);
    
    // 尝试探测是否为已知有问题的浏览器
    var ua = navigator.userAgent || '';
    var isAndroid44 = (ua.indexOf('Android 4.4') > -1 || ua.indexOf('Android 5.') > -1) && ua.indexOf('Chrome') === -1;
    
    // Android 4.4.4 强制使用同步请求
    var useAsync = !isAndroid44;

    // 构造完整URL
    var fullUrl = url;
    if (!fullUrl.match(/^https?:\/\//)) {
        var base = window.location.href;
        base = base.substring(0, base.lastIndexOf('/') + 1);
        fullUrl = base + fullUrl;
    }
    
    // 添加缓存破坏参数
    var targetUrl = fullUrl + cacheBuster;

    if (useAsync) {
        // 异步请求
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0 || xhr.status === 304) {
                    cb(null, xhr.responseText);
                } else {
                    console.warn('XHR async failed (' + xhr.status + '), trying sync fallback for:', url);
                    trySyncFallback(url, cb);
                }
            }
        };
        
        try {
            xhr.open('GET', targetUrl, true);
            xhr.setRequestHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            xhr.setRequestHeader('Pragma', 'no-cache');
            xhr.setRequestHeader('Expires', '0');
            xhr.timeout = 15000;
            xhr.ontimeout = function() {
                console.warn('XHR timeout, trying sync fallback for:', url);
                trySyncFallback(url, cb);
            };
            xhr.send(null);
        } catch (asyncErr) {
            console.warn('Async XHR setup failed:', asyncErr.message, 'trying sync for:', url);
            trySyncFallback(url, cb);
        }
    } else {
        // Android 4.4.4 直接使用同步请求
        trySyncFallback(url, cb);
    }

    // 同步请求函数（用于 Android 4.4.4）
    function trySyncFallback(urlToFetch, callback) {
        var syncXhr = new XMLHttpRequest();
        
        // 为同步请求生成新的缓存破坏参数
        var syncCacheBuster = '?sync=' + new Date().getTime() + '&r=' + Math.random().toString(36).substring(7) + '&v=' + Math.floor(Math.random() * 1000000);
        
        var syncUrl = urlToFetch + syncCacheBuster;
        var base = window.location.href;
        base = base.substring(0, base.lastIndexOf('/') + 1);
        if (!syncUrl.match(/^https?:\/\//)) {
            syncUrl = base + syncUrl;
        }
        
        try {
            syncXhr.open('GET', syncUrl, false);
            syncXhr.setRequestHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            syncXhr.setRequestHeader('Pragma', 'no-cache');
            syncXhr.setRequestHeader('Expires', '0');
            syncXhr.send(null);
            
            if ((syncXhr.status >= 200 && syncXhr.status < 300) || syncXhr.status === 0) {
                callback(null, syncXhr.responseText);
            } else {
                callback(new Error('同步请求失败 HTTP ' + syncXhr.status + ' for: ' + urlToFetch));
            }
        } catch (syncErr) {
            callback(new Error('同步请求异常: ' + syncErr.message + ' for: ' + urlToFetch));
        }
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
    if (!norm) return null;
    norm = String(norm).trim().replace('T', ' ');
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(norm);
    if (!m) {
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

// 加载倒计时配置
function loadCountdownConfig(cb) {
    fetchText('data/countdown.csv', function (err, csv) {
        if (err) {
            console.warn('倒计时配置加载失败:', err);
            if (cb) cb(err);
            return;
        }
        var rows = parseCSV(csv);
        countdownConfig = []; // 改为数组，支持任意数量的倒计时
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (!r || !r.grade) continue;
            countdownConfig.push({
                grade: r.grade,
                name: r.name || '',
                target_date: r.target_date || '',
                description: r.description || ''
            });
        }
        if (cb) cb(null);
    });
}

// 更新倒计时显示
function updateCountdown() {
    if (!countdownDisplay) return;
    
    var now = new Date();
    var html = '';
    
    // 年级名称映射
    var gradeNames = {'1': '初一', '2': '初二', '3': '初三'};
    
    // 遍历所有倒计时配置（支持任意数量）
    for (var i = 0; i < countdownConfig.length; i++) {
        var config = countdownConfig[i];
        
        if (config && config.target_date) {
            var targetDate = toDate(config.target_date);
            
            if (targetDate) {
                var diff = targetDate - now;
                var absDiff = Math.abs(diff);
                var days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
                var hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                var minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
                var seconds = Math.floor((absDiff % (1000 * 60)) / 1000);
                
                var timeStr = '';
                if (diff > 0) {
                    timeStr = days + '天 ' + hours + '小时 ' + minutes + '分 ' + seconds + '秒';
                } else {
                    // 倒计时结束后显示负数计时
                    timeStr = '-' + days + '天 ' + hours + '小时 ' + minutes + '分 ' + seconds + '秒';
                }
                
                var gradeLabel = gradeNames[config.grade] || config.grade;
                
                html += '<div class="countdown-item grade-' + config.grade + '">'
                    + '<div class="countdown-title">' + escapeHtml(config.name) + ' <span class="countdown-grade">(' + gradeLabel + ')</span></div>'
                    + '<div class="countdown-time">' + timeStr + '</div>'
                    + '<div class="countdown-desc">' + escapeHtml(config.description) + '</div>'
                    + '</div>';
            }
        }
    }
    
    countdownDisplay.innerHTML = html;
}

function loadAnnouncementCsv(cb) {
    if (!announcementColumn || !announcementList) {
        if (cb) cb();
        return;
    }
    fetchText('data/announcement.csv', function (err, csvText) {
        if (err) {
            console.warn('公告栏加载失败:', err);
            announcementColumn.style.display = 'none';
            if (cb) cb(err);
            return;
        }
        var processedText = '';
        var inQuotes = false;
        for (var i = 0; i < csvText.length; i++) {
            var c = csvText.charAt(i);
            var next = csvText.charAt(i + 1);
            if (c === '"' && next === '"') {
                processedText += '""';
                i++;
            } else if (c === '"') {
                inQuotes = !inQuotes;
                processedText += '"';
            } else if (c === '\n' && inQuotes) {
                processedText += '\\n';
            } else {
                processedText += c;
            }
        }
        var rows = parseCSV(processedText);
        allAnnouncements = [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i] || {};
            var text = row.text || row.announcement || row.content || '';
            var grade = row.grade || 'all';
            // 即使内容为空的公告也要展示
            allAnnouncements.push({
                text: text.trim().replace(/\\n/g, '\n'),
                grade: grade,
                time: row.time || '',
                image: row.image || '',
                video: row.video || ''
            });
        }
        renderAnnouncements();
        if (allAnnouncements.length > 0) {
            announcementColumn.style.display = 'block';
        } else {
            announcementColumn.style.display = 'none';
        }
        if (cb) cb(null);
    });
}

function loadSemesterRecords(semesterKey, cb) {
    // Android 4.4兼容处理：添加错误检查和详细日志
    try {
        var sem = semesterConfig[semesterKey];
        if (!sem || !sem.file) {
            var errorMsg = '学期配置缺少file：' + semesterKey;
            console.error(errorMsg);
            return cb(new Error(errorMsg));
        }
        
        var url = 'data/' + sem.file;
        console.log("正在加载学期数据:", url);
        
        fetchText(url, function (err, csv) {
            if (err) {
                console.error("加载学期数据失败:", err);
                return cb(err);
            }
            
            try {
                var parsed = parseCSV(csv);
                console.log("解析CSV数据成功，记录数:", parsed.length);
                
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
                        grade: r.grade || '',
                        semester: semesterKey,
                        semesterName: sem.name
                    });
                }
                
                allPraiseData = [];
                allCriticismData = [];
                
                for (var j = 0; j < rows.length; j++) {
                    var item = rows[j];
                    var t = (item.type || '');
                    var tl = (t && t.toLowerCase) ? t.toLowerCase() : t;
                    if (t === '奖' || tl === 'praise') allPraiseData.push(item);
                    else if (t === '惩' || tl === 'criticism') allCriticismData.push(item);
                }
                
                console.log("学期数据加载完成 - 表彰:", allPraiseData.length, "条, 批评:", allCriticismData.length, "条");
                cb(null);
            } catch (e) {
                console.error("处理学期数据时出错:", e);
                cb(new Error("处理学期数据时出错: " + e.message));
            }
        });
    } catch (e) {
        console.error("加载学期记录失败:", e);
        cb(new Error("加载学期记录失败: " + e.message));
    }
}

function renderAnnouncements() {
    if (!announcementList) return;
    var selectedGrade = announcementGradeFilter ? announcementGradeFilter.value : 'all';
    announcementList.innerHTML = '';
    var filteredAnnouncements = [];
    for (var i = 0; i < allAnnouncements.length; i++) {
        var announcement = allAnnouncements[i];
        // 兼容数字和字符串形式的年级值，如"2"和"初二"
        if (selectedGrade === 'all' || 
            announcement.grade === selectedGrade || 
            (selectedGrade === '2' && announcement.grade === '初二') ||
            (selectedGrade === '初二' && announcement.grade === '2') ||
            (selectedGrade === '1' && announcement.grade === '初一') ||
            (selectedGrade === '初一' && announcement.grade === '1') ||
            (selectedGrade === '3' && announcement.grade === '初三') ||
            (selectedGrade === '初三' && announcement.grade === '3')) {
            filteredAnnouncements.push(announcement);
        }
    }
    if (filteredAnnouncements.length === 0) {
        announcementList.innerHTML = ''
            + '<div class="no-data">'
            + '  <i class="far fa-bell"></i>'
            + '  <p>暂无公告</p>'
            + '</div>';
        return;
    }
    for (var j = 0; j < filteredAnnouncements.length; j++) {
        var ann = filteredAnnouncements[j];
        var item = document.createElement('div');
        item.className = 'announcement-item';
        var gradeLabel = '';
        if (ann.grade && ann.grade !== 'all') {
            var gradeMap = { '1': '初一', '2': '初二', '3': '初三' };
            gradeLabel = '<span class="announcement-item-grade">' + (gradeMap[ann.grade] || ann.grade) + '</span>';
        }
        var formattedText = escapeHtml(ann.text).replace(/\n/g, '<br>');

        // 处理多个图片 - Android 4.4 优化
        var imageHtml = '';
        if (ann.image && ann.image.trim()) {
            var images = ann.image.split('|').filter(function(img) { return img && img.trim(); });
            if (images.length > 0) {
                imageHtml = '<div class="announcement-item-images">';
                for (var i = 0; i < images.length; i++) {
                    var imagePath = images[i].trim();
                    if (!imagePath.match(/^https?:\/\//) && !imagePath.match(/^data\//)) {
                        imagePath = 'data/img/' + imagePath;
                    }
                    // Android 4.4 兼容：使用 data-src 懒加载，避免同时加载过多图片
                    // 移除 loading="lazy"（Android 4.4 不支持）
                    // 添加 data-original 存储真实路径
                    imageHtml += '<div class="announcement-item-image"><img data-src="' + imagePath + '" src="" alt="公告图片" onclick="showImageModal(\'' + imagePath + '\')" onerror="this.src=\'\'; this.alt=\'图片加载失败\'" style="background-color:#f0f0f0;min-height:150px;"></div>';
                }
                imageHtml += '</div>';
            }
        }

        // 处理多个视频 - Android 4.4 优化
                var videoHtml = '';
                if (ann.video && ann.video.trim()) {
                    var videos = ann.video.split('|').filter(function(vid) { return vid && vid.trim(); });
                    if (videos.length > 0) {
                        videoHtml = '<div class="announcement-item-videos">';
                        for (var j = 0; j < videos.length; j++) {
                            var videoPath = videos[j].trim();
                            if (!videoPath.match(/^https?:\/\//) && !videoPath.match(/^data\//)) {
                                videoPath = 'data/video/' + videoPath;
                            }
                            // Android 4.4 兼容：添加多种防止自动全屏的属性
                            // 添加 controls 让用户可以手动控制播放
                            // 移除 autoplay，避免安卓4.4自动全屏
                            videoHtml += '<div class="announcement-item-video"><video data-src="' + videoPath + '" muted loop playsinline webkit-playsinline x-webkit-airplay="allow" preload="none" controls><p>您的浏览器不支持视频播放。</p></video></div>';
                        }
                        videoHtml += '</div>';
                    }
                }

        item.innerHTML = ''
            + gradeLabel
            + imageHtml
            + videoHtml
            + '<div class="announcement-item-content">' + formattedText + '</div>'
            + (ann.time ? '<div class="announcement-item-time"><i class="far fa-clock"></i> ' + formatDate(ann.time) + '</div>' : '');
        announcementList.appendChild(item);
    }
}

function renderCombinedList() {
    combinedList.innerHTML = '';
    filteredCombinedData = [];
    for (var i = 0; i < filteredPraiseData.length; i++) {
        var item = filteredPraiseData[i];
        item.displayType = 'praise';
        filteredCombinedData.push(item);
    }
    for (var j = 0; j < filteredCriticismData.length; j++) {
        var item2 = filteredCriticismData[j];
        item2.displayType = 'criticism';
        filteredCombinedData.push(item2);
    }
    filteredCombinedData.sort(function (a, b) {
        var tb = toDate(b.datetime); tb = tb ? tb.getTime() : 0;
        var ta = toDate(a.datetime); ta = ta ? ta.getTime() : 0;
        return tb - ta;
    });
    combinedCount.textContent = '(' + filteredCombinedData.length + '条记录)';
    if (filteredCombinedData.length === 0) {
        combinedList.innerHTML = ''
            + '<div class="no-data">'
            + '  <i class="fas fa-clipboard-list"></i>'
            + '  <p>暂无奖惩记录</p>'
            + '</div>';
        return;
    }
    for (var k = 0; k < filteredCombinedData.length; k++) {
        var record = filteredCombinedData[k];
        var isPraise = record.displayType === 'praise';
        var card = document.createElement('div');
        card.className = 'combined-card ' + (isPraise ? 'praise' : 'criticism');
        var typeIcon = isPraise ? '<i class="fas fa-trophy"></i> 表彰' : '<i class="fas fa-exclamation-triangle"></i> 批评';
        var nameColorClass = isPraise ? 'praise-name' : 'criticism-name';
        card.innerHTML = ''
            + '<div class="card-header">'
            + '  <div class="student-name ' + nameColorClass + '">' + escapeHtml(record.person) + ' <small>(' + typeIcon + ')</small></div>'
            + '  <div class="date">' + escapeHtml(formatDate(record.datetime)) + '</div>'
            + '</div>'
            + '<div class="card-body">'
            + '  <div class="reason">' + escapeHtml(record.detail) + '</div>'
            + '</div>'
            + '<div class="card-footer">'
            + '  <div class="semester-info"><i class="fas fa-calendar"></i><span>' + escapeHtml(record.semesterName || record.semester) + '</span></div>'
            + '  <div class="teacher-info"><i class="fas fa-user-shield"></i><span>' + escapeHtml(record.admin || '-') + '</span></div>'
            + '  <div class="teacher-info"><i class="fas fa-tag"></i><span>' + escapeHtml(record.method || '-') + '</span></div>'
            + '</div>';
        combinedList.appendChild(card);
    }
    combinedScrollOffset = 0;
    
    // 同步滚动条位置
    var container = document.querySelector('.column-content-single');
    if (container) {
        container.scrollTop = 0;
    }
    
    // 不再需要transform，只使用CSS的原生滚动
}

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

function handleSearch() {
    applyFilters();
}

function handleFilter() {
    applyFilters();
}

function applyFilters() {
    var gradeFilterValue = gradeFilter.value;
    var typeFilterValue = filterType.value;
    var dateFilterValue = dateFilter.value;
    var semesterFilterValue = semesterFilter.value;
    var searchTerm = (searchInput.value || '').trim().toLowerCase();
    
    var filteredPraise = allPraiseData.slice();
    var filteredCriticism = allCriticismData.slice();
    
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
    
    if (gradeFilterValue !== 'all') {
        var gradeMap = { 'grade1': '初一', 'grade2': '初二', 'grade3': '初三' };
        var targetGrade = gradeMap[gradeFilterValue] || '';
        var pGrade = [];
        for (var i = 0; i < filteredPraise.length; i++) {
            var item = filteredPraise[i];
            if (item.grade === targetGrade) pGrade.push(item);
        }
        filteredPraise = pGrade;
        var cGrade = [];
        for (var j = 0; j < filteredCriticism.length; j++) {
            var itemc = filteredCriticism[j];
            if (itemc.grade === targetGrade) cGrade.push(itemc);
        }
        filteredCriticism = cGrade;
    }

    if (typeFilterValue === 'praise') {
        filteredCriticism = [];
    } else if (typeFilterValue === 'criticism') {
        filteredPraise = [];
    }
    
    if (semesterFilterValue !== 'all') {
        var p3 = [];
        for (var pi = 0; pi < filteredPraise.length; pi++) if (filteredPraise[pi].semester === semesterFilterValue) p3.push(filteredPraise[pi]);
        filteredPraise = p3;
        var c3 = [];
        for (var ci = 0; ci < filteredCriticism.length; ci++) if (filteredCriticism[ci].semester === semesterFilterValue) c3.push(filteredCriticism[ci]);
        filteredCriticism = c3;
    }
    
    if (dateFilterValue !== 'all') {
        var now = new Date();
        var startDate = new Date(0);
        var endDate = new Date('9999-12-31');
        if (dateFilterValue === 'week') {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - now.getDay());
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
        } else if (dateFilterValue === 'month') {
            startDate = new Date(now);
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(now);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0);
            endDate.setHours(23, 59, 59, 999);
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
    
    filteredPraiseData = filteredPraise;
    filteredCriticismData = filteredCriticism;
    
    renderCombinedList();
}

function startAutoScroll() {
    clearInterval(scrollInterval);
    
    scrollInterval = setInterval(function () {
        if (!isScrolling) return;
        
        var container = document.querySelector('.column-content-single');
        if (!container || !combinedList) {
            console.warn('滚动容器或列表未找到，滚动暂停。');
            clearInterval(scrollInterval);
            return;
        }
        var containerHeight = container.offsetHeight;
        var listHeight = combinedList.scrollHeight;
        
        // 检查用户是否正在手动滚动
        if (container.scrollTop !== Math.abs(combinedScrollOffset)) {
            // 用户正在手动滚动，更新偏移量以匹配当前位置
            combinedScrollOffset = -container.scrollTop;
            return; // 跳过本次自动滚动，不打断用户操作
        }

        combinedScrollOffset -= 1;
        
        if (listHeight > 0 && Math.abs(combinedScrollOffset) >= listHeight - containerHeight) {
            combinedScrollOffset = 0;
        }
        
        // 同步滚动条位置
        container.scrollTop = Math.abs(combinedScrollOffset);
    }, scrollSpeed);
    
    statusDot.classList.remove('paused');
    statusText.textContent = '自动滚动中';
    pauseBtn.innerHTML = '<i class="fas fa-pause"></i> 暂停滚动';
}

// 公告栏自动滚动功能
function startAnnouncementAutoScroll() {
    clearInterval(announcementScrollInterval);
    
    var isWaitingAtBottom = false; // 是否在底部等待
    
    announcementScrollInterval = setInterval(function () {
        if (!isAnnouncementScrolling) return;
        
        var container = announcementList;
        if (!container) {
            console.warn('公告栏容器未找到，滚动暂停。');
            clearInterval(announcementScrollInterval);
            return;
        }
        
        var containerHeight = container.offsetHeight;
        var listHeight = container.scrollHeight;
        
        // 检查用户是否正在手动滚动（在非等待状态下）
        if (!isWaitingAtBottom && container.scrollTop !== announcementScrollOffset) {
            announcementScrollOffset = container.scrollTop;
            return;
        }
        
        // 如果在底部等待中，不进行滚动
        if (isWaitingAtBottom) {
            return;
        }
        
        announcementScrollOffset += 1;
        
        // 如果滚动到底部，等待5秒后快速置顶
        if (listHeight > 0 && announcementScrollOffset >= listHeight - containerHeight) {
            isWaitingAtBottom = true;
            
            // 5秒后快速置顶
            setTimeout(function() {
                if (!isAnnouncementScrolling || !container) {
                    isWaitingAtBottom = false;
                    return;
                }
                
                // 快速置顶，同时重置偏移量
                announcementScrollOffset = 0;
                container.scrollTop = 0;
                isWaitingAtBottom = false;
            }, 5000); // 等待5秒
        }
        
        // 同步滚动条位置
        container.scrollTop = announcementScrollOffset;
    }, scrollSpeed);
}

function toggleScroll() {
    isScrolling = !isScrolling;
    isAnnouncementScrolling = isScrolling; // 公告栏滚动状态同步
    
    if (isScrolling) {
        startAutoScroll();
        startAnnouncementAutoScroll();
    } else {
        clearInterval(scrollInterval);
        clearInterval(announcementScrollInterval);
        statusDot.classList.add('paused');
        statusText.textContent = '滚动已暂停';
        pauseBtn.innerHTML = '<i class="fas fa-play"></i> 继续滚动';
    }
}

function resetScrollPosition() {
    // 重置奖惩榜滚动位置
    combinedScrollOffset = 0;
    
    // 同步滚动条位置
    var container = document.querySelector('.column-content-single');
    if (container) {
        container.scrollTop = 0;
    }
    
    // 重置公告栏滚动位置
    announcementScrollOffset = 0;
    if (announcementList) {
        announcementList.scrollTop = 0;
    }
    
    // 不再需要transform，只使用CSS的原生滚动
    // 奖惩榜的自动滚动功能
    if (!isScrolling) {
        isScrolling = true;
    }
    if (!isAnnouncementScrolling) {
        isAnnouncementScrolling = true;
    }
    clearInterval(scrollInterval);
    clearInterval(announcementScrollInterval);
    startAutoScroll();
    startAnnouncementAutoScroll();
}

function reloadData() {
    allPraiseData = [];
    allCriticismData = [];
    filteredPraiseData = [];
    filteredCriticismData = [];
    filteredCombinedData = [];
    
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

function showCurrentSemesterInfo() {
    var currentSemester = semesterConfig[selectedSemesterKey] || semesterConfig.current_semester;
    if (currentSemester) {
        semesterInfoDisplay.innerHTML = ''
            + '<h3><i class="fas fa-info-circle"></i> 当前学期信息</h3>'
            + '<p><strong>学期名称:</strong> ' + escapeHtml(currentSemester.name) + '</p>'
            + '<p><strong>开始时间:</strong> ' + escapeHtml(currentSemester.start_date) + '</p>'
            + '<p><strong>结束时间:</strong> ' + escapeHtml(currentSemester.end_date) + '</p>';
        semesterInfoDisplay.style.display = 'block';
        
        setTimeout(function () {
            semesterInfoDisplay.style.display = 'none';
        }, 5000);
    }
}

function init() {
    // Android 4.4兼容处理：添加try-catch和详细错误信息
    try {
        loadSemesterConfig(function (err) {
            if (err) {
                console.error("学期配置加载失败:", err);
                showError('外部数据加载失败', '请用本地HTTP服务器打开（不要直接 file://）。Android 4.4 也需要通过 HTTP 才更稳定。错误: ' + (err.message || String(err)));
                return;
            }

            try {
                initSemesterFilter();
                loadAnnouncementCsv(function (err) {
                    if (err) {
                        console.warn("公告加载失败:", err);
                    }
                });
                
                // 加载倒计时配置
                loadCountdownConfig(function (err) {
                    if (err) {
                        console.warn("倒计时配置加载失败:", err);
                    }
                });

                var todayKey = getTodayKeyByRange() || 'current_semester';
                var firstKey = null;
                for (var k in semesterConfig) { if (hasOwn(semesterConfig, k)) { firstKey = k; break; } }
                selectedSemesterKey = semesterConfig[todayKey] ? todayKey : (firstKey || 'all');
                
                // Android 4.4兼容处理：检查DOM元素是否存在
                if (semesterFilter) {
                    semesterFilter.value = selectedSemesterKey;
                }

                loadSemesterRecords(selectedSemesterKey, function (err2) {
                    if (err2) {
                        console.error("学期记录加载失败:", err2);
                        showError('外部数据加载失败', err2.message || String(err2));
                        return;
                    }

                    try {
                        applyFilters();
                        startAutoScroll();
                        startAnnouncementAutoScroll(); // 启动公告栏自动滚动
                        updateCurrentTime();
                        updateCountdown(); // 更新倒计时
                        // Android 4.4兼容处理：使用setInterval替代setTimeout
                        setInterval(updateCurrentTime, 1000);
                        setInterval(updateCountdown, 1000); // 每秒更新倒计时
                    } catch (e) {
                        console.error("应用过滤器或启动滚动失败:", e);
                        showError('系统初始化失败', '应用过滤器或启动滚动时出错: ' + e.message);
                    }
                });
            } catch (e) {
                console.error("初始化过程中出错:", e);
                showError('系统初始化失败', '初始化过程中出错: ' + e.message);
            }
        });
    } catch (e) {
        console.error("初始化失败:", e);
        showError('系统初始化失败', '系统初始化失败: ' + e.message);
    }

    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keyup', function (event) {
        var key = event && (event.key || event.keyCode);
        if (key === 'Enter' || key === 13) handleSearch();
    });

    gradeFilter.addEventListener('change', handleFilter);
    filterType.addEventListener('change', handleFilter);
    dateFilter.addEventListener('change', handleFilter);
    semesterFilter.addEventListener('change', function () {
        var key = semesterFilter.value;
        if (key === 'all') {
            alert('index页按单学期加载数据；如需查看全部学期，请点击"汇总所有学期"。');
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
    resetBtn.addEventListener('click', resetScrollPosition);
    loadDataBtn.addEventListener('click', reloadData);
    showCurrentSemesterBtn.addEventListener('click', showCurrentSemesterInfo);

    if (announcementGradeFilter) {
        announcementGradeFilter.addEventListener('change', renderAnnouncements);
    }
}

// 页面加载完成后初始化
function safeInit() {
    try {
        init();
    } catch (e) {
        showError("系统初始化失败", "请尝试刷新页面或联系管理员。错误信息: " + e.message);
    }
}

// 图片放大查看功能
function showImageModal(imageSrc) {
    // 创建模态框元素
    var modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,0.9);display:flex;justify-content:center;align-items:center;z-index:9999;cursor:pointer;';
    
    // 创建图片元素
    var img = document.createElement('img');
    img.src = imageSrc;
    img.style.cssText = 'max-width:90%;max-height:90%;object-fit:contain;';
    
    // 创建关闭按钮
    var closeBtn = document.createElement('span');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'position:absolute;top:20px;right:30px;color:#f1f1f1;font-size:40px;font-weight:bold;cursor:pointer;z-index:10000;';
    
    // 添加点击事件关闭模态框
    modal.onclick = function() {
        document.body.removeChild(modal);
    };
    
    closeBtn.onclick = function(e) {
        e.stopPropagation(); // 阻止事件冒泡
        document.body.removeChild(modal);
    };
    
    // 将元素添加到模态框
    modal.appendChild(img);
    modal.appendChild(closeBtn);
    
    // 将模态框添加到页面
    document.body.appendChild(modal);
}

if (document.readyState === 'loading') {
    // 简单兼容性处理
    if (document.addEventListener) {
        document.addEventListener('DOMContentLoaded', safeInit);
    } else {
        // 如果addEventListener不可用，使用传统方式
        document.onreadystatechange = function() {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                safeInit();
            }
        };
    }
} else {
    safeInit();
}

// Android 4.4 图片懒加载功能 - 分批加载避免浏览器卡顿
function lazyLoadImages() {
    var images = document.querySelectorAll('img[data-src]');
    var videos = document.querySelectorAll('video[data-src]');
    var loadIndex = 0;
    var batchSize = 3; // 每次加载3张图片，避免同时加载过多
    
    function loadNextBatch() {
        // 加载图片
        for (var i = 0; i < batchSize && loadIndex < images.length; i++) {
            var img = images[loadIndex];
            if (img && img.getAttribute('data-src')) {
                var src = img.getAttribute('data-src');
                img.src = src;
                img.removeAttribute('data-src');
            }
            loadIndex++;
        }
        
        if (loadIndex < images.length) {
            // 延迟200ms加载下一批，给浏览器喘息时间
            setTimeout(loadNextBatch, 200);
        } else {
            // 图片加载完成后，加载视频
            lazyLoadVideos();
        }
    }
    
    loadNextBatch();
}

// Android 4.4 视频懒加载功能
function lazyLoadVideos() {
    var videos = document.querySelectorAll('video[data-src]');
    for (var i = 0; i < videos.length; i++) {
        var video = videos[i];
        if (video && video.getAttribute('data-src')) {
            var src = video.getAttribute('data-src');
            video.src = src;
            video.removeAttribute('data-src');
            // 尝试播放视频
            try {
                video.play();
            } catch (e) {
                console.warn('视频自动播放失败:', e);
            }
        }
    }
}

// 重写 renderAnnouncements 函数，在渲染后调用懒加载
var originalRenderAnnouncements = renderAnnouncements;
renderAnnouncements = function() {
    originalRenderAnnouncements();
    // 延迟100ms后开始懒加载图片
    setTimeout(lazyLoadImages, 100);
};