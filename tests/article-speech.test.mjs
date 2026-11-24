import test from 'node:test';
import assert from 'node:assert/strict';

import { createArticleSpeechController } from '../js/article-speech.js';

test('朗讀進入新段落時會捲動至該段，並尊重減少動態效果設定', () => {
  const paragraphs = [0, 1].map(() => ({
    attributes: new Set(),
    scrollOptions: null,
    setAttribute(name) { this.attributes.add(name); },
    removeAttribute(name) { this.attributes.delete(name); },
    scrollIntoView(options) { this.scrollOptions = options; },
  }));
  const status = { textContent: '' };
  const toggle = { setAttribute() {}, title: '' };
  const stop = { hidden: true, setAttribute() {} };
  let prefersReducedMotion = false;
  let utterance;

  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; }
  };
  globalThis.window = {
    SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
    matchMedia: () => ({ matches: prefersReducedMotion }),
    speechSynthesis: {
      cancel() {},
      getVoices: () => [],
      speak(value) { utterance = value; },
    },
  };
  globalThis.document = {
    querySelector(selector) {
      if (selector === '#speech-status') return status;
      if (selector === '#speech-toggle') return toggle;
      if (selector === '#speech-stop') return stop;
      if (selector.includes('[data-speech-index="0"]')) return paragraphs[0];
      if (selector.includes('[data-speech-index="1"]')) return paragraphs[1];
      return null;
    },
    querySelectorAll() {
      return paragraphs.filter((paragraph) => paragraph.attributes.has('data-speech-active'));
    },
  };

  const controller = createArticleSpeechController(() => ({
    paragraphs: ['第一段', '第二段'],
  }));

  controller.startAt(0);
  assert.equal(status.textContent, '正在從第 1 段開始朗讀。');
  assert.deepEqual(paragraphs[0].scrollOptions, { behavior: 'smooth', block: 'start' });

  prefersReducedMotion = true;
  utterance.onend();
  assert.deepEqual(paragraphs[1].scrollOptions, { behavior: 'auto', block: 'start' });
});
