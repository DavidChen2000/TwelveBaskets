const app = document.querySelector('#app');
const storageKey = 'twelveBaskets_';
const state = { books: null, volumes: new Map(), currentArticle: null, pendingBookmarkImport: null };
let readerFloatTimer;
let speechSession = { token: 0, chunks: [], index: 0, charIndex: 0, status: 'idle' };

const readStored = (key, fallback) => {
  try {
    const value = localStorage.getItem(`${storageKey}${key}`);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const writeStored = (key, value) => localStorage.setItem(`${storageKey}${key}`, JSON.stringify(value));
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const volumePath = (id) => `./data/volume${id}.json`;

async function loadBooks() {
  if (state.books) return state.books;
  const response = await fetch('./data/books.json');
  if (!response.ok) throw new Error('無法載入書目資料');
  state.books = await response.json();
  return state.books;
}

async function loadVolume(id) {
  if (state.volumes.has(id)) return state.volumes.get(id);
  const response = await fetch(volumePath(id));
  if (!response.ok) return null;
  const volume = await response.json();
  state.volumes.set(id, volume);
  return volume;
}

function updateChrome(route) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const selected = link.dataset.nav === route;
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const bookmarks = readStored('bookmarks', []);
  document.querySelector('#bookmark-count').textContent = bookmarks.length || '';
}

function renderHome() {
  updateChrome('home');
  const volumes = state.books.volumes;
  const lastRead = readStored('lastRead', null);
  const resume = lastRead ? state.books.volumes.find((volume) => volume.id === lastRead.volumeId) : null;
  app.innerHTML = `
    <section class="home-shell">
      <div class="home-intro">
        <div><p class="eyebrow">READING ROOM · 12 VOLUMES</p><h1>十二籃</h1><p class="lead">一輯一輯地讀，讓神的話陪伴每天的靈修時刻。</p></div>
        ${resume ? `<a class="resume-link" href="#/article/${encodeURIComponent(lastRead.articleId)}"><small>接續閱讀 · ${esc(resume.title)}</small><strong>${esc(lastRead.title)}　→</strong></a>` : ''}
      </div>
      <div class="section-heading"><h2>全書輯目</h2><span>共 ${volumes.length} 輯</span></div>
      <div class="volume-grid">${volumes.map((volume, index) => `<a class="volume-card" style="--i:${index}" href="#/volume/${volume.id}"><span class="volume-number">VOLUME ${String(volume.number).padStart(2, '0')}</span><strong>${esc(volume.title)}</strong><span class="volume-meta">${volume.articleCount ? `${volume.articleCount} 篇` : '開啟輯目'} <span aria-hidden="true">↗</span></span></a>`).join('')}</div>
    </section>`;
}

async function renderVolume(id) {
  const volume = await loadVolume(id);
  if (!volume) {
    renderNotReady('這一輯的篇目正在整理，請稍後再來。');
    return;
  }
  updateChrome('home');
  app.innerHTML = `<section class="view-shell"><a class="back-link" href="#/home">←　回到全書輯目</a><p class="eyebrow" style="margin-top:34px">VOLUME ${volume.id}</p><h1 class="view-title">${esc(volume.title)}</h1><p class="view-subtitle">${volume.articles.length} 篇文章</p><div class="article-list">${volume.articles.map((article) => `<a class="article-row" href="#/article/${encodeURIComponent(article.id)}"><span class="article-index">${String(article.number).padStart(2, '0')}</span><span class="article-title">${esc(article.title)}</span><span class="article-arrow" aria-hidden="true">↗</span></a>`).join('')}</div></section>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function findArticle(articleId) {
  await loadBooks();
  for (const entry of state.books.volumes) {
    const volume = await loadVolume(entry.id);
    const article = volume?.articles.find((item) => item.id === articleId);
    if (article) return { volume, article };
  }
  return null;
}

function rememberRead(volume, article) {
  writeStored('lastRead', { volumeId: volume.id, articleId: article.id, title: article.title });
}

function updateSpeechButton(label) {
  const button = document.querySelector('#speech-toggle');
  if (!button) return;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.setAttribute('aria-pressed', String(speechSession.status === 'speaking'));
}

function stopArticleSpeech() {
  speechSession.token += 1;
  speechSession.chunks = [];
  speechSession.index = 0;
  speechSession.charIndex = 0;
  speechSession.status = 'idle';
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  document.querySelectorAll('.article-body [data-speech-active]').forEach((paragraph) => paragraph.removeAttribute('data-speech-active'));
  updateSpeechButton('開始朗讀');
}

function toggleArticleSpeech() {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    document.querySelector('#speech-status').textContent = '此瀏覽器不支援語音朗讀。';
    return;
  }

  if (speechSession.status === 'speaking') {
    speechSession.token += 1;
    speechSession.status = 'paused';
    window.speechSynthesis.cancel();
    updateSpeechButton('繼續朗讀');
    return;
  }

  if (speechSession.status === 'paused') {
    speechSession.status = 'speaking';
    updateSpeechButton('暫停朗讀');
    speakNextChunk(speechSession.token);
    return;
  }

  startArticleSpeech(0);
}

function startArticleSpeech(paragraphIndex) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    document.querySelector('#speech-status').textContent = '此瀏覽器不支援語音朗讀。';
    return;
  }

  const chunks = state.currentArticle.article.paragraphs
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => text.trim());
  const startIndex = chunks.findIndex(({ index }) => index >= paragraphIndex);
  if (startIndex < 0) return;
  speechSession = { token: speechSession.token + 1, chunks, index: startIndex, charIndex: 0, status: 'speaking' };
  window.speechSynthesis.cancel();
  const token = speechSession.token;
  document.querySelector('#speech-status').textContent = `正在從第 ${paragraphIndex + 1} 段開始朗讀。`;
  updateSpeechButton('暫停朗讀');
  speakNextChunk(token);
}

function setActiveSpeechParagraph(index) {
  document.querySelectorAll('.article-body [data-speech-active]').forEach((paragraph) => paragraph.removeAttribute('data-speech-active'));
  document.querySelector(`.article-body [data-speech-index="${index}"]`)?.setAttribute('data-speech-active', 'true');
}

function speakNextChunk(token) {
  if (token !== speechSession.token || speechSession.status !== 'speaking') return;
  if (speechSession.index >= speechSession.chunks.length) {
    speechSession.status = 'idle';
    setActiveSpeechParagraph(-1);
    updateSpeechButton('開始朗讀');
    document.querySelector('#speech-status').textContent = '朗讀完成。';
    return;
  }

  const chunk = speechSession.chunks[speechSession.index];
  const startCharIndex = speechSession.charIndex;
  setActiveSpeechParagraph(chunk.index);
  const utterance = new SpeechSynthesisUtterance(chunk.text.slice(startCharIndex));
  utterance.lang = 'zh-TW';
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === 'zh-tw')
    || voices.find((voice) => voice.lang.toLowerCase().startsWith('zh'))
    || null;
  utterance.onboundary = (event) => {
    if (token !== speechSession.token || typeof event.charIndex !== 'number') return;
    speechSession.charIndex = startCharIndex + event.charIndex;
  };
  utterance.onend = () => {
    if (token !== speechSession.token) return;
    speechSession.index += 1;
    speechSession.charIndex = 0;
    speakNextChunk(token);
  };
  utterance.onerror = (event) => {
    if (token !== speechSession.token || event.error === 'canceled' || event.error === 'interrupted') return;
    speechSession.status = 'idle';
    setActiveSpeechParagraph(-1);
    updateSpeechButton('開始朗讀');
    document.querySelector('#speech-status').textContent = '朗讀發生問題，請再試一次。';
  };
  window.speechSynthesis.speak(utterance);
}

function revealReaderFloat() {
  const controls = document.querySelector('.reader-float');
  if (!controls) return;
  controls.classList.add('is-visible');
  window.clearTimeout(readerFloatTimer);
  readerFloatTimer = window.setTimeout(() => controls.classList.remove('is-visible'), 931);
}

async function renderArticle(id) {
  const found = await findArticle(id);
  if (!found) {
    renderNotReady('找不到這篇文章。');
    return;
  }
  const { volume, article } = found;
  const index = volume.articles.findIndex((item) => item.id === article.id);
  const previous = volume.articles[index - 1];
  const next = volume.articles[index + 1];
  const bookmarks = readStored('bookmarks', []);
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
    <header class="article-header"><p class="eyebrow">${esc(volume.title)} · ${String(article.number).padStart(2, '0')}</p><h1>${esc(article.title)}</h1>${article.subtitle ? `<p class="article-subtitle">${esc(article.subtitle)}</p>` : ''}</header>
    ${article.scripture ? `<p class="scripture">讀經：${esc(article.scripture)}</p>` : ''}
    <span id="speech-status" class="visually-hidden" role="status" aria-live="polite"></span>
    <div class="article-body">${paragraphs}</div>
    <nav class="reader-pager" aria-label="文章導覽">${previous ? `<a class="pager-link" href="#/article/${encodeURIComponent(previous.id)}"><span>上一篇</span><strong>← ${esc(previous.title)}</strong></a>` : '<span></span>'}<a class="pager-home" href="#/volume/${volume.id}" aria-label="回到${esc(volume.title)}篇目" title="回到${esc(volume.title)}篇目"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5.5 9v11h13V9M9 20v-6h6v6"/></svg></a>${next ? `<a class="pager-link pager-link-next" href="#/article/${encodeURIComponent(next.id)}"><span>下一篇</span><strong>${esc(next.title)} →</strong></a>` : '<span></span>'}</nav>
  </article>`;
  const readerFloat = document.createElement('nav');
  readerFloat.className = 'reader-float';
  readerFloat.setAttribute('aria-label', '閱讀頁快速導覽');
  readerFloat.innerHTML = `<button class="reader-float-button" type="button" data-scroll="top" aria-label="移至頁面頂端" title="移至頁面頂端">↑</button><button class="reader-float-button" type="button" data-scroll="bottom" aria-label="移至頁面底端" title="移至頁面底端">↓</button>`;
  document.querySelector('.reader-shell').append(readerFloat);
  readerFloat.querySelector('[data-scroll="top"]').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  readerFloat.querySelector('[data-scroll="bottom"]').addEventListener('click', () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
  document.querySelector('#bookmark-toggle').addEventListener('click', toggleBookmark);
  document.querySelector('#speech-toggle').addEventListener('click', toggleArticleSpeech);
  document.querySelectorAll('.article-body [data-speech-index]').forEach((paragraph) => {
    paragraph.addEventListener('click', () => startArticleSpeech(Number(paragraph.dataset.speechIndex)));
  });
  document.querySelector('#font-down').addEventListener('click', () => adjustFont(-1));
  document.querySelector('#font-up').addEventListener('click', () => adjustFont(1));
  applyFontSize();
}

function toggleBookmark() {
  const button = document.querySelector('#bookmark-toggle');
  const bookmarks = readStored('bookmarks', []);
  const id = state.currentArticle.article.id;
  const updated = bookmarks.includes(id) ? bookmarks.filter((item) => item !== id) : [...bookmarks, id];
  writeStored('bookmarks', updated);
  button.setAttribute('aria-pressed', String(updated.includes(id)));
  button.setAttribute('aria-label', updated.includes(id) ? '移除書籤' : '加入書籤');
  button.title = updated.includes(id) ? '移除書籤' : '加入書籤';
  updateChrome('home');
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

async function exportBookmarks() {
  const bookmarks = readStored('bookmarks', []);
  const date = new Date().toISOString().slice(0, 10);
  const file = new File([JSON.stringify({
    app: 'twelve-baskets',
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks: Array.isArray(bookmarks) ? bookmarks : [],
  }, null, 2)], `twelve-baskets-bookmarks-${date}.json`, { type: 'application/json' });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '十二籃書籤' });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function renderBookmarks() {
  updateChrome('bookmarks');
  const ids = readStored('bookmarks', []);
  const items = [];
  for (const id of ids) {
    const found = await findArticle(id);
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
    const bookmarks = readStored('bookmarks', []);
    writeStored('bookmarks', bookmarks.filter((id) => id !== pendingDeleteId));
    deleteDialog.close();
    await renderBookmarks();
    document.querySelector('#bookmark-feedback').textContent = '書籤已刪除。';
  });
  document.querySelector('#bookmark-export').addEventListener('click', async () => {
    try {
      await exportBookmarks();
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
      const data = JSON.parse(await readFileAsText(file));
      if (data?.app !== 'twelve-baskets' || data.version !== 1 || !Array.isArray(data.bookmarks)) {
        throw new Error('檔案格式不符，請選擇十二籃匯出的 JSON 備份。');
      }
      const importedIds = [...new Set(data.bookmarks.filter((id) => typeof id === 'string'))];
      const volumes = await Promise.all(state.books.volumes.map(({ id }) => loadVolume(id)));
      const validIds = new Set(volumes.flatMap((volume) => volume?.articles.map(({ id }) => id) || []));
      const bookmarks = importedIds.filter((id) => validIds.has(id));
      state.pendingBookmarkImport = { bookmarks, skipped: data.bookmarks.length - bookmarks.length };
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
      const current = readStored('bookmarks', []);
      const updated = mode === 'replace' ? bookmarks : [...new Set([...current, ...bookmarks])];
      const added = updated.length - (mode === 'replace' ? 0 : current.length);
      writeStored('bookmarks', updated);
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
  stopArticleSpeech();
  const [, routeName, id] = location.hash.match(/^#\/(\w+)(?:\/([^/?#]+))?/) || [];
  try {
    await loadBooks();
    if (!routeName || routeName === 'home') renderHome();
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

function registerServiceWorkerUpdates() {
  if (!('serviceWorker' in navigator)) return;

  const banner = document.querySelector('#update-banner');
  const applyButton = document.querySelector('#update-apply');
  const dismissButton = document.querySelector('#update-dismiss');
  let waitingWorker = null;
  let hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  const showUpdate = (worker) => {
    waitingWorker = worker;
    banner.hidden = false;
  };

  applyButton.addEventListener('click', () => waitingWorker?.postMessage({ type: 'SKIP_WAITING' }));
  dismissButton.addEventListener('click', () => { banner.hidden = true; });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./service-worker.js').then((registration) => {
    if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);

    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing;
      installingWorker?.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdate(installingWorker);
        }
      });
    });
  }).catch(() => {});
}

window.addEventListener('load', registerServiceWorkerUpdates, { once: true });