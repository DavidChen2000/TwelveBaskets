export function normalizeSearchText(value = '') {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[~!@#$%^&*()_+=\[\]{};:'"<>?,./\\|`]/g, ' ')
    .replace(/[\u3000\s]+/g, '')
    .trim()
    .toLowerCase();
}

function buildSnippet(text, query) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const index = raw.toLowerCase().indexOf(query);
  if (index < 0) return raw.slice(0, 120);
  const start = Math.max(0, index - 28);
  const end = Math.min(raw.length, index + query.length + 90);
  return raw.slice(start, end).trim();
}

export function findMatchingArticles({ query, volumes }) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const matches = volumes.flatMap((volume) => {
    return volume.articles.map((article) => {
      const title = normalizeSearchText(article.title);
      const subtitle = normalizeSearchText(article.subtitle || '');
      const scripture = normalizeSearchText(article.scripture || '');
      const paragraphs = (article.paragraphs || []).map((paragraph) => normalizeSearchText(paragraph));

      let score = 0;
      if (title.includes(normalizedQuery)) score += 100;
      if (subtitle.includes(normalizedQuery)) score += 40;
      if (scripture.includes(normalizedQuery)) score += 30;

      const paragraphIndex = paragraphs.findIndex((paragraph) => paragraph.includes(normalizedQuery));
      if (paragraphIndex >= 0) score += 25 + Math.max(0, 10 - paragraphIndex);
      if (score <= 0) return null;

      const snippetSource = normalizeSearchText(
        paragraphs[paragraphIndex] || scripture || subtitle || article.title || ''
      );

      return {
        volume,
        article,
        score,
        snippet: buildSnippet(snippetSource, normalizedQuery),
      };
    }).filter(Boolean);
  });

  return matches.sort((left, right) => right.score - left.score || left.article.title.localeCompare(right.article.title));
}
