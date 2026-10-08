// 封裝文章朗讀狀態、瀏覽器語音 API 與目前段落的提示狀態。
export function createArticleSpeechController(getCurrentArticle) {
  let speechSession = { token: 0, chunks: [], index: 0, charIndex: 0, status: 'idle' };

  function updateSpeechButton() {
    const toggle = document.querySelector('#speech-toggle');
    const toggleLabel = speechSession.status === 'speaking'
      ? '暫停朗讀'
      : speechSession.status === 'paused' ? '繼續朗讀' : '開始朗讀';
    if (toggle) {
      toggle.setAttribute('aria-label', toggleLabel);
      toggle.title = toggleLabel;
      toggle.setAttribute('aria-pressed', String(speechSession.status === 'speaking'));
    }
    const button = document.querySelector('#speech-stop');
    if (!button) return;
    button.hidden = speechSession.status !== 'speaking';
    button.setAttribute('aria-pressed', String(speechSession.status === 'speaking'));
  }

  function stop() {
    speechSession.token += 1;
    speechSession.chunks = [];
    speechSession.index = 0;
    speechSession.charIndex = 0;
    speechSession.status = 'idle';
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    document.querySelectorAll('.article-body [data-speech-active]').forEach((paragraph) => paragraph.removeAttribute('data-speech-active'));
    updateSpeechButton();
  }

  function toggle() {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      document.querySelector('#speech-status').textContent = '此瀏覽器不支援語音朗讀。';
      return;
    }

    if (speechSession.status === 'speaking') {
      speechSession.token += 1;
      speechSession.status = 'paused';
      window.speechSynthesis.cancel();
      updateSpeechButton();
      return;
    }

    if (speechSession.status === 'paused') {
      speechSession.status = 'speaking';
      updateSpeechButton();
      speakNextChunk(speechSession.token);
      return;
    }

    startAt(0);
  }

  function startAt(paragraphIndex) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      document.querySelector('#speech-status').textContent = '此瀏覽器不支援語音朗讀。';
      return;
    }

    const article = getCurrentArticle();
    if (!article) return;
    const chunks = article.paragraphs
      .map((text, index) => ({ text, index }))
      .filter(({ text }) => text.trim());
    const startIndex = chunks.findIndex(({ index }) => index >= paragraphIndex);
    if (startIndex < 0) return;
    speechSession = { token: speechSession.token + 1, chunks, index: startIndex, charIndex: 0, status: 'speaking' };
    window.speechSynthesis.cancel();
    const token = speechSession.token;
    document.querySelector('#speech-status').textContent = `正在從第 ${paragraphIndex + 1} 段開始朗讀。`;
    updateSpeechButton();
    speakNextChunk(token);
  }

  function setActiveParagraph(index) {
    document.querySelectorAll('.article-body [data-speech-active]').forEach((paragraph) => paragraph.removeAttribute('data-speech-active'));
    document.querySelector(`.article-body [data-speech-index="${index}"]`)?.setAttribute('data-speech-active', 'true');
  }

  function speakNextChunk(token) {
    if (token !== speechSession.token || speechSession.status !== 'speaking') return;
    if (speechSession.index >= speechSession.chunks.length) {
      speechSession.status = 'idle';
      setActiveParagraph(-1);
      updateSpeechButton();
      document.querySelector('#speech-status').textContent = '朗讀完成。';
      return;
    }

    const chunk = speechSession.chunks[speechSession.index];
    const startCharIndex = speechSession.charIndex;
    setActiveParagraph(chunk.index);
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
      setActiveParagraph(-1);
      updateSpeechButton();
      document.querySelector('#speech-status').textContent = '朗讀發生問題，請再試一次。';
    };
    window.speechSynthesis.speak(utterance);
  }

  return { stop, toggle, startAt };
}