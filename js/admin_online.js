/**
 * 在线数据管理系统 JavaScript
 * 用于处理在线模式下的数据加载、编辑和保存功能
 */

// 全局变量
let currentSemester = null;
let tableData = [];
let unsavedChanges = false;
let selectedRows = new Set();
const API_BASE_URL = '/api';

// DOM 元素
const semesterSelect = document.getElementById('semesterSelect');
const loadDataBtn = document.getElementById('loadDataBtn');
const currentSemesterSpan = document.getElementById('currentSemester');
const totalRecordsSpan = document.getElementById('totalRecords');
const tableBody = document.getElementById('tableBody');
const dataTable = document.getElementById('dataTable');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const addRecordBtn = document.getElementById('addRecordBtn');
const exportSelectedBtn = document.getElementById('exportSelectedBtn');
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
const saveChangesBtn = document.getElementById('saveChangesBtn');
const resetBtn = document.getElementById('resetBtn');
const adminGradeFilter = document.getElementById('adminGradeFilter');
const tableSearchInput = document.getElementById('tableSearchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const visibleCountSpan = document.getElementById('visibleCount');
const loadedCountSpan = document.getElementById('loadedCount');
const lastLoadTimeSpan = document.getElementById('lastLoadTime');
const unsavedWarning = document.getElementById('unsavedWarning');
const announcementText = document.getElementById('announcementText');
const loadAnnouncementBtn = document.getElementById('loadAnnouncementBtn');
const saveAnnouncementBtn = document.getElementById('saveAnnouncementBtn');
const addRecordModal = document.getElementById('addRecordModal');
const newRecordForm = document.getElementById('newRecordForm');
const loadingOverlay = document.querySelector('.loading-overlay');
const notification = document.querySelector('.notification');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadSemesters();
    loadAnnouncement();
    setupEventListeners();
});

// 设置事件监听器
function setupEventListeners() {
    // 学期选择和加载
    semesterSelect.addEventListener('change', () => {
        currentSemester = semesterSelect.value;
        currentSemesterSpan.textContent = semesterSelect.options[semesterSelect.selectedIndex].text;
    });

    loadDataBtn.addEventListener('click', loadData);

    // 表格操作
    selectAllCheckbox.addEventListener('change', toggleSelectAll);
    addRecordBtn.addEventListener('click', showAddRecordModal);
    exportSelectedBtn.addEventListener('click', exportSelectedToCsv);
    deleteSelectedBtn.addEventListener('click', deleteSelectedRecords);
    saveChangesBtn.addEventListener('click', saveChanges);
    resetBtn.addEventListener('click', resetData);

    // 筛选和搜索
    adminGradeFilter.addEventListener('change', filterTable);
    tableSearchInput.addEventListener('input', filterTable);
    clearSearchBtn.addEventListener('click', clearSearch);

    // 公告管理
    loadAnnouncementBtn.addEventListener('click', loadAnnouncement);
    saveAnnouncementBtn.addEventListener('click', saveAnnouncement);

    // 模态框
    document.querySelector('.modal-close').addEventListener('click', () => {
        addRecordModal.style.display = 'none';
    });

    newRecordForm.addEventListener('submit', addNewRecord);

    // 表格单元格编辑
    tableBody.addEventListener('dblclick', handleCellEdit);

    // 单元格编辑完成
    tableBody.addEventListener('blur', handleCellEditComplete, true);

    // 输入框按Enter保存，Esc取消
    tableBody.addEventListener('keydown', function(e) {
        if (!e.target || !e.target.classList) return;

        if (e.target.classList.contains('cell-edit-input')) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const row = e.target.closest('tr');
                const saveBtn = row.querySelector('.btn-save-record');
                if (saveBtn) saveBtn.click();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                const row = e.target.closest('tr');
                const cancelBtn = row.querySelector('.btn-cancel-edit');
                if (cancelBtn) cancelBtn.click();
            }
        }
    });
}

// 加载学期列表
async function loadSemesters() {
    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/semesters`);
        if (!response.ok) throw new Error('加载学期列表失败');

        const semesters = await response.json();

        // 清空并填充学期选择下拉框
        semesterSelect.innerHTML = '<option value="" disabled selected>请选择学期</option>';
        semesters.forEach(semester => {
            const option = document.createElement('option');
            option.value = semester.key;
            option.textContent = semester.name;
            semesterSelect.appendChild(option);
        });

        // 设置当前学期为默认选中
        if (semesters.length > 0) {
            const current = semesters.find(s => s.key === 'current_semester');
            if (current) {
                semesterSelect.value = current.key;
                currentSemester = current.key;
                currentSemesterSpan.textContent = current.name;
            }
        }
    } catch (error) {
        showNotification('加载学期列表失败: ' + error.message, 'error');
        console.error('加载学期列表失败:', error);
    } finally {
        hideLoading();
    }
}

// 加载数据
async function loadData() {
    if (!currentSemester) {
        showNotification('请先选择学期', 'error');
        return;
    }

    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/records?semester=${currentSemester}`);
        if (!response.ok) throw new Error('加载数据失败');

        tableData = await response.json();

        // 清除所有修改标记
        tableData.forEach(record => {
            delete record._modified;
        });

        renderTable();
        updateTableInfo();
        lastLoadTimeSpan.textContent = new Date().toLocaleString();
        unsavedChanges = false;
        updateUnsavedIndicator();

        // 默认全选所有记录
        selectedRows.clear();
        tableData.forEach(record => {
            selectedRows.add(record.id);
        });
        updateDeleteButtonState();
        selectAllCheckbox.checked = true;
    } catch (error) {
        showNotification('加载数据失败: ' + error.message, 'error');
        console.error('加载数据失败:', error);
    } finally {
        hideLoading();
    }
}

// 渲染表格
function renderTable() {
    tableBody.innerHTML = '';

    if (tableData.length === 0) {
        const noDataRow = document.createElement('tr');
        noDataRow.id = 'noDataRow';
        noDataRow.innerHTML = `
            <td colspan="11" style="text-align: center; padding: 40px; color: #7f8c8d;">
                <i class="fas fa-search fa-2x" style="margin-bottom: 10px; display: block;"></i>
                无匹配记录
            </td>
        `;
        tableBody.appendChild(noDataRow);
        return;
    }

    tableData.forEach((record, index) => {
        const row = document.createElement('tr');
        row.dataset.id = record.id;

        if (selectedRows.has(record.id)) {
            row.classList.add('selected');
        }

        // 处理detail字段显示
        const displayDetail = record.detail && record.detail.length > 60 
            ? record.detail.substring(0, 60) + '...' 
            : (record.detail || '');

        row.innerHTML = `
            <td><input type="checkbox" class="row-checkbox" data-id="${record.id}" ${selectedRows.has(record.id) ? 'checked' : ''}></td>
            <td class="editable" data-field="grade">${record.grade || ''}</td>
            <td class="editable" data-field="type">${record.type || ''}</td>
            <td class="editable" data-field="person">${record.person || ''}</td>
            <td class="editable" data-field="detail" title="${record.detail || ''}">${displayDetail}</td>
            <td class="editable" data-field="datetime">${formatDateTime(record.datetime)}</td>
            <td class="editable" data-field="admin">${record.admin || ''}</td>
            <td class="editable" data-field="method">${record.method || ''}</td>
            <td class="editable" data-field="points">${record.points || ''}</td>
            <td class="editable" data-field="status">${record.status || ''}</td>
            <td class="action-buttons">
                <button class="btn-save-record" data-id="${record.id}" title="保存此行修改" style="display:none;">
                    <i class="fas fa-save"></i>
                </button>
                <button class="btn-cancel-edit" data-id="${record.id}" title="取消编辑" style="display:none;">
                    <i class="fas fa-times"></i>
                </button>
                <button class="btn-delete-record" data-id="${record.id}" title="删除此行">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;

        tableBody.appendChild(row);
    });

    // 为操作按钮添加事件监听
    tableBody.addEventListener('click', (e) => {
        if (!e.target || !e.target.closest) return;

        const deleteBtn = e.target.closest('.btn-delete-record');
        const saveBtn = e.target.closest('.btn-save-record');
        const cancelBtn = e.target.closest('.btn-cancel-edit');

        // 处理删除按钮点击
        if (deleteBtn) {
            e.stopPropagation();
            const id = parseInt(deleteBtn.dataset.id);
            deleteRecord(id);
            return;
        }

        // 处理保存按钮点击
        if (saveBtn) {
            e.stopPropagation();
            const row = saveBtn.closest('tr');
            const id = parseInt(row.dataset.id);
            saveRecord(id);
            return;
        }

        // 处理取消按钮点击
        if (cancelBtn) {
            e.stopPropagation();
            const row = cancelBtn.closest('tr');
            cancelEdit(row);
            return;
        }
    });

    // 为复选框添加事件监听
    document.querySelectorAll('.row-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id);
            const row = e.target.closest('tr');

            if (e.target.checked) {
                selectedRows.add(id);
                row.classList.add('selected');
            } else {
                selectedRows.delete(id);
                row.classList.remove('selected');
            }

            updateDeleteButtonState();
        });
    });
}

// 保存单条记录
async function saveRecord(id) {
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (!row) return;

    const record = tableData.find(r => r.id === id);
    if (!record) return;

    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/records/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(record)
        });

        if (!response.ok) throw new Error('保存记录失败');

        const updatedRecord = await response.json();

        // 更新本地数据
        const index = tableData.findIndex(r => r.id === id);
        if (index !== -1) {
            tableData[index] = updatedRecord;
            delete tableData[index]._modified; // 清除修改标记
        }

        // 检查是否还有未保存的修改
        const hasUnsavedChanges = tableData.some(r => r._modified);
        unsavedChanges = hasUnsavedChanges;
        updateUnsavedIndicator();

        // 重新渲染表格
        renderTable();
        updateTableInfo();

        showNotification('记录保存成功');
    } catch (error) {
        showNotification('保存记录失败: ' + error.message, 'error');
        console.error('保存记录失败:', error);
    } finally {
        hideLoading();
    }
}

// 取消编辑
function cancelEdit(row) {
    if (!row) return;

    // 恢复所有编辑中的单元格
    const editingCells = row.querySelectorAll('.editable.editing');
    editingCells.forEach(cell => {
        const field = cell.dataset.field;
        const recordId = parseInt(row.dataset.id);
        const record = tableData.find(r => r.id === recordId);

        if (record) {
            let displayValue = record[field] || '';

            // 处理datetime字段显示
            if (field === 'datetime' && displayValue) {
                displayValue = formatDateTime(displayValue);
            }

            // 处理detail字段显示
            if (field === 'detail' && displayValue.length > 60) {
                displayValue = displayValue.substring(0, 60) + '...';
            }

            cell.textContent = displayValue;
        }

        cell.classList.remove('editing');
    });

    // 隐藏保存/取消按钮，显示删除按钮
    const actionCell = row.querySelector('.action-buttons');
    if (actionCell) {
        actionCell.querySelector('.btn-save-record').style.display = 'none';
        actionCell.querySelector('.btn-cancel-edit').style.display = 'none';
        actionCell.querySelector('.btn-delete-record').style.display = 'inline-flex';
    }
}

// 格式化日期时间
function formatDateTime(datetime) {
    if (!datetime) return '';
    const date = new Date(datetime);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 更新表格信息
function updateTableInfo() {
    totalRecordsSpan.textContent = tableData.length;
    loadedCountSpan.textContent = tableData.length;

    // 应用筛选后更新可见行数
    filterTable();
}

// 全选/反选
function toggleSelectAll() {
    const isChecked = selectAllCheckbox.checked;
    const checkboxes = document.querySelectorAll('.row-checkbox');

    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
        const id = parseInt(checkbox.dataset.id);
        const row = checkbox.closest('tr');

        if (isChecked) {
            selectedRows.add(id);
            row.classList.add('selected');
        } else {
            selectedRows.delete(id);
            row.classList.remove('selected');
        }
    });

    updateDeleteButtonState();
}

// 更新删除按钮状态
function updateDeleteButtonState() {
    deleteSelectedBtn.disabled = selectedRows.size === 0;
}

// 显示添加记录模态框
function showAddRecordModal() {
    addRecordModal.style.display = 'block';

    // 设置默认日期时间为当前时间
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('newDatetime').value = now.toISOString().slice(0, 16);
}

// 添加新记录
async function addNewRecord(e) {
    e.preventDefault();

    if (!currentSemester) {
        showNotification('请先选择学期', 'error');
        return;
    }

    const newRecord = {
        semester: currentSemester,
        grade: document.getElementById('newGrade').value,
        type: document.getElementById('newType').value,
        person: document.getElementById('newPerson').value,
        detail: document.getElementById('newDetail').value,
        datetime: document.getElementById('newDatetime').value,
        admin: document.getElementById('newAdmin').value,
        method: document.getElementById('newMethod').value,
        points: document.getElementById('newPoints').value || 0,
        status: document.getElementById('newStatus').value
    };

    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/records`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newRecord)
        });

        if (!response.ok) throw new Error('添加记录失败');

        const addedRecord = await response.json();
        addedRecord._modified = true; // 标记新记录为已修改
        tableData.unshift(addedRecord); // 添加到开头，与离线模式一致
        renderTable();
        updateTableInfo();

        // 关闭模态框并重置表单
        addRecordModal.style.display = 'none';
        newRecordForm.reset();

        showNotification('记录添加成功');
        unsavedChanges = true;
        updateUnsavedIndicator();
    } catch (error) {
        showNotification('添加记录失败: ' + error.message, 'error');
        console.error('添加记录失败:', error);
    } finally {
        hideLoading();
    }
}

// 删除记录
async function deleteRecord(id) {
    if (!confirm('确定要删除此记录吗？')) return;

    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/records/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('删除记录失败');

        // 从本地数据中移除
        tableData = tableData.filter(record => record.id !== id);

        // 从选中集合中移除
        selectedRows.delete(id);
        updateDeleteButtonState();

        renderTable();
        updateTableInfo();
        showNotification('记录删除成功');
        // 删除操作不标记为未保存，因为已经立即同步到服务器
        // 如果需要标记为未保存，可以取消下面注释
        // unsavedChanges = true;
        // updateUnsavedIndicator();
    } catch (error) {
        showNotification('删除记录失败: ' + error.message, 'error');
        console.error('删除记录失败:', error);
    } finally {
        hideLoading();
    }
}

// 删除选中的记录
async function deleteSelectedRecords() {
    if (selectedRows.size === 0) return;

    if (!confirm(`确定要删除选中的 ${selectedRows.size} 条记录吗？`)) return;

    try {
        showLoading();

        // 逐个删除选中的记录
        for (const id of selectedRows) {
            const response = await fetch(`${API_BASE_URL}/records/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error(`删除记录 ID ${id} 失败`);
        }

        // 从本地数据中移除所有选中的记录
        tableData = tableData.filter(record => !selectedRows.has(record.id));

        // 保存删除数量用于通知
        const deletedCount = selectedRows.size;

        // 清空选中集合
        selectedRows.clear();
        updateDeleteButtonState();
        selectAllCheckbox.checked = false;

        renderTable();
        updateTableInfo();
        showNotification(`成功删除 ${deletedCount} 条记录`);
        // 删除操作不标记为未保存，因为已经立即同步到服务器
        // 如果需要标记为未保存，可以取消下面注释
        // unsavedChanges = true;
        // updateUnsavedIndicator();
    } catch (error) {
        showNotification('删除记录失败: ' + error.message, 'error');
        console.error('删除记录失败:', error);
    } finally {
        hideLoading();
    }
}

// 处理单元格编辑
function handleCellEdit(e) {
    const cell = e.target.closest('.editable');
    if (!cell) return;

    // 如果已经是编辑状态，不重复处理
    if (cell.classList.contains('editing')) return;

    const currentValue = cell.textContent.trim();
    const field = cell.dataset.field;
    const row = cell.closest('tr');
    const recordId = parseInt(row.dataset.id);

    // 创建编辑输入控件
    let editInput;

    // 根据字段类型设置不同的输入控件
    if (field === 'datetime') {
        editInput = document.createElement('input');
        editInput.type = 'datetime-local';
        editInput.className = 'cell-edit-input';
        // 转换为 datetime-local 所需的格式
        const date = new Date(currentValue);
        if (!isNaN(date.getTime())) {
            date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
            editInput.value = date.toISOString().slice(0, 16);
        }
    } else if (field === 'grade') {
        editInput = document.createElement('select');
        editInput.className = 'cell-edit-input';
        ['', '初一', '初二', '初三'].forEach(grade => {
            const option = document.createElement('option');
            option.value = grade;
            option.textContent = grade || '(无)';
            if (grade === currentValue) option.selected = true;
            editInput.appendChild(option);
        });
    } else if (field === 'type') {
        editInput = document.createElement('select');
        editInput.className = 'cell-edit-input';
        ['奖', '惩'].forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            if (type === currentValue) option.selected = true;
            editInput.appendChild(option);
        });
    } else if (field === 'status') {
        editInput = document.createElement('select');
        editInput.className = 'cell-edit-input';
        ['', '已处理', '处理中', '待处理'].forEach(status => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status || '(无)';
            if (status === currentValue) option.selected = true;
            editInput.appendChild(option);
        });
    } else if (field === 'detail') {
        editInput = document.createElement('textarea');
        editInput.className = 'cell-edit-input';
        editInput.rows = 2;
        editInput.value = currentValue;
        // 自动调整高度
        setTimeout(() => {
            editInput.style.height = editInput.scrollHeight + 'px';
        }, 0);
    } else if (field === 'points') {
        editInput = document.createElement('input');
        editInput.type = 'number';
        editInput.className = 'cell-edit-input';
        editInput.step = '0.5';
        editInput.value = currentValue;
    } else {
        // 默认使用文本输入框
        editInput = document.createElement('input');
        editInput.type = 'text';
        editInput.className = 'cell-edit-input';
        editInput.value = currentValue;
    }

    // 清空单元格并添加输入控件
    cell.textContent = '';
    cell.appendChild(editInput);
    cell.classList.add('editing');
    editInput.focus();

    // 显示保存/取消按钮
    const actionCell = row.querySelector('.action-buttons');
    if (actionCell) {
        actionCell.querySelector('.btn-save-record').style.display = 'inline-flex';
        actionCell.querySelector('.btn-cancel-edit').style.display = 'inline-flex';
        actionCell.querySelector('.btn-delete-record').style.display = 'none';
    }
}

// 处理单元格编辑完成
function handleCellEditComplete(e) {
    const cell = e.target.closest('.editable');
    if (!cell || !cell.classList.contains('editing')) return;

    const editInput = cell.querySelector('.cell-edit-input');
    if (!editInput) return;

    const newValue = editInput.value;
    const field = cell.dataset.field;
    const row = cell.closest('tr');
    const recordId = parseInt(row.dataset.id);

    // 处理datetime字段格式
    let displayValue = newValue;
    if (field === 'datetime' && newValue) {
        const date = new Date(newValue);
        if (!isNaN(date.getTime())) {
            displayValue = formatDateTime(date.toISOString());
        }
    }

    // 处理detail字段显示
    if (field === 'detail' && displayValue.length > 60) {
        displayValue = displayValue.substring(0, 60) + '...';
    }

    // 恢复单元格显示
    cell.textContent = displayValue;
    cell.classList.remove('editing');

    // 隐藏保存/取消按钮，显示删除按钮
    const actionCell = row.querySelector('.action-buttons');
    if (actionCell) {
        actionCell.querySelector('.btn-save-record').style.display = 'none';
        actionCell.querySelector('.btn-cancel-edit').style.display = 'none';
        actionCell.querySelector('.btn-delete-record').style.display = 'inline-flex';
    }

    // 更新本地数据
    const record = tableData.find(r => r.id === recordId);
    if (record) {
        // 获取原始值
        const originalValue = record[field] || '';

        // 如果值有变化，更新本地数据并标记为未保存
        if (newValue !== originalValue) {
            record[field] = newValue;
            record._modified = true; // 标记记录为已修改
            unsavedChanges = true;
            updateUnsavedIndicator();
        }
    }
}

// 保存更改
async function saveChanges() {
    if (!unsavedChanges) {
        showNotification('没有需要保存的更改');
        return;
    }

    // 检查是否有正在编辑的单元格
    const editingCells = document.querySelectorAll('.editable.editing');
    if (editingCells.length > 0) {
        showNotification('请先保存或取消正在编辑的单元格', 'error');
        return;
    }

    try {
        showLoading();

        // 只保存修改过的记录
        let savedCount = 0;
        for (const record of tableData) {
            // 检查记录是否被修改过
            if (record._modified) {
                const response = await fetch(`${API_BASE_URL}/records/${record.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(record)
                });

                if (!response.ok) throw new Error(`保存记录 ID ${record.id} 失败`);

                // 更新本地数据
                const updatedRecord = await response.json();
                const index = tableData.findIndex(r => r.id === record.id);
                if (index !== -1) {
                    tableData[index] = updatedRecord;
                    delete tableData[index]._modified;
                }

                savedCount++;
            }
        }

        if (savedCount === 0) {
            showNotification('没有需要保存的更改');
        } else {
            unsavedChanges = false;
            updateUnsavedIndicator();
            showNotification(`成功保存 ${savedCount} 条记录到服务器`);

            // 重新渲染表格以显示最新数据
            renderTable();
        }
    } catch (error) {
        showNotification('保存更改失败: ' + error.message, 'error');
        console.error('保存更改失败:', error);
    } finally {
        hideLoading();
    }
}

// 重置数据
async function resetData() {
    if (unsavedChanges && !confirm('有未保存的更改，确定要放弃并重置吗？')) {
        return;
    }

    await loadData();

    // 清除所有修改标记
    tableData.forEach(record => {
        delete record._modified;
    });
}

// 筛选表格
function filterTable() {
    const gradeFilter = adminGradeFilter.value;
    const searchTerm = tableSearchInput.value.toLowerCase();

    const rows = tableBody.querySelectorAll('tr:not(#noDataRow)');
    let visibleCount = 0;

    rows.forEach(row => {
        const grade = row.querySelector('td:nth-child(2)').textContent;
        const person = row.querySelector('td:nth-child(4)').textContent.toLowerCase();
        const detail = row.querySelector('td:nth-child(5)').textContent.toLowerCase();
        const admin = row.querySelector('td:nth-child(7)').textContent.toLowerCase();

        const matchesGrade = gradeFilter === 'all' || grade === gradeFilter;
        const matchesSearch = searchTerm === '' || 
                              person.includes(searchTerm) || 
                              detail.includes(searchTerm) ||
                              admin.includes(searchTerm);

        if (matchesGrade && matchesSearch) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    visibleCountSpan.textContent = visibleCount;
}

// 清空搜索
function clearSearch() {
    tableSearchInput.value = '';
    adminGradeFilter.value = 'all';
    filterTable();
}

// 更新未保存指示器
function updateUnsavedIndicator() {
    unsavedWarning.style.display = unsavedChanges ? 'inline' : 'none';
}

// 加载公告
async function loadAnnouncement() {
    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/announcement`);
        if (!response.ok) throw new Error('加载公告失败');

        const announcement = await response.json();
        announcementText.value = announcement.text || '';
    } catch (error) {
        showNotification('加载公告失败: ' + error.message, 'error');
        console.error('加载公告失败:', error);
    } finally {
        hideLoading();
    }
}

// 保存公告
async function saveAnnouncement() {
    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}/announcement`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: announcementText.value })
        });

        if (!response.ok) throw new Error('保存公告失败');

        showNotification('公告已成功保存');
    } catch (error) {
        showNotification('保存公告失败: ' + error.message, 'error');
        console.error('保存公告失败:', error);
    } finally {
        hideLoading();
    }
}

// 显示加载中
function showLoading() {
    loadingOverlay.style.display = 'flex';
}

// 隐藏加载中
function hideLoading() {
    loadingOverlay.style.display = 'none';
}

// 显示通知
function showNotification(message, type = 'success') {
    notification.textContent = message;
    notification.className = 'notification';

    if (type === 'error') {
        notification.classList.add('error');
    }

    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// 导出选中的记录为CSV
function exportSelectedToCsv() {
    if (selectedRows.size === 0) {
        showNotification('请先选择要导出的记录', 'error');
        return;
    }

    // 获取选中的记录
    const selectedRecords = tableData.filter(record => selectedRows.has(record.id));

    if (selectedRecords.length === 0) {
        showNotification('没有可导出的记录', 'error');
        return;
    }

    // 创建CSV内容
    let csvContent = 'type,person,detail,datetime,admin,method,points,status\n';

    selectedRecords.forEach(record => {
        const row = [
            record.type || '',
            record.person || '',
            record.detail || '',
            record.datetime || '',
            record.admin || '',
            record.method || '',
            record.points || '',
            record.status || ''
        ];

        // 处理字段中的逗号和引号
        for (let i = 0; i < row.length; i++) {
            let cell = String(row[i] || '');
            if (cell.indexOf(',') !== -1 || cell.indexOf('"') !== -1 || cell.indexOf('\n') !== -1) {
                cell = '"' + cell.replace(/"/g, '""') + '"';
            }
            row[i] = cell;
        }

        csvContent += row.join(',') + '\n';
    });

    // 添加BOM以支持Excel中文
    const BOM = '﻿';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${currentSemester || 'export'}_selected_${timestamp}.csv`;

    // 创建下载链接并触发下载
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showNotification(`成功导出 ${selectedRecords.length} 条记录`);
}
