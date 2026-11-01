/* Home: scroll-driven intro + work cards.
   The text fills with ink word by word as you scroll; each project card slides up and stacks
   over the previous one. Scroll position <-> reading position is piecewise linear, anchored
   on the word where each card is mentioned. */
(() => {
  const textEl  = document.getElementById('scrolly-text');
  const cardsEl = document.getElementById('scrolly-cards');
  const sticky  = textEl && textEl.parentElement;
  const hint    = document.getElementById('scroll-hint');
  if (!textEl || !cardsEl) return;

  const root   = document.documentElement;
  const cards  = [...cardsEl.children];
  const tail   = cardsEl.appendChild(document.createElement('div'));
  tail.setAttribute('aria-hidden', 'true');
  tail.style.flex = 'none';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp  = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---- split the text into word spans; mentions stay as wrapper elements ---- */
  const words = [];             // { els: [span, ...], v }
  const anchors = [];           // card index -> index of the first word of its mention
  const mentions = [];          // { el, k }
  let leadIndex = 0;            // words before this index are the headline: always black

  const addWords = (text, parent, cardId, glue) => {
    let first = true;
    text.split(/(\s+)/).forEach(tok => {
      if (!tok) return;
      if (/^\s+$/.test(tok)) { parent.appendChild(document.createTextNode(tok)); first = false; return; }
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = tok;
      parent.appendChild(s);
      if (first && glue && words.length) {
        words[words.length - 1].els.push(s);      // punctuation after a mention belongs to its last word
      } else {
        if (cardId != null && anchors[cardId] === undefined) anchors[cardId] = words.length;
        words.push({ els: [s], v: -1 });
      }
      first = false;
    });
  };

  [...textEl.children].forEach((block, bi) => {
    let afterElement = false;
    [...block.childNodes].forEach(node => {
      if (node.nodeType === 3) {
        const frag = document.createDocumentFragment();
        addWords(node.textContent, frag, null, afterElement);
        node.replaceWith(frag);
        afterElement = false;
      } else if (node.nodeType === 1) {
        const text = node.textContent;
        const cardId = node.dataset.card != null ? +node.dataset.card : null;
        node.textContent = '';
        addWords(text, node, cardId, false);
        if (cardId != null) mentions.push({ el: node, k: cardId });
        afterElement = true;
      }
    });
    if (bi === 0) leadIndex = words.length;
  });

  const total = words.length;
  const GRAY = 145, INK = 0;    // --muted (#919191) -> black
  const HOLD = 160;             // px of scroll after the last word turns black
  const HARD_MIN_FONT = 22;     // last resort when even the min font doesn't fit

  /* ---- feel (tuned in the interaction POC) ---- */
  const P = { pace: 60, dwell: 160, start: 0, window: 1, ratio: 1.25, minFont: 28, maxFont: 56 };

  /* ---- layout: fit the text, size the cards, place every card in scroll space ---- */
  let knotsY = [], knotsR = [], rEnd = total, arrivals = [], sectionEnd = 0;

  // largest font in [lo, hi] whose text height fits maxH, or null when even lo doesn't fit
  const fitFont = (lo, hi, maxH) => {
    const h = fs => { textEl.style.fontSize = fs + 'px'; return textEl.offsetHeight; };
    if (h(lo) > maxH) return null;
    if (h(hi) <= maxH) return hi;
    let a = lo, b = hi;
    for (let i = 0; i < 9; i++) { const m = (a + b) / 2; if (h(m) <= maxH) a = m; else b = m; }
    return Math.floor(a * 10) / 10;
  };

  const measure = () => {
    const vh = innerHeight;
    const top = parseFloat(getComputedStyle(sticky).top);
    const bottom = parseFloat(getComputedStyle(root).getPropertyValue('--space-6'));
    const stacked = matchMedia('(max-width: 800px)').matches;
    const avail = vh - top - bottom;
    const colW = cardsEl.clientWidth;

    let fs, copyH, cardH, cardTop = top;
    textEl.style.height = 'auto';

    if (!stacked) {
      const h0 = Math.min(avail, Math.round(colW * P.ratio));
      fs = fitFont(P.minFont, P.maxFont, h0);
      if (fs != null) { copyH = cardH = h0; }
      else {
        textEl.style.fontSize = P.minFont + 'px';
        const need = textEl.offsetHeight;
        if (need <= avail) { fs = P.minFont; copyH = cardH = need; }   // card grows to fit the text
        else {
          fs = fitFont(HARD_MIN_FONT, P.minFont, avail) ?? HARD_MIN_FONT;
          copyH = cardH = avail;
        }
      }
    } else {
      const gap = 12;
      copyH = Math.round(avail * 0.5);
      fs = fitFont(13, 40, copyH) ?? 13;
      cardTop = top + copyH + gap;
      cardH = avail - copyH - gap;
    }

    textEl.style.fontSize = fs + 'px';
    textEl.style.height = copyH + 'px';
    root.style.setProperty('--box-h', cardH + 'px');
    root.style.setProperty('--card-top', cardTop + 'px');

    // a card travels from the viewport's bottom edge up to its stuck position
    const travel = vh - cardTop;
    cardsEl.style.paddingTop = vh + 'px';

    // reading position at which each card starts to enter
    const rs = [];
    cards.forEach((_, k) => {
      const r = k === 0 ? leadIndex : anchors[k] + P.start;
      rs.push(k === 0 ? r : Math.max(r, rs[k - 1] + 1));
    });
    rEnd = total + P.window;

    // slot height = scroll distance from one card's start to the next (constant pace, long enough to land)
    const H = cards.map((_, k) => {
      const last = k === cards.length - 1;
      let h = P.pace * Math.max(0, (last ? rEnd : rs[k + 1]) - rs[k]);
      if (last) h += HOLD;
      return Math.max(h, travel + P.dwell);
    });
    // spacing goes above each card and into a tail spacer: a sticky box can't move past its own bottom margin
    cards.forEach((c, k) => { c.style.marginTop = k === 0 ? '0px' : (H[k - 1] - cardH) + 'px'; });
    tail.style.height = (H[cards.length - 1] - cardH) + 'px';

    // scroll position <-> reading position, piecewise linear between the card starts
    const y0 = cardsEl.getBoundingClientRect().top + scrollY;
    knotsY = []; knotsR = [];
    let y = y0;
    cards.forEach((_, k) => { knotsY.push(y); knotsR.push(rs[k]); y += H[k]; });
    sectionEnd = y + vh;                                    // the cards column ends here (padding included)
    knotsY.push(y - HOLD); knotsR.push(rEnd);
    arrivals = cards.map((_, k) => knotsY[k] + travel);     // scroll position where card k is fully in place
  };

  const rAt = y => {
    if (y <= knotsY[0]) return knotsR[0];
    for (let i = 1; i < knotsY.length; i++) {
      if (y <= knotsY[i]) return knotsR[i - 1] + (knotsR[i] - knotsR[i - 1]) * (y - knotsY[i - 1]) / (knotsY[i] - knotsY[i - 1]);
    }
    return rEnd;
  };
  const yAt = r => {
    if (r <= knotsR[0]) return knotsY[0];
    for (let i = 1; i < knotsR.length; i++) {
      if (r <= knotsR[i]) return knotsY[i - 1] + (knotsY[i] - knotsY[i - 1]) * (r - knotsR[i - 1]) / (knotsR[i] - knotsR[i - 1]);
    }
    return knotsY[knotsY.length - 1];
  };

  /* ---- scroll -> reading position ---- */
  let rTarget = leadIndex, r = leadIndex;
  const readScroll = () => {
    rTarget = rAt(scrollY);
    if (hint) hint.style.opacity = scrollY > 10 ? 0 : 1;
  };

  // re-measure without losing the reader's place: inside the section keep the same spot in the
  // text; below it keep the same distance from the section's end (the page keeps its own scroll)
  const relayout = () => {
    const keep = rTarget;
    const oldEnd = sectionEnd;
    const inside = scrollY < knotsY[knotsY.length - 1];
    measure();
    if (inside) scrollTo(0, yAt(keep));
    else if (oldEnd) scrollTo(0, scrollY + (sectionEnd - oldEnd));
    readScroll();
  };

  /* ---- text colouring ---- */
  const frame = () => {
    r = rTarget;
    for (let i = 0; i < total; i++) {
      const t = i < leadIndex ? 1 : clamp((r - i) / P.window, 0, 1);
      const v = Math.round(GRAY + (INK - GRAY) * t);
      const w = words[i];
      if (w.v !== v) { w.v = v; w.els.forEach(el => el.style.setProperty('--w', `rgb(${v},${v},${v})`)); }
    }
    requestAnimationFrame(frame);
  };

  /* ---- mentions: click scrolls to the connected card, hover colour comes from the card ---- */
  mentions.forEach(m => {
    m.el.style.setProperty('--mention-color', getComputedStyle(cards[m.k]).getPropertyValue('--theme-bg'));
    m.el.addEventListener('click', e => {
      e.preventDefault();
      scrollTo({ top: arrivals[m.k], behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  /* ---- events ---- */
  addEventListener('scroll', readScroll, { passive: true });

  let lastW = innerWidth, lastH = innerHeight, pending = 0;
  addEventListener('resize', () => {
    // ignore the mobile URL bar growing/shrinking while scrolling
    if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 120) return;
    lastW = innerWidth; lastH = innerHeight;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(relayout);
  });
  document.fonts && document.fonts.ready.then(relayout);

  measure();
  readScroll();
  r = rTarget;
  frame();
})();
