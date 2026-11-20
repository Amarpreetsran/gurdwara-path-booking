// Roman (English letters) -> Gurmukhi, for names and notes typed on an English keyboard.
// Text already typed in Gurmukhi is left exactly as it is; only words in English letters change.
// 1) whole words from a dictionary of common Punjabi names and words,
// 2) names built from common parts (gur + preet, sukh + winder, ...),
// 3) otherwise phonetic rules.
// Optionally asks Google's transliteration service for a better spelling (falls back to the above).
window.GPB_TRANSLIT = (function () {
  const DICT = {
    singh: 'ਸਿੰਘ', kaur: 'ਕੌਰ', pal: 'ਪਾਲ', dev: 'ਦੇਵ', jit: 'ਜੀਤ', jeet: 'ਜੀਤ', preet: 'ਪ੍ਰੀਤ', deep: 'ਦੀਪ', jot: 'ਜੋਤ', ji: 'ਜੀ', sahib: 'ਸਾਹਿਬ', bibi: 'ਬੀਬੀ', sardar: 'ਸਰਦਾਰ', sardarni: 'ਸਰਦਾਰਨੀ', mata: 'ਮਾਤਾ', bapu: 'ਬਾਪੂ',
    parivar: 'ਪਰਿਵਾਰ', family: 'ਪਰਿਵਾਰ', and: 'ਅਤੇ', of: 'ਦਾ', village: 'ਪਿੰਡ', pind: 'ਪਿੰਡ',
    ardas: 'ਅਰਦਾਸ', langar: 'ਲੰਗਰ', path: 'ਪਾਠ', bhog: 'ਭੋਗ', kirtan: 'ਕੀਰਤਨ', sukhmani: 'ਸੁਖਮਨੀ', akhand: 'ਅਖੰਡ', sehaj: 'ਸਹਿਜ',
    sra: 'ਸਰਾ', sran: 'ਸਰਾਂ', sandhu: 'ਸੰਧੂ', sidhu: 'ਸਿੱਧੂ', gill: 'ਗਿੱਲ', brar: 'ਬਰਾੜ', dhillon: 'ਢਿੱਲੋਂ', grewal: 'ਗਰੇਵਾਲ',
    randhawa: 'ਰੰਧਾਵਾ', bajwa: 'ਬਾਜਵਾ', mann: 'ਮਾਨ', maan: 'ਮਾਨ', virk: 'ਵਿਰਕ', chahal: 'ਚਾਹਲ', dhaliwal: 'ਧਾਲੀਵਾਲ', cheema: 'ਚੀਮਾ',
    sekhon: 'ਸੇਖੋਂ', bhullar: 'ਭੁੱਲਰ', aulakh: 'ਔਲਖ', bains: 'ਬੈਂਸ', johal: 'ਜੌਹਲ', kang: 'ਕੰਗ', khaira: 'ਖਹਿਰਾ', toor: 'ਤੂਰ',
    waraich: 'ਵੜੈਚ', sohal: 'ਸੋਹਲ', hundal: 'ਹੁੰਦਲ', dhindsa: 'ਢੀਂਡਸਾ', ahluwalia: 'ਆਹਲੂਵਾਲੀਆ', bedi: 'ਬੇਦੀ', sodhi: 'ਸੋਢੀ',
    bhatti: 'ਭੱਟੀ', khosa: 'ਖੋਸਾ', nijjar: 'ਨਿੱਜਰ', atwal: 'ਅਟਵਾਲ', pannu: 'ਪੰਨੂ', sangha: 'ਸੰਘਾ', saini: 'ਸੈਣੀ', walia: 'ਵਾਲੀਆ',
    kahlon: 'ਕਾਹਲੋਂ', sahota: 'ਸਹੋਤਾ', thind: 'ਥਿੰਦ', mangat: 'ਮੰਗਤ', pandher: 'ਪੰਧੇਰ', bhangu: 'ਭੰਗੂ', deol: 'ਦਿਓਲ', dhami: 'ਧਾਮੀ',
    sohi: 'ਸੋਹੀ', sekhon: 'ਸੇਖੋਂ', mangat: 'ਮੰਗਤ', jhutti: 'ਝੁੱਟੀ', samra: 'ਸਮਰਾ', kalsi: 'ਕਲਸੀ', ghuman: 'ਘੁੰਮਣ', sarao: 'ਸਰਾਓ', bhupinder: 'ਭੁਪਿੰਦਰ', rupinder: 'ਰੁਪਿੰਦਰ', lovepreet: 'ਲਵਪ੍ਰੀਤ', love: 'ਲਵ', nanak: 'ਨਾਨਕ', gobind: 'ਗੋਬਿੰਦ',
    pathrala: 'ਪਥਰਾਲਾ', bathinda: 'ਬਠਿੰਡਾ', bhatinda: 'ਬਠਿੰਡਾ', sirsa: 'ਸਿਰਸਾ', gosayiana: 'ਗੋਸਾਈਆਣਾ', dadi: 'ਦਾਦੀ', dada: 'ਦਾਦਾ', nani: 'ਨਾਨੀ', nana: 'ਨਾਨਾ',
    benipal: 'ਬੈਨੀਪਾਲ', dhaliwal: 'ਧਾਲੀਵਾਲ', mahal: 'ਮਾਹਲ', jawanda: 'ਜਵੰਦਾ', boparai: 'ਬੋਪਾਰਾਏ', matharu: 'ਮਠਾੜੂ',
    simran: 'ਸਿਮਰਨ', amrit: 'ਅੰਮ੍ਰਿਤ', satnam: 'ਸਤਨਾਮ', avtar: 'ਅਵਤਾਰ', darshan: 'ਦਰਸ਼ਨ', nirmal: 'ਨਿਰਮਲ', kamal: 'ਕਮਲ',
    harman: 'ਹਰਮਨ', ranjit: 'ਰਣਜੀਤ', rajinder: 'ਰਾਜਿੰਦਰ', mohinder: 'ਮਹਿੰਦਰ', mahinder: 'ਮਹਿੰਦਰ', joginder: 'ਜੋਗਿੰਦਰ',
    pardeep: 'ਪ੍ਰਦੀਪ', pradeep: 'ਪ੍ਰਦੀਪ', sandeep: 'ਸੰਦੀਪ', kirpal: 'ਕਿਰਪਾਲ', balbir: 'ਬਲਬੀਰ', amandeep: 'ਅਮਨਦੀਪ',
    gurlal: 'ਗੁਰਲਾਲ', gurbachan: 'ਗੁਰਬਚਨ', harbhajan: 'ਹਰਭਜਨ', gurcharan: 'ਗੁਰਚਰਨ', harnek: 'ਹਰਨੇਕ', prabhjot: 'ਪ੍ਰਭਜੋਤ',
    navjot: 'ਨਵਜੋਤ', jaskaran: 'ਜਸਕਰਨ', karan: 'ਕਰਨ', arjan: 'ਅਰਜਨ', fateh: 'ਫ਼ਤਿਹ', ajit: 'ਅਜੀਤ', jujhar: 'ਜੁਝਾਰ', zorawar: 'ਜ਼ੋਰਾਵਰ'
  };
  const FIRST = { gur: 'ਗੁਰ', har: 'ਹਰ', sukh: 'ਸੁਖ', jas: 'ਜਸ', man: 'ਮਨ', nav: 'ਨਵ', aman: 'ਅਮਨ', amar: 'ਅਮਰ', bal: 'ਬਲ', kul: 'ਕੁਲ',
    param: 'ਪਰਮ', raj: 'ਰਾਜ', sur: 'ਸੁਰ', karam: 'ਕਰਮ', sarab: 'ਸਰਬ', jag: 'ਜਗ', lakh: 'ਲਖ', rup: 'ਰੁਪ', tej: 'ਤੇਜ', prabh: 'ਪ੍ਰਭ',
    amrit: 'ਅੰਮ੍ਰਿਤ', simran: 'ਸਿਮਰਨ', inder: 'ਇੰਦਰ', man: 'ਮਨ', sat: 'ਸਤ', dal: 'ਦਲ', bhupinder: 'ਭੁਪਿੰਦਰ', kar: 'ਕਰ', ran: 'ਰਣ',
    jasvir: 'ਜਸਵੀਰ', sim: 'ਸਿਮ', har: 'ਹਰ', dil: 'ਦਿਲ', gagan: 'ਗਗਨ', jagan: 'ਜਗਨ', ishar: 'ਈਸ਼ਰ', jot: 'ਜੋਤ' };
  const LAST = { preet: 'ਪ੍ਰੀਤ', prit: 'ਪ੍ਰੀਤ', deep: 'ਦੀਪ', dip: 'ਦੀਪ', jeet: 'ਜੀਤ', jit: 'ਜੀਤ', inder: 'ਇੰਦਰ', winder: 'ਵਿੰਦਰ',
    vinder: 'ਵਿੰਦਰ', jinder: 'ਜਿੰਦਰ', minder: 'ਮਿੰਦਰ', pinder: 'ਪਿੰਦਰ', tinder: 'ਤਿੰਦਰ', pal: 'ਪਾਲ', vir: 'ਵੀਰ', veer: 'ਵੀਰ', bir: 'ਬੀਰ',
    jot: 'ਜੋਤ', meet: 'ਮੀਤ', want: 'ਵੰਤ', vant: 'ਵੰਤ', dev: 'ਦੇਵ', nam: 'ਨਾਮ', leen: 'ਲੀਨ', bhajan: 'ਭਜਨ', bachan: 'ਬਚਨ', lal: 'ਲਾਲ',
    charan: 'ਚਰਨ', nek: 'ਨੇਕ', kirat: 'ਕੀਰਤ', noor: 'ਨੂਰ', sharan: 'ਸ਼ਰਨ', deep: 'ਦੀਪ', bans: 'ਬੰਸ', mohan: 'ਮੋਹਨ', karan: 'ਕਰਨ',
    jeev: 'ਜੀਵ', ajit: 'ਅਜੀਤ', bhushan: 'ਭੂਸ਼ਣ', kaur: 'ਕੌਰ', singh: 'ਸਿੰਘ' };

  const CONS = [['chh', 'ਛ'], ['kh', 'ਖ'], ['gh', 'ਘ'], ['ch', 'ਚ'], ['jh', 'ਝ'], ['th', 'ਥ'], ['dh', 'ਧ'], ['ph', 'ਫ'], ['bh', 'ਭ'], ['sh', 'ਸ਼'],
    ['k', 'ਕ'], ['g', 'ਗ'], ['j', 'ਜ'], ['t', 'ਤ'], ['d', 'ਦ'], ['n', 'ਨ'], ['p', 'ਪ'], ['b', 'ਬ'], ['m', 'ਮ'], ['y', 'ਯ'], ['r', 'ਰ'],
    ['l', 'ਲ'], ['v', 'ਵ'], ['w', 'ਵ'], ['s', 'ਸ'], ['h', 'ਹ'], ['f', 'ਫ਼'], ['z', 'ਜ਼'], ['q', 'ਕ'], ['c', 'ਕ'], ['x', 'ਕਸ']];
  const VOW = [['aa', 'ਆ', 'ਾ', 1], ['ai', 'ਐ', 'ੈ', 1], ['au', 'ਔ', 'ੌ', 1], ['ee', 'ਈ', 'ੀ', 1], ['ii', 'ਈ', 'ੀ', 1], ['oo', 'ਊ', 'ੂ', 1],
    ['uu', 'ਊ', 'ੂ', 1], ['a', 'ਅ', '', 0], ['i', 'ਇ', 'ਿ', 0], ['u', 'ਉ', 'ੁ', 0], ['e', 'ਏ', 'ੇ', 1], ['o', 'ਓ', 'ੋ', 1]];
  const PAIRIN = new Set(['k', 'kh', 'g', 'gh', 'p', 'ph', 'b', 'bh', 't', 'th', 'd', 'dh']);
  const NASAL_NEXT = /^(k|kh|g|gh|ch|chh|j|jh|t|th|d|dh|p|ph|b|bh|s|sh)/;

  function units(w) {
    const out = []; let i = 0;
    while (i < w.length) {
      let hit = null;
      for (const [r, g, s, long] of VOW) if (w.startsWith(r, i)) { hit = { t: 'V', r, g, s, long }; break; }
      if (!hit) for (const [r, g] of CONS) if (w.startsWith(r, i)) { hit = { t: 'C', r, g }; break; }
      if (!hit) hit = { t: 'X', r: w[i], g: w[i] };
      out.push(hit); i += hit.r.length;
    }
    return out;
  }
  function rules(word, notEnd) {
    let w = notEnd ? word.toLowerCase() : word.toLowerCase().replace(/er$/, 'ar').replace(/ey$/, 'e');
    const u = units(w); let out = ''; let prevLong = false;
    for (let i = 0; i < u.length; i++) {
      const x = u[i], nx = u[i + 1], nn = u[i + 2];
      if (x.t === 'V') {
        const afterC = i > 0 && u[i - 1].t === 'C';
        if (!afterC) out += x.g;
        else if (!notEnd && x.r === 'a' && i === u.length - 1) out += 'ਾ';
        else if (!notEnd && x.r === 'u' && i === u.length - 1) out += 'ੂ';
        else if (!notEnd && x.r === 'i' && i === u.length - 1) out += 'ੀ';
        else out += x.s;
        prevLong = !!x.long || (x.r === 'a' && i === u.length - 1);
        continue;
      }
      if (x.t === 'X') { out += x.g; continue; }
      // nasal n/m before a consonant: tippi or bindi
      if ((x.r === 'n' || x.r === 'm') && i > 0 && nx && nx.t === 'C' && NASAL_NEXT.test(nx.r) && !(nx.r === x.r)) {
        out += prevLong ? 'ਂ' : 'ੰ'; continue;
      }
      if (x.r === 'n' && i === u.length - 1 && i > 0 && u[i - 1].t === 'V' && u[i - 1].long && /^(aa|o|e|ai)$/.test(u[i - 1].r) && false) { out += 'ਂ'; continue; }
      // double consonant: addak
      if (nx && nx.t === 'C' && nx.r === x.r && i > 0) { out += 'ੱ'; continue; }
      // consonant + r + vowel: pairi rara
      if (PAIRIN.has(x.r) && nx && nx.t === 'C' && nx.r === 'r' && nn && nn.t === 'V' && i === 0) { out += x.g + '੍ਰ'; i++; prevLong = false; continue; }
      out += x.g; prevLong = false;
    }
    return out;
  }
  // Joining parts: an independent vowel after a consonant becomes a vowel sign (ਤੇਜ + ਇੰਦਰ -> ਤੇਜਿੰਦਰ).
  const SIGN = { 'ਅ': '', 'ਆ': 'ਾ', 'ਇ': 'ਿ', 'ਈ': 'ੀ', 'ਉ': 'ੁ', 'ਊ': 'ੂ', 'ਏ': 'ੇ', 'ਐ': 'ੈ', 'ਓ': 'ੋ', 'ਔ': 'ੌ' };
  const join = (a, b) => (/[\u0A15-\u0A39\u0A59-\u0A5E]$/.test(a) && SIGN[b[0]] !== undefined) ? a + SIGN[b[0]] + b.slice(1) : a + b;
  const byLen = o => Object.entries(o).sort((a, b) => b[0].length - a[0].length);
  const FIRST_L = byLen(FIRST), LAST_L = byLen(LAST);
  function parts(w) {
    // try FIRST + LAST (longest parts first)
    for (const [f, fg] of FIRST_L) {
      if (!w.startsWith(f)) continue;
      const rest = w.slice(f.length);
      if (LAST[rest]) return join(fg, LAST[rest]);
      if (DICT[rest]) return join(fg, DICT[rest]);
    }
    for (const [l, lg] of LAST_L) if (w.endsWith(l) && w.length > l.length + 1) {
      const head = w.slice(0, -l.length);
      return join(DICT[head] || FIRST[head] || rules(head, true), lg);
    }
    return null;
  }
  function word(w) {
    const k = w.toLowerCase();
    return DICT[k] || parts(k) || rules(k);
  }
  const hasLatin = s => /[A-Za-z]/.test(s);
  function convert(text) {
    return String(text || '').replace(/[A-Za-z]+/g, m => word(m));
  }
  // Better spelling from Google's transliteration service, when reachable (times out quickly).
  const cache = {};
  async function suggest(text) {
    const t = String(text || '').trim();
    if (!hasLatin(t)) return t;
    if (cache[t]) return cache[t];
    const local = convert(t);
    try {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 1500);
      const words = t.split(/(\s+)/);
      const latin = words.filter(x => /^[A-Za-z]+$/.test(x));
      if (!latin.length) return local;
      const res = await Promise.all(latin.map(x => fetch('https://inputtools.google.com/request?itc=pa-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&text=' + encodeURIComponent(x), { signal: ctl.signal }).then(r => r.json())));
      clearTimeout(timer);
      const map = {};
      latin.forEach((x, i) => { const r = res[i]; if (r && r[0] === 'SUCCESS' && r[1][0] && r[1][0][1][0]) map[x] = r[1][0][1][0]; });
      // Dictionary words win (e.g. surnames with fixed spellings); Google fills the rest.
      const out = words.map(x => /^[A-Za-z]+$/.test(x) ? (DICT[x.toLowerCase()] || map[x] || word(x)) : x).join('');
      cache[t] = out; return out;
    } catch (e) { return local; }
  }
  return { convert, suggest, hasLatin };
})();
