// ==UserScript==
// @name         Max.ru - ZIP Архиватор (чистый)
// @namespace    http://tampermonkey.net/
// @version      8.5
// @description  Скачивание медиа из меню «⋯» — ZIP или папка
// @author       alekseichmsk
// @updateURL    https://github.com/alekseichmsk/max-media-downloader/raw/main/max-zip.js
// @downloadURL  https://github.com/alekseichmsk/max-media-downloader/raw/main/max-zip.js
// @match        https://web.max.ru/*
// @require      https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js
// @connect      i.oneme.ru
// @connect      okcdn.ru
// @connect      *.okcdn.ru
// @connect      maxvd*
// @connect      raw.githubusercontent.com
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
(function () {
    'use strict';
    GM_addStyle(`
        .mx-dl-menu-item { cursor: pointer; }
        .mx-dl-menu-item--busy { opacity: 0.5; pointer-events: none; }
        .mx-dl-menu-item svg { flex-shrink: 0; }
        .mx-dl-progress {
            display: none;
            width: 100%;
            box-sizing: border-box;
            padding: 2px 12px 6px;
        }
        .mx-dl-progress--visible { display: block; }
        .mx-dl-progress__row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .mx-dl-progress__track {
            flex: 1;
            height: 2px;
            border-radius: 1px;
            background: rgba(255, 255, 255, 0.14);
            overflow: hidden;
        }
        .mx-dl-progress__fill {
            height: 100%;
            width: 0%;
            border-radius: 1px;
            background: var(--mx-dl-accent, #5b9cff);
            transition: width 0.12s ease-out;
        }
        .mx-dl-progress__pct {
            flex-shrink: 0;
            min-width: 30px;
            font-size: 11px;
            line-height: 1;
            text-align: right;
            color: rgba(255, 255, 255, 0.5);
            font-variant-numeric: tabular-nums;
        }
        .mx-dl-update {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin: 0 8px 6px;
            padding: 8px 10px;
            border-radius: 10px;
            font-size: 12px;
            line-height: 1.3;
            color: rgba(255, 255, 255, 0.9);
            background: rgba(91, 156, 255, 0.18);
            border: 1px solid rgba(91, 156, 255, 0.35);
        }
        .mx-dl-update a {
            color: #8ec1ff;
            text-decoration: none;
            white-space: nowrap;
        }
        .mx-dl-update a:hover { text-decoration: underline; }
        .mx-dl-update__close {
            flex-shrink: 0;
            border: none;
            background: transparent;
            color: rgba(255, 255, 255, 0.55);
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            padding: 0 4px;
        }
        .mx-dl-update__close:hover { color: #fff; }
    `);
    const MENU_ICON_IDS = {
        zip: [
            'icon_archive_fill',
            'icon_file_fill',
            'icon_attachment_fill',
            'icon_document_fill',
            'icon_download_fill',
        ],
        folder: [
            'icon_folder_fill',
            'icon_folder',
            'icon_download_fill',
            'icon_download_outline',
            'icon_save_fill',
        ],
    };
    const MENU_ICON_FALLBACK = {
        zip: '<path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM8 12h2v6H8v-6zm4-3h2v9h-2V9zm4 3h2v6h-2v-6z"/>',
        folder:
            '<path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zm0 2h7.17L18 8H10V6zm-6 4h16v10H4V10z"/>',
    };
    const LOG = '[Max ZIP]';
    const SCRIPT_UPDATE_URL =
        'https://github.com/alekseichmsk/max-media-downloader/raw/main/max-zip.js';
    const REPO_URL = 'https://github.com/alekseichmsk/max-media-downloader';
    const UPDATE_CHECK_MS = 12 * 60 * 60 * 1000;
    const JPEG_QUALITY = 0.92;
    const zipSync = typeof fflate !== 'undefined' && fflate.zipSync;
    const UA = navigator.userAgent;
    const gridByWrapper = new WeakMap();
    let pendingMenuGrid = null;
    let menuInjectUntil = 0;

    const COMPOSER_MENU_MARKERS = ['Вырезать', 'Вставить', 'Форматирование'];

    let progressEl = null;
    let progressHook = null;

    function getComposerHost() {
        return document.querySelector('[data-testid="composer"]');
    }

    function getCurrentVersion() {
        return typeof GM_info !== 'undefined' && GM_info.script?.version ? GM_info.script.version : '0';
    }

    function isNewerVersion(remote, local) {
        const toParts = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
        const a = toParts(remote);
        const b = toParts(local);
        const len = Math.max(a.length, b.length);
        for (let i = 0; i < len; i++) {
            const x = a[i] || 0;
            const y = b[i] || 0;
            if (x > y) return true;
            if (x < y) return false;
        }
        return false;
    }

    function showUpdateBanner(remoteVersion) {
        const composer = getComposerHost();
        if (!composer || composer.querySelector('.mx-dl-update')) return;

        const mount =
            composer.querySelector('.composer.svelte-nwz8cp') ||
            composer.querySelector('.composer') ||
            composer;

        const bar = document.createElement('div');
        bar.className = 'mx-dl-update';
        bar.innerHTML = `
            <span>Доступна версия <b>${remoteVersion}</b> (у вас ${getCurrentVersion()})</span>
            <a href="${SCRIPT_UPDATE_URL}" target="_blank" rel="noopener">Скачать</a>
        `;

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'mx-dl-update__close';
        close.setAttribute('aria-label', 'Скрыть');
        close.textContent = '×';
        close.onclick = () => {
            GM_setValue('update_dismissed', remoteVersion);
            bar.remove();
        };

        bar.appendChild(close);
        mount.insertBefore(bar, mount.firstChild);
    }

    function checkForUpdates() {
        const now = Date.now();
        const lastCheck = GM_getValue('update_check_ts', 0);
        if (now - lastCheck < UPDATE_CHECK_MS) return;
        GM_setValue('update_check_ts', now);

        const current = getCurrentVersion();
        GM_xmlhttpRequest({
            method: 'GET',
            url: SCRIPT_UPDATE_URL,
            timeout: 20000,
            headers: { Accept: 'text/plain,*/*' },
            onload: (res) => {
                if (res.status !== 200 || !res.responseText) return;
                const match = res.responseText.match(/@version\s+([\d.]+)/);
                if (!match) return;
                const remote = match[1];
                if (!isNewerVersion(remote, current)) return;
                if (GM_getValue('update_dismissed', '') === remote) return;
                showUpdateBanner(remote);
                console.log(LOG, 'update available', remote, 'current', current);
            },
            onerror: () => console.warn(LOG, 'update check failed'),
        });
    }

    function ensureProgressBar() {
        const composer = getComposerHost();
        if (!composer) return null;

        if (progressEl?.isConnected) return progressEl;

        const mount =
            composer.querySelector('.composer.svelte-nwz8cp') ||
            composer.querySelector('.composer') ||
            composer;

        progressEl = document.createElement('div');
        progressEl.className = 'mx-dl-progress';
        progressEl.setAttribute('role', 'progressbar');
        progressEl.setAttribute('aria-valuemin', '0');
        progressEl.setAttribute('aria-valuemax', '100');
        progressEl.innerHTML = `
            <div class="mx-dl-progress__row">
                <div class="mx-dl-progress__track">
                    <div class="mx-dl-progress__fill"></div>
                </div>
                <span class="mx-dl-progress__pct">0%</span>
            </div>
        `;
        mount.appendChild(progressEl);
        return progressEl;
    }

    function renderProgress(pct) {
        const bar = ensureProgressBar();
        if (!bar) return;
        const value = Math.max(0, Math.min(100, Math.round(pct)));
        bar.classList.add('mx-dl-progress--visible');
        bar.setAttribute('aria-valuenow', String(value));
        bar.querySelector('.mx-dl-progress__fill').style.width = `${value}%`;
        bar.querySelector('.mx-dl-progress__pct').textContent = `${value}%`;
    }

    function hideProgressBar() {
        if (!progressEl) return;
        progressEl.classList.remove('mx-dl-progress--visible');
        progressEl.setAttribute('aria-valuenow', '0');
    }

    function createProgress(totalSteps) {
        const total = Math.max(1, totalSteps);
        let done = 0;
        let sub = 0;

        const api = {
            setFileProgress(loaded, size) {
                sub = size > 0 ? loaded / size : 0.35;
                renderProgress(((done + sub) / total) * 100);
            },
            tickFile() {
                done += 1;
                sub = 0;
                renderProgress((done / total) * 100);
            },
            setPhase(pct) {
                sub = 0;
                renderProgress(pct);
            },
            start() {
                done = 0;
                sub = 0;
                renderProgress(0);
            },
            done() {
                renderProgress(100);
                setTimeout(hideProgressBar, 700);
            },
            fail() {
                hideProgressBar();
            },
        };
        return api;
    }
    function shortHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return (hash >>> 0).toString(16).slice(-6).padStart(6, '0');
    }
    function timestamp() {
        return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    }
    function registerGrid(grid) {
        const wrapper = grid.closest('.messageWrapper');
        if (wrapper) gridByWrapper.set(wrapper, grid);
        grid.dataset.zipReady = '1';
    }
    function resolveMediaUrl(el, attr = 'src') {
        if (!el) return '';
        const raw = el.currentSrc || el[attr] || el.getAttribute(attr);
        if (!raw) return '';
        return raw.replace(/&amp;/g, '&');
    }
    function isMediaImageUrl(url) {
        return /oneme\.ru/i.test(url) || /okcdn\.ru.*getImage/i.test(url);
    }
    function tileHasVideo(tile) {
        return tile && tile.querySelector('video source, video[src]');
    }
    function liveVideoUrl(videoEl, fallback) {
        const fromDom = resolveMediaUrl(
            videoEl?.querySelector('source[type="video/mp4"], source[src*="okcdn"]') || videoEl
        );
        if (fromDom) return fromDom;
        const fromPerf = performance
            .getEntriesByType('resource')
            .map((e) => e.name)
            .filter((u) => /maxvd\d*\.okcdn\.ru/i.test(u))
            .pop();
        return fromPerf || fallback;
    }
    function collectMedia(grid) {
        const items = [];
        const seen = new Set();
        const push = (type, url, videoEl = null) => {
            if (!url || seen.has(url)) return;
            seen.add(url);
            items.push({ type, url, videoEl });
        };
        grid.querySelectorAll('video').forEach((video) => {
            if (video.closest('.mark, .link, .author, .avatar')) return;
            const source =
                video.querySelector(
                    'source[type="video/mp4"], source[src*="okcdn"], source[src*="maxvd"]'
                ) || video.querySelector('source');
            const url = liveVideoUrl(video, source ? resolveMediaUrl(source) : resolveMediaUrl(video));
            if (!url) return;
            push('video', url, video);
        });
        grid.querySelectorAll(
            '.tile img, button.tile img, img.image, img.img.image, img[src*="oneme.ru"], img[src*="okcdn.ru"]'
        ).forEach((img) => {
            if (img.classList.contains('avatarImage')) return;
            if (img.closest('.mark, .link, .author, .avatar')) return;
            const tile = img.closest('.tile, button.tile');
            if (tileHasVideo(tile)) return;
            const src = resolveMediaUrl(img);
            if (!isMediaImageUrl(src)) return;
            if (/\/fn=sqr_/i.test(src)) return;
            push('image', src);
        });
        return items;
    }
    function isMp4Buffer(buf) {
        if (!buf || buf.byteLength < 12) return false;
        const tag = String.fromCharCode(...new Uint8Array(buf, 4, 4));
        return tag === 'ftyp' || tag === 'moof' || tag === 'mdat' || tag === 'free';
    }
    function gmRequest(url, { responseType = 'blob', timeout = 120000, headers = {}, onProgress } = {}) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType,
                timeout,
                headers: {
                    Referer: 'https://web.max.ru/',
                    'User-Agent': UA,
                    Accept: '*/*',
                    'Accept-Encoding': 'identity',
                    ...headers,
                },
                onprogress: onProgress
                    ? (ev) => {
                          if (ev.lengthComputable) {
                              onProgress(ev.loaded, ev.total);
                          } else if (ev.loaded) {
                              onProgress(ev.loaded, 0);
                          }
                      }
                    : undefined,
                onload: (xhr) => resolve({ ok: true, xhr }),
                onerror: () => resolve({ ok: false }),
                ontimeout: () => resolve({ ok: false, timeout: true }),
            });
        });
    }

    function trackProgress(loaded, total) {
        progressHook?.setFileProgress(loaded, total);
    }
    function parseGmBuffer(xhr) {
        const { status, response } = xhr;
        if (status !== 200 || !response) return null;
        const data = response instanceof ArrayBuffer ? response : null;
        if (!data || data.byteLength < 2048) return null;
        if (isMp4Buffer(data) || data.byteLength > 50000) {
            return new Blob([data], { type: 'video/mp4' });
        }
        return null;
    }
    async function gmVideoBlob(url) {
        const attempts = [
            { Range: 'bytes=0-' },
            {},
            { Range: 'bytes=0-', Accept: 'video/mp4,*/*' },
        ];
        for (const extra of attempts) {
            const req = await gmRequest(url, {
                responseType: 'arraybuffer',
                timeout: 300000,
                headers: extra,
                onProgress: trackProgress,
            });
            if (!req.ok) continue;
            const blob = parseGmBuffer(req.xhr);
            if (blob) return blob;
            console.warn(LOG, 'video gm', req.xhr.status, req.xhr.response?.byteLength);
        }
        return null;
    }
    function gmDownloadUrl(url, filename) {
        return new Promise((resolve) => {
            GM_download({
                url,
                name: filename,
                saveAs: false,
                headers: {
                    Referer: 'https://web.max.ru/',
                    'User-Agent': UA,
                },
                onload: () => resolve(true),
                onerror: () => resolve(false),
            });
        });
    }
    async function downloadImage(url) {
        const req = await gmRequest(url, {
            timeout: 30000,
            headers: { Accept: 'image/*,*/*;q=0.8' },
            onProgress: trackProgress,
        });
        if (!req.ok) return { ok: false };
        const { status, response: blob } = req.xhr;
        if (status !== 200 || !blob || blob.size < 100) return { ok: false };
        const type = (blob.type || '').toLowerCase();
        if (type.startsWith('text/') || type.includes('html')) return { ok: false };
        return { ok: true, blob };
    }
    async function downloadVideo(item) {
        const url = liveVideoUrl(item.videoEl, item.url);
        const blob = await gmVideoBlob(url);
        if (blob) return { ok: true, blob, url };
        const viaDl = await gmDownloadUrl(url, 'video_tmp.mp4');
        if (viaDl) {
            return { ok: true, external: true, url, name: null };
        }
        return { ok: false, url };
    }
    async function downloadMediaItem(item) {
        return item.type === 'video' ? downloadVideo(item) : downloadImage(item.url);
    }
    function isJpegBlob(blob) {
        const t = (blob.type || '').toLowerCase();
        return t === 'image/jpeg' || t === 'image/jpg';
    }
    async function toJpegBytes(blob) {
        if (isJpegBlob(blob)) {
            return new Uint8Array(await blob.arrayBuffer());
        }
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas 2D недоступен'));
                    return;
                }
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(
                    async (jpegBlob) => {
                        if (!jpegBlob) {
                            reject(new Error('JPEG conversion failed'));
                            return;
                        }
                        resolve(new Uint8Array(await jpegBlob.arrayBuffer()));
                    },
                    'image/jpeg',
                    JPEG_QUALITY
                );
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Image decode failed'));
            };
            img.src = url;
        });
    }
    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
        }, 5000);
    }
    function buildZipBlob(filesMap) {
        if (!zipSync) throw new Error('fflate не загрузился');
        return new Blob([zipSync(filesMap, { level: 0 })], { type: 'application/zip' });
    }
    async function prepareZipEntries(media) {
        const entries = [];
        const externalVideos = [];
        let imgIndex = 0;
        let vidIndex = 0;
        for (const item of media) {
            progressHook?.setFileProgress(0, 1);
            const result = await downloadMediaItem(item);
            progressHook?.tickFile();
            if (!result.ok) {
                console.warn(LOG, 'skip zip', item.type, item.url?.slice(0, 80));
                continue;
            }
            if (item.type === 'video') {
                vidIndex++;
                const name = `vid_${String(vidIndex).padStart(2, '0')}_${shortHash(result.url)}.mp4`;
                if (result.external) {
                    await gmDownloadUrl(result.url, name);
                    externalVideos.push(name);
                    continue;
                }
                entries.push({
                    name,
                    bytes: new Uint8Array(await result.blob.arrayBuffer()),
                });
            } else {
                imgIndex++;
                entries.push({
                    name: `img_${String(imgIndex).padStart(2, '0')}_${shortHash(item.url)}.jpg`,
                    bytes: await toJpegBytes(result.blob),
                });
            }
        }
        return { entries, externalVideos };
    }
    async function prepareFolderBlobs(media) {
        const blobEntries = [];
        const externalVideos = [];
        let imgIndex = 0;
        let vidIndex = 0;
        for (const item of media) {
            progressHook?.setFileProgress(0, 1);
            const result = await downloadMediaItem(item);
            progressHook?.tickFile();
            if (!result.ok) {
                console.warn(LOG, 'skip file', item.type, item.url?.slice(0, 80));
                continue;
            }
            if (item.type === 'video') {
                vidIndex++;
                const name = `vid_${String(vidIndex).padStart(2, '0')}_${shortHash(result.url)}.mp4`;
                if (result.external) {
                    await gmDownloadUrl(result.url, name);
                    externalVideos.push(name);
                    continue;
                }
                blobEntries.push({ name, blob: result.blob });
            } else {
                imgIndex++;
                const bytes = await toJpegBytes(result.blob);
                blobEntries.push({
                    name: `img_${String(imgIndex).padStart(2, '0')}_${shortHash(item.url)}.jpg`,
                    blob: new Blob([bytes], { type: 'image/jpeg' }),
                });
            }
        }
        return { blobEntries, externalVideos };
    }
    async function pickSaveDirectory() {
        if (typeof showDirectoryPicker !== 'function') return null;
        return showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'documents',
            id: 'max-ru-media-save',
        });
    }
    async function writeEntriesToDir(dirHandle, blobEntries) {
        const n = blobEntries.length;
        for (let i = 0; i < n; i++) {
            const { name, blob } = blobEntries[i];
            const handle = await dirHandle.getFileHandle(name, { create: true });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            progressHook?.setPhase(88 + Math.round(((i + 1) / n) * 12));
        }
        return dirHandle.name;
    }
    function mediaSummary(media) {
        return {
            photos: media.filter((m) => m.type === 'image').length,
            videos: media.filter((m) => m.type === 'video').length,
        };
    }
    function notifyExternalVideos(externalVideos) {
        if (!externalVideos.length) return;
        alert(
            `Видео (${externalVideos.length}) CDN отдал только через скачивание браузера — они в папке «Загрузки»:\n` +
                externalVideos.join('\n') +
                '\n\nФото лежат в выбранной папке. Для ZIP — видео тоже в Загрузках.'
        );
    }
    function closeActionsMenu() {
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })
        );
    }
    async function runZip(grid, menuRoot) {
        const media = collectMedia(grid);
        if (!media.length) {
            alert('Нет фото или видео в этом сообщении.');
            return;
        }
        setMenuBusy(menuRoot, true);
        closeActionsMenu();
        progressHook = createProgress(media.length + 1);
        progressHook.start();
        try {
            const { entries, externalVideos } = await prepareZipEntries(media);
            if (!entries.length && !externalVideos.length) {
                progressHook.fail();
                alert(
                    'Не удалось скачать медиа.\n\nПрокрутите чат, чтобы видео прогрузились, обновите страницу и попробуйте снова.'
                );
                return;
            }
            if (entries.length) {
                progressHook.setPhase(92);
                const label = media.some((m) => m.type === 'video') ? 'Media' : 'Photos';
                saveBlob(
                    buildZipBlob(Object.fromEntries(entries.map((e) => [e.name, e.bytes]))),
                    `Max_${label}_${timestamp()}.zip`
                );
            }
            notifyExternalVideos(externalVideos);
            progressHook.done();
            console.log(LOG, 'zip', entries.length, externalVideos.length, mediaSummary(media));
        } catch (err) {
            progressHook.fail();
            console.error(LOG, err);
            alert(err?.message || err);
        } finally {
            progressHook = null;
            setMenuBusy(menuRoot, false);
        }
    }
    async function runSaveToFolder(grid, dirPromise, menuRoot) {
        const media = collectMedia(grid);
        if (!media.length) {
            alert('Нет фото или видео в этом сообщении.');
            return;
        }
        let dirHandle;
        try {
            dirHandle = dirPromise ? await dirPromise : await pickSaveDirectory();
        } catch (err) {
            if (err?.name === 'AbortError') return;
            alert('Папка не выбрана.');
            return;
        }
        if (!dirHandle) return;
        setMenuBusy(menuRoot, true);
        closeActionsMenu();
        progressHook = createProgress(media.length + 1);
        progressHook.start();
        try {
            const { blobEntries, externalVideos } = await prepareFolderBlobs(media);
            if (!blobEntries.length && !externalVideos.length) {
                progressHook.fail();
                alert(
                    'Не удалось скачать медиа.\n\nПрокрутите чат, чтобы видео прогрузились, обновите страницу и попробуйте снова.'
                );
                return;
            }
            if (blobEntries.length) {
                await writeEntriesToDir(dirHandle, blobEntries);
                console.log(LOG, 'saved to', dirHandle.name, blobEntries.length);
            }
            notifyExternalVideos(externalVideos);
            progressHook.done();
        } catch (err) {
            progressHook.fail();
            console.error(LOG, err);
            alert(err?.message || err);
        } finally {
            progressHook = null;
            setMenuBusy(menuRoot, false);
        }
    }
    function setMenuBusy(menuRoot, busy) {
        if (!menuRoot) return;
        menuRoot.querySelectorAll('.mx-dl-menu-item').forEach((el) => {
            el.classList.toggle('mx-dl-menu-item--busy', busy);
            el.setAttribute('aria-disabled', busy ? 'true' : 'false');
        });
    }
    function findActionsMenu() {
        const roots = [document.querySelector('#top-layer'), document.body].filter(Boolean);
        for (const root of roots) {
            for (const menu of root.querySelectorAll('[role="menu"], [role="listbox"]')) {
                if (menu.querySelector('.mx-dl-menu-item')) return menu;
                if (menu.querySelector('button, [role="menuitem"]')) return menu;
            }
            for (const dialog of root.querySelectorAll('[role="dialog"]')) {
                const inner =
                    dialog.querySelector('[role="menu"], [role="listbox"]') ||
                    dialog.querySelector('[class*="menu"], [class*="actions"]');
                if (inner?.querySelector('button, [role="menuitem"]')) return inner;
                if (dialog.querySelector('button')) return dialog;
            }
        }
        return null;
    }
    function spriteExists(id) {
        return !!document.getElementById(id);
    }
    function pickSpriteId(candidates) {
        for (const id of candidates) {
            if (spriteExists(id)) return id;
        }
        return null;
    }
    function buildMenuIcon(sample, iconKey) {
        const spriteId = pickSpriteId(MENU_ICON_IDS[iconKey] || []);
        const sampleSvg = sample?.querySelector('svg');
        if (sampleSvg) {
            const svg = sampleSvg.cloneNode(true);
            const use = svg.querySelector('use');
            if (use && spriteId) {
                use.setAttribute('href', `#${spriteId}`);
            }
            return svg;
        }
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        if (spriteId) {
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttribute('href', `#${spriteId}`);
            svg.appendChild(use);
        } else {
            svg.innerHTML = MENU_ICON_FALLBACK[iconKey] || '';
        }
        return svg;
    }
    function setMenuItemLabel(item, label, sample, iconKey) {
        const labelEl =
            item.querySelector('[class*="text"], [class*="label"], [class*="title"]') ||
            [...item.querySelectorAll('span, div')].find(
                (el) => !el.querySelector('svg') && !el.closest('svg')
            );
        if (labelEl) {
            labelEl.textContent = label;
            return;
        }
        const sampleLabel =
            sample?.querySelector('[class*="text"], [class*="label"]') ||
            sample?.querySelector('span');
        item.textContent = '';
        item.appendChild(buildMenuIcon(sample, iconKey));
        const wrap = sampleLabel ? sampleLabel.cloneNode(false) : document.createElement('span');
        wrap.textContent = label;
        item.appendChild(wrap);
    }
    function applyMenuItemIcon(item, sample, iconKey) {
        const spriteId = pickSpriteId(MENU_ICON_IDS[iconKey] || []);
        const use = item.querySelector('use');
        if (use && spriteId) {
            use.setAttribute('href', `#${spriteId}`);
            return;
        }
        const oldSvg = item.querySelector('svg');
        const svg = buildMenuIcon(sample, iconKey);
        if (oldSvg) {
            oldSvg.replaceWith(svg);
        } else {
            item.insertBefore(svg, item.firstChild);
        }
    }
    function makeMenuItem(menu, label, iconKey, onClick) {
        const sample =
            menu.querySelector('[role="menuitem"]:not(.mx-dl-menu-item)') ||
            menu.querySelector('button:not(.mx-dl-menu-item)');
        const item = sample ? sample.cloneNode(true) : document.createElement('button');
        item.type = 'button';
        item.classList.add('mx-dl-menu-item');
        if (sample?.className) item.className = `${sample.className} mx-dl-menu-item`;
        item.setAttribute('role', sample?.getAttribute('role') || 'menuitem');
        applyMenuItemIcon(item, sample, iconKey);
        setMenuItemLabel(item, label, sample, iconKey);
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick(e);
        });
        return item;
    }
    function isMessageActionsMenu(menu) {
        const text = menu.textContent || '';
        if (COMPOSER_MENU_MARKERS.some((m) => text.includes(m))) return false;
        return /Переслать|Удалить|Пожаловаться|Отметить непрочитанным|Скопировать текст/i.test(
            text
        );
    }

    function injectMenuItems() {
        if (Date.now() > menuInjectUntil) {
            pendingMenuGrid = null;
            return;
        }
        const grid = pendingMenuGrid;
        if (!grid || !document.contains(grid)) {
            pendingMenuGrid = null;
            return;
        }
        const menu = findActionsMenu();
        if (!menu || menu.querySelector('.mx-dl-menu-item')) return;
        if (!isMessageActionsMenu(menu)) return;
        const itemZip = makeMenuItem(menu, 'Скачать ZIP', 'zip', () => {
            void runZip(grid, menu);
        });
        const itemFolder = makeMenuItem(menu, 'Сохранить все в папку…', 'folder', () => {
            let dirPromise = null;
            if (typeof showDirectoryPicker === 'function') {
                try {
                    dirPromise = pickSaveDirectory();
                } catch (err) {
                    console.warn(LOG, 'picker', err);
                }
            }
            void runSaveToFolder(grid, dirPromise, menu);
        });
        const first = menu.querySelector(
            '[role="menuitem"]:not(.mx-dl-menu-item), button:not(.mx-dl-menu-item)'
        );
        if (first) {
            first.before(itemZip, itemFolder);
        } else {
            menu.prepend(itemZip, itemFolder);
        }
        pendingMenuGrid = null;
        menuInjectUntil = 0;
        console.log(LOG, 'menu injected');
    }

    function scheduleMenuInject() {
        injectMenuItems();
        requestAnimationFrame(injectMenuItems);
        [50, 150, 300].forEach((ms) => setTimeout(injectMenuItems, ms));
    }
    document.addEventListener(
        'click',
        (e) => {
            const btn = e.target.closest('[aria-label="Действия с сообщением"]');
            if (!btn) return;
            const wrapper = btn.closest('.messageWrapper');
            const grid =
                gridByWrapper.get(wrapper) ||
                wrapper?.querySelector('.grid[aria-label="Прикрепленные фото"]');
            if (!grid) return;
            pendingMenuGrid = grid;
            menuInjectUntil = Date.now() + 600;
            scheduleMenuInject();
        },
        true
    );

    document.addEventListener(
        'contextmenu',
        (e) => {
            if (
                e.target.closest(
                    '[contenteditable="true"], textarea, input, [class*="composer"], [class*="input"], [class*="field"]'
                )
            ) {
                pendingMenuGrid = null;
                menuInjectUntil = 0;
            }
        },
        true
    );

    function scan() {
        document.querySelectorAll('.grid[aria-label="Прикрепленные фото"]').forEach(registerGrid);
        document.querySelectorAll('.messageControls .mx-dl-btn, .grid > .mx-dl-toolbar').forEach((el) =>
            el.remove()
        );
    }
    new MutationObserver((m) => {
        if (m.some((r) => r.addedNodes.length)) scan();
    }).observe(document.body, { childList: true, subtree: true });
    scan();
    checkForUpdates();
})();
