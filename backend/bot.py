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

bot = telebot.TeleBot(TOKEN, parse_mode=None)


# ── /start — Telegram арқылы автоматты кіру ─────────────────
@bot.message_handler(commands=['start', 'help'])
def cmd_start(msg):
    cid        = msg.chat.id
    first_name = (msg.from_user.first_name or '').strip()

    try:
        r = requests.post(
            f'{API_URL}/api/tg-login',
            json={'telegram_id': str(cid), 'first_name': first_name},
            timeout=10
        )
        d = r.json()
    except Exception:
        bot.send_message(cid, 'Сервермен байланыс жоқ. Кейінірек қайталаңыз.')
        return

    if not d.get('success'):
        bot.send_message(cid, f'Қате: {d.get("error", "белгісіз")}')
        return

    token      = d.get('token')
    free_used  = int(d.get('free_games_used', 0) or 0)
    free_left  = max(0, 3 - free_used)
    link       = f'{HUB_URL}/?t={token}'

    if free_left > 0:
        free_text = f'🎁 Тегін ойындар: {free_left}/3 қалды'
    else:
        free_text = '⚡ Тегін ойындар таусылды. Жазылым: 4990 тг/ай'

    greeting = f'Сәлем, {first_name}!' if first_name else 'Сәлем!'

    bot.send_message(cid,
        f'{greeting} 🎓\n\n'
        f'▶ Платформаға кіру сілтемесі:\n'
        f'{link}\n\n'
        f'{free_text}\n\n'
        f'⚠️ Бұл сілтеме жеке — басқаға бермеңіз!\n'
        f'Жаңа сілтеме алу үшін /start деп жазыңыз.'
    )


# ── /myid — Telegram ID алу (admin үшін) ─────────────────────
@bot.message_handler(commands=['myid'])
def cmd_myid(msg):
    bot.send_message(msg.chat.id,
        f'Сіздің Telegram ID-іңіз:\n\n'
        f'{msg.chat.id}\n\n'
        f'Railway → Variables ішіне қосыңыз:\n'
        f'ADMIN_TG_ID = {msg.chat.id}'
    )


# ── /stats — тек администратор ───────────────────────────────
@bot.message_handler(commands=['stats', 'users'])
def cmd_stats(msg):
    cfg2     = load_config()
    admin_id = cfg2.get('admin_tg_id', 0)
    if not admin_id:
        bot.send_message(msg.chat.id, 'Admin ID орнатылмаған. /myid арқылы алыңыз.')
        return
    if msg.chat.id != admin_id:
        bot.send_message(msg.chat.id, 'Бұл команда тек администраторға арналған.')
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
    text = f'Тіркелген мұғалімдер: {total}\n\nТізім:\n'
    for i, u in enumerate(users[:30], 1):
        name = u.get('display_name') or u.get('email', '')
        text += f'{i}. {name}\n'
    bot.send_message(msg.chat.id, text)


# ── Белгісіз хабар ───────────────────────────────────────────
@bot.message_handler(func=lambda m: True)
def handle_unknown(msg):
    bot.send_message(msg.chat.id,
        'Платформаға кіру үшін /start деп жазыңыз.'
    )


me = bot.get_me()
print(f'  Bot started: @{me.username}')
print(f'  Hub URL: {HUB_URL}')
print(f'  API URL: {API_URL}')
print(f'  Admin TG ID: {cfg.get("admin_tg_id", "not set")}')
bot.infinity_polling(timeout=30, long_polling_timeout=20)
