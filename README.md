# ⚡ FlexiVPN

> Бесплатный VPN-расширение для Chrome с обходом блокировок РФ, ежедневным обновлением серверов и Premium за активность.

[![Robot](https://github.com/YOUR_USERNAME/flexivpn/actions/workflows/robot.yml/badge.svg)](https://github.com/YOUR_USERNAME/flexivpn/actions/workflows/robot.yml)
[![Deploy](https://github.com/YOUR_USERNAME/flexivpn/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOUR_USERNAME/flexivpn/actions/workflows/deploy.yml)

---

## 🌐 Сайт

**[flexivpn.vercel.app](https://flexivpn.vercel.app)**

---

## ✨ Возможности

| Функция | Бесплатно | Premium |
|--------|-----------|---------|
| Серверы NL, DE, SE, FI | ✅ | ✅ |
| Авто-выбор сервера | ✅ | ✅ |
| Обход блокировок РФ | ✅ | ✅ |
| Push-уведомления | ✅ | ✅ |
| Время сессии | 60 мин | ∞ |
| Серверы US, FR, CH, JP | 🔒 | ✅ |
| Приоритетные серверы | ❌ | ✅ |

### 👑 Как получить Premium бесплатно
Заходи в расширение **14 дней подряд** → автоматически получишь **7 дней Premium** с доступом ко всем серверам.

---

## 📁 Структура проекта

```
flexivpn/
├── extension/          # Chrome-расширение (Manifest V3)
│   ├── manifest.json
│   ├── scripts/
│   │   └── background.js   # Логика VPN, таймер, Premium, уведомления
│   ├── pages/
│   │   ├── popup.html       # Основной попап
│   │   ├── welcome.html     # Страница при установке
│   │   ├── uninstall.html   # Страница при удалении
│   │   ├── options.html     # Настройки
│   │   ├── faq.html         # FAQ
│   │   ├── tos.html         # Условия использования
│   │   └── privacy.html     # Политика конфиденциальности
│   └── icons/
├── landing/            # Лендинг (Vercel / GitHub Pages)
│   └── index.html
├── robot/              # Робот обновления серверов
│   ├── collect.js      # Сборщик прокси из 6+ источников
│   ├── verify.js       # Верификатор доступности
│   └── package.json
├── .github/
│   └── workflows/
│       ├── robot.yml   # Ежедневный запуск робота
│       └── deploy.yml  # Деплой лендинга
├── servers.json        # База серверов (обновляется роботом)
└── vercel.json         # Конфигурация Vercel
```

---

## 🚀 Установка расширения

### Способ 1 — Вручную (Developer Mode)

1. Скачай этот репозиторий как ZIP
2. Распакуй архив
3. Открой Chrome → `chrome://extensions/`
4. Включи **Режим разработчика** (правый верхний угол)
5. Нажми **Загрузить распакованное расширение**
6. Выбери папку `extension/`

### Способ 2 — Chrome Web Store *(скоро)*

Расширение проходит проверку и скоро появится в Web Store.

---

## 🌐 Деплой

### Vercel (рекомендуется)

```bash
npm i -g vercel
vercel --prod
```

### GitHub Pages

1. Включи GitHub Pages в Settings → Pages → Source: `GitHub Actions`
2. Запушь в `main` — задеплоится автоматически

### Tatnet

1. Загрузи папку `landing/` в корень сайта на Tatnet
2. Убедись что `servers.json` лежит рядом или настрой URL в `background.js`

---

## 🤖 Робот (GitHub Actions)

Робот запускается **каждый день в 03:00 UTC** и:
1. Собирает публичные прокси из 6+ источников
2. Определяет геолокацию (западные страны)
3. Проверяет доступность каждого сервера
4. Коммитит обновлённый `servers.json`

### Настройка робота

```bash
cd robot
npm install
node collect.js  # Сбор
node verify.js   # Верификация
```

### Добавить источник прокси

В `robot/collect.js` добавь объект в массив `SOURCES`:

```js
{
  name: 'MySource SOCKS5',
  url: 'https://example.com/socks5.txt',
  parser: parseLineList,
  type: 'SOCKS5',
},
```

---

## 📢 Реклама партнёров

Добавление нового рекламного блока в лендинг — просто скопируй шаблон в `landing/index.html`:

```html
<!-- В секции #ad-cards -->
<a href="ССЫЛКА" target="_blank" class="ad-card"
   style="--ad-gradient: linear-gradient(135deg, rgba(255,100,100,0.08), transparent)">
  <div class="ad-icon">🔥</div>
  <div class="ad-info">
    <div class="ad-name">НАЗВАНИЕ</div>
    <div class="ad-desc">ОПИСАНИЕ</div>
  </div>
  <span class="ad-tag">МЕТКА</span>
</a>
```

### Текущие партнёры
- [ProHub Nexus](https://prohub-nexus.lovable.app) — профессиональный форум разработчиков
- [FlexDev](https://flexdev.csamp.app) — платформа разработчиков OinkTech

---

## ⚙️ Конфигурация

### Изменить URL серверов

В `extension/scripts/background.js`:
```js
const SERVERS_URL = 'https://raw.githubusercontent.com/YOUR_USERNAME/flexivpn-servers/main/servers.json';
```

### Изменить время сессии

```js
const FREE_SESSION_MINUTES = 60;       // Бесплатная сессия
const PREMIUM_UNLOCK_DAYS = 14;        // Дней для Premium
const PREMIUM_TRIAL_DAYS = 7;          // Длина триала
```

### Добавить новый сервер в базу

Просто добавь объект в `servers.json`:
```json
{
  "id": "gb-1",
  "name": "UK 🇬🇧",
  "country": "GB",
  "city": "London",
  "host": "IP_АДРЕС",
  "port": 1080,
  "type": "SOCKS5",
  "tier": "free",
  "ping": 55,
  "load": 40
}
```

---

## 📄 Лицензия

MIT © 2026 OinkTech Ltd

---

## 🤝 Контакты

- **Email:** support@oinktech.ru
- **GitHub:** [@YOUR_USERNAME](https://github.com/YOUR_USERNAME)
- **Сайт:** [flexivpn.vercel.app](https://flexivpn.vercel.app)
