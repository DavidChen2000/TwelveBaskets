import { findMatchingArticles, normalizeSearchText } from './search-utils.js';
import { registerServiceWorkerUpdates } from './service-worker-updates.js';
import { createArticleSpeechController } from './article-speech.js';
import { createBookmarkService } from './bookmark-service.js';
import { createLibraryData } from './library-data.js';
import { createStorage } from './storage.js';

const app = document.querySelector('#app');
const userAgent = navigator.userAgent;
const isSafari = /Safari/i.test(userAgent) && !/(Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|OPiOS|FxiOS|Firefox|Android)/i.test(userAgent);
const readerFloatDuration = isSafari ? 2000 : 931;
const state = { currentArticle: null, pendingBookmarkImport: null };
const libraryData = createLibraryData();
const articleSpeech = createArticleSpeechController(() => state.currentArticle?.article);
let readerFloatTimer;
const { readStored, writeStored } = createStorage(localStorage);
const bookmarkService = createBookmarkService({ readStored, writeStored });
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function updateChrome(route) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const selected = link.dataset.nav === route;
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const bookmarks = bookmarkService.list();
  document.querySelector('#bookmark-count').textContent = bookmarks.length || '';
}

async function renderHome() {
  updateChrome('home');
  const books = await libraryData.loadBooks();
  const volumes = books.volumes;
  const lastRead = readStored('lastRead', null);
  const resume = lastRead ? books.volumes.find((volume) => volume.id === lastRead.volumeId) : null;
  app.innerHTML = `
    <section class="home-shell">
      <div class="home-intro">
        <div><p class="eyebrow">READING ROOM · 12 VOLUMES</p><h1>十二籃</h1><p class="lead">一輯一輯地讀，讓神的話陪伴每天的靈修時刻。</p></div>
        ${resume ? `<a class="resume-link" href="#/article/${encodeURIComponent(lastRead.articleId)}"><small>接續閱讀 · ${esc(resume.title)}</small><strong>${esc(lastRead.title)}　→</strong></a>` : ''}
      </div>
      <div class="search-panel">
        <form class="search-form" id="search-form" action="#/search" autocomplete="off">
          <label class="search-field" for="global-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="M16 16l5 5"></path></svg>
            <input id="global-search" type="search" name="q" placeholder="搜尋文章標題、經文或內容" aria-label="搜尋文章" />
          </label>
          <button class="bookmark-action bookmark-action-primary" type="submit">搜尋</button>
        </form>
      </div>
      <div class="section-heading"><h2>全書輯目</h2><span>共 ${volumes.length} 輯</span></div>
      <div class="volume-grid">${volumes.map((volume, index) => `<a class="volume-card" style="--i:${index}" href="#/volume/${volume.id}"><span class="volume-number">VOLUME ${String(volume.number).padStart(2, '0')}</span><strong>${esc(volume.title)}</strong><span class="volume-meta">${volume.articleCount ? `${volume.articleCount} 篇` : '開啟輯目'} <span aria-hidden="true">↗</span></span></a>`).join('')}</div>
    </section>`;
  const searchForm = document.querySelector('#search-form');
  const searchInput = document.querySelector('#global-search');
  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = searchInput.value.trim();
      location.hash = query ? `#/search/${encodeURIComponent(query)}` : '#/search';
    });
  }
}

async function searchArticles(rawQuery) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];
  const books = await libraryData.loadBooks();
  const volumes = await Promise.all(books.volumes.map(async ({ id }) => libraryData.loadVolume(id)));
  return findMatchingArticles({ query, volumes: volumes.filter(Boolean) }).slice(0, 100);
}

async function renderSearch(query = '') {
  updateChrome('search');
  const normalizedQuery = normalizeSearchText(query);
  const matches = normalizedQuery ? await searchArticles(normalizedQuery) : [];
  app.innerHTML = `<section class="view-shell">
    <a class="back-link" href="#/home">←　回到全書輯目</a>
    <div class="search-panel" style="margin-top:24px;">
      <form class="search-form" id="search-form" action="#/search" autocomplete="off">
        <label class="search-field" for="search-input">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="M16 16l5 5"></path></svg>
          <input id="search-input" type="search" name="q" value="${esc(query)}" placeholder="搜尋文章標題、經文或內容" aria-label="搜尋文章" />
        </label>
        <button class="bookmark-action bookmark-action-primary" type="submit">搜尋</button>
      </form>
    </div>
    ${normalizedQuery ? (matches.length ? `<p class="search-summary">找到 ${matches.length} 篇文章</p>` : '<p class="search-status">找不到符合的文章，請換一個關鍵字再試一次。</p>') : '<p class="search-status">輸入關鍵字，搜尋文章標題、經文或內容。</p>'}
    ${matches.length ? `<div class="article-list">${matches.map(({ volume, article, snippet }) => `<a class="search-result-card" href="#/article/${encodeURIComponent(article.id)}"><span class="search-result-meta">${esc(volume.title)} · ${String(article.number).padStart(2, '0')}</span><strong>${esc(article.title)}</strong>${article.subtitle ? `<span class="search-result-meta">${esc(article.subtitle)}</span>` : ''}<span class="search-result-snippet">${esc(snippet || article.title)}</span></a>`).join('')}</div>` : ''}
  </section>`;
  const form = document.querySelector('#search-form');
  const input = document.querySelector('#search-input');
  if (form && input) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const nextValue = input.value.trim();
      location.hash = nextValue ? `#/search/${encodeURIComponent(nextValue)}` : '#/search';
    });
  }
}

async function renderVolume(id) {
  const volume = await libraryData.loadVolume(id);
  if (!volume) {
    renderNotReady('這一輯的篇目正在整理，請稍後再來。');
    return;
  }
  updateChrome('home');
  app.innerHTML = `<section class="view-shell"><a class="back-link" href="#/home">←　回到全書輯目</a><p class="eyebrow" style="margin-top:34px">VOLUME ${volume.id}</p><h1 class="view-title">${esc(volume.title)}</h1><p class="view-subtitle">${volume.articles.length} 篇文章</p><div class="article-list">${volume.articles.map((article) => `<a class="article-row" href="#/article/${encodeURIComponent(article.id)}"><span class="article-index">${String(article.number).padStart(2, '0')}</span><span class="article-title">${esc(article.title)}</span><span class="article-arrow" aria-hidden="true">↗</span></a>`).join('')}</div></section>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function rememberRead(volume, article) {
  writeStored('lastRead', { volumeId: volume.id, articleId: article.id, title: article.title });
}

function revealReaderFloat() {
  const controls = document.querySelector('.reader-float');
  if (!controls) return;
  controls.classList.add('is-visible');
  window.clearTimeout(readerFloatTimer);
  readerFloatTimer = window.setTimeout(() => controls.classList.remove('is-visible'), readerFloatDuration);
}

function bindArticleSwipeNavigation(reader) {
  let touchStart = null;
  reader.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || event.target.closest('a, button, input, textarea, select')) {
      touchStart = null;
      return;
    }
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  reader.addEventListener('touchend', (event) => {
    if (!touchStart || event.changedTouches.length !== 1) {
      touchStart = null;
      return;
    }
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(deltaX) < 80 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;

    const link = reader.querySelector(deltaX < 0 ? '.pager-link-next' : '.pager-link:not(.pager-link-next)');
    if (!link) return;
    event.preventDefault();
    location.hash = link.getAttribute('href').slice(1);
  }, { passive: false });
  reader.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
}

async function renderArticle(id) {
  const found = await libraryData.findArticle(id);
  if (!found) {
    renderNotReady('找不到這篇文章。');
    return;
  }
  const { volume, article } = found;
  const index = volume.articles.findIndex((item) => item.id === article.id);
  const previous = volume.articles[index - 1];
  const next = volume.articles[index + 1];
  const bookmarks = bookmarkService.list();
  const bookmarked = bookmarks.includes(article.id);
  state.currentArticle = { volume, article };
  rememberRead(volume, article);
  updateChrome('home');
  const paragraphs = article.paragraphs.map((paragraph, paragraphIndex) => `<p data-speech-index="${paragraphIndex}">${esc(paragraph)}</p>`).join('');
  app.innerHTML = `<article class="reader-shell">
    <div class="reader-tools"><a class="back-link" href="#/volume/${volume.id}">←　${esc(volume.title)}篇目</a><div class="reader-actions">
      <button id="bookmark-toggle" type="button" aria-pressed="${bookmarked}" aria-label="${bookmarked ? '移除書籤' : '加入書籤'}" title="${bookmarked ? '移除書籤' : '加入書籤'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.8c0-.9.7-1.6 1.6-1.6h8.8c.9 0 1.6.7 1.6 1.6V21l-6-3.8L6 21V4.8Z"/></svg></button>
      <button id="speech-toggle" type="button" aria-label="開始朗讀" title="開始朗讀"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg></button>
      <button id="font-down" type="button" aria-label="縮小字體" title="縮小字體">A−</button><button id="font-up" type="button" aria-label="放大字體" title="放大字體">A+</button>
    </div></div>
    <header class="article-header"><div class="article-heading-meta"><p class="eyebrow">${esc(volume.title)} · ${String(article.number).padStart(2, '0')}</p><button id="share-article" class="article-share" type="button" aria-label="分享文章" title="分享文章"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.4"></path></svg><span>分享</span></button></div><h1>${esc(article.title)}</h1>${article.subtitle ? `<p class="article-subtitle">${esc(article.subtitle)}</p>` : ''}</header>
    ${article.scripture ? `<p class="scripture">讀經：${esc(article.scripture)}</p>` : ''}
    <span id="speech-status" class="visually-hidden" role="status" aria-live="polite"></span>
    <span id="share-status" class="visually-hidden" role="status" aria-live="polite"></span>
    <div class="article-body">${paragraphs}</div>
    <nav class="reader-pager" aria-label="文章導覽">${previous ? `<a class="pager-link" href="#/article/${encodeURIComponent(previous.id)}"><span>上一篇</span><strong>← ${esc(previous.title)}</strong></a>` : '<span></span>'}<a class="pager-home" href="#/volume/${volume.id}" aria-label="回到${esc(volume.title)}篇目" title="回到${esc(volume.title)}篇目"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5.5 9v11h13V9M9 20v-6h6v6"/></svg></a>${next ? `<a class="pager-link pager-link-next" href="#/article/${encodeURIComponent(next.id)}"><span>下一篇</span><strong>${esc(next.title)} →</strong></a>` : '<span></span>'}</nav>
  </article>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const readerShell = document.querySelector('.reader-shell');
  bindArticleSwipeNavigation(readerShell);
  const readerFloat = document.createElement('nav');
  readerFloat.className = 'reader-float';
  readerFloat.setAttribute('aria-label', '閱讀頁快速導覽');
  readerFloat.innerHTML = `<button class="reader-float-button" type="button" data-scroll="top" aria-label="移至頁面頂端" title="移至頁面頂端">↑</button><button class="reader-float-button" type="button" data-scroll="bottom" aria-label="移至頁面底端" title="移至頁面底端">↓</button>`;
  readerShell.append(readerFloat);
  readerFloat.querySelector('[data-scroll="top"]').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  readerFloat.querySelector('[data-scroll="bottom"]').addEventListener('click', () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
  const speechStop = document.createElement('button');
  speechStop.id = 'speech-stop';
  speechStop.className = 'reader-speech-stop';
  speechStop.type = 'button';
  speechStop.setAttribute('aria-label', '停止朗讀');
  speechStop.title = '停止朗讀';
  speechStop.setAttribute('aria-pressed', 'false');
  speechStop.hidden = true;
  speechStop.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>';
  readerShell.append(speechStop);
  speechStop.addEventListener('click', articleSpeech.stop);
  document.querySelector('#bookmark-toggle').addEventListener('click', toggleBookmark);
  document.querySelector('#share-article').addEventListener('click', shareArticle);
  document.querySelector('#speech-toggle').addEventListener('click', articleSpeech.toggle);
  document.querySelectorAll('.article-body [data-speech-index]').forEach((paragraph) => {
    paragraph.addEventListener('click', () => articleSpeech.startAt(Number(paragraph.dataset.speechIndex)));
  });
  document.querySelector('#font-down').addEventListener('click', () => adjustFont(-1));
  document.querySelector('#font-up').addEventListener('click', () => adjustFont(1));
  applyFontSize();
}

function toggleBookmark() {
  const button = document.querySelector('#bookmark-toggle');
  const id = state.currentArticle.article.id;
  const updated = bookmarkService.toggle(id);
  button.setAttribute('aria-pressed', String(updated.includes(id)));
  button.setAttribute('aria-label', updated.includes(id) ? '移除書籤' : '加入書籤');
  button.title = updated.includes(id) ? '移除書籤' : '加入書籤';
  updateChrome('home');
}

async function shareArticle() {
  const status = document.querySelector('#share-status');
  const { volume, article } = state.currentArticle;
  const url = window.location.href;

  try {
    if (navigator.share) {
      await navigator.share({ title: article.title, text: volume.title, url });
      return;
    }
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url);
    status.textContent = '文章連結已複製。';
  } catch (error) {
    if (error.name === 'AbortError') return;
    status.textContent = '無法分享或複製連結，請複製網址列連結。';
  }
}

function adjustFont(direction) {
  const sizes = ['15px', '16px', '17px', '18px', '20px', '22px', '24px'];
  const current = readStored('settings', { fontSize: '18px' }).fontSize;
  const index = Math.max(0, sizes.indexOf(current));
  const next = sizes[Math.max(0, Math.min(sizes.length - 1, index + direction))];
  const settings = readStored('settings', { fontSize: '18px' });
  settings.fontSize = next;
  writeStored('settings', settings);
  applyFontSize();
}

function applyFontSize() {
  const settings = readStored('settings', { fontSize: '18px' });
  const body = document.querySelector('.article-body');
  if (body) body.style.fontSize = settings.fontSize;
}

async function renderBookmarks() {
  updateChrome('bookmarks');
  const ids = bookmarkService.list();
  const items = [];
  for (const id of ids) {
    const found = await libraryData.findArticle(id);
    if (found) items.push(found);
  }
  app.innerHTML = `<section class="view-shell"><a class="back-link" href="#/home">←　回到全書輯目</a><p class="eyebrow" style="margin-top:34px">YOUR MARKS</p><h1 class="view-title">書籤</h1><div class="bookmark-tools"><button class="bookmark-action" id="bookmark-export" type="button">匯出書籤</button><button class="bookmark-action" id="bookmark-import-trigger" type="button">匯入書籤</button><input class="bookmark-file-input" id="bookmark-import-file" type="file" accept=".json,application/json" aria-label="選擇書籤備份檔"><span id="bookmark-feedback" class="bookmark-feedback" role="status" aria-live="polite"></span></div>${items.length ? `<div class="article-list">${items.map(({ volume, article }) => `<div class="article-row bookmark-row"><a class="bookmark-entry" href="#/article/${encodeURIComponent(article.id)}"><span class="article-index">${volume.id}</span><span class="article-title">${esc(article.title)}</span></a><button class="bookmark-delete" type="button" data-bookmark-id="${esc(article.id)}" data-bookmark-title="${esc(article.title)}" aria-label="刪除「${esc(article.title)}」書籤" title="刪除書籤"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 14h11l1-14M9 7V4h6v3"/></svg></button></div>`).join('')}</div>` : '<p class="empty-state">尚未收藏文章。閱讀時按下書籤圖示，即可在這裡找到它。</p>'}<dialog class="bookmark-dialog" id="bookmark-delete-dialog" aria-labelledby="bookmark-delete-title"><h2 id="bookmark-delete-title">確認刪除書籤</h2><p id="bookmark-delete-message"></p><div class="bookmark-dialog-actions"><button class="bookmark-action" id="bookmark-delete-cancel" type="button">取消</button><button class="bookmark-action bookmark-action-danger" id="bookmark-delete-confirm" type="button">確認</button></div></dialog><dialog class="bookmark-dialog" id="bookmark-import-dialog" aria-labelledby="bookmark-import-title"><h2 id="bookmark-import-title">匯入書籤</h2><p id="bookmark-import-status">已檢查備份內容，請選擇匯入方式。</p><div class="bookmark-dialog-actions"><button class="bookmark-action" id="bookmark-import-cancel" type="button">取消</button><button class="bookmark-action" data-import-mode="merge" type="button">合併書籤</button><button class="bookmark-action bookmark-action-primary" data-import-mode="replace" type="button">取代現有書籤</button></div></dialog></section>`;

  const fileInput = document.querySelector('#bookmark-import-file');
  const feedback = document.querySelector('#bookmark-feedback');
  const dialog = document.querySelector('#bookmark-import-dialog');
  const deleteDialog = document.querySelector('#bookmark-delete-dialog');
  let pendingDeleteId = null;
  document.querySelectorAll('.bookmark-delete').forEach((button) => {
    button.addEventListener('click', () => {
      pendingDeleteId = button.dataset.bookmarkId;
      document.querySelector('#bookmark-delete-message').textContent = `確定要刪除「${button.dataset.bookmarkTitle}」嗎？`;
      deleteDialog.showModal();
    });
  });
  document.querySelector('#bookmark-delete-cancel').addEventListener('click', () => deleteDialog.close());
  deleteDialog.addEventListener('close', () => { pendingDeleteId = null; });
  document.querySelector('#bookmark-delete-confirm').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    bookmarkService.remove(pendingDeleteId);
    deleteDialog.close();
    await renderBookmarks();
    document.querySelector('#bookmark-feedback').textContent = '書籤已刪除。';
  });
  document.querySelector('#bookmark-export').addEventListener('click', async () => {
    try {
      await bookmarkService.exportBackup();
      feedback.textContent = '書籤備份已準備完成。';
    } catch {
      feedback.textContent = '匯出失敗，請稍後再試。';
    }
  });
  document.querySelector('#bookmark-import-trigger').addEventListener('click', () => fileInput.click());
  document.querySelector('#bookmark-import-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { state.pendingBookmarkImport = null; });
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    fileInput.value = '';
    if (!file) return;

    try {
      const data = JSON.parse(await bookmarkService.readFileAsText(file));
      const books = await libraryData.loadBooks();
      const volumes = await Promise.all(books.volumes.map(({ id }) => libraryData.loadVolume(id)));
      const validIds = new Set(volumes.flatMap((volume) => volume?.articles.map(({ id }) => id) || []));
      state.pendingBookmarkImport = bookmarkService.parseImport(data, validIds);
      const { bookmarks } = state.pendingBookmarkImport;
      document.querySelector('#bookmark-import-status').textContent = `找到 ${bookmarks.length} 筆有效書籤，${state.pendingBookmarkImport.skipped} 筆無法辨識。請選擇匯入方式。`;
      dialog.querySelectorAll('[data-import-mode]').forEach((button) => { button.disabled = bookmarks.length === 0; });
      dialog.showModal();
    } catch (error) {
      feedback.textContent = error.message || '無法讀取備份檔。';
    }
  });
  dialog.querySelectorAll('[data-import-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      const { bookmarks, skipped } = state.pendingBookmarkImport;
      const mode = button.dataset.importMode;
      const { added } = bookmarkService.applyImport(bookmarks, mode);
      dialog.close();
      await renderBookmarks();
      document.querySelector('#bookmark-feedback').textContent = `已${mode === 'replace' ? '取代' : '合併'}書籤，新增 ${added} 筆，略過 ${skipped} 筆。`;
    });
  });
}

function renderNotReady(message) {
  updateChrome('home');
  app.innerHTML = `<section class="view-shell"><a class="back-link" href="#/home">←　回到全書輯目</a><p class="empty-state">${esc(message)}</p></section>`;
}

async function route() {
  articleSpeech.stop();
  const [, routeName, id] = location.hash.match(/^#\/(\w+)(?:\/([^/?#]+))?/) || [];
  try {
    await libraryData.loadBooks();
    if (!routeName || routeName === 'home') await renderHome();
    else if (routeName === 'search') await renderSearch(decodeURIComponent(id || ''));
    else if (routeName === 'volume') await renderVolume(decodeURIComponent(id || ''));
    else if (routeName === 'article') await renderArticle(decodeURIComponent(id || ''));
    else if (routeName === 'bookmarks') await renderBookmarks();
    else renderNotReady('此頁面尚未開放。');
    app.focus({ preventScroll: true });
  } catch (error) {
    app.innerHTML = `<section class="view-shell"><p class="empty-state">${esc(error.message)}。請確認使用本機伺服器開啟閱讀器。</p></section>`;
  }
}

document.querySelector('#theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  writeStored('settings', { ...readStored('settings', {}), theme });
});
const savedTheme = readStored('settings', {}).theme;
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
window.addEventListener('hashchange', route);
window.addEventListener('scroll', revealReaderFloat, { passive: true });
route();

window.addEventListener('load', registerServiceWorkerUpdates, { once: true });