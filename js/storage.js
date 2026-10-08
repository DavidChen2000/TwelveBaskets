// 封裝應用程式的 localStorage 前綴、JSON 解析與讀取失敗預設值。
export function createStorage(storage, prefix = 'twelveBaskets_') {
  function readStored(key, fallback) {
    try {
      const value = storage.getItem(`${prefix}${key}`);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeStored(key, value) {
    storage.setItem(`${prefix}${key}`, JSON.stringify(value));
  }

  return { readStored, writeStored };
}