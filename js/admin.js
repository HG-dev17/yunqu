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
                var record = {
                    _id: r.id || generateId(), // 内部ID，用于追踪
                    type: r.type || '',
                    person: r.person || '',
                    detail: r.detail || '',
                    datetime: normalizeDateTime(r.datetime || r.date || ''),
                    admin: r.admin || r.teacher || '',
                    method: r.method || '',
                    points: r.points || '',
                    status: r.status || ''
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
            tableBody.innerHTML = '<tr id="noDataRow"><td colspan="10" style="text-align: center; padding: 40px; color: #7f8c8d;"><i class="fas fa-search fa-2x" style="margin-bottom: 10px; display: block;"></i>无匹配记录</td></tr>';
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
        
        // 保存单元格编辑
        tableBody.addEventListener('click', function(e) {
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
        if (!searchTerm) {
            displayedRecords = allRecords.slice();
        } else {
            displayedRecords = [];
            for (var i = 0; i < allRecords.length; i++) {
                var r = allRecords[i];
                var hay = (r.person + ' ' + r.detail + ' ' + r.admin + ' ' + r.method + ' ' + r.status + ' ' + r.type).toLowerCase();
                if (hay.indexOf(searchTerm) !== -1) {
                    displayedRecords.push(r);
                }
            }
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
                type: document.getElementById('newType').value,
                person: document.getElementById('newPerson').value,
                detail: document.getElementById('newDetail').value,
                datetime: document.getElementById('newDatetime').value,
                admin: document.getElementById('newAdmin').value,
                method: document.getElementById('newMethod').value,
                points: document.getElementById('newPoints').value,
                status: document.getElementById('newStatus').value
            };
            
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
    }

    // 初始化
    function init() {
        initSemesterSelect();
        bindEvents();
        console.log('管理后台初始化完成 (本地模式)');
    }

    document.addEventListener('DOMContentLoaded', init);
})();