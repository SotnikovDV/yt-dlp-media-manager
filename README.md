# YT-DLP Media Manager

Домашний медиа-центр для скачивания и просмотра видео с YouTube и других платформ.

## Возможности

- 📺 **Медиатека** — просмотр и организация скачанных видео (избранное, просмотры, теги)
- 📥 **Скачивание** — загрузка видео с выбором качества и формата
- 🔔 **Подписки** — автоматическое отслеживание новых видео на каналах (категории, расписание)
- 📋 **Очередь** — управление задачами скачивания
- 🎬 **Видеоплеер** — встроенный плеер для просмотра, публичные ссылки просмотра
- 👥 **Авторизация** — регистрация, вход, профиль; OAuth (Google); панель администратора
- 🐳 **Docker** — готовый контейнер для развёртывания на Synology NAS

## Поддерживаемые платформы

yt-dlp поддерживает сотни видео-платформ:

- YouTube
- Vimeo
- TikTok
- Twitch
- Rutube
- PeerTube
- и многие другие

## Установка на Synology NAS

### Вариант 1: Docker Compose (рекомендуется)

1. **Подготовка папок**

   В File Station создайте структуру папок:

   ```text
   /docker/yt-dlp-manager/
   ├── data/
   │   └── database/
   └── downloads/
   ```

2. **Загрузка файлов**

   Загрузите файлы `docker-compose.yml` и `Dockerfile` в папку `/docker/yt-dlp-manager/`

3. **Запуск через SSH**

   ```bash
   cd /volume1/docker/yt-dlp-manager
   docker-compose up -d --build
   ```

4. **Доступ к приложению**

   Откройте в браузере: `http://<IP-вашего-NAS>:3000`

   **Production:** для доступа извне добавьте в `environment` секцию `docker-compose.yml` переменные `NEXTAUTH_URL`, `BASE_URL`, `NEXTAUTH_SECRET` (см. раздел «Безопасность и production» ниже).

### Вариант 2: Docker через DSM

1. Откройте **Container Manager** в DSM
2. Создайте новый проект
3. Укажите путь к папке с `docker-compose.yml`
4. Запустите контейнер

### Вариант 3: Готовый образ (Docker Hub / ghcr.io)

```yaml
version: '3.8'
services:
  yt-dlp-manager:
    image: ghcr.io/your-username/yt-dlp-manager:latest
    container_name: yt-dlp-media-manager
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
      - ./downloads:/data/downloads
    environment:
      - DATABASE_URL=file:/data/database/media.db
      - DOWNLOAD_PATH=/data/downloads
      - TOOLS_DIR=/data/tools
      - NODE_ENV=production
      # Для production обязательно задайте:
      - NEXTAUTH_URL=https://your-domain.com
      - BASE_URL=https://your-domain.com
      - NEXTAUTH_SECRET=your-random-secret
```

## Разработка

### Требования

- Node.js 20+
- Bun или npm
- yt-dlp (для тестирования скачивания)

### Установка

```bash
# Установка зависимостей
npm install

# Скопируйте .env.example в .env и задайте переменные (минимум DATABASE_URL, DOWNLOAD_PATH)

# Инициализация базы данных
npm run db:push

# Запуск в режиме разработки
npm run dev
```

### Скрипты

```bash
npm run dev        # Запуск сервера разработки
npm run build      # Сборка для production
npm run start      # Запуск production (standalone)
npm run lint       # Проверка кода
npm run db:push    # Синхронизация схемы БД
npm run db:generate # Генерация Prisma-клиента
```

## Структура проекта

```text
├── src/
│   ├── app/
│   │   ├── api/              # API endpoints
│   │   │   ├── auth/          # NextAuth, регистрация
│   │   │   ├── admin/         # Панель администратора (пользователи, ремонт путей)
│   │   │   ├── profile/       # Профиль, пароль, аватар
│   │   │   ├── videos/        # Управление видео, секции, избранное, просмотры
│   │   │   ├── download/      # Скачивание
│   │   │   ├── queue/         # Очередь задач
│   │   │   ├── subscriptions/# Подписки
│   │   │   ├── stream/        # Стриминг видео
│   │   │   ├── stats/         # Статистика
│   │   │   ├── settings/      # Настройки
│   │   │   └── ...
│   │   ├── login/             # Страница входа
│   │   ├── register/          # Регистрация
│   │   ├── profile/           # Профиль пользователя
│   │   ├── admin/             # Панель администратора
│   │   ├── watch/[id]/        # Публичный просмотр видео
│   │   ├── layout.tsx         # Корневой layout
│   │   ├── page.tsx           # Главная страница (SPA)
│   │   └── providers.tsx      # React Query, Session провайдеры
│   ├── lib/
│   │   ├── db.ts              # Prisma клиент
│   │   ├── auth.ts            # NextAuth конфигурация
│   │   ├── ytdlp.ts           # Интеграция с yt-dlp
│   │   └── utils.ts           # Утилиты
│   └── components/            # UI компоненты (shadcn/ui и др.)
├── prisma/
│   └── schema.prisma          # Схема базы данных
├── Dockerfile                  # Docker образ
├── docker-compose.yml         # Docker Compose конфигурация
└── .env.example               # Шаблон переменных окружения
```

## API Endpoints

| Метод | Endpoint | Описание |
| --- | --- | --- |
| GET | /api/videos | Список видео |
| GET | /api/videos/sections | Секции медиатеки (последние, избранное и т.д.) |
| DELETE | /api/videos/[id] | Удалить видео |
| POST | /api/download | Добавить задачу на скачивание |
| POST | /api/download/info | Получить информацию о видео |
| GET | /api/queue | Очередь задач |
| GET | /api/subscriptions | Список подписок |
| POST | /api/subscriptions | Создать подписку |
| POST | /api/subscriptions/check | Проверить новые видео |
| GET | /api/stats | Статистика системы |
| GET | /api/settings | Настройки |
| GET | /api/stream/[id] | Стриминг видео |
| GET | /api/health | Проверка работоспособности (БД) |
| GET | /api/deps | Статус yt-dlp и ffmpeg |

## Настройка

### Переменные окружения

| Переменная | Описание | По умолчанию |
| --- | --- | --- |
| DATABASE_URL | Путь к базе данных SQLite | file:./db/custom.db (локально); file:/data/database/media.db (Docker) |
| DOWNLOAD_PATH | Папка для скачивания | ./downloads |
| TOOLS_DIR | Каталог с бинарниками `yt-dlp`/`ffmpeg` (кроссплатформенно, для обновления без пересборки) | `./data/tools` (или `/data/tools` в Docker) |
| YTDLP_PATH | Путь к бинарю yt-dlp (если не в PATH) | yt-dlp |
| FFMPEG_PATH | Путь к ffmpeg (если не в PATH) | ffmpeg |
| NEXTAUTH_URL | URL приложения (в production — реальный адрес) | http://localhost:3000 |
| BASE_URL | Базовый адрес сервера (для ссылок «Поделиться» и публичной страницы) | http://localhost:3000 |
| NEXTAUTH_SECRET | Секрет для подписи JWT/сессий (обязательно в production) | — |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | OAuth Google (опционально) | — |

### Безопасность и production

- **NEXTAUTH_SECRET** в production **обязателен**: без него приложение не должно работать (или выдаст ошибку). Задайте длинную случайную строку, например: `openssl rand -base64 32`.
- **NEXTAUTH_URL** и **BASE_URL** в production укажите на реальный адрес приложения (например, `https://your-domain.com`).
- При первом развёртывании создаётся учётная запись администратора по умолчанию. **Сразу после первого входа** зайдите в раздел «Профиль» и смените пароль.

### Если yt-dlp / ffmpeg не установлены

- **Рекомендуемый (универсальный) вариант**: хранить инструменты в `TOOLS_DIR` и монтировать как volume в Docker (Synology NAS). Тогда их можно обновлять без пересборки образа.

Структура `TOOLS_DIR`:

```text
data/tools/
  windows/
    yt-dlp.exe
    ffmpeg.exe
  linux-x64/
    yt-dlp
    ffmpeg
  linux-arm64/
    yt-dlp
    ffmpeg
  macos-x64/
    yt-dlp
    ffmpeg
  macos-arm64/
    yt-dlp
    ffmpeg
```

Примечания:

- Для Docker на Synology обычно нужен `linux-arm64` (если NAS на ARM) или `linux-x64` (если NAS на x86_64).
- Можно переопределить точные пути через `YTDLP_PATH`/`FFMPEG_PATH` (имеют приоритет над `TOOLS_DIR`).

Проверка статуса доступна через:

- `GET /api/deps`
- `GET /api/stats` (поле `deps`)

### Качество видео

- `best` - лучшее доступное качество
- `1080`, `720`, `480`, `360` - конкретное разрешение
- `audio` - только аудио

### Форматы

- `mp4` - универсальный формат (по умолчанию)
- `mkv` - Matroska, хорош для больших файлов
- `webm` - WebM формат

## Лицензия

MIT

## Благодарности

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — утилита для скачивания видео
- [Next.js](https://nextjs.org/) — React фреймворк
- [NextAuth.js](https://next-auth.js.org/) — аутентификация
- [shadcn/ui](https://ui.shadcn.com/) — UI компоненты
- [Prisma](https://www.prisma.io/) — ORM
