// Reads the UPI transaction ID (UTR) from a payment screenshot, on the phone itself.
// The text-reading tool (Tesseract.js) loads only when someone uses this, the first time about 3-4 MB.
window.GPB_UTR = (function () {
  const LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let loading = null;
  const load = () => loading || (loading = new Promise((ok, bad) => {
    if (window.Tesseract) return ok(window.Tesseract);
    const s = document.createElement('script'); s.src = LIB; s.onload = () => ok(window.Tesseract); s.onerror = bad;
    document.head.appendChild(s);
  }));
  // Picks the 12-digit UTR, preferring numbers that follow words like "UTR", "UPI Ref" or "Transaction ID".
  function findUtr(text) {
    const t = String(text || '').replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').replace(/(?<=\d)[lI|](?=\d)/g, '1');
    const found = [];
    const re = /(?<![\d])(\d(?:[ \-]?\d){11})(?![\d])/g; let m;
    while ((m = re.exec(t))) {
      const num = m[1].replace(/[ \-]/g, ''); if (num.length !== 12) continue;
      const before = t.slice(Math.max(0, m.index - 60), m.index).toLowerCase();
      const score = /utr|upi\s*ref|ref(erence)?\s*(no|number|id)|transaction\s*id|txn\s*id|upi\s*transaction/.test(before) ? 2 : 1;
      found.push({ num, score, i: m.index });
    }
    found.sort((a, b) => b.score - a.score || a.i - b.i);
    return found.length ? found[0].num : '';
  }
  async function read(file, onProgress) {
    const T = await load();
    const { data } = await T.recognize(file, 'eng', { logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(Math.round(m.progress * 100)); } });
    return findUtr(data && data.text);
  }
  return { read, findUtr };
})();
