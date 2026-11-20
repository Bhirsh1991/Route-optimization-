(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WazeNavigation = factory();
}(typeof self !== 'undefined' ? self : this, function() {
  function linkFor(point) {
    if (!point || !Number.isFinite(point.lat) || Math.abs(point.lat) > 90 ||
        !Number.isFinite(point.lng) || Math.abs(point.lng) > 180) return null;
    const url = new URL('https://waze.com/ul');
    url.searchParams.set('ll', point.lat + ',' + point.lng);
    url.searchParams.set('navigate', 'yes');
    return url.href;
  }

  function destinations(route, hasFixedStart) {
    return route.slice(hasFixedStart ? 1 : 0);
  }

  function mount(section, save) {
    const status = section.querySelector('[data-waze-status]');
    const controls = section.querySelector('[data-waze-links]');
    const previous = section.querySelector('[data-waze-previous]');
    let stops = [];
    let index = 0;

    function showIndex(next) {
      index = next;
      status.textContent = 'יעד ' + (index + 1) + ' מתוך ' + stops.length + ' · ' + stops[index].address;
      previous.disabled = index === 0;
      [...controls.children].forEach((link, i) => {
        link.classList.toggle('hidden', i !== index && i !== index + 1);
        link.textContent = i === index ? 'נווט ליעד זה ב-Waze' : 'נווט ליעד הבא ב-Waze';
        link.setAttribute('aria-label', link.textContent + ' · ' + stops[i].address);
      });
    }

    previous.addEventListener('click', () => {
      if (index <= 0) return;
      showIndex(index - 1);
      save();
    });

    function clear() {
      stops = [];
      index = 0;
      section.classList.add('hidden');
      controls.replaceChildren();
      status.textContent = '';
    }

    function show(route, hasFixedStart, savedIndex) {
      clear();
      const targets = destinations(route, hasFixedStart);
      const urls = targets.map(linkFor);
      if (!urls.length || urls.includes(null)) return;
      stops = targets;
      urls.forEach((url, i) => {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-indigo-300 px-4 py-2 font-semibold';
        // Each native app link keeps its own destination even as the user advances.
        link.addEventListener('click', () => {
          showIndex(i);
          save();
        });
        controls.append(link);
      });
      showIndex(Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < stops.length ? savedIndex : 0);
      section.classList.remove('hidden');
    }

    return {clear, show, get currentIndex() { return index; }};
  }

  return {linkFor, destinations, mount};
}));
