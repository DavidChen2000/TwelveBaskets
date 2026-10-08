// 集中管理書目與各輯 JSON 的載入、快取及文章查找。
export function createLibraryData(fetchData = fetch) {
  let books = null;
  const volumes = new Map();

  async function loadBooks() {
    if (books) return books;
    const response = await fetchData('./data/books.json');
    if (!response.ok) throw new Error('無法載入書目資料');
    books = await response.json();
    return books;
  }

  async function loadVolume(id) {
    if (volumes.has(id)) return volumes.get(id);
    const response = await fetchData(`./data/volume${id}.json`);
    if (!response.ok) return null;
    const volume = await response.json();
    volumes.set(id, volume);
    return volume;
  }

  async function findArticle(articleId) {
    const library = await loadBooks();
    for (const entry of library.volumes) {
      const volume = await loadVolume(entry.id);
      const article = volume?.articles.find((item) => item.id === articleId);
      if (article) return { volume, article };
    }
    return null;
  }

  return { loadBooks, loadVolume, findArticle };
}