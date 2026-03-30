// admin.js - 后台管理核心逻辑
// 依赖：复用 all_semesters.js 中的 fetchText, parseCSV, stripBOM, normalizeDateTime 等函数

(function() {
    'use strict';

    // 状态变量
    var semesterConfig = {};
    var currentSemesterKey = null;
    var currentFilename = '';
    var allRecords = [];           // 从CSV加载的原始数据
    var displayedRecords = [];     // 筛选后显示的数据
    var isDataModified = false;
    var selectedRowIds = new Set(); // 存储选中行的ID
    var allAnnouncements = []; // 存储所有公告数据

    // DOM 元素
    var semesterSelect = document.getElementById('semesterSelect');
    var loadCsvBtn = document.getElementById('loadCsvBtn');
    var currentFileSpan = document.getElementById('currentFile');
    var totalRecordsSpan = document.getElementById('totalRecords');
    var loadedCountSpan = document.getElementById('loadedCount');
    var visibleCountSpan = document.getElementById('visibleCount');
    var addRowBtn = document.getElementById('addRowBtn');
    var deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    var saveChangesBtn = document.getElementById('saveChangesBtn');
    var resetBtn = document.getElementById('resetBtn');
    var tableSearchInput = document.getElementById('tableSearchInput');
    var adminGradeFilter = document.getElementById('adminGradeFilter');
    var clearSearchBtn = document.getElementById('clearSearchBtn');
    var masterCheckbox = document.getElementById('masterCheckbox');
    var selectAllCheckbox = document.getElementById('selectAllCheckbox');
    var tableBody = document.getElementById('tableBody');
    var noDataRow = document.getElementById('noDataRow');
    var lastLoadTimeSpan = document.getElementById('lastLoadTime');
    var unsavedWarning = document.getElementById('unsavedWarning');
    var addRowModal = document.getElementById('addRowModal');
    var newRowForm = document.getElementById('newRowForm');
    var cancelAddBtn = document.getElementById('cancelAddBtn');
    var newDatetimeInput = document.getElementById('newDatetime');
    var currentTimeSpan = document.getElementById('currentTime');
    var loadAnnouncementBtn = document.getElementById('loadAnnouncementBtn');
    var exportAnnouncementBtn = document.getElementById('exportAnnouncementBtn');
    var addAnnouncementBtn = document.getElementById('addAnnouncementBtn');
    var announcementListAdmin = document.getElementById('announcementListAdmin');
    var announcementModal = document.getElementById('announcementModal');
    var announcementForm = document.getElementById('announcementForm');
    var cancelAnnouncementBtn = document.getElementById('cancelAnnouncementBtn');
    var announcementModalTitle = document.getElementById('announcementModalTitle');
    var announcementId = document.getElementById('announcementId');
    var announcementGrade = document.getElementById('announcementGrade');
    var announcementContent = document.getElementById('announcementContent');
    var announcementImages = document.getElementById('announcementImages');
    var announcementVideos = document.getElementById('announcementVideos');
        var announcementTime = document.getElementById('announcementTime');
        var announcementGradeFilter = document.getElementById('announcementGradeFilter');
        var allCountdowns = []; // 存储所有倒计时数据
        var loadCountdownBtn = document.getElementById('loadCountdownBtn');
        var exportCountdownBtn = document.getElementById('exportCountdownBtn');
        var addCountdownBtn = document.getElementById('addCountdownBtn');
        var countdownListAdmin = document.getElementById('countdownListAdmin');
        var countdownModal = document.getElementById('countdownModal');
        var countdownForm = document.getElementById('countdownForm');
        var cancelCountdownBtn = document.getElementById('cancelCountdownBtn');
        var countdownModalTitle = document.getElementById('countdownModalTitle');
        var countdownId = document.getElementById('countdownId');
        var countdownGrade = document.getElementById('countdownGrade');
        var countdownName = document.getElementById('countdownName');
        var countdownTargetDate = document.getElementById('countdownTargetDate');
        var countdownDescription = document.getElementById('countdownDescription');

    // 工具函数
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function strIncludes(hay, needle) {
        hay = String(hay == null ? '' : hay);
        needle = String(needle == null ? '' : needle);
        return hay.indexOf(needle) !== -1;
    }

    function generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function formatDateTimeLocal(dtStr) {
        var d = toDate(dtStr);
        if (!d) return '';
        var y = d.getFullYear();
        var m = (d.getMonth() + 1).toString().padStart(2, '0');
        var day = d.getDate().toString().padStart(2, '0');
        var h = d.getHours().toString().padStart(2, '0');
        var min = d.getMinutes().toString().padStart(2, '0');
        return y + '-' + m + '-' + day + 'T' + h + ':' + min;
    }

    function getNowDateTimeLocalValue() {
        var d = new Date();
        var y = d.getFullYear();
        var m = (d.getMonth() + 1).toString().padStart(2, '0');
        var day = d.getDate().toString().padStart(2, '0');
        var h = d.getHours().toString().padStart(2, '0');
        var min = d.getMinutes().toString().padStart(2, '0');
        return y + '-' + m + '-' + day + 'T' + h + ':' + min;
    }

    function updateCurrentTime() {
        var now = new Date();
        var y = now.getFullYear();
        var m = (now.getMonth() + 1).toString().padStart(2, '0');
        var d = now.getDate().toString().padStart(2, '0');
        var hh = now.getHours().toString().padStart(2, '0');
        var mm = now.getMinutes().toString().padStart(2, '0');
        var ss = now.getSeconds().toString().padStart(2, '0');
        currentTimeSpan.textContent = y + '-' + m + '-' + d + ' ' + hh + ':' + mm + ':' + ss;
    }
    setInterval(updateCurrentTime, 1000);
    updateCurrentTime();

    // 设置新建记录时间的默认值为现在
    newDatetimeInput.value = getNowDateTimeLocalValue();

    // 初始化学期列表
    function initSemesterSelect() {
        fetchText('data/semesters.csv', function(err, csv) {
            if (err) {
                console.error('无法加载学期配置文件:', err);
                semesterSelect.innerHTML = '<option value="" disabled>加载失败</option>';
                return;
            }
            var rows = parseCSV(csv);
            semesterConfig = {};
            semesterSelect.innerHTML = '<option value="" disabled selected>请选择学期...</option>';
            
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                if (!r || !r.key) continue;
                semesterConfig[r.key] = {
                    key: r.key,
                    name: r.name || r.key,
                    file: r.file || ''
                };
                var opt = document.createElement('option');
                opt.value = r.key;
                opt.textContent = (r.name || r.key) + ' (' + (r.file || '') + ')';
                semesterSelect.appendChild(opt);
            }
            
            if (rows.length > 0) {
                semesterSelect.disabled = false;
                loadCsvBtn.disabled = false;
            }
        });
    }

    function escapeCsvCell(cell) {
        cell = String(cell == null ? '' : cell);
        if (cell.indexOf(',') !== -1 || cell.indexOf('"') !== -1 || cell.indexOf('\n') !== -1 || cell.indexOf('\r') !== -1) {
            return '"' + cell.replace(/"/g, '""') + '"';
        }
        return cell;
    }

    // 公告栏：从 data/announcement.csv 读取，并可导出覆盖修改后的文件
    function loadAnnouncementCsv() {
        if (loadAnnouncementBtn) {
            loadAnnouncementBtn.disabled = true;
            loadAnnouncementBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';
        }

        fetchText('data/announcement.csv', function(err, csvText) {
            if (loadAnnouncementBtn) {
                loadAnnouncementBtn.disabled = false;
                loadAnnouncementBtn.innerHTML = '<i class="fas fa-sync-alt"></i> 重新加载公告';
            }

            if (err) {
                console.error('公告栏加载失败:', err);
                allAnnouncements = [];
                renderAnnouncementList();
                return;
            }

            var rows = parseCSV(csvText);
            allAnnouncements = [];

            for (var i = 0; i < rows.length; i++) {
                var r = rows[i] || {};
                var text = r.text || r.announcement || r.content || '';
                var image = r.image || '';
                var video = r.video || '';
                var grade = r.grade || 'all';

                // 年级字段兼容数字和中文格式
                var gradeMap = { '1': '初一', '2': '初二', '3': '初三' };
                if (gradeMap[grade]) {
                    grade = gradeMap[grade];
                }

                // 允许公告只有图片或视频，没有文本
                if (text && text.trim() || image || video) {
                    allAnnouncements.push({
                        _id: r.id || generateId(),
                        text: text ? text.trim() : '',
                        grade: grade,
                        image: image,
                        video: video,
                        time: r.time || ''
                    });
                }
            }

            // 渲染公告列表
            renderAnnouncementList();
        });
    }

    function exportAnnouncementToCsv() {
        // 构建CSV内容
        var csvContent = 'text,grade,image,video,time\r\n';

        for (var i = 0; i < allAnnouncements.length; i++) {
            var ann = allAnnouncements[i];
            var row = [
                escapeCsvCell(ann.text || ''),
                escapeCsvCell(ann.grade || 'all'),
                escapeCsvCell(ann.image || ''),
                escapeCsvCell(ann.video || ''),
                escapeCsvCell(ann.time || '')
            ];
            csvContent += row.join(',') + '\r\n';
        }

        var BOM = '\uFEFF';
        var blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);

        var timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        var filename = 'announcement_modified_' + timestamp + '.csv';

        var link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        alert('公告已导出: ' + filename + '\n请用此文件手动替换 data/announcement.csv');
    }

    // 渲染公告列表
    function renderAnnouncementList() {
        if (!announcementListAdmin) return;

        // 获取当前选择的年级
        var selectedGrade = announcementGradeFilter ? announcementGradeFilter.value : 'all';

        // 筛选公告
        var filteredAnnouncements = [];
        for (var i = 0; i < allAnnouncements.length; i++) {
            var ann = allAnnouncements[i];
            if (selectedGrade === 'all' || ann.grade === selectedGrade) {
                filteredAnnouncements.push(ann);
            }
        }

        if (filteredAnnouncements.length === 0) {
            announcementListAdmin.innerHTML = '<div class="no-data"><i class="far fa-bell"></i><p>暂无公告</p></div>';
            return;
        }

        var html = '';
        for (var i = 0; i < filteredAnnouncements.length; i++) {
            var ann = filteredAnnouncements[i];
            var gradeLabel = '';
            if (ann.grade && ann.grade !== 'all') {
                var gradeMap = { '1': '初一', '2': '初二', '3': '初三' };
                gradeLabel = '<span class="announcement-item-grade">' + (gradeMap[ann.grade] || ann.grade) + '</span>';
            }

            var imagePreview = '';
            if (ann.image && ann.image.trim()) {
                var images = ann.image.split('|').filter(function(img) { return img && img.trim(); });
                if (images.length > 0) {
                    imagePreview = '<div class="announcement-item-images">';
                    for (var j = 0; j < images.length; j++) {
                        var imagePath = images[j].trim();
                        if (!imagePath.match(/^https?:\/\//) && !imagePath.match(/^data\//)) {
                            imagePath = 'data/img/' + imagePath;
                        }
                        imagePreview += '<div class="announcement-item-image"><img src="' + imagePath + '" alt="公告图片" loading="lazy" style="max-width: 100px; max-height: 100px; object-fit: contain;"></div>';
                    }
                    imagePreview += '</div>';
                }
            }

            var videoPreview = '';
            if (ann.video && ann.video.trim()) {
                var videos = ann.video.split('|').filter(function(vid) { return vid && vid.trim(); });
                if (videos.length > 0) {
                    videoPreview = '<div class="announcement-item-videos">';
                    for (var k = 0; k < videos.length; k++) {
                        var videoPath = videos[k].trim();
                        if (!videoPath.match(/^https?:\/\//) && !videoPath.match(/^data\//)) {
                            videoPath = 'data/video/' + videoPath;
                        }
                        videoPreview += '<div class="announcement-item-video"><video controls src="' + videoPath + '" style="max-width: 200px; max-height: 150px; object-fit: contain;"></video></div>';
                    }
                    videoPreview += '</div>';
                }
            }

            html += '<div class="announcement-item-admin" data-id="' + escapeHtml(ann._id) + '">';
            html += '  <div class="announcement-item-header">';
            html += '    ' + gradeLabel;
            html += '    <div class="announcement-item-actions">';
            html += '      <button class="action-btn edit" data-id="' + escapeHtml(ann._id) + '"><i class="fas fa-edit"></i> 编辑</button>';
            html += '      <button class="action-btn delete" data-id="' + escapeHtml(ann._id) + '"><i class="fas fa-trash-alt"></i> 删除</button>';
            html += '    </div>';
            html += '  </div>';
            html += '  <div class="announcement-item-body">';
            html += '    ' + imagePreview;
            html += '    ' + videoPreview;
            html += '    <div class="announcement-item-content">' + escapeHtml(ann.text).replace(/\n/g, '<br>') + '</div>';
            html += '    ' + (ann.time ? '<div class="announcement-item-time"><i class="far fa-clock"></i> ' + escapeHtml(ann.time) + '</div>' : '');
            html += '  </div>';
            html += '</div>';
        }

        announcementListAdmin.innerHTML = html;

        // 绑定编辑和删除按钮事件
        var editButtons = announcementListAdmin.querySelectorAll('.action-btn.edit');
        for (var m = 0; m < editButtons.length; m++) {
            editButtons[m].addEventListener('click', function(e) {
                var id = e.currentTarget.getAttribute('data-id');
                openAnnouncementModal(id);
            });
        }

        var deleteButtons = announcementListAdmin.querySelectorAll('.action-btn.delete');
        for (var n = 0; n < deleteButtons.length; n++) {
            deleteButtons[n].addEventListener('click', function(e) {
                var id = e.currentTarget.getAttribute('data-id');
                if (confirm('确定要删除这条公告吗？')) {
                    deleteAnnouncement(id);
                }
            });
        }
    }

    // 打开公告编辑模态框
    function openAnnouncementModal(id) {
        var announcement = null;
        for (var i = 0; i < allAnnouncements.length; i++) {
            if (allAnnouncements[i]._id === id) {
                announcement = allAnnouncements[i];
                break;
            }
        }

        if (id && announcement) {
            // 编辑模式
            announcementModalTitle.textContent = '编辑公告';
            announcementId.value = id;

            // 年级字段兼容数字和中文格式
            var grade = announcement.grade || 'all';
            var gradeMap = { '1': '初一', '2': '初二', '3': '初三' };
            if (gradeMap[grade]) {
                grade = gradeMap[grade];
            }
            announcementGrade.value = grade;

            announcementContent.value = announcement.text || '';
            announcementImages.value = announcement.image || '';
            announcementVideos.value = announcement.video || '';
            announcementTime.value = announcement.time || '';

            // 同步更新年级筛选下拉框
            if (announcementGradeFilter) {
                announcementGradeFilter.value = grade;
                // 手动触发change事件，以刷新公告列表
                var event = new Event('change', { bubbles: true });
                announcementGradeFilter.dispatchEvent(event);
            }
        } else {
            // 新增模式
            announcementModalTitle.textContent = '新增公告';
            announcementId.value = '';
            announcementGrade.value = 'all';
            announcementContent.value = '';
            announcementImages.value = '';
            announcementVideos.value = '';
            var now = new Date();
            var month = (now.getMonth() + 1).toString();
            var day = now.getDate().toString();
            announcementTime.value = now.getFullYear() + '-' + 
                (month.length < 2 ? '0' + month : month) + '-' + 
                (day.length < 2 ? '0' + day : day);
        }

        announcementModal.style.display = 'flex';
    }

    // 关闭公告编辑模态框
    function closeAnnouncementModal() {
        announcementModal.style.display = 'none';
        announcementForm.reset();
        announcementId.value = '';
    }

    // 保存公告
    function saveAnnouncement(formData) {
        var id = formData.id;

        if (id) {
            // 编辑模式
            for (var i = 0; i < allAnnouncements.length; i++) {
                if (allAnnouncements[i]._id === id) {
                    allAnnouncements[i].text = formData.text;
                    allAnnouncements[i].grade = formData.grade;
                    allAnnouncements[i].image = formData.image;
                    allAnnouncements[i].video = formData.video;
                    allAnnouncements[i].time = formData.time;
                    break;
                }
            }
        } else {
            // 新增模式
            var newAnnouncement = {
                _id: generateId(),
                text: formData.text,
                grade: formData.grade,
                image: formData.image,
                video: formData.video,
                time: formData.time
            };
            allAnnouncements.unshift(newAnnouncement);
        }

        renderAnnouncementList();
        closeAnnouncementModal();
    }

    // 删除公告
    function deleteAnnouncement(id) {
        var index = -1;
        for (var i = 0; i < allAnnouncements.length; i++) {
            if (allAnnouncements[i]._id === id) {
                index = i;
                break;
            }
        }

        if (index > -1) {
            allAnnouncements.splice(index, 1);
            renderAnnouncementList();
        }
    }

    // 倒计时：从 data/countdown.csv 读取，并可导出覆盖修改后的文件
    function loadCountdownCsv() {
        if (loadCountdownBtn) {
            loadCountdownBtn.disabled = true;
            loadCountdownBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';
        }

        fetchText('data/countdown.csv', function(err, csvText) {
            if (loadCountdownBtn) {
                loadCountdownBtn.disabled = false;
                loadCountdownBtn.innerHTML = '<i class="fas fa-sync-alt"></i> 重新加载倒计时';
            }

            if (err) {
                console.error('倒计时加载失败:', err);
                allCountdowns = [];
                renderCountdownList();
                return;
            }

            var rows = parseCSV(csvText);
            allCountdowns = [];

            for (var i = 0; i < rows.length; i++) {
                var r = rows[i] || {};
                var grade = r.grade || r.年级 || '';
                var name = r.name || r.名称 || '';
                var targetDate = r.target_date || r.target_date || r.目标时间 || '';
                var description = r.description || r.描述 || '';

                if (grade && name && targetDate) {
                    allCountdowns.push({
                        _id: r.id || generateId(),
                        grade: grade,
                        name: name,
                        targetDate: targetDate,
                        description: description
                    });
                }
            }

            // 渲染倒计时列表
            renderCountdownList();
        });
    }

    function exportCountdownToCsv() {
        // 构建CSV内容
        var csvContent = 'grade,name,target_date,description\r\n';

        for (var i = 0; i < allCountdowns.length; i++) {
            var cd = allCountdowns[i];
            var row = [
                escapeCsvCell(cd.grade || ''),
                escapeCsvCell(cd.name || ''),
                escapeCsvCell(cd.targetDate || ''),
                escapeCsvCell(cd.description || '')
            ];
            csvContent += row.join(',') + '\r\n';
        }

        var BOM = '\uFEFF';
        var blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);

        var filename = 'countdown.csv';

        var link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        alert('倒计时已导出: ' + filename + '\n请将此文件放到 data/ 目录下，替换原 countdown.csv 文件');
    }

    // 渲染倒计时列表
    function renderCountdownList() {
        if (!countdownListAdmin) return;

        if (allCountdowns.length === 0) {
            countdownListAdmin.innerHTML = '<div class="no-data"><i class="far fa-clock"></i><p>暂无倒计时</p></div>';
            return;
        }

        var html = '';
        for (var i = 0; i < allCountdowns.length; i++) {
            var cd = allCountdowns[i];
            var gradeMap = { '1': '初一', '2': '初二', '3': '初三' };
            var gradeLabel = gradeMap[cd.grade] || cd.grade;

            html += '<div class="countdown-item-admin" data-id="' + escapeHtml(cd._id) + '">';
            html += '  <div class="countdown-item-header">';
            html += '    <span class="countdown-item-grade">' + escapeHtml(gradeLabel) + '</span>';
            html += '    <span class="countdown-item-name">' + escapeHtml(cd.name) + '</span>';
            html += '    <div class="countdown-item-actions">';
            html += '      <button class="action-btn edit" data-id="' + escapeHtml(cd._id) + '"><i class="fas fa-edit"></i> 编辑</button>';
            html += '      <button class="action-btn delete" data-id="' + escapeHtml(cd._id) + '"><i class="fas fa-trash-alt"></i> 删除</button>';
            html += '    </div>';
            html += '  </div>';
            html += '  <div class="countdown-item-body">';
            html += '    <div class="countdown-item-time"><i class="far fa-clock"></i> 目标时间: ' + escapeHtml(cd.targetDate) + '</div>';
            html += '    ' + (cd.description ? '<div class="countdown-item-description">' + escapeHtml(cd.description) + '</div>' : '');
            html += '  </div>';
            html += '</div>';
        }

        countdownListAdmin.innerHTML = html;

        // 绑定编辑和删除按钮事件
        var editButtons = countdownListAdmin.querySelectorAll('.action-btn.edit');
        for (var m = 0; m < editButtons.length; m++) {
            editButtons[m].addEventListener('click', function(e) {
                var id = e.currentTarget.getAttribute('data-id');
                openCountdownModal(id);
            });
        }

        var deleteButtons = countdownListAdmin.querySelectorAll('.action-btn.delete');
        for (var n = 0; n < deleteButtons.length; n++) {
            deleteButtons[n].addEventListener('click', function(e) {
                var id = e.currentTarget.getAttribute('data-id');
                if (confirm('确定要删除这个倒计时吗？')) {
                    deleteCountdown(id);
                }
            });
        }
    }

    // 打开倒计时编辑模态框
    function openCountdownModal(id) {
        var countdown = null;
        for (var i = 0; i < allCountdowns.length; i++) {
            if (allCountdowns[i]._id === id) {
                countdown = allCountdowns[i];
                break;
            }
        }

        if (id && countdown) {
            // 编辑模式
            countdownModalTitle.textContent = '编辑倒计时';
            countdownId.value = id;
            countdownGrade.value = countdown.grade;
            countdownName.value = countdown.name;
            countdownTargetDate.value = countdown.targetDate.replace(' ', 'T');
            countdownDescription.value = countdown.description || '';
        } else {
            // 新增模式
            countdownModalTitle.textContent = '新增倒计时';
            countdownId.value = '';
            countdownGrade.value = '1';
            countdownName.value = '';
            countdownTargetDate.value = '';
            countdownDescription.value = '';
        }

        countdownModal.style.display = 'flex';
    }

    // 关闭倒计时编辑模态框
    function closeCountdownModal() {
        countdownModal.style.display = 'none';
        countdownForm.reset();
        countdownId.value = '';
    }

    // 保存倒计时
    function saveCountdown(formData) {
        var id = formData.id;

        if (id) {
            // 编辑模式
            for (var i = 0; i < allCountdowns.length; i++) {
                if (allCountdowns[i]._id === id) {
                    allCountdowns[i].grade = formData.grade;
                    allCountdowns[i].name = formData.name;
                    allCountdowns[i].targetDate = formData.targetDate.replace('T', ' ');
                    allCountdowns[i].description = formData.description;
                    break;
                }
            }
        } else {
            // 新增模式
            var newCountdown = {
                _id: generateId(),
                grade: formData.grade,
                name: formData.name,
                targetDate: formData.targetDate.replace('T', ' '),
                description: formData.description
            };
            allCountdowns.unshift(newCountdown);
        }

        renderCountdownList();
        closeCountdownModal();
    }

    // 删除倒计时
    function deleteCountdown(id) {
        var index = -1;
        for (var i = 0; i < allCountdowns.length; i++) {
            if (allCountdowns[i]._id === id) {
                index = i;
                break;
            }
        }

        if (index > -1) {
            allCountdowns.splice(index, 1);
            renderCountdownList();
        }
    }

    // 加载CSV数据
    function loadCsvData() {
        var key = semesterSelect.value;
        if (!key) {
            alert('请先选择一个学期文件');
            return;
        }
        
        var sem = semesterConfig[key];
        if (!sem || !sem.file) {
            alert('该学期配置不完整，缺少文件名');
            return;
        }
        
        if (isDataModified) {
            if (!confirm('当前有未保存的修改，确定要重新加载吗？这将丢失所有未保存的更改。')) {
                return;
            }
        }
        
        loadCsvBtn.disabled = true;
        loadCsvBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';
        
        fetchText('data/' + sem.file, function(err, csvText) {
            loadCsvBtn.disabled = false;
            loadCsvBtn.innerHTML = '<i class="fas fa-sync-alt"></i> 重新加载';
            
            if (err) {
                console.error('加载CSV失败:', err);
                alert('无法加载文件: ' + sem.file + '\n错误: ' + (err.message || err));
                return;
            }
            
            currentSemesterKey = key;
            currentFilename = sem.file;
            currentFileSpan.textContent = currentFilename;
            
            var rows = parseCSV(csvText);
            allRecords = [];
            
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                var grade = r.grade || '';
                // 如果没有年级字段，尝试从人物字段中提取
                if (!grade && r.person) {
                    if (strIncludes(r.person, '初一')) grade = '初一';
                    else if (strIncludes(r.person, '初二')) grade = '初二';
                    else if (strIncludes(r.person, '初三')) grade = '初三';
                }
                var record = {
                    _id: r.id || generateId(), // 内部ID，用于追踪
                    type: r.type || '',
                    person: r.person || '',
                    detail: r.detail || '',
                    datetime: normalizeDateTime(r.datetime || r.date || ''),
                    admin: r.admin || r.teacher || '',
                    method: r.method || '',
                    points: r.points || '',
                    status: r.status || '',
                    grade: grade
                };
                allRecords.push(record);
            }
            
            selectedRowIds.clear();
            isDataModified = false;
            updateModificationStatus();
            
            totalRecordsSpan.textContent = allRecords.length;
            loadedCountSpan.textContent = allRecords.length;
            lastLoadTimeSpan.textContent = new Date().toLocaleTimeString();
            
            applyTableFilter();
            renderTable();
            saveChangesBtn.disabled = false;
            
            console.log('成功加载', allRecords.length, '条记录，文件:', currentFilename);
        });
    }

    // 渲染表格
    function renderTable() {
        if (displayedRecords.length === 0) {
            tableBody.innerHTML = '<tr id="noDataRow"><td colspan="11" style="text-align: center; padding: 40px; color: #7f8c8d;"><i class="fas fa-search fa-2x" style="margin-bottom: 10px; display: block;"></i>无匹配记录</td></tr>';
            visibleCountSpan.textContent = '0';
            masterCheckbox.checked = false;
            selectAllCheckbox.checked = false;
            deleteSelectedBtn.disabled = true;
            return;
        }
        
        noDataRow.style.display = 'none';
        var html = '';
        
        for (var i = 0; i < displayedRecords.length; i++) {
            var r = displayedRecords[i];
            var isSelected = selectedRowIds.has(r._id);
            html += '<tr data-id="' + escapeHtml(r._id) + '"' + (isSelected ? ' class="selected"' : '') + '>';
            
            // 复选框列
            html += '<td><input type="checkbox" class="row-checkbox" ' + (isSelected ? 'checked' : '') + '></td>';
            
            // 年级
            html += '<td class="editable-cell" data-field="grade">';
            html += '<div class="cell-display">' + escapeHtml(r.grade) + '</div>';
            html += '<select class="cell-edit"><option value=""' + (!r.grade ? ' selected' : '') + '></option><option value="初一"' + (r.grade === '初一' ? ' selected' : '') + '>初一</option><option value="初二"' + (r.grade === '初二' ? ' selected' : '') + '>初二</option><option value="初三"' + (r.grade === '初三' ? ' selected' : '') + '>初三</option></select>';
            html += '</td>';

            // 类型
            html += '<td class="editable-cell" data-field="type">';
            html += '<div class="cell-display">' + escapeHtml(r.type) + '</div>';
            html += '<select class="cell-edit"><option value="奖"' + (r.type === '奖' ? ' selected' : '') + '>奖</option><option value="惩"' + (r.type === '惩' ? ' selected' : '') + '>惩</option></select>';
            html += '</td>';
            
            // 人物
            html += '<td class="editable-cell" data-field="person">';
            html += '<div class="cell-display">' + escapeHtml(r.person) + '</div>';
            html += '<input type="text" class="cell-edit" value="' + escapeHtml(r.person) + '">';
            html += '</td>';
            
            // 事项
            html += '<td class="editable-cell" data-field="detail">';
            html += '<div class="cell-display" title="' + escapeHtml(r.detail) + '">' + escapeHtml(r.detail.length > 60 ? r.detail.substring(0, 60) + '...' : r.detail) + '</div>';
            html += '<textarea class="cell-edit" rows="2">' + escapeHtml(r.detail) + '</textarea>';
            html += '</td>';
            
            // 时间
            html += '<td class="editable-cell" data-field="datetime">';
            html += '<div class="cell-display">' + escapeHtml(r.datetime) + '</div>';
            html += '<input type="datetime-local" class="cell-edit" value="' + formatDateTimeLocal(r.datetime) + '">';
            html += '</td>';
            
            // 管理员
            html += '<td class="editable-cell" data-field="admin">';
            html += '<div class="cell-display">' + escapeHtml(r.admin) + '</div>';
            html += '<input type="text" class="cell-edit" value="' + escapeHtml(r.admin) + '">';
            html += '</td>';
            
            // 方式
            html += '<td class="editable-cell" data-field="method">';
            html += '<div class="cell-display">' + escapeHtml(r.method) + '</div>';
            html += '<input type="text" class="cell-edit" value="' + escapeHtml(r.method) + '">';
            html += '</td>';
            
            // 分值
            html += '<td class="editable-cell" data-field="points">';
            html += '<div class="cell-display">' + escapeHtml(r.points) + '</div>';
            html += '<input type="number" class="cell-edit" value="' + escapeHtml(r.points) + '" step="0.5">';
            html += '</td>';
            
            // 状态
            html += '<td class="editable-cell" data-field="status">';
            html += '<div class="cell-display">' + escapeHtml(r.status) + '</div>';
            html += '<input type="text" class="cell-edit" value="' + escapeHtml(r.status) + '">';
            html += '</td>';
            
            // 操作按钮
            html += '<td class="action-buttons">';
            html += '<button class="action-btn save" title="保存此行修改" style="display:none;">保存</button>';
            html += '<button class="action-btn cancel" title="取消编辑" style="display:none;">取消</button>';
            html += '<button class="action-btn delete" title="删除此行">删除</button>';
            html += '</td>';
            
            html += '</tr>';
        }
        
        tableBody.innerHTML = html;
        visibleCountSpan.textContent = displayedRecords.length;
        deleteSelectedBtn.disabled = selectedRowIds.size === 0;
        
        // 绑定行内事件
        bindRowEvents();
    }

    // 绑定表格行事件
    function bindRowEvents() {
        // 复选框选择
        var checkboxes = tableBody.querySelectorAll('.row-checkbox');
        for (var i = 0; i < checkboxes.length; i++) {
            checkboxes[i].addEventListener('change', function(e) {
                var row = e.target.closest('tr');
                var id = row.getAttribute('data-id');
                if (e.target.checked) {
                    selectedRowIds.add(id);
                    row.classList.add('selected');
                } else {
                    selectedRowIds.delete(id);
                    row.classList.remove('selected');
                }
                deleteSelectedBtn.disabled = selectedRowIds.size === 0;
                masterCheckbox.checked = selectedRowIds.size === displayedRecords.length;
                selectAllCheckbox.checked = selectedRowIds.size === displayedRecords.length;
            });
        }
        
        // 双击编辑单元格
        var cells = tableBody.querySelectorAll('.editable-cell');
        for (var j = 0; j < cells.length; j++) {
            cells[j].addEventListener('dblclick', function(e) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }
                var cell = e.currentTarget;
                if (cell.classList.contains('editing')) return;
                
                cell.classList.add('editing');
                var editInput = cell.querySelector('.cell-edit');
                if (editInput) {
                    editInput.focus();
                    if (editInput.tagName === 'TEXTAREA') {
                        editInput.style.height = editInput.scrollHeight + 'px';
                    }
                }
                
                // 显示保存/取消按钮
                var actionCell = cell.parentNode.querySelector('.action-buttons');
                actionCell.querySelector('.save').style.display = 'inline-flex';
                actionCell.querySelector('.cancel').style.display = 'inline-flex';
                actionCell.querySelector('.delete').style.display = 'none';
            });
        }
    }

    // 查找记录
    function findRecordById(id) {
        for (var i = 0; i < allRecords.length; i++) {
            if (allRecords[i]._id === id) return allRecords[i];
        }
        return null;
    }

    // 删除记录
    function deleteRecordById(id) {
        var index = -1;
        for (var i = 0; i < allRecords.length; i++) {
            if (allRecords[i]._id === id) {
                index = i;
                break;
            }
        }
        if (index > -1) {
            allRecords.splice(index, 1);
            selectedRowIds.delete(id);
            isDataModified = true;
            updateModificationStatus();
            totalRecordsSpan.textContent = allRecords.length;
            applyTableFilter();
            renderTable();
        }
    }

    // 更新修改状态
    function updateModificationStatus() {
        if (isDataModified) {
            unsavedWarning.style.display = 'inline';
            saveChangesBtn.innerHTML = '<i class="fas fa-exclamation-circle"></i> 导出修改 (有未保存更改)';
        } else {
            unsavedWarning.style.display = 'none';
            saveChangesBtn.innerHTML = '<i class="fas fa-save"></i> 导出修改';
        }
    }

    // 表格内筛选
    function applyTableFilter() {
        var searchTerm = (tableSearchInput.value || '').trim().toLowerCase();
        var gradeFilterValue = adminGradeFilter.value;

        displayedRecords = [];

        for (var i = 0; i < allRecords.length; i++) {
            var r = allRecords[i];

            // 应用年级筛选
            if (gradeFilterValue !== 'all') {
                if (r.grade !== gradeFilterValue) {
                    continue;
                }
            }

            // 应用搜索筛选
            if (searchTerm) {
                var hay = (r.person + ' ' + r.detail + ' ' + r.admin + ' ' + r.method + ' ' + r.status + ' ' + r.type).toLowerCase();
                if (hay.indexOf(searchTerm) === -1) {
                    continue;
                }
            }

            displayedRecords.push(r);
        }

        loadedCountSpan.textContent = allRecords.length;
    }

    // 导出为CSV
    function exportToCsv() {
        if (allRecords.length === 0) {
            alert('没有数据可导出');
            return;
        }
        
        var csvContent = 'type,person,detail,datetime,admin,method,points,status\r\n';
        
        for (var i = 0; i < allRecords.length; i++) {
            var r = allRecords[i];
            var row = [
                r.type || '',
                r.person || '',
                r.detail || '',
                r.datetime || '',
                r.admin || '',
                r.method || '',
                r.points || '',
                r.status || ''
            ];
            
            // 处理字段中的逗号和引号
            for (var j = 0; j < row.length; j++) {
                var cell = row[j];
                if (cell.indexOf(',') !== -1 || cell.indexOf('"') !== -1 || cell.indexOf('\n') !== -1) {
                    cell = '"' + cell.replace(/"/g, '""') + '"';
                }
                row[j] = cell;
            }
            
            csvContent += row.join(',') + '\r\n';
        }
        
        // 添加BOM以支持Excel中文
        var BOM = '\uFEFF';
        var blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        var timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        var filename = currentFilename.replace('.csv', '') + '_modified_' + timestamp + '.csv';
        
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        isDataModified = false;
        updateModificationStatus();
        alert('文件已导出: ' + filename + '\n请用此文件手动替换 data/' + currentFilename);
    }

    // 新增记录
    function addNewRecord(formData) {
        var newRecord = {
            _id: generateId(),
            grade: (formData.grade || '').trim(),
            type: formData.type || '奖',
            person: (formData.person || '').trim(),
            detail: (formData.detail || '').trim(),
            datetime: normalizeDateTime(formData.datetime || ''),
            admin: (formData.admin || '').trim(),
            method: (formData.method || '').trim(),
            points: (formData.points || '').trim(),
            status: (formData.status || '').trim()
        };
        
        allRecords.unshift(newRecord); // 添加到开头
        isDataModified = true;
        updateModificationStatus();
        totalRecordsSpan.textContent = allRecords.length;
        
        applyTableFilter();
        renderTable();
        
        addRowModal.style.display = 'none';
        newRowForm.reset();
        newDatetimeInput.value = getNowDateTimeLocalValue();
    }

    // 事件绑定
    function bindEvents() {
        loadCsvBtn.addEventListener('click', loadCsvData);
        
        addRowBtn.addEventListener('click', function() {
            addRowModal.style.display = 'flex';
        });
        
        document.querySelector('.modal-close').addEventListener('click', function() {
            addRowModal.style.display = 'none';
            newRowForm.reset();
            newDatetimeInput.value = getNowDateTimeLocalValue();
        });
        
        cancelAddBtn.addEventListener('click', function() {
            addRowModal.style.display = 'none';
            newRowForm.reset();
            newDatetimeInput.value = getNowDateTimeLocalValue();
        });
        
        newRowForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var formData = {
                grade: document.getElementById('newGrade').value,
                type: document.getElementById('newType').value,
                person: document.getElementById('newPerson').value,
                detail: document.getElementById('newDetail').value,
                datetime: document.getElementById('newDatetime').value,
                admin: document.getElementById('newAdmin').value,
                method: document.getElementById('newMethod').value,
                points: document.getElementById('newPoints').value,
                status: document.getElementById('newStatus').value
            };
            
            if (!formData.grade.trim()) {
                alert('请选择年级');
                return;
            }

            if (!formData.person.trim()) {
                alert('请填写人物姓名');
                return;
            }
            
            addNewRecord(formData);
        });
        
        deleteSelectedBtn.addEventListener('click', function() {
            if (selectedRowIds.size === 0) return;
            if (!confirm('确定要删除选中的 ' + selectedRowIds.size + ' 条记录吗？')) {
                return;
            }
            
            var idsToDelete = Array.from(selectedRowIds);
            for (var i = 0; i < idsToDelete.length; i++) {
                deleteRecordById(idsToDelete[i]);
            }
            
            selectedRowIds.clear();
            deleteSelectedBtn.disabled = true;
        });
        
        saveChangesBtn.addEventListener('click', exportToCsv);
        
        resetBtn.addEventListener('click', function() {
            if (!isDataModified) {
                alert('当前没有未保存的修改');
                return;
            }
            if (confirm('确定要放弃所有未保存的修改吗？')) {
                loadCsvData(); // 重新加载原始数据
            }
        });
        
        tableSearchInput.addEventListener('input', function() {
            applyTableFilter();
            renderTable();
        });

        adminGradeFilter.addEventListener('change', function() {
            applyTableFilter();
            renderTable();
        });
        
        clearSearchBtn.addEventListener('click', function() {
            tableSearchInput.value = '';
            applyTableFilter();
            renderTable();
        });
        
        masterCheckbox.addEventListener('change', function(e) {
            var isChecked = e.target.checked;
            var checkboxes = tableBody.querySelectorAll('.row-checkbox');
            for (var i = 0; i < checkboxes.length; i++) {
                checkboxes[i].checked = isChecked;
                checkboxes[i].dispatchEvent(new Event('change'));
            }
            selectAllCheckbox.checked = isChecked;
        });
        
        selectAllCheckbox.addEventListener('change', function(e) {
            var isChecked = e.target.checked;
            if (isChecked) {
                // 选择所有显示的行
                for (var i = 0; i < displayedRecords.length; i++) {
                    selectedRowIds.add(displayedRecords[i]._id);
                }
            } else {
                // 清空所有选择
                selectedRowIds.clear();
            }
            masterCheckbox.checked = isChecked;
            renderTable();
            deleteSelectedBtn.disabled = !isChecked;
        });

        // 公告栏
        if (loadAnnouncementBtn) loadAnnouncementBtn.addEventListener('click', loadAnnouncementCsv);
        if (exportAnnouncementBtn) exportAnnouncementBtn.addEventListener('click', exportAnnouncementToCsv);
        if (addAnnouncementBtn) addAnnouncementBtn.addEventListener('click', function() {
            openAnnouncementModal(null);
        });
        if (cancelAnnouncementBtn) cancelAnnouncementBtn.addEventListener('click', closeAnnouncementModal);
        if (announcementForm) {
            announcementForm.addEventListener('submit', function(e) {
                e.preventDefault();
                var formData = {
                    id: announcementId.value,
                    text: announcementContent.value,
                    grade: announcementGrade.value,
                    image: announcementImages.value,
                    video: announcementVideos.value,
                    time: announcementTime.value
                };

                // 允许公告内容完全留空
                saveAnnouncement(formData);
            });
        }
        if (announcementModal) {
            announcementModal.querySelector('.modal-close').addEventListener('click', closeAnnouncementModal);
        }
        if (announcementGradeFilter) {
            announcementGradeFilter.addEventListener('change', function() {
                renderAnnouncementList();
            });
        }

        // 倒计时
        if (loadCountdownBtn) loadCountdownBtn.addEventListener('click', loadCountdownCsv);
        if (exportCountdownBtn) exportCountdownBtn.addEventListener('click', exportCountdownToCsv);
        if (addCountdownBtn) addCountdownBtn.addEventListener('click', function() {
            openCountdownModal(null);
        });
        if (cancelCountdownBtn) cancelCountdownBtn.addEventListener('click', closeCountdownModal);
        if (countdownForm) {
            countdownForm.addEventListener('submit', function(e) {
                e.preventDefault();
                var formData = {
                    id: countdownId.value,
                    grade: countdownGrade.value,
                    name: countdownName.value,
                    targetDate: countdownTargetDate.value,
                    description: countdownDescription.value
                };

                if (!formData.name.trim()) {
                    alert('请填写倒计时名称');
                    return;
                }

                if (!formData.targetDate.trim()) {
                    alert('请选择目标时间');
                    return;
                }

                saveCountdown(formData);
            });
        }
        if (countdownModal) {
            countdownModal.querySelector('.modal-close').addEventListener('click', closeCountdownModal);
        }

        // 行内保存/取消/删除（事件委托：只绑定一次，避免重复弹窗确认）
        tableBody.addEventListener('click', function(e) {
            if (!e.target || !e.target.classList) return;

            if (e.target.classList.contains('save')) {
                var row = e.target.closest('tr');
                var id = row.getAttribute('data-id');
                var record = findRecordById(id);
                if (!record) return;

                var cells = row.querySelectorAll('.editable-cell.editing');
                for (var k = 0; k < cells.length; k++) {
                    var cell = cells[k];
                    var field = cell.getAttribute('data-field');
                    var editInput = cell.querySelector('.cell-edit');
                    var newValue = editInput ? editInput.value : '';

                    if (field === 'datetime') {
                        newValue = normalizeDateTime(newValue);
                    }

                    if (record[field] !== newValue) {
                        record[field] = newValue;
                        isDataModified = true;
                        updateModificationStatus();
                    }

                    cell.classList.remove('editing');
                    cell.querySelector('.cell-display').textContent = field === 'detail' && newValue.length > 60 ?
                        newValue.substring(0, 60) + '...' : newValue;
                }

                // 隐藏保存/取消按钮，显示删除按钮
                var actionCell = row.querySelector('.action-buttons');
                actionCell.querySelector('.save').style.display = 'none';
                actionCell.querySelector('.cancel').style.display = 'none';
                actionCell.querySelector('.delete').style.display = 'inline-flex';

                renderTable(); // 重新渲染以更新显示
            }

            // 取消编辑
            if (e.target.classList.contains('cancel')) {
                var row = e.target.closest('tr');
                var cells = row.querySelectorAll('.editable-cell.editing');
                for (var m = 0; m < cells.length; m++) {
                    cells[m].classList.remove('editing');
                }

                var actionCell = row.querySelector('.action-buttons');
                actionCell.querySelector('.save').style.display = 'none';
                actionCell.querySelector('.cancel').style.display = 'none';
                actionCell.querySelector('.delete').style.display = 'inline-flex';
            }

            // 删除单行
            if (e.target.classList.contains('delete')) {
                var row = e.target.closest('tr');
                var id = row.getAttribute('data-id');
                if (confirm('确定要删除这条记录吗？')) {
                    deleteRecordById(id);
                }
            }
        });

        // 输入框按Enter保存，Esc取消
        tableBody.addEventListener('keydown', function(e) {
            if (!e.target || !e.target.classList) return;

            if (e.target.classList.contains('cell-edit')) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    var saveBtn = e.target.closest('tr').querySelector('.action-btn.save');
                    if (saveBtn) saveBtn.click();
                }
                if (e.key === 'Escape') {
                    var cancelBtn = e.target.closest('tr').querySelector('.action-btn.cancel');
                    if (cancelBtn) cancelBtn.click();
                }
            }
        });
    }

    // 初始化
    function init() {
        initSemesterSelect();
        bindEvents();
        loadAnnouncementCsv(); // 初始化公告栏内容
        loadCountdownCsv(); // 初始化倒计时内容
        console.log('管理后台初始化完成 (本地模式)');
    }

    document.addEventListener('DOMContentLoaded', init);
})();