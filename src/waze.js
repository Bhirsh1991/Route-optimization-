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

  function restoreProgress(saved, length) {
    const index = saved?.wazeStopIndex;
    if (!Number.isInteger(index) || index < 0 || index >= length) {
      return {wazeStopIndex: 0, wazeLaunched: false, wazeFinished: false};
    }
    return {wazeStopIndex: index, wazeLaunched: saved.wazeLaunched === true,
      wazeFinished: saved.wazeFinished === true && index === length - 1};
  }

  function mount(section, timeline, previous, save) {
    const part = name => section.querySelector('[data-waze-' + name + ']');
    const controls = part('links');
    const bar = part('progress');
    let stops = [];
    let links = [];
    let rows = [];
    let index = 0;
    let launched = false;
    let finished = false;

    const finish = document.createElement('button');
    finish.type = 'button';
    finish.className = 'primary';
    finish.addEventListener('click', () => {
      if (finished) index = 0;
      finished = !finished;
      launched = false;
      refresh();
      save();
      if (finish.hidden) links[index].focus();
    });

    function refresh() {
      const count = (index + 1) + ' מתוך ' + stops.length;
      const [address, ...locality] = stops[index].address.split(/,\s*/u);
      part('role').textContent = finished ? 'הנסיעה הסתיימה' : 'היעד הנוכחי';
      part('count').textContent = count;
      part('address').textContent = finished ? 'המסלול הושלם' : address;
      part('locality').textContent = finished ? stops[index].address : locality.join(', ');
      part('locality').hidden = !part('locality').textContent;
      part('status').textContent = finished ? 'המסלול הושלם' : 'יעד ' + count + ' · ' + stops[index].address;
      previous.hidden = index === 0 && !finished;

      const primary = !launched ? index : index + 1;
      links.forEach((link, i) => {
        link.hidden = finished || (i !== index && i !== index + 1);
        if (link.hidden) return;
        link.className = i === primary ? 'primary' : 'text-button';
        link.style.order = i === primary ? '0' : '1';
        link.textContent = i !== index ? 'ניווט ליעד הבא ב־Waze' : launched ? 'פתיחה חוזרת' : 'ניווט ב־Waze';
        link.setAttribute('aria-label', link.textContent + ' · ' + stops[i].address);
      });
      finish.hidden = !(finished || (launched && index === stops.length - 1));
      finish.textContent = finished ? 'התחלה מחדש' : 'סיום המסלול';
      [...bar.children].forEach((piece, i) => {
        const fraction = Math.floor(index * bar.children.length / stops.length);
        piece.className = finished || i < fraction ? 'done' : i === fraction ? 'active' : '';
      });
      for (const row of rows) {
        const current = !finished && row.target === index;
        const visited = finished || row.target < index;
        row.item.className = current ? 'current' : visited ? 'visited' : 'upcoming';
        if (current) row.item.setAttribute('aria-current', 'step');
        else row.item.removeAttribute('aria-current');
        row.pin.textContent = visited ? '✓' : String(row.target + 1);
        row.state.textContent = current ? 'עכשיו' : row.target < 0 ? 'יציאה' : row.last ? 'סיום' : '';
        row.state.hidden = !row.state.textContent;
      }
    }

    previous.addEventListener('click', () => {
      if (!finished) index = Math.max(0, index - 1);
      launched = finished = false;
      refresh();
      save();
      if (previous.hidden) links[index].focus();
    });

    function clear() {
      stops = [];
      links = [];
      rows = [];
      index = 0;
      launched = finished = false;
      section.classList.add('hidden');
      previous.hidden = true;
      controls.replaceChildren();
      timeline.replaceChildren();
      bar.replaceChildren();
      part('status').textContent = '';
    }

    function show(route, hasFixedStart, saved) {
      clear();
      const targets = destinations(route, hasFixedStart);
      const urls = targets.map(linkFor);
      if (!urls.length || urls.includes(null)) return;
      stops = targets;
      const restored = restoreProgress(saved, stops.length);
      index = restored.wazeStopIndex;
      launched = restored.wazeLaunched;
      finished = restored.wazeFinished;
      links = urls.map((url, i) => {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        // Keep each href stable while the native app receives the original tap.
        link.addEventListener('click', () => {
          index = i;
          launched = true;
          refresh();
          save();
        });
        return link;
      });
      controls.append(...links, finish);
      for (let i = 0; i < Math.min(stops.length, 18); i++) bar.append(document.createElement('i'));
      rows = route.map((point, i) => {
        const item = document.createElement('li');
        const pin = document.createElement('span');
        pin.className = 'pin';
        pin.setAttribute('aria-hidden', 'true');
        const address = document.createElement('span');
        address.className = 'address';
        const street = document.createElement('b');
        street.textContent = point.address;
        address.append(street);
        const state = document.createElement('small');
        state.className = 'state';
        item.append(pin, address, state);
        timeline.append(item);
        return {item, pin, state, target: i - Number(hasFixedStart), last: i === route.length - 1};
      });
      refresh();
      section.classList.remove('hidden');
    }

    return {clear, show, get progress() {
      return {wazeStopIndex: index, wazeLaunched: launched, wazeFinished: finished};
    }};
  }

  return {linkFor, destinations, restoreProgress, mount};
}));
