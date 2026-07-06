# -*- coding: utf-8 -*-
import json, os, sys

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')

def load_config():
    if not os.path.exists(CONFIG_PATH):
        return {}
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

cfg     = load_config()
TOKEN   = cfg.get('bot_token', '')
HUB_URL = cfg.get('hub_url', 'http://localhost:5000')
API_URL = cfg.get('api_url', 'http://localhost:5000')

if not TOKEN or TOKEN == 'YOUR_TOKEN_HERE':
    print()
    print('  Bot token missing!')
    print(f'  Add bot_token to: {CONFIG_PATH}')
    print()
    sys.exit(0)

try:
    import telebot, requests
except ImportError:
    print('pip install pyTelegramBotAPI requests')
    sys.exit(1)

bot    = telebot.TeleBot(TOKEN, parse_mode=None)
states = {}  # {chat_id: {'step': 'email'|'password', 'email': ''}}

# ── /start ──────────────────────────────────────────────
@bot.message_handler(commands=['start', 'help'])
def cmd_start(msg):
    cid = msg.chat.id
    states[cid] = {'step': 'email'}
    bot.send_message(cid,
        'Сәлем! Мұғалімдер платформасына қош келдіңіз! 🎓\n\n'
        'Тіркелу үшін атыңызды жазыңыз (кез келген ат):'
    )

# ── /myid ─────────────────────────────────────────────────
@bot.message_handler(commands=['myid'])
def cmd_myid(msg):
    bot.send_message(msg.chat.id,
        f'Сіздің Telegram ID-іңіз:\n\n'
        f'{msg.chat.id}\n\n'
        f'Бұл санды config.json → admin_tg_id өрісіне жазыңыз.'
    )

# ── /stats — тек администратор ──────────────────────────
@bot.message_handler(commands=['stats', 'users'])
def cmd_stats(msg):
    cfg2     = load_config()
    admin_id = cfg2.get('admin_tg_id', 0)
    if not admin_id:
        bot.send_message(msg.chat.id, 'Admin ID орнатылмаған. /myid арқылы алыңыз.')
        return
    if msg.chat.id != admin_id:
        bot.send_message(msg.chat.id, '❌ Бұл команда тек администраторға арналған.')
        return
    try:
        r = requests.get(
            f'{API_URL}/api/admin/stats',
            headers={'X-Token': cfg2.get('admin_token', '')},
            timeout=5
        )
        d = r.json()
    except Exception as e:
        bot.send_message(msg.chat.id, f'Сервер қатесі: {e}')
        return
    total = d.get('total', 0)
    users = d.get('users', [])
    text = f'👥 Тіркелген мұғалімдер: {total}\n\n📋 Тізім:\n'
    for i, u in enumerate(users[:30], 1):
        text += f'{i}. {u["email"]}\n'
    bot.send_message(msg.chat.id, text)

# ── Тіркелу / кіру ──────────────────────────────────────
@bot.message_handler(func=lambda m: True)
def handle(msg):
    cid  = msg.chat.id
    text = msg.text.strip() if msg.text else ''

    if cid not in states:
        bot.send_message(cid, '/start деп жазыңыз')
        return

    st = states[cid]

    if st['step'] == 'email':
        if len(text) < 2:
            bot.send_message(cid, 'Атыңыз кем дегенде 2 символ болу керек')
            return
        st['email'] = text.lower()
        st['step']  = 'password'
        bot.send_message(cid, f'Атыңыз: {text}\n\nПароль жазыңыз (4 символдан кем емес):')

    elif st['step'] == 'password':
        if len(text) < 4:
            bot.send_message(cid, 'Пароль кем дегенде 4 символ болу керек')
            return
        email, pw = st['email'], text
        del states[cid]

        payload = {'email': email, 'password': pw, 'telegram_id': str(cid)}
        try:
            r = requests.post(f'{API_URL}/api/register', json=payload, timeout=5)
            d = r.json()
        except Exception:
            bot.send_message(cid, 'Сервермен байланыс жоқ. Кейінірек қайталаңыз.')
            return

        if d.get('success'):
            bot.send_message(cid,
                f'✅ Тіркелдіңіз!\n\n'
                f'👤 Атыңыз: {email}\n'
                f'🔑 Пароль: {pw}\n\n'
                f'🌐 Платформаға кіру:\n{HUB_URL}\n\n'
                f'⚠️ Атыңыз бен паролді сақтаңыз!\n\n'
                f'🎁 3 ойын тегін. Одан кейін 4990 тг/ай.'
            )
        elif 'тіркелген' in d.get('error', ''):
            r2 = requests.post(f'{API_URL}/api/login', json=payload, timeout=5)
            d2 = r2.json()
            if d2.get('success'):
                bot.send_message(cid,
                    f'✅ Кірдіңіз!\n\n'
                    f'🌐 Платформаға кіру:\n{HUB_URL}'
                )
            else:
                bot.send_message(cid, f'Бұл ат тіркелген, бірақ пароль қате.\n\n/start деп қайталаңыз.')
        else:
            bot.send_message(cid, f'Қате: {d.get("error","Белгісіз")}')

me = bot.get_me()
print(f'  Bot started: @{me.username}')
print(f'  Admin TG ID: {cfg.get("admin_tg_id", "not set — send /myid to bot")}')
bot.infinity_polling(timeout=30, long_polling_timeout=20)
