# Проект — Telegram Bot

Минимальный Telegram-бот проекта «Проект».

## MVP

- `/start` — приветствие и основное действие;
- `/help` — краткая помощь;
- `/status` — проверка работы бота;
- кнопка `Подтвердить номер`;
- запрос собственного контакта пользователя через Telegram `request_contact`;
- проверка, что переданный контакт принадлежит отправителю;
- нормализация номера телефона;
- подтверждение номера пользователю.

## Требования

- Node.js 20+;
- Telegram Bot Token от BotFather.

## Локальный запуск

```bash
npm install
cp .env.example .env
```

Добавьте токен в `.env`:

```env
TELEGRAM_BOT_TOKEN=your_token_here
```

Запуск:

```bash
npm start
```

Для разработки:

```bash
npm run dev
```

## Безопасность

Токен Telegram никогда не должен попадать в Git. `.env` исключён через `.gitignore`.

Номер считается подтверждённым только если пользователь передал свой контакт через Telegram-кнопку `request_contact`. Номер, написанный обычным сообщением, подтверждением не считается.

## Следующий этап

Связать бота с веб-сайтом через одноразовую verification session:

```text
Web checkout
    ↓
one-time token
    ↓
Telegram bot
    ↓
request_contact
    ↓
backend verifies phone + Telegram user
    ↓
VERIFIED
```

Текущий MVP специально не содержит базы данных и интеграции с сайтом, чтобы сначала получить простой рабочий бот и проверить его в Telegram.
