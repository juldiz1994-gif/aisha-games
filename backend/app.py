import os, json, hashlib, secrets, time, base64, io

BOT_USERNAME = None
from flask import Flask, request, jsonify, send_from_directory, redirect
from flask_cors import CORS
from sqlalchemy import create_engine, text
import requests as http_req

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, 'netlify-local')
CFG_PATH   = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')
DB_PATH    = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'teachers.db')

def load_config():
    if not os.path.exists(CFG_PATH):
        return {}
    with open(CFG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

app = Flask(__name__)
CORS(app)

# ── Database ───────────────────────────────────────────────
_db_url = os.environ.get('DATABASE_URL', f'sqlite:///{DB_PATH}')
if _db_url.startswith('postgres://'):
    _db_url = _db_url.replace('postgres://', 'postgresql://', 1)
USE_PG = _db_url.startswith('postgresql')
engine = create_engine(_db_url, pool_pre_ping=True)

if USE_PG:
    SERIAL  = 'SERIAL PRIMARY KEY'
    NOW_TS  = 'extract(epoch from now())::bigint'
else:
    SERIAL  = 'INTEGER PRIMARY KEY AUTOINCREMENT'
    NOW_TS  = "cast(strftime('%s','now') as integer)"

def row_dict(row):
    return dict(row._mapping) if row else None

def init_db():
    with engine.begin() as c:
        c.execute(text(f'''CREATE TABLE IF NOT EXISTS teachers (
            id {SERIAL},
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            token TEXT UNIQUE,
            telegram_id TEXT,
            display_name TEXT,
            subscription_end BIGINT DEFAULT 0,
            free_games_used INTEGER DEFAULT 0,
            created_at BIGINT DEFAULT ({NOW_TS})
        )'''))
        c.execute(text(f'''CREATE TABLE IF NOT EXISTS game_configs (
            id TEXT PRIMARY KEY,
            teacher_id INTEGER,
            game_type TEXT NOT NULL,
            config_json TEXT NOT NULL,
            title TEXT,
            use_count INTEGER DEFAULT 0,
            max_uses INTEGER DEFAULT 3,
            created_at BIGINT DEFAULT ({NOW_TS})
        )'''))
        c.execute(text(f'''CREATE TABLE IF NOT EXISTS payments (
            id {SERIAL},
            teacher_id INTEGER,
            teacher_email TEXT,
            screenshot TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            amount INTEGER DEFAULT 4990,
            created_at BIGINT DEFAULT ({NOW_TS})
        )'''))
        c.execute(text(f'''CREATE TABLE IF NOT EXISTS unlock_codes (
            code TEXT PRIMARY KEY,
            used BOOLEAN DEFAULT FALSE,
            created_at BIGINT DEFAULT ({NOW_TS})
        )'''))
        c.execute(text(f'''CREATE TABLE IF NOT EXISTS device_unlocks (
            device_id TEXT PRIMARY KEY,
            status TEXT DEFAULT 'pending',
            created_at BIGINT DEFAULT ({NOW_TS})
        )'''))
        c.execute(text(f'''CREATE TABLE IF NOT EXISTS tg_sessions (
            chat_id TEXT PRIMARY KEY,
            status TEXT DEFAULT 'pending',
            unlocked_at BIGINT DEFAULT NULL,
            created_at BIGINT DEFAULT ({NOW_TS})
        )'''))

    # Migrations — add new columns if missing
    if USE_PG:
        migs = [
            "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS telegram_id TEXT",
            "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS display_name TEXT",
            "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS subscription_end BIGINT DEFAULT 0",
            "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS free_games_used INTEGER DEFAULT 0",
            "ALTER TABLE game_configs ADD COLUMN IF NOT EXISTS use_count INTEGER DEFAULT 0",
            "ALTER TABLE game_configs ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT 3",
            "ALTER TABLE tg_sessions ADD COLUMN IF NOT EXISTS unlocked_at BIGINT DEFAULT NULL",
        ]
    else:
        migs = [
            "ALTER TABLE teachers ADD COLUMN telegram_id TEXT",
            "ALTER TABLE teachers ADD COLUMN display_name TEXT",
            "ALTER TABLE teachers ADD COLUMN subscription_end INTEGER DEFAULT 0",
            "ALTER TABLE teachers ADD COLUMN free_games_used INTEGER DEFAULT 0",
            "ALTER TABLE game_configs ADD COLUMN use_count INTEGER DEFAULT 0",
            "ALTER TABLE game_configs ADD COLUMN max_uses INTEGER DEFAULT 3",
            "ALTER TABLE tg_sessions ADD COLUMN unlocked_at BIGINT DEFAULT NULL",
        ]
    for sql in migs:
        try:
            with engine.begin() as c:
                c.execute(text(sql))
        except Exception:
            pass

init_db()

# ── Helpers ───────────────────────────────────────────────
def hash_pw(pw):
    return hashlib.sha256(pw.strip().encode('utf-8')).hexdigest()

def get_teacher_by_token(token):
    if not token:
        return None
    with engine.connect() as c:
        row = c.execute(text('SELECT * FROM teachers WHERE token=:t'), {'t': token}).fetchone()
    return row_dict(row)

def get_admin_email():
    cfg = load_config()
    return os.environ.get('ADMIN_EMAIL') or cfg.get('admin_email', '')

def is_admin(teacher):
    if not teacher:
        return False
    cfg = load_config()
    admin_email = os.environ.get('ADMIN_EMAIL') or cfg.get('admin_email', '')
    admin_tg    = str(os.environ.get('ADMIN_TG_ID') or cfg.get('admin_tg_id', '') or '')
    tg_id       = str(teacher.get('telegram_id') or '')
    return (teacher['email'] == admin_email) or (admin_tg and tg_id and tg_id == admin_tg)

def notify_admin(teacher_email, screenshot_b64):
    cfg = load_config()
    bot_token = os.environ.get('BOT_TOKEN') or cfg.get('bot_token', '')
    admin_id  = os.environ.get('ADMIN_TG_ID') or str(cfg.get('admin_tg_id', ''))
    if not bot_token or not admin_id:
        return
    try:
        data_part = screenshot_b64.split(',', 1)[-1] if ',' in screenshot_b64 else screenshot_b64
        img_bytes = base64.b64decode(data_part)
        http_req.post(
            f'https://api.telegram.org/bot{bot_token}/sendPhoto',
            data={
                'chat_id': admin_id,
                'caption': (
                    f'💳 Жаңа төлем!\n'
                    f'👤 Мұғалім: {teacher_email}\n'
                    f'💰 Сома: 4990 тг\n\n'
                    f'Платформаға кіріп растаңыз.'
                )
            },
            files={'photo': ('payment.jpg', io.BytesIO(img_bytes), 'image/jpeg')},
            timeout=10
        )
    except Exception as e:
        print(f'Telegram notify error: {e}')

# ── Auth ──────────────────────────────────────────────────
@app.route('/api/register', methods=['POST'])
def api_register():
    data        = request.get_json() or {}
    email       = data.get('email', '').strip().lower()
    password    = data.get('password', '').strip()
    telegram_id = str(data.get('telegram_id', '')).strip() or None
    if not email or not password:
        return jsonify({'error': 'Email және пароль керек'}), 400
    if len(password) < 4:
        return jsonify({'error': 'Пароль кем дегенде 4 символ'}), 400
    token = secrets.token_hex(24)
    try:
        with engine.begin() as c:
            c.execute(
                text('INSERT INTO teachers (email, password_hash, token, telegram_id) VALUES (:e,:p,:t,:tg)'),
                {'e': email, 'p': hash_pw(password), 't': token, 'tg': telegram_id}
            )
        return jsonify({'success': True, 'token': token, 'email': email})
    except Exception:
        return jsonify({'error': 'Бұл ат бұрын тіркелген'}), 409

@app.route('/api/login', methods=['POST'])
def api_login():
    data        = request.get_json() or {}
    email       = data.get('email', '').strip().lower()
    password    = data.get('password', '').strip()
    telegram_id = str(data.get('telegram_id', '')).strip() or None
    with engine.connect() as c:
        row = c.execute(
            text('SELECT * FROM teachers WHERE email=:e AND password_hash=:p'),
            {'e': email, 'p': hash_pw(password)}
        ).fetchone()
    if not row:
        return jsonify({'error': 'Ат немесе пароль қате'}), 401
    token = secrets.token_hex(24)
    update = {'token': token, 'id': row_dict(row)['id']}
    if telegram_id and not row_dict(row).get('telegram_id'):
        update['tg'] = telegram_id
        with engine.begin() as c:
            c.execute(text('UPDATE teachers SET token=:token, telegram_id=:tg WHERE id=:id'), update)
    else:
        with engine.begin() as c:
            c.execute(text('UPDATE teachers SET token=:token WHERE id=:id'), update)
    return jsonify({'success': True, 'token': token, 'email': email})

@app.route('/api/tg-login', methods=['POST'])
def api_tg_login():
    data       = request.get_json() or {}
    tg_id      = str(data.get('telegram_id', '')).strip()
    first_name = data.get('first_name', '').strip()
    if not tg_id:
        return jsonify({'error': 'telegram_id керек'}), 400

    with engine.connect() as c:
        row = c.execute(
            text('SELECT * FROM teachers WHERE telegram_id=:tg'),
            {'tg': tg_id}
        ).fetchone()

    new_token = secrets.token_hex(24)

    if row:
        teacher = row_dict(row)
        dn = first_name or teacher.get('display_name') or ''
        with engine.begin() as c:
            c.execute(
                text('UPDATE teachers SET token=:t, display_name=:dn WHERE telegram_id=:tg'),
                {'t': new_token, 'dn': dn, 'tg': tg_id}
            )
        return jsonify({
            'success':      True,
            'token':        new_token,
            'email':        teacher['email'],
            'display_name': dn,
            'free_games_used': teacher.get('free_games_used', 0) or 0,
        })
    else:
        email    = f'tg_{tg_id}@telegram.kz'
        rand_pw  = secrets.token_hex(8)
        try:
            with engine.begin() as c:
                c.execute(
                    text('INSERT INTO teachers (email, password_hash, token, telegram_id, display_name) VALUES (:e,:p,:t,:tg,:dn)'),
                    {'e': email, 'p': hash_pw(rand_pw), 't': new_token, 'tg': tg_id, 'dn': first_name}
                )
            return jsonify({'success': True, 'token': new_token, 'email': email,
                            'display_name': first_name, 'free_games_used': 0})
        except Exception as ex:
            return jsonify({'error': str(ex)}), 500

@app.route('/api/logout', methods=['POST'])
def api_logout():
    token = request.headers.get('X-Token', '')
    if token:
        with engine.begin() as c:
            c.execute(text('UPDATE teachers SET token=NULL WHERE token=:t'), {'t': token})
    return jsonify({'success': True})

@app.route('/api/me')
def api_me():
    token   = request.headers.get('X-Token', '')
    teacher = get_teacher_by_token(token)
    if not teacher:
        return jsonify({'error': 'Авторизация жоқ'}), 401
    now = int(time.time())
    display = teacher.get('display_name') or teacher['email']
    return jsonify({
        'email':            teacher['email'],
        'display_name':     display,
        'is_admin':         is_admin(teacher),
        'subscription_end': teacher.get('subscription_end', 0) or 0,
        'free_games_used':  teacher.get('free_games_used', 0) or 0,
        'has_sub':          (teacher.get('subscription_end', 0) or 0) > now,
    })

# ── Games ─────────────────────────────────────────────────
@app.route('/api/save-game', methods=['POST'])
def api_save_game():
    data      = request.get_json() or {}
    game_type = data.get('type', 'unknown')
    config    = data.get('config', {})
    title     = data.get('title', 'Сабақ')
    game_id   = secrets.token_urlsafe(8)

    with engine.begin() as c:
        c.execute(
            text('INSERT INTO game_configs (id, teacher_id, game_type, config_json, title, use_count, max_uses) VALUES (:id,:tid,:gt,:cfg,:title,0,3)'),
            {'id': game_id, 'tid': None, 'gt': game_type,
             'cfg': json.dumps(config, ensure_ascii=False), 'title': title}
        )

    return jsonify({'success': True, 'id': game_id, 'max_uses': 3})

def _create_unlock_code():
    code = secrets.token_urlsafe(6).upper().replace('-', '').replace('_', '')[:8]
    try:
        with engine.begin() as c:
            c.execute(text('INSERT INTO unlock_codes (code) VALUES (:code)'), {'code': code})
    except Exception:
        code = secrets.token_hex(4).upper()
        with engine.begin() as c:
            c.execute(text('INSERT INTO unlock_codes (code) VALUES (:code)'), {'code': code})
    return code


@app.route('/api/limit-hit', methods=['POST'])
def api_limit_hit():
    data      = request.get_json() or {}
    tg_id     = str(data.get('tg_id', '') or '').strip()
    cfg       = load_config()
    bot_token = os.environ.get('BOT_TOKEN') or cfg.get('bot_token', '')
    admin_id  = os.environ.get('ADMIN_TG_ID') or str(cfg.get('admin_tg_id', ''))
    code = _create_unlock_code()
    if bot_token and admin_id:
        try:
            http_req.post(
                f'https://api.telegram.org/bot{bot_token}/sendMessage',
                json={
                    'chat_id': admin_id,
                    'parse_mode': 'HTML',
                    'text': (
                        '🔔 <b>Жаңа сатып алушы!</b>\n\n'
                        '👤 Мұғалім 3 тегін ойын жасады.\n'
                        '💳 Kaspi: <b>8 771 510 4948</b> (Сахибжамал А)\n\n'
                        f'✅ Растау коды: <code>{code}</code>\n\n'
                        'Төлемді тексеріп, осы кодты мұғалімге жіберіңіз.'
                    )
                },
                timeout=5
            )
        except Exception as e:
            print(f'limit-hit notify error: {e}')
    # Мұғалімнің tg_id-ін pending деп белгіле (start басқанда лимит бітті деп жазу үшін)
    if tg_id:
        try:
            with engine.begin() as c:
                c.execute(
                    text("INSERT INTO tg_sessions (chat_id, status) VALUES (:cid, 'pending') ON CONFLICT (chat_id) DO NOTHING"),
                    {'cid': tg_id}
                )
        except Exception as e:
            print(f'tg_sessions limit-hit insert error: {e}')
    # Мұғалімге Telegram хабарлама жібер
    if bot_token and tg_id:
        try:
            hub_url = os.environ.get('HUB_URL') or cfg.get('hub_url', '')
            http_req.post(
                f'https://api.telegram.org/bot{bot_token}/sendMessage',
                json={
                    'chat_id': tg_id,
                    'parse_mode': 'HTML',
                    'text': (
                        '🔔 <b>Тегін нұсқаңыз таусылды!</b>\n\n'
                        '3 тегін ойын жасалды.\n\n'
                        '💳 Жалғастыру үшін Kaspi арқылы аудару:\n'
                        '<b>📱 8 771 510 4948</b>\n'
                        '👤 Сахибжамал А\n\n'
                        'Төлеп болған соң <b>чек суретін осы ботқа жіберіңіз</b> — біз растаймыз!'
                    )
                },
                timeout=5
            )
        except Exception as e:
            print(f'limit-hit teacher notify error: {e}')
    return jsonify({'ok': True})


def _setup_webhook():
    global BOT_USERNAME
    cfg       = load_config()
    bot_token = os.environ.get('BOT_TOKEN') or cfg.get('bot_token', '')
    hub_url   = os.environ.get('HUB_URL') or cfg.get('hub_url', '')
    if bot_token and hub_url:
        try:
            me = http_req.get(f'https://api.telegram.org/bot{bot_token}/getMe', timeout=5).json()
            if me.get('ok'):
                BOT_USERNAME = me['result'].get('username', '')
        except Exception as e:
            print(f'getMe error: {e}')
        try:
            http_req.post(
                f'https://api.telegram.org/bot{bot_token}/setWebhook',
                json={'url': f'{hub_url}/api/tg-webhook'},
                timeout=5
            )
        except Exception as e:
            print(f'webhook setup error: {e}')

_setup_webhook()


@app.route('/api/submit-check', methods=['POST'])
def api_submit_check():
    data       = request.get_json() or {}
    screenshot = data.get('screenshot', '')
    device_id  = data.get('device_id', '').strip()
    tg_id      = str(data.get('tg_id', '') or '').strip()
    if not screenshot:
        return jsonify({'ok': False, 'error': 'screenshot жоқ'}), 400

    # tg_id бар болса tg_sessions-қа pending жаз (device_id емес)
    if tg_id:
        try:
            with engine.begin() as c:
                c.execute(
                    text("INSERT INTO tg_sessions (chat_id, status) VALUES (:cid, 'pending') ON CONFLICT (chat_id) DO NOTHING"),
                    {'cid': tg_id}
                )
        except Exception as e:
            print(f'tg_sessions submit-check insert error: {e}')
    elif device_id:
        try:
            with engine.begin() as c:
                c.execute(
                    text('INSERT INTO device_unlocks (device_id, status) VALUES (:did, :st) ON CONFLICT (device_id) DO UPDATE SET status=:st'),
                    {'did': device_id, 'st': 'pending'}
                )
        except Exception as e:
            print(f'device_unlocks insert error: {e}')

    cfg       = load_config()
    bot_token = os.environ.get('BOT_TOKEN') or cfg.get('bot_token', '')
    admin_id  = os.environ.get('ADMIN_TG_ID') or str(cfg.get('admin_tg_id', ''))
    if bot_token and admin_id:
        try:
            data_part = screenshot.split(',', 1)[-1] if ',' in screenshot else screenshot
            img_bytes = base64.b64decode(data_part)
            # tg_id бар болса tg_unlock пайдалан, болмаса device_id
            if tg_id:
                cb_data = f'tg_unlock:{tg_id}'
            elif device_id:
                cb_data = f'unlock:{device_id}'
            else:
                cb_data = None
            keyboard = {'inline_keyboard': [[
                {'text': '✅ Растау — шексіз мүмкіндік бер', 'callback_data': cb_data}
            ]]} if cb_data else None
            payload = {
                'chat_id': admin_id,
                'caption': '💳 Мұғалімнен чек келді!\nТөлемді тексеріп, «Растау» батырмасын басыңыз.'
            }
            if keyboard:
                payload['reply_markup'] = json.dumps(keyboard)
            http_req.post(
                f'https://api.telegram.org/bot{bot_token}/sendPhoto',
                data=payload,
                files={'photo': ('check.jpg', io.BytesIO(img_bytes), 'image/jpeg')},
                timeout=10
            )
        except Exception as e:
            print(f'submit-check error: {e}')
    return jsonify({'ok': True})


@app.route('/api/bot-info')
def api_bot_info():
    return jsonify({'username': BOT_USERNAME or ''})


@app.route('/api/check-tg-unlock')
def api_check_tg_unlock():
    chat_id = request.args.get('tg', '').strip()
    if not chat_id:
        return jsonify({'unlocked': False})
    try:
        with engine.connect() as c:
            row = c.execute(
                text("SELECT status FROM tg_sessions WHERE chat_id=:cid"),
                {'cid': chat_id}
            ).fetchone()
        if row and row[0] == 'unlocked':
            return jsonify({'unlocked': True})
    except Exception as e:
        print(f'check-tg-unlock error: {e}')
    return jsonify({'unlocked': False})


@app.route('/api/check-unlock')
def api_check_unlock():
    device_id = request.args.get('device', '').strip()
    if not device_id:
        return jsonify({'unlocked': False})
    try:
        with engine.connect() as c:
            row = c.execute(
                text("SELECT status FROM device_unlocks WHERE device_id=:did"),
                {'did': device_id}
            ).fetchone()
        if row and row[0] == 'unlocked':
            return jsonify({'unlocked': True})
    except Exception as e:
        print(f'check-unlock error: {e}')
    return jsonify({'unlocked': False})


@app.route('/api/tg-webhook', methods=['POST'])
def api_tg_webhook():
    data      = request.get_json() or {}
    cfg       = load_config()
    bot_token = os.environ.get('BOT_TOKEN') or cfg.get('bot_token', '')
    admin_id  = os.environ.get('ADMIN_TG_ID') or str(cfg.get('admin_tg_id', ''))
    hub_url   = os.environ.get('HUB_URL') or cfg.get('hub_url', '')

    # ── Callback (inline button) ──
    callback = data.get('callback_query')
    if callback:
        cdata = callback.get('data', '')

        if cdata.startswith('unlock:'):
            device_id = cdata[7:]
            try:
                with engine.begin() as c:
                    c.execute(
                        text("UPDATE device_unlocks SET status='unlocked' WHERE device_id=:did"),
                        {'did': device_id}
                    )
            except Exception as e:
                print(f'tg-webhook unlock error: {e}')
            if bot_token:
                try:
                    http_req.post(
                        f'https://api.telegram.org/bot{bot_token}/answerCallbackQuery',
                        json={'callback_query_id': callback['id'], 'text': '✅ Мұғалімге шексіз мүмкіндік берілді!'},
                        timeout=5
                    )
                except Exception:
                    pass

        elif cdata.startswith('tg_unlock:'):
            chat_id = cdata[10:]
            try:
                now_ts = int(time.time())
                with engine.begin() as c:
                    c.execute(
                        text("INSERT INTO tg_sessions (chat_id, status, unlocked_at) VALUES (:cid, 'unlocked', :ts) ON CONFLICT (chat_id) DO UPDATE SET status='unlocked', unlocked_at=:ts"),
                        {'cid': chat_id, 'ts': now_ts}
                    )
            except Exception as e:
                print(f'tg_unlock error: {e}')
            if bot_token:
                try:
                    http_req.post(
                        f'https://api.telegram.org/bot{bot_token}/answerCallbackQuery',
                        json={'callback_query_id': callback['id'], 'text': '✅ Мұғалімге шексіз мүмкіндік берілді!'},
                        timeout=5
                    )
                    http_req.post(
                        f'https://api.telegram.org/bot{bot_token}/sendMessage',
                        json={
                            'chat_id': chat_id,
                            'parse_mode': 'HTML',
                            'text': '✅ <b>Сіздің аккаунтіңіз белсендірілді!</b>\n\nЕнді шексіз ойын жасай аласыз. Платформаға оралыңыз.'
                        },
                        timeout=5
                    )
                except Exception:
                    pass

        return jsonify({'ok': True})

    # ── Message ──
    message = data.get('message')
    if message and bot_token:
        chat_id  = str(message.get('chat', {}).get('id', ''))
        text_msg = (message.get('text') or '').strip()
        photo    = message.get('photo')

        if text_msg == '/start':
            # Лимит статусын тексер
            tg_status = None
            tg_unlocked_at = None
            try:
                with engine.connect() as c:
                    row_ts = c.execute(
                        text("SELECT status, unlocked_at FROM tg_sessions WHERE chat_id=:cid"),
                        {'cid': chat_id}
                    ).fetchone()
                if row_ts:
                    tg_status = row_ts[0]
                    tg_unlocked_at = row_ts[1]
            except Exception:
                pass

            if tg_status == 'pending':
                msg = (
                    '🔔 <b>Тегін нұсқаңыз таусылды!</b>\n\n'
                    '3 тегін ойын жасалды.\n\n'
                    '💳 Жалғастыру үшін Kaspi арқылы аудару:\n'
                    '<b>📱 8 771 510 4948</b>\n'
                    '👤 Сахибжамал А\n\n'
                    'Төлеп болған соң <b>чек суретін осы ботқа жіберіңіз</b> — біз растаймыз!'
                )
                try:
                    http_req.post(
                        f'https://api.telegram.org/bot{bot_token}/sendMessage',
                        json={'chat_id': chat_id, 'parse_mode': 'HTML', 'text': msg},
                        timeout=5
                    )
                except Exception as e:
                    print(f'start limit message error: {e}')
            elif tg_status == 'unlocked':
                import datetime
                start_ts  = tg_unlocked_at or int(time.time())
                end_ts    = start_ts + 30 * 24 * 3600
                end_date  = datetime.datetime.utcfromtimestamp(end_ts).strftime('%d.%m.%Y')
                days_left = max(0, (end_ts - int(time.time())) // 86400)
                msg = (
                    '✅ <b>Сіздің шексіз пайдалану мерзіміңіз белсенді!</b>\n\n'
                    f'📅 Мерзім: <b>30 күн</b>\n'
                    f'⏳ Қалған күн: <b>{days_left} күн</b> ({end_date} дейін)\n\n'
                    f'📱 Платформаға кіру:\n{hub_url}?tg={chat_id}\n\n'
                    '🎮 Шексіз ойын жасай аласыз!'
                )
                try:
                    http_req.post(
                        f'https://api.telegram.org/bot{bot_token}/sendMessage',
                        json={'chat_id': chat_id, 'parse_mode': 'HTML', 'text': msg},
                        timeout=5
                    )
                except Exception as e:
                    print(f'start unlocked message error: {e}')
            else:
                welcome = (
                    '👋 Сәлем, мұғалім!\n\n'
                    '🎮 AI Aisha платформасында 3 тегін ойын жасай аласыз.\n\n'
                    f'📱 Платформаға кіру:\n{hub_url}?tg={chat_id}\n\n'
                    '💡 Лимит біткен соң чек суретін осы ботқа жіберіңіз — біз растаймыз!'
                )
                try:
                    http_req.post(
                        f'https://api.telegram.org/bot{bot_token}/sendMessage',
                        json={'chat_id': chat_id, 'text': welcome},
                        timeout=5
                    )
                except Exception as e:
                    print(f'start message error: {e}')

        elif photo and admin_id:
            file_id  = photo[-1]['file_id']
            keyboard = {'inline_keyboard': [[
                {'text': '✅ Растау — шексіз мүмкіндік бер', 'callback_data': f'tg_unlock:{chat_id}'}
            ]]}
            try:
                http_req.post(
                    f'https://api.telegram.org/bot{bot_token}/sendPhoto',
                    json={
                        'chat_id': admin_id,
                        'photo': file_id,
                        'caption': f'💳 Мұғалімнен чек келді!\nTG ID: {chat_id}\nТексеріп «Растау» батырмасын басыңыз.',
                        'reply_markup': keyboard
                    },
                    timeout=10
                )
                http_req.post(
                    f'https://api.telegram.org/bot{bot_token}/sendMessage',
                    json={'chat_id': chat_id, 'text': '✅ Чегіңіз жіберілді! Растауды күтіңіз...'},
                    timeout=5
                )
            except Exception as e:
                print(f'photo forward error: {e}')

    return jsonify({'ok': True})


@app.route('/api/unlock', methods=['POST'])
def api_unlock():
    data = request.get_json() or {}
    code = data.get('code', '').strip().upper()
    if not code:
        return jsonify({'ok': False})
    try:
        with engine.connect() as c:
            row = c.execute(
                text('SELECT used FROM unlock_codes WHERE code=:code'),
                {'code': code}
            ).fetchone()
        if row and not row[0]:
            with engine.begin() as c:
                c.execute(
                    text('UPDATE unlock_codes SET used=TRUE WHERE code=:code'),
                    {'code': code}
                )
            return jsonify({'ok': True})
    except Exception as e:
        print(f'unlock error: {e}')
    return jsonify({'ok': False})

@app.route('/api/my-games')
def api_my_games():
    token   = request.headers.get('X-Token', '')
    teacher = get_teacher_by_token(token)
    if not teacher:
        return jsonify({'error': 'Авторизация қажет'}), 401
    with engine.connect() as c:
        rows = c.execute(
            text('SELECT id, game_type, title, created_at FROM game_configs WHERE teacher_id=:tid ORDER BY created_at DESC'),
            {'tid': teacher['id']}
        ).fetchall()
    return jsonify([dict(r._mapping) for r in rows])

@app.route('/api/game/<game_id>')
def api_get_game(game_id):
    with engine.connect() as c:
        row = c.execute(text('SELECT * FROM game_configs WHERE id=:id'), {'id': game_id}).fetchone()
    if not row:
        return jsonify({'error': 'Табылмады'}), 404
    d = dict(row._mapping)
    d['config'] = json.loads(d.pop('config_json'))
    return jsonify(d)

@app.route('/play/<game_id>')
def play_game(game_id):
    with engine.connect() as c:
        row = c.execute(text('SELECT game_type FROM game_configs WHERE id=:id'), {'id': game_id}).fetchone()
    if not row:
        return '<h2 style="font-family:sans-serif;padding:40px;color:#333">Сілтеме табылмады</h2>', 404
    return redirect(f'/{row_dict(row)["game_type"]}.html?play={game_id}')

# ── Payments ──────────────────────────────────────────────
@app.route('/api/payment/submit', methods=['POST'])
def payment_submit():
    token   = request.headers.get('X-Token', '')
    teacher = get_teacher_by_token(token)
    if not teacher:
        return jsonify({'error': 'Авторизация қажет'}), 401
    data       = request.get_json() or {}
    screenshot = data.get('screenshot', '')
    if not screenshot:
        return jsonify({'error': 'Чек суреті жоқ'}), 400
    with engine.begin() as c:
        c.execute(
            text('INSERT INTO payments (teacher_id, teacher_email, screenshot) VALUES (:tid,:email,:sc)'),
            {'tid': teacher['id'], 'email': teacher['email'], 'sc': screenshot}
        )
    notify_admin(teacher['email'], screenshot)
    return jsonify({'success': True, 'message': 'Чегіңіз жіберілді! Растауды күтіңіз.'})

@app.route('/api/admin/payments')
def admin_payments():
    token   = request.headers.get('X-Token', '')
    teacher = get_teacher_by_token(token)
    if not teacher or teacher['email'] != get_admin_email():
        return jsonify({'error': 'Тек администраторға рұқсат'}), 403
    with engine.connect() as c:
        rows = c.execute(
            text("SELECT id, teacher_email, screenshot, status, amount, created_at FROM payments WHERE status='pending' ORDER BY created_at DESC")
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r._mapping)
        result.append({
            'id':            d['id'],
            'teacher_email': d['teacher_email'],
            'screenshot':    d['screenshot'],
            'amount':        d['amount'],
            'created_at':    d['created_at'],
        })
    return jsonify(result)

@app.route('/api/admin/payments/<int:pay_id>/approve', methods=['POST'])
def admin_approve(pay_id):
    token   = request.headers.get('X-Token', '')
    teacher = get_teacher_by_token(token)
    if not teacher or teacher['email'] != get_admin_email():
        return jsonify({'error': 'Тек администраторға рұқсат'}), 403
    with engine.connect() as c:
        row = c.execute(text('SELECT * FROM payments WHERE id=:id'), {'id': pay_id}).fetchone()
    if not row:
        return jsonify({'error': 'Табылмады'}), 404
    pay = row_dict(row)
    sub_end = int(time.time()) + 30 * 24 * 3600  # 30 күн
    with engine.begin() as c:
        c.execute(text("UPDATE payments SET status='approved' WHERE id=:id"), {'id': pay_id})
        c.execute(
            text('UPDATE teachers SET subscription_end=:sub WHERE id=:tid'),
            {'sub': sub_end, 'tid': pay['teacher_id']}
        )
    # Notify teacher via Telegram (optional)
    _notify_teacher(pay['teacher_id'], '✅ Төлемңіз расталды! 30 күнге шексіз пайдалануыңызға болады.')
    return jsonify({'success': True})

@app.route('/api/admin/payments/<int:pay_id>/reject', methods=['POST'])
def admin_reject(pay_id):
    token   = request.headers.get('X-Token', '')
    teacher = get_teacher_by_token(token)
    if not teacher or teacher['email'] != get_admin_email():
        return jsonify({'error': 'Тек администраторға рұқсат'}), 403
    with engine.begin() as c:
        row_result = c.execute(text('SELECT * FROM payments WHERE id=:id'), {'id': pay_id}).fetchone()
        if not row_result:
            return jsonify({'error': 'Табылмады'}), 404
        pay = row_dict(row_result)
        c.execute(text("UPDATE payments SET status='rejected' WHERE id=:id"), {'id': pay_id})
    _notify_teacher(pay['teacher_id'], '❌ Төлеміңіз расталмады. Дұрыс чек жіберіп қайталаңыз.')
    return jsonify({'success': True})

def _notify_teacher(teacher_id, text_msg):
    cfg = load_config()
    bot_token = os.environ.get('BOT_TOKEN') or cfg.get('bot_token', '')
    if not bot_token:
        return
    with engine.connect() as c:
        row = c.execute(text('SELECT telegram_id FROM teachers WHERE id=:id'), {'id': teacher_id}).fetchone()
    if not row:
        return
    tg_id = row_dict(row).get('telegram_id')
    if not tg_id:
        return
    try:
        http_req.post(
            f'https://api.telegram.org/bot{bot_token}/sendMessage',
            json={'chat_id': tg_id, 'text': text_msg},
            timeout=5
        )
    except Exception:
        pass

# ── Admin stats ───────────────────────────────────────────
@app.route('/api/admin/stats')
def admin_stats():
    token   = request.headers.get('X-Token', '')
    teacher = get_teacher_by_token(token)
    if not teacher or teacher['email'] != get_admin_email():
        return jsonify({'error': 'Admin only'}), 403
    with engine.connect() as c:
        total = c.execute(text('SELECT COUNT(*) AS cnt FROM teachers')).fetchone()[0]
        rows  = c.execute(text('SELECT email, created_at FROM teachers ORDER BY created_at DESC')).fetchall()
    return jsonify({'total': total, 'users': [dict(r._mapping) for r in rows]})

# ── Static files ──────────────────────────────────────────
@app.route('/')
def root():
    return redirect('/hub.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)

if __name__ == '__main__':
    import socket
    port = int(os.environ.get('PORT', 5000))
    try:
        local_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        local_ip = '127.0.0.1'
    print(f'\n{"="*52}\n  Platform started!\n  Local:   http://localhost:{port}\n  Network: http://{local_ip}:{port}\n{"="*52}\n')
    app.run(host='0.0.0.0', port=port, debug=False)
