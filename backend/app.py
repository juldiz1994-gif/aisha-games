from flask import Flask, request, jsonify, send_from_directory, redirect
from flask_cors import CORS
import sqlite3, hashlib, secrets, os, json

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, 'netlify-local')
DB_PATH    = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'teachers.db')
CFG_PATH   = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')

def load_config():
    if not os.path.exists(CFG_PATH):
        return {}
    with open(CFG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

app = Flask(__name__)
CORS(app)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    db = get_db()
    db.execute('''CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        token TEXT UNIQUE,
        created_at INTEGER DEFAULT (strftime('%s','now'))
    )''')
    db.execute('''CREATE TABLE IF NOT EXISTS game_configs (
        id TEXT PRIMARY KEY,
        teacher_id INTEGER,
        game_type TEXT NOT NULL,
        config_json TEXT NOT NULL,
        title TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    )''')
    db.commit()
    db.close()

init_db()

def hash_pw(pw):
    return hashlib.sha256(pw.strip().encode('utf-8')).hexdigest()

def get_teacher(token):
    if not token:
        return None
    db = get_db()
    row = db.execute('SELECT * FROM teachers WHERE token=?', (token,)).fetchone()
    db.close()
    return dict(row) if row else None

@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json() or {}
    email = data.get('email','').strip().lower()
    password = data.get('password','').strip()
    if not email or not password:
        return jsonify({'error': 'Email және пароль керек'}), 400
    if len(password) < 4:
        return jsonify({'error': 'Пароль кем дегенде 4 символ'}), 400
    token = secrets.token_hex(24)
    try:
        db = get_db()
        db.execute('INSERT INTO teachers (email, password_hash, token) VALUES (?,?,?)',
                   (email, hash_pw(password), token))
        db.commit()
        db.close()
        return jsonify({'success': True, 'token': token, 'email': email})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Бұл email бұрын тіркелген'}), 409

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    email = data.get('email','').strip().lower()
    password = data.get('password','').strip()
    db = get_db()
    row = db.execute('SELECT * FROM teachers WHERE email=? AND password_hash=?',
                     (email, hash_pw(password))).fetchone()
    if not row:
        db.close()
        return jsonify({'error': 'Email немесе пароль қате'}), 401
    token = secrets.token_hex(24)
    db.execute('UPDATE teachers SET token=? WHERE id=?', (token, row['id']))
    db.commit()
    db.close()
    return jsonify({'success': True, 'token': token, 'email': email})

@app.route('/api/logout', methods=['POST'])
def api_logout():
    token = request.headers.get('X-Token','')
    if token:
        db = get_db()
        db.execute('UPDATE teachers SET token=NULL WHERE token=?', (token,))
        db.commit()
        db.close()
    return jsonify({'success': True})

@app.route('/api/me')
def api_me():
    token = request.headers.get('X-Token','')
    teacher = get_teacher(token)
    if not teacher:
        return jsonify({'error': 'Авторизация жоқ'}), 401
    return jsonify({'email': teacher['email']})

@app.route('/api/save-game', methods=['POST'])
def api_save_game():
    token = request.headers.get('X-Token','')
    teacher = get_teacher(token)
    if not teacher:
        return jsonify({'error': 'Авторизация қажет'}), 401
    data = request.get_json() or {}
    game_type = data.get('type','unknown')
    config    = data.get('config', {})
    title     = data.get('title', 'Сабақ')
    game_id   = secrets.token_urlsafe(8)
    db = get_db()
    db.execute('INSERT INTO game_configs (id, teacher_id, game_type, config_json, title) VALUES (?,?,?,?,?)',
               (game_id, teacher['id'], game_type, json.dumps(config, ensure_ascii=False), title))
    db.commit()
    db.close()
    return jsonify({'success': True, 'id': game_id})

@app.route('/api/my-games')
def api_my_games():
    token = request.headers.get('X-Token','')
    teacher = get_teacher(token)
    if not teacher:
        return jsonify({'error': 'Авторизация қажет'}), 401
    db = get_db()
    rows = db.execute('SELECT id, game_type, title, created_at FROM game_configs WHERE teacher_id=? ORDER BY created_at DESC',
                      (teacher['id'],)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/admin/stats')
def admin_stats():
    token = request.headers.get('X-Token','')
    teacher = get_teacher(token)
    if not teacher:
        return jsonify({'error': 'Auth required'}), 401
    cfg = load_config()
    if teacher['email'] != cfg.get('admin_email',''):
        return jsonify({'error': 'Admin only'}), 403
    db = get_db()
    total = db.execute('SELECT COUNT(*) as cnt FROM teachers').fetchone()['cnt']
    rows  = db.execute(
        'SELECT email, created_at FROM teachers ORDER BY created_at DESC'
    ).fetchall()
    db.close()
    return jsonify({'total': total, 'users': [dict(r) for r in rows]})

@app.route('/api/game/<game_id>')
def api_get_game(game_id):
    db = get_db()
    row = db.execute('SELECT * FROM game_configs WHERE id=?', (game_id,)).fetchone()
    db.close()
    if not row:
        return jsonify({'error': 'Табылмады'}), 404
    result = dict(row)
    result['config'] = json.loads(result.pop('config_json'))
    return jsonify(result)

@app.route('/play/<game_id>')
def play_game(game_id):
    db = get_db()
    row = db.execute('SELECT game_type FROM game_configs WHERE id=?', (game_id,)).fetchone()
    db.close()
    if not row:
        return '<h2 style="font-family:sans-serif;padding:40px">Сілтеме табылмады</h2>', 404
    return redirect(f'/{row["game_type"]}.html?play={game_id}')

@app.route('/')
def root():
    return redirect('/hub.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)

if __name__ == '__main__':
    import socket
    port = int(os.environ.get('PORT', 5000))
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        local_ip = '127.0.0.1'
    print()
    print('=' * 52)
    print('  Platform started!')
    print()
    print(f'  Local:   http://localhost:{port}')
    print(f'  Network: http://{local_ip}:{port}')
    print('=' * 52)
    print()
    app.run(host='0.0.0.0', port=port, debug=False)
