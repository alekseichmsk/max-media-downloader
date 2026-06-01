# Max Media Downloader

Скрипт для [web.max.ru](https://web.max.ru): скачивает **фото и видео** из сообщения — одним **ZIP** или в **папку**. Работает через расширение **Tampermonkey** (бесплатно).

---

## Что понадобится

- Браузер: **Google Chrome**, **Microsoft Edge** или **Firefox**
- Аккаунт Max и открытый чат на [web.max.ru](https://web.max.ru)

---

## Шаг 1. Установить Tampermonkey

Tampermonkey — это расширение, которое запускает наш скрипт на сайте Max. Без него скрипт не заработает.

### Chrome

1. Откройте магазин расширений: [Tampermonkey в Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
2. Нажмите **«Установить»** → подтвердите.
3. В панели браузера (справа вверху) появится значок **Tampermonkey** — чёрная маска.

### Microsoft Edge

1. Откройте: [Tampermonkey в Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfph)
2. Нажмите **«Получить»** / **«Установить»**.

### Firefox

1. Откройте: [Tampermonkey на addons.mozilla.org](https://addons.mozilla.org/firefox/addon/tampermonkey/)
2. Нажмите **«Добавить в Firefox»** → разрешите установку.

> **Совет:** если значка нет, нажмите на иконку «пазла» в браузере и закрепите Tampermonkey на панели.

---

## Шаг 2. Добавить скрипт Max Media Downloader

**Ссылка на скрипт** (откройте → скопируйте весь код → вставьте в Tampermonkey):

https://github.com/alekseichmsk/max-media-downloader/blob/main/max-zip.js

Быстрая установка (Tampermonkey предложит установку сам):

https://github.com/alekseichmsk/max-media-downloader/raw/main/max-zip.js

**Видео на YouTube (рекомендуем):** [Смотреть инструкцию](https://youtu.be/LWGP_au76Kg)

[![Установка скрипта в Tampermonkey — открыть на YouTube](https://img.youtube.com/vi/LWGP_au76Kg/hqdefault.jpg)](https://youtu.be/LWGP_au76Kg)

Краткая демонстрация в репозитории:

![Установка скрипта в Tampermonkey](docs/install-max-media-downloader.gif)

---

## Шаг 3. Проверить, что всё работает

1. Откройте [web.max.ru](https://web.max.ru) и зайдите в чат, где есть **фото или видео**.
2. Наведите на сообщение с медиа → нажмите **⋯** (три точки, «Действия с сообщением»).
3. В меню должны появиться пункты:
   - **Скачать ZIP**
   - **Сохранить все в папку…**
4. Внизу, под полем **«Сообщение»**, при скачивании появится **тонкая полоска** и **проценты**.

Если пунктов нет:

- обновите страницу (`F5`);
- в Tampermonkey → панель управления → убедитесь, что скрипт **включён** (переключатель зелёный);
- проверьте, что открыт именно **web.max.ru**, а не приложение Max.

---

## Как пользоваться

| Действие | Что делает |
|----------|------------|
| **Скачать ZIP** | Все фото и видео из сообщения — одним архивом в «Загрузки» |
| **Сохранить все в папку…** | Вы выбираете папку один раз; файлы сохраняются туда без лишних окон |

**Про папку:** лучше выбирать папку в **«Документах»** или на **«Рабочем столе»**, не корень диска `C:\`.

**Про видео:** если ссылка устарела, обновите чат и попробуйте снова. Часть видео может уйти в «Загрузки» браузера отдельно — скрипт сообщит об этом.

---

## Частые вопросы

**Нужно ли платить?**  
Нет. Tampermonkey и скрипт бесплатны.

**Безопасно ли?**  
Скрипт работает только на `web.max.ru`, код открыт в этом репозитории. Устанавливайте только из доверенной ссылки или файла `max-zip.js` отсюда.

**Обновить скрипт**  
Скачайте новый `max-zip.js`, откройте старый скрипт в Tampermonkey, замените текст целиком и сохраните (`Ctrl+S`).

**Скрипт не видит видео**  
Прокрутите чат, чтобы превью прогрузилось, затем снова откройте **⋯**.

---

## Файлы в репозитории

| Файл | Назначение |
|------|------------|
| [max-zip.js](https://github.com/alekseichmsk/max-media-downloader/blob/main/max-zip.js) | Сам userscript — его ставят в Tampermonkey |
| `docs/install-max-media-downloader.gif` | GIF для README — установка скрипта |
| `docs/install-max-media-downloader.mp4` | Полное видео (Git LFS) |
| `README.md` | Эта инструкция |

---

Если что-то не получается — опишите браузер и на каком шаге застряли, в [Issues](https://github.com/alekseichmsk/max-media-downloader/issues) репозитория.
