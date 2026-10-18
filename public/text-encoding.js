(function initializeTextEncoding(globalObject) {
  function decodeUtf8Mojibake(value) {
    const text = String(value ?? '');
    if (!/[\u00d8\u00d9]/.test(text)) {
      return text;
    }

    const codePoints = Array.from(text, (character) => character.charCodeAt(0));
    if (codePoints.some((codePoint) => codePoint > 255)) {
      return text;
    }

    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(codePoints));
      return /[\u0600-\u06ff]/.test(decoded) ? decoded : text;
    } catch {
      return text;
    }
  }

  function normalizeUserNameRecords(records) {
    if (!Array.isArray(records)) {
      return [];
    }

    return records.map((record) => ({
      ...record,
      UserName: decodeUtf8Mojibake(record?.UserName)
    }));
  }

  const api = Object.freeze({
    decodeUtf8Mojibake,
    normalizeUserNameRecords
  });

  if (globalObject) {
    globalObject.MainProjectTextEncoding = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof window !== 'undefined' ? window : null));
