"""
在线数据管理服务器
使用 Flask 框架提供 RESTful API 接口
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import csv
import sqlite3
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='.')
CORS(app)  # 允许跨域请求

# 配置
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
DB_FILE = os.path.join(BASE_DIR, 'database.db')
SEMESTERS_FILE = os.path.join(DATA_DIR, 'semesters.csv')
ANNOUNCEMENT_FILE = os.path.join(DATA_DIR, 'announcement.csv')

# 确保数据目录存在
os.makedirs(DATA_DIR, exist_ok=True)

# 数据库初始化
def init_db():
    """初始化数据库表"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 创建学期表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS semesters (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        file TEXT
    )
    ''')
    
    # 创建记录表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        semester TEXT NOT NULL,
        grade TEXT,
        type TEXT,
        person TEXT,
        detail TEXT,
        datetime TEXT,
        admin TEXT,
        method TEXT,
        points REAL DEFAULT 0,
        status TEXT DEFAULT '已处理',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (semester) REFERENCES semesters(key)
    )
    ''')
    
    # 创建公告表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    conn.commit()

    
    # 从CSV文件导入初始数据
    import_data_from_csv()

def import_data_from_csv():
    """从CSV文件导入数据到数据库"""
    # 导入学期数据
    if os.path.exists(SEMESTERS_FILE):
        with open(SEMESTERS_FILE, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                upsert_semester(row)
    
    # 导入公告数据
    if os.path.exists(ANNOUNCEMENT_FILE):
        with open(ANNOUNCEMENT_FILE, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                upsert_announcement(row.get('text', ''))
    
    # 导入各学期记录数据
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('SELECT key, file FROM semesters')
    semesters = cursor.fetchall()

    
    for key, file in semesters:
        file_path = os.path.join(DATA_DIR, file)
        if os.path.exists(file_path):
            import_records_from_csv(key, file_path)

def import_records_from_csv(semester_key, file_path):
    """从CSV文件导入记录数据"""
    if not os.path.exists(file_path):
        logger.warning(f"文件不存在: {file_path}")
        return
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 检查该学期是否已有数据
    cursor.execute('SELECT COUNT(*) FROM records WHERE semester = ?', (semester_key,))
    count = cursor.fetchone()[0]
    
    if count > 0:
        logger.info(f"学期 {semester_key} 已有 {count} 条记录，跳过导入")
    
        return
    
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            cursor.execute('''
            INSERT INTO records (semester, grade, type, person, detail, datetime, admin, method, points, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                semester_key,
                row.get('grade', ''),
                row.get('type', ''),
                row.get('person', ''),
                row.get('detail', ''),
                row.get('datetime', ''),
                row.get('admin', ''),
                row.get('method', ''),
                float(row.get('points', 0)) if row.get('points') else 0,
                row.get('status', '已处理')
            ))
    
    conn.commit()

    logger.info(f"从 {file_path} 导入记录到学期 {semester_key}")

def upsert_semester(semester_data):
    """插入或更新学期数据"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute('''
    INSERT OR REPLACE INTO semesters (key, name, start_date, end_date, file)
    VALUES (?, ?, ?, ?, ?)
    ''', (
        semester_data.get('key', ''),
        semester_data.get('name', ''),
        semester_data.get('start_date', ''),
        semester_data.get('end_date', ''),
        semester_data.get('file', '')
    ))
    
    conn.commit()


def upsert_announcement(text):
    """插入或更新公告数据"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 检查是否已有公告
    cursor.execute('SELECT COUNT(*) FROM announcements')
    count = cursor.fetchone()[0]
    
    if count > 0:
        # 更新第一条公告
        cursor.execute('UPDATE announcements SET text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1', (text,))
    else:
        # 插入新公告
        cursor.execute('INSERT INTO announcements (text) VALUES (?)', (text,))
    
    conn.commit()


# 静态文件路由
@app.route('/css/<path:filename>')
def serve_css(filename):
    """提供CSS文件"""
    return send_from_directory('css', filename)

@app.route('/data/<path:filename>')
def serve_data(filename):
    """提供data目录下的文件"""
    return send_from_directory('data', filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    """提供JavaScript文件"""
    return send_from_directory('js', filename)

@app.route('/vendor/<path:filename>')
def serve_vendor(filename):
    """提供vendor文件"""
    return send_from_directory('vendor', filename)

# API 路由
@app.route('/')
def index():
    """提供主页面"""
    return send_from_directory('.', 'index.html')

@app.route('/index.html')
def index_html():
    """提供主页面"""
    return send_from_directory('.', 'index.html')

@app.route('/admin.html')
def admin():
    """提供本地管理页面"""
    return send_from_directory('.', 'admin.html')

@app.route('/admin_online.html')
def admin_online():
    """提供在线管理页面"""
    return send_from_directory('.', 'admin_online.html')

@app.route('/all_semesters.html')
def all_semesters():
    """提供全部记录汇总页面"""
    return send_from_directory('.', 'all_semesters.html')

@app.route('/api/semesters', methods=['GET'])
def get_semesters():
    """获取所有学期"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT key, name, start_date, end_date FROM semesters ORDER BY key DESC')
    semesters = [dict(row) for row in cursor.fetchall()]
    

    return jsonify(semesters)

@app.route('/api/semesters', methods=['POST'])
def add_semester():
    """添加新学期"""
    data = request.json
    upsert_semester(data)
    return jsonify({'success': True, 'message': '学期添加成功'})

@app.route('/api/records', methods=['GET'])
def get_records():
    """获取记录"""
    semester = request.args.get('semester')
    
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    if semester:
        cursor.execute('SELECT * FROM records WHERE semester = ? ORDER BY datetime DESC', (semester,))
    else:
        cursor.execute('SELECT * FROM records ORDER BY datetime DESC')
    
    records = [dict(row) for row in cursor.fetchall()]

    
    return jsonify(records)

@app.route('/api/records', methods=['POST'])
def add_record():
    """添加新记录"""
    data = request.json
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute('''
    INSERT INTO records (semester, grade, type, person, detail, datetime, admin, method, points, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.get('semester', ''),
        data.get('grade', ''),
        data.get('type', ''),
        data.get('person', ''),
        data.get('detail', ''),
        data.get('datetime', ''),
        data.get('admin', ''),
        data.get('method', ''),
        float(data.get('points', 0)) if data.get('points') else 0,
        data.get('status', '已处理')
    ))
    
    record_id = cursor.lastrowid
    conn.commit()

    
    # 获取新添加的记录
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM records WHERE id = ?', (record_id,))
    new_record = dict(cursor.fetchone())

    
    return jsonify(new_record)

@app.route('/api/records/<int:record_id>', methods=['PUT'])
def update_record(record_id):
    """更新记录"""
    data = request.json
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 构建更新SQL
    update_fields = []
    update_values = []
    
    for field in ['grade', 'type', 'person', 'detail', 'datetime', 'admin', 'method', 'points', 'status']:
        if field in data:
            update_fields.append(f"{field} = ?")
            update_values.append(data[field])
    
    if not update_fields:
    
        return jsonify({'success': False, 'message': '没有要更新的字段'}), 400
    
    update_values.append(record_id)
    
    cursor.execute(f'''
    UPDATE records SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    ''', update_values)
    
    conn.commit()

    
    # 获取更新后的记录
    # 重新创建连接以设置row_factory
    conn2 = sqlite3.connect(DB_FILE)
    conn2.row_factory = sqlite3.Row
    cursor2 = conn2.cursor()
    cursor2.execute('SELECT * FROM records WHERE id = ?', (record_id,))
    updated_record = dict(cursor2.fetchone())
    conn2.close()


    return jsonify(updated_record)

@app.route('/api/records/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    """删除记录"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM records WHERE id = ?', (record_id,))
    
    conn.commit()

    
    return jsonify({'success': True, 'message': '记录删除成功'})

@app.route('/api/announcement', methods=['GET'])
def get_announcement():
    """获取公告"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT text FROM announcements ORDER BY updated_at DESC LIMIT 1')
    result = cursor.fetchone()
    

    
    if result:
        return jsonify({'text': result['text']})
    else:
        return jsonify({'text': '暂无公告。'})

@app.route('/api/announcement', methods=['POST', 'PUT'])
def update_announcement():
    """更新公告"""
    data = request.json
    text = data.get('text', '')
    
    upsert_announcement(text)
    
    return jsonify({'success': True, 'message': '公告更新成功'})

@app.route('/api/export/<semester_key>', methods=['GET'])
def export_to_csv(semester_key):
    """导出学期数据到CSV文件"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 获取学期文件名
    cursor.execute('SELECT file FROM semesters WHERE key = ?', (semester_key,))
    result = cursor.fetchone()
    
    if not result:
    
        return jsonify({'success': False, 'message': '学期不存在'}), 404
    
    file_name = result['file']
    file_path = os.path.join(DATA_DIR, file_name)
    
    # 获取学期记录
    cursor.execute('SELECT * FROM records WHERE semester = ?', (semester_key,))
    records = [dict(row) for row in cursor.fetchall()]
    

    
    # 写入CSV文件
    with open(file_path, 'w', newline='', encoding='utf-8-sig') as f:
        if records:
            writer = csv.DictWriter(f, fieldnames=[
                'grade', 'type', 'person', 'detail', 'datetime', 
                'admin', 'method', 'points', 'status'
            ])
            writer.writeheader()
            
            for record in records:
                # 移除不需要的字段
                record_copy = {
                    'grade': record.get('grade', ''),
                    'type': record.get('type', ''),
                    'person': record.get('person', ''),
                    'detail': record.get('detail', ''),
                    'datetime': record.get('datetime', ''),
                    'admin': record.get('admin', ''),
                    'method': record.get('method', ''),
                    'points': record.get('points', 0),
                    'status': record.get('status', '已处理')
                }
                writer.writerow(record_copy)
    
    return jsonify({
        'success': True, 
        'message': f'数据已导出到 {file_name}',
        'file_path': file_path
    })

@app.route('/api/export/announcement', methods=['GET'])
def export_announcement_to_csv():
    """导出公告到CSV文件"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT text FROM announcements ORDER BY updated_at DESC LIMIT 1')
    result = cursor.fetchone()
    

    
    # 写入CSV文件
    with open(ANNOUNCEMENT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['text'])
        writer.writeheader()
        writer.writerow({'text': result['text'] if result else '暂无公告。'})
    
    return jsonify({
        'success': True, 
        'message': f'公告已导出到 {ANNOUNCEMENT_FILE}',
        'file_path': ANNOUNCEMENT_FILE
    })

# 启动应用
if __name__ == '__main__':
    init_db()
    logger.info("数据库初始化完成")
    logger.info("服务器启动在 http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
    app.run(host='0.0.0.0', port=5000, debug=True)
