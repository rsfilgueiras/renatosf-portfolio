/* Case pages: the RF logo behaves like Back when the visitor came from the home page,
   so the home page returns exactly as it was left (scroll position, card state). */
(() => {
  const brand = document.querySelector('.brand');
  if (!brand) return;

  const cameFromHome = () => {
    try {
      const ref = new URL(document.referrer);
      return ref.origin === location.origin && !ref.pathname.includes('/projects/');
    } catch { return false; }
  };

  brand.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (history.length > 1 && cameFromHome()) {
      e.preventDefault();
      history.back();
    }
  });
})();
