# YT-DLP Media Manager

Домашний медиа-центр для скачивания и просмотра видео с YouTube и других платформ.

## Возможности

- 📺 **Медиатека** — просмотр и организация скачанных видео (избранное, просмотры, теги)
- 📥 **Скачивание** — загрузка видео с выбором качества и формата
- 🔔 **Подписки** — автоматическое отслеживание новых видео на каналах (категории, расписание)
- 📋 **Очередь** — управление задачами скачивания
- 🎬 **Видеоплеер** — встроенный плеер для просмотра, публичные ссылки просмотра
- 👥 **Авторизация** — регистрация, вход, профиль; OAuth (Google); панель администратора
- 🐳 **Docker** — готовый контейнер для развёртывания на Synology и TerraMaster NAS

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

   **Важно про URL:** переменная окружения **`NEXTAUTH_URL`** должна **строго совпадать** с адресом, по которому вы реально открываете приложение (включая порт), иначе авторизация может не работать из‑за CSRF‑проверки NextAuth.

   - Если вы заходите напрямую по IP и порту NAS (без обратного proxy), укажите, например:  
     `NEXTAUTH_URL=http://192.168.1.10:3000`
   - Если вы используете домен и обратный proxy (например, `https://media.example.com`), то `NEXTAUTH_URL` должен быть `https://media.example.com`, и заходить нужно именно по этому домену.

   Для ссылок «Поделиться» и публичного просмотра используется **`BASE_URL`** — он должен указывать на **внешний публичный адрес**, через который к вам приходят пользователи (обычно домен за обратным proxy), и может отличаться от `NEXTAUTH_URL`.

   **Production:** для доступа извне добавьте в `environment` секцию `docker-compose.yml` переменные `NEXTAUTH_URL`, `BASE_URL`, `NEXTAUTH_SECRET` (см. раздел «Безопасность и production» ниже).

### Вариант 2: Docker через DSM

1. Откройте **Container Manager** в DSM
2. Создайте новый проект
3. Укажите путь к папке с `docker-compose.yml`
4. Запустите контейнер

## Установка на TerraMaster NAS

TerraMaster TS F4-424 Pro (и другие модели с TOS 5) поддерживают Docker. NAS на Intel x86_64 — текущий образ работает нативно. Рекомендуется хранить данные на Vol 2 (не системном томе).

### Вариант 1: Docker Manager (рекомендуется)

1. **Подготовка папок**

   В File Manager (TOS) создайте структуру на Vol 2:

   ```text
   /Volume2/docker/yt-dlp-manager/
   ├── data/
   │   ├── database/
   │   └── tools/
   │       └── linux-x64/   # yt-dlp, ffmpeg (опционально, для обновления без пересборки)
   └── downloads/
   ```

2. **Установка Docker**

   - TOS App Center → установите **Docker** (Docker Engine)
   - Установите **Docker Manager** (GUI для контейнеров)

3. **Загрузка и развёртывание**

   - Загрузите `docker-compose.yml`, `Dockerfile` и `.dockerignore` в папку `/Volume2/docker/yt-dlp-manager/`
   - Docker Manager → **Projects** → добавьте проект
   - Укажите путь к папке с `docker-compose.yml`
   - Для production задайте переменные `NEXTAUTH_URL`, `BASE_URL`, `NEXTAUTH_SECRET` (см. раздел «Безопасность и production»).  
     При этом:
     - `NEXTAUTH_URL` — фактический URL, по которому вы открываете UI (IP+порт или домен).
     - `BASE_URL` — внешний адрес для ссылок (обычно домен за обратным proxy).
   - Запустите сборку и контейнер

4. **Запуск через SSH** (альтернатива)

   ```bash
   cd /Volume2/docker/yt-dlp-manager
   docker-compose up -d --build
   ```

5. **Доступ**

   Откройте в браузере: `http://<IP-вашего-NAS>:3000`

### Вариант 2: Docker через Portainer

Portainer даёт удобный веб-интерфейс для управления контейнерами и stacks.

1. Установите Portainer из App Center (если доступен) или вручную через Docker
2. Portainer → **Stacks** → **Add stack**
3. Вставьте содержимое `docker-compose.yml` с нужными путями volumes (например `/Volume2/docker/yt-dlp-manager/data:/data`)
4. Добавьте production-переменные и разверните

**Примечание:** TerraMaster F4-424 Pro на Intel Core i3-N305 (x86_64) — используйте `linux-x64` в `TOOLS_DIR` при необходимости отдельных бинарников.

## Установка (готовый образ)

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
      # Вариант A: доступ напрямую по IP/порту NAS
      # В этом случае вы открываете приложение, например, по http://192.168.1.10:3000
      # и переменная NEXTAUTH_URL должна строго совпадать с этим адресом (иначе NextAuth может отклонять логин).
      # - NEXTAUTH_URL=http://192.168.1.10:3000
      # - BASE_URL=http://192.168.1.10:3000
      #
      # Вариант B: доступ только через домен и обратный proxy
      # Пример: внешний адрес https://media.example.com приходит на proxy,
      # proxy прокидывает внутрь на http://yt-dlp-manager:3000
      # В этом случае:
      # - NEXTAUTH_URL=https://media.example.com   # адрес, по которому вы реально открываете UI
      # - BASE_URL=https://media.example.com       # адрес, который попадает в ссылки «Поделиться»
      #
      # Для production обязательно задайте:
      # - NEXTAUTH_SECRET=your-random-secret       # openssl rand -base64 32
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
│   │   │   ├── subscriptions/# Подписки (в т.ч. [id]/check — ручная проверка)
│   │   │   ├── playlists/     # Плейлисты
│   │   │   ├── stream/        # Стриминг видео
│   │   │   ├── stats/         # Статистика
│   │   │   ├── settings/      # Настройки
│   │   │   └── ...
│   │   ├── (main)/            # Основной layout и вкладки (медиатека, подписки, очередь)
│   │   ├── login/             # Страница входа
│   │   ├── register/          # Регистрация
│   │   ├── profile/           # Профиль пользователя
│   │   ├── admin/             # Панель администратора
│   │   ├── watch/[id]/        # Публичный просмотр видео
│   │   ├── layout.tsx         # Корневой layout
│   │   └── providers.tsx      # React Query, Session провайдеры
│   ├── lib/
│   │   ├── db.ts              # Prisma клиент
│   │   ├── auth.ts            # NextAuth конфигурация
│   │   ├── ytdlp.ts           # Интеграция с yt-dlp
│   │   ├── deps.ts            # Поиск yt-dlp/ffmpeg, getQueueLogDir
│   │   ├── queue-worker.ts    # Воркер очереди и планировщик подписок
│   │   ├── queue-logger.ts    # Запись в queue.log
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
| POST | /api/subscriptions/check | Проверить новые видео (массово) |
| POST | /api/subscriptions/[id]/check | Проверить одну подписку на новые видео |
| GET | /api/playlists | Список плейлистов |
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
| INITIAL_ADMIN_PASSWORD | Пароль учётной записи admin при первом запуске (в production задайте свой; в development по умолчанию admin) | — |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | OAuth Google (опционально) | — |
| QUEUE_LOG_LEVEL | Уровень журнала очереди и подписок: `none`, `error`, `warn`, `info`, `debug` | info |
| QUEUE_MAX_CONCURRENT_DOWNLOADS | Максимум одновременных загрузок в очереди | 1 |

### Безопасность и production

- **NEXTAUTH_SECRET** в production **обязателен**: без него приложение не должно работать (или выдаст ошибку). Задайте длинную случайную строку, например: `openssl rand -base64 32`.
- **NEXTAUTH_URL** и **BASE_URL** в production укажите на реальный адрес приложения (например, `https://your-domain.com`).
- **INITIAL_ADMIN_PASSWORD**: в production задайте переменную для пароля учётной записи `admin` при первом запуске; **сразу после первого входа** смените пароль в разделе «Профиль». Без этой переменной в production учётная запись admin не создаётся (создайте пользователя через /register и назначьте права вручную в БД или задайте INITIAL_ADMIN_PASSWORD).

### Ошибки «Failed to resolve» (i.ytimg.com, googlevideo.com)

Если при загрузке с YouTube появляются ошибки вида `Failed to resolve 'i.ytimg.com'` или `googlevideo.com` (getaddrinfo failed / Errno 11001 на Windows, Errno -3 в Docker) — это проблема DNS. На ПК смените DNS на 8.8.8.8 и 8.8.4.4; в Docker добавьте в `docker-compose.yml` секцию `dns: [8.8.8.8, 8.8.4.4]`. Подробнее: [.docs/DNS_AND_NETWORK.md](.docs/DNS_AND_NETWORK.md).

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

В подпапке **`log`** того каталога, где лежит yt-dlp (например `data/tools/windows/log/`), автоматически создаётся файл **`queue.log`** — журнал очереди загрузки и проверок подписок (уровень задаётся `QUEUE_LOG_LEVEL`).

Примечания:

- Для Docker на Synology обычно нужен `linux-arm64` (если NAS на ARM) или `linux-x64` (если NAS на x86_64).
- Для TerraMaster F4-424 Pro (Intel x86_64) используйте `linux-x64`.
- Можно переопределить точные пути через `YTDLP_PATH`/`FFMPEG_PATH` (имеют приоритет над `TOOLS_DIR`).
- В подпапке **`log`** каталога с yt-dlp (или `TOOLS_DIR/log`, если yt-dlp из PATH) ведётся журнал очереди и подписок — файл **`queue.log`**. Уровень детализации задаётся переменной **`QUEUE_LOG_LEVEL`** (см. таблицу выше).
- Docker-образ основан на Alpine (musl). Если вы кладёте собственный бинарь yt-dlp в `TOOLS_DIR` (например, в `linux-x64/yt-dlp`), используйте **musl‑сборку** (`yt-dlp_musllinux` для x86_64), а не `yt-dlp_linux` под glibc — иначе утилита может не запускаться и в `/api/deps` будет отображаться как «не установлена».

Проверка статуса доступна через:

- `GET /api/deps`
- `GET /api/stats` (поле `deps`)

### Журнал очереди и подписок

В подпапке **`log`** папки, где лежит yt-dlp (при установке из PATH — в `TOOLS_DIR`), создаётся файл **`queue.log`**. В него пишутся события: старт/завершение/ошибки задач скачивания, проверки подписок (плановые и ручные). Уровень детализации задаётся переменной **`QUEUE_LOG_LEVEL`** (`none` — отключить, `error`, `warn`, `info`, `debug`). По умолчанию используется `info`.

### Качество видео

- `best` - лучшее доступное качество
- `1080`, `720`, `480`, `360` - конкретное разрешение
- `audio` - только аудио

### Форматы

- `mp4` - универсальный формат (по умолчанию)
- `mkv` - Matroska, хорош для больших файлов
- `webm` - WebM формат

### Подписки

**Ограничение по глубине (downloadDays)**. Для каждой подписки можно задать глубину в днях (например, 30). При проверке обновлений в очередь добавляются только видео, опубликованные не раньше чем `сегодня − downloadDays`.

**Фильтрация по дате публикации**. yt-dlp в режиме `--flat-playlist` для канала может не возвращать поле `upload_date` или возвращать `"NA"`. В таких случаях приложение **исключает** видео из результата — дату публикации проверить нельзя. Включаются только видео с валидной датой в формате YYYYMMDD, удовлетворяющей ограничению глубины. Это предотвращает попадание старых видео (до 2 лет и более) в очередь при установленном ограничении в 30 дней.

Переменные окружения: `DEFAULT_SUBSCRIPTION_HISTORY_DAYS` (дней истории при добавлении подписки), `SUBSCRIPTION_CHECK_VIDEO_LIMIT` (макс. видео при проверке), `DEFAULT_CHECK_INTERVAL` (интервал проверки в минутах).

## Лицензия

MIT

## Благодарности

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — утилита для скачивания видео
- [Next.js](https://nextjs.org/) — React фреймворк
- [NextAuth.js](https://next-auth.js.org/) — аутентификация
- [shadcn/ui](https://ui.shadcn.com/) — UI компоненты
- [Prisma](https://www.prisma.io/) — ORM
