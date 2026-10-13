//將讀經區塊 class="scripture" 的經文自動轉換為可點擊的連結，連結至恢復本網站的對應經文頁面
const books = [
  ['創', '創世記'], ['出', '出埃及記'], ['利', '利未記'], ['民', '民數記'], ['申', '申命記'],
  ['書', '約書亞記'], ['士', '士師記'], ['得', '路得記'], ['撒上', '撒母耳記上'], ['撒下', '撒母耳記下'],
  ['王上', '列王紀上'], ['王下', '列王紀下'], ['代上', '歷代志上'], ['代下', '歷代志下'], ['拉', '以斯拉記'],
  ['尼', '尼希米記'], ['斯', '以斯帖記'], ['伯', '約伯記'], ['詩', '詩篇'], ['箴', '箴言'],
  ['傳', '傳道書'], ['歌', '雅歌'], ['賽', '以賽亞書'], ['耶', '耶利米書'], ['哀', '耶利米哀歌'],
  ['結', '以西結書'], ['但', '但以理書'], ['何', '何西阿書'], ['珥', '約珥書'], ['摩', '阿摩司書'],
  ['俄', '俄巴底亞書'], ['拿', '約拿書'], ['彌', '彌迦書'], ['鴻', '那鴻書'], ['哈', '哈巴谷書'],
  ['番', '西番雅書'], ['該', '哈該書'], ['亞', '撒迦利亞書'], ['瑪', '瑪拉基書'], ['太', '馬太福音'],
  ['可', '馬可福音'], ['路', '路加福音'], ['約', '約翰福音'], ['徒', '使徒行傳'], ['羅', '羅馬書'],
  ['林前', '哥林多前書'], ['林後', '哥林多後書'], ['加', '加拉太書'], ['弗', '以弗所書'], ['腓', '腓立比書'],
  ['西', '歌羅西書'], ['帖前', '帖撒羅尼迦前書'], ['帖後', '帖撒羅尼迦後書'], ['提前', '提摩太前書'],
  ['提後', '提摩太後書'], ['多', '提多書'], ['門', '腓利門書'], ['來', '希伯來書'], ['雅', '雅各書'],
  ['彼前', '彼得前書'], ['彼後', '彼得後書'], ['約一', '約翰一書'], ['約二', '約翰二書'],
  ['約三', '約翰三書'], ['猶', '猶大書'], ['啟', '啟示錄'],
];

const aliases = books.flatMap(([abbreviation, fullName], index) => [
  { name: abbreviation, bookId: index + 1 },
  { name: fullName, bookId: index + 1 },
  ...(abbreviation === '太' ? [{ name: '馬太', bookId: index + 1 }] : []),
]).sort((first, second) => second.name.length - first.name.length);

const numeralPattern = '[零〇一二兩三四五六七八九十百千廿]+|\\d+';
const aliasPattern = aliases.map(({ name }) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const citationPattern = new RegExp(
  `(${aliasPattern})(${numeralPattern})(?:章|篇|:)?(${numeralPattern})(?:(~|～|至|到|-)\\s*(${numeralPattern}))?`,
  'g',
);

function parseNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if ([...value].every((character) => character in digits)) {
    return Number([...value].map((character) => digits[character]).join(''));
  }

  const units = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let current = 0;
  for (const character of value) {
    if (character === '廿') {
      total += 20;
    } else if (character in digits) {
      current = digits[character];
    } else {
      total += (current || 1) * units[character];
      current = 0;
    }
  }
  return total + current;
}

export function linkScripture(scripture) {
  let result = '';
  let lastIndex = 0;

  for (const match of scripture.matchAll(citationPattern)) {
    const [text, name, chapterText, verseText] = match;
    const index = match.index;
    let chapter = parseNumber(chapterText);
    const verse = parseNumber(verseText);
    if (!chapter || !verse) continue;

    let book = aliases.find((alias) => alias.name === name);
    if (name === '約二' && chapterText === '一') {
      // "約二一4" is commonly used for John 21:4, not 2 John 1:4.
      book = aliases.find((alias) => alias.name === '約');
      chapter = 21;
    }
    const href = `https://www.recoveryversion.com.tw/verse/${book.bookId}/${chapter}?verse=${verse}`;
    result += `${escapeHtml(scripture.slice(lastIndex, index))}<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
    lastIndex = index + text.length;
  }

  return result + escapeHtml(scripture.slice(lastIndex));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}
