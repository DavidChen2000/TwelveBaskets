// 集中管理書籤資料異動與備份檔讀寫，讓畫面只處理互動流程。
export function createBookmarkService({ readStored, writeStored }) {
  function list() {
    const bookmarks = readStored('bookmarks', []);
    return Array.isArray(bookmarks) ? bookmarks : [];
  }

  function toggle(articleId) {
    const bookmarks = list();
    const updated = bookmarks.includes(articleId)
      ? bookmarks.filter((id) => id !== articleId)
      : [...bookmarks, articleId];
    writeStored('bookmarks', updated);
    return updated;
  }

  function remove(articleId) {
    const updated = list().filter((id) => id !== articleId);
    writeStored('bookmarks', updated);
    return updated;
  }

  async function exportBackup() {
    const exportedAt = new Date().toISOString();
    const file = new File([JSON.stringify({
      app: 'twelve-baskets',
      version: 1,
      exportedAt,
      bookmarks: list(),
    }, null, 2)], `twelve-baskets-bookmarks-${exportedAt.slice(0, 10)}.json`, { type: 'application/json' });

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

  function parseImport(data, validArticleIds) {
    if (data?.app !== 'twelve-baskets' || data.version !== 1 || !Array.isArray(data.bookmarks)) {
      throw new Error('檔案格式不符，請選擇十二籃匯出的 JSON 備份。');
    }
    const importedIds = [...new Set(data.bookmarks.filter((id) => typeof id === 'string'))];
    const bookmarks = importedIds.filter((id) => validArticleIds.has(id));
    return { bookmarks, skipped: data.bookmarks.length - bookmarks.length };
  }

  function applyImport(importedBookmarks, mode) {
    const current = list();
    const updated = mode === 'replace'
      ? importedBookmarks
      : [...new Set([...current, ...importedBookmarks])];
    const added = updated.length - (mode === 'replace' ? 0 : current.length);
    writeStored('bookmarks', updated);
    return { bookmarks: updated, added };
  }

  return { list, toggle, remove, exportBackup, readFileAsText, parseImport, applyImport };
}