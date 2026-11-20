function mountAiImport(searchContext, hasDraft, onRoute) {
  const dialog = document.getElementById('aiImportDialog');
  const form = document.getElementById('aiImportForm');
  const city = document.getElementById('aiImportCity');
  const list = document.getElementById('aiImportRows');
  const submit = document.getElementById('aiImportRun');
  const status = document.getElementById('aiImportStatus');
  const areaNote = document.getElementById('aiImportArea');
  const locate = document.getElementById('aiImportLocate');
  const keepRepeats = document.getElementById('aiImportKeepRepeats');
  let rows = [];
  let sourceHash = '';
  let generation = 0;
  let routingController;
  let nearby;
  let allowRepeatedStops = false;

  function resetRepeatApproval() {
    allowRepeatedStops = false;
    keepRepeats.hidden = true;
  }

  function busy(active) {
    submit.disabled = active;
    locate.disabled = active;
    keepRepeats.disabled = active;
    city.readOnly = active;
    for (const row of rows) {
      row.input.readOnly = active;
      row.results.querySelectorAll('button').forEach(button => { button.disabled = active; });
    }
  }

  function cancelWork() {
    generation++;
    routingController?.abort();
    busy(false);
  }

  function dismiss() {
    cancelWork();
    if (sourceHash && location.hash === sourceHash) {
      history.replaceState(history.state, '', location.pathname + location.search);
    }
    sourceHash = '';
    dialog.close();
  }
  document.getElementById('aiImportClose').addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });

  function resetRow(row) {
    resetRepeatApproval();
    row.selected = null;
    row.results.replaceChildren();
  }

  function describeArea() {
    const {israelOnly} = searchContext();
    const hints = [];
    if (!city.value.trim() && Number.isFinite(nearby?.lat) && Number.isFinite(nearby?.lng)) {
      hints.push('החיפוש יתמקד באזור המיקום שאישרתם.');
    }
    if (israelOnly) hints.push('החיפוש מוגבל לישראל לפי ההגדרה שלכם.');
    areaNote.textContent = hints.join(' ');
    areaNote.hidden = !hints.length;
  }
  city.addEventListener('input', () => {
    cancelWork();
    nearby = null;
    rows.forEach(resetRow);
    status.textContent = '';
    describeArea();
  });
  locate.addEventListener('click', () => {
    if (!navigator.geolocation) {
      status.textContent = 'המיקום אינו זמין בדפדפן הזה. אפשר להזין עיר.';
      return;
    }
    const token = ++generation;
    busy(true);
    status.textContent = 'ממתינים לאישור ולמיקום מהמכשיר…';
    const failed = error => {
      if (token !== generation) return;
      busy(false);
      status.textContent = error.code === 1 ? 'לא ניתנה הרשאת מיקום. אפשר להזין עיר.'
        : 'לא התקבל מיקום. אפשר להזין עיר או לנסות שוב.';
    };
    try {
      navigator.geolocation.getCurrentPosition(({coords}) => {
        if (token !== generation) return;
        nearby = {lat: Number(coords.latitude.toFixed(2)), lng: Number(coords.longitude.toFixed(2))};
        city.value = '';
        rows.forEach(resetRow);
        status.textContent = '';
        busy(false);
        describeArea();
      }, failed, {enableHighAccuracy: false, timeout: 12000, maximumAge: 300000});
    } catch (error) { failed(error); }
  });

  function addRow(point, index) {
    const item = document.createElement('li');
    const label = document.createElement('label');
    const input = document.createElement('input');
    const results = document.createElement('div');
    input.type = 'text';
    input.dir = 'auto';
    input.autocomplete = 'off';
    input.maxLength = 160;
    input.id = 'ai-address-' + index;
    input.value = point.address;
    label.htmlFor = input.id;
    label.textContent = point.role === 'start' ? 'נקודת יציאה' : point.role === 'end' ? 'יעד סיום' : 'עצירת ביניים';
    label.textContent = (index + 1) + '. ' + label.textContent;
    results.className = 'ai-choices';
    item.append(label, input, results);
    list.append(item);
    const row = {role: point.role, input, results, selected: null};
    input.addEventListener('input', () => {
      cancelWork();
      resetRow(row);
      status.textContent = '';
    });
    return row;
  }

  function readLink() {
    cancelWork();
    resetRepeatApproval();
    let request;
    let error;
    try { request = AIRoute.parseLink(location.hash); } catch (e) { error = e; }
    if (!request && !error) {
      if (dialog.open) dialog.close();
      sourceHash = '';
      return;
    }
    sourceHash = location.hash;
    list.replaceChildren();
    rows = [];
    form.hidden = Boolean(error);
    status.textContent = error ? error.message : '';
    if (request) {
      const {area} = searchContext();
      nearby = area;
      city.value = request.city || area.city || '';
      describeArea();
      document.getElementById('aiDraftNotice').hidden = !hasDraft();
      rows = AIRoute.pointsFor(request).map(addRow);
    }
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }

  function currentRequest() {
    const request = {city: city.value.trim(), stops: []};
    for (const row of rows) {
      const value = row.input.value.trim();
      if (!value) {
        row.input.focus();
        throw new Error('חסרה כתובת. השלימו את כל השדות לפני החיפוש.');
      }
      if (row.role === 'stop') request.stops.push(value);
      else request[row.role] = value;
    }
    AIRoute.pointsFor(request); // Revalidate edited fields before any network request.
    return request;
  }

  function select(row, choice) {
    row.selected = {...choice}; // A separate visit may deliberately use the same pin.
    row.results.textContent = 'נבחרה: ' + choice.address + (choice.reference ? ' · מאגר הכתובות מ־2024' : '');
  }

  function showChoices(row, choices) {
    row.results.replaceChildren();
    if (!choices.length) {
      row.results.textContent = 'לא נמצאה התאמה. אפשר לערוך את הכתובת ולנסות שוב.';
      row.input.focus();
      return;
    }
    const hint = document.createElement('p');
    hint.textContent = 'בחרו את המיקום המתאים כדי להמשיך בחישוב.';
    row.results.append(hint);
    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      let description = RouteGeocode.displayFullAddress(choice.fullAddress || choice.address);
      if (choice.approximate) description = 'ללא מספר בית מאומת · ' + description;
      if (choice.ambiguous || choices.some(other => other !== choice && (other.fullAddress || other.address) === (choice.fullAddress || choice.address))) {
        description += ' (' + choice.lat + ', ' + choice.lng + ')';
      }
      button.textContent = description;
      button.addEventListener('click', () => {
        select(row, choice);
        submit.focus();
        run();
      });
      row.results.append(button);
      if (choice.ambiguous || choices.length > 1) {
        const map = document.createElement('a');
        const url = new URL('https://www.openstreetmap.org/');
        url.searchParams.set('mlat', choice.lat);
        url.searchParams.set('mlon', choice.lng);
        url.hash = 'map=19/' + choice.lat + '/' + choice.lng;
        map.href = url.href;
        map.target = '_blank';
        map.rel = 'noopener noreferrer';
        map.className = 'text-button';
        map.textContent = 'בדיקה במפה';
        map.setAttribute('aria-label', 'בדיקה במפה · ' + description);
        row.results.append(map);
      }
    }
    row.results.querySelector('button').focus();
  }

  async function run() {
    if (!dialog.open || submit.disabled) return;
    const token = ++generation;
    const current = () => dialog.open && token === generation;
    let timer;
    let controller;
    try {
      const request = currentRequest();
      busy(true);
      const context = searchContext();
      const area = request.city ? {city: request.city} : nearby || {};
      for (const [index, row] of rows.entries()) {
        if (row.selected) continue;
        status.textContent = 'בודק כתובת ' + (index + 1) + ' מתוך ' + rows.length + '…';
        const address = row.input.value.trim();
        let choices = await AIRoute.referenceChoices(address, request.city);
        if (!current()) return;
        if (!choices.length) choices = await RouteGeocode.findAddresses(address, context.israelOnly, current, area);
        if (!current()) return;
        const exact = AIRoute.autoPick(choices, address, request.city);
        if (!exact) {
          busy(false);
          showChoices(row, choices);
          status.textContent = 'נדרשת בדיקה של כתובת ' + (index + 1) + '.';
          return;
        }
        select(row, exact);
      }
      const points = rows.map(row => row.selected);
      const repeats = AIRoute.duplicateStops(AIRoute.pointsFor(request), points);
      if (repeats.length && !allowRepeatedStops) {
        const numbers = repeats.map(i => i + 1).join(', ');
        status.textContent = 'הכתובות בשורות ' + numbers + ' חוזרות על מיקום שכבר מופיע במסלול. אפשר לערוך אותן או לאשר ביקורים נפרדים.';
        busy(false);
        keepRepeats.hidden = false;
        keepRepeats.focus();
        return;
      }
      status.textContent = 'מחשב מסלול לפי זמני הנסיעה בכביש…';
      controller = new AbortController();
      routingController = controller;
      timer = setTimeout(() => controller.abort(), 20000);
      const durations = await routing.getOSRMTable(points, controller.signal);
      if (!current()) return;
      const {order} = AIRoute.solve(request, points, {code: 'Ok', durations}, {allowRepeatedStops});
      const byRole = role => rows.filter(row => row.role === role).map(row => row.selected);
      const route = PlannerState.snapshot(byRole('start')[0] || null, byRole('stop'), byRole('end')[0] || null,
        order.map(index => points[index]));
      if (PlannerState.restoreOrder(route).length !== points.length) throw new Error('לא התקבל מסלול עם כל העצירות.');
      dismiss();
      onRoute(route);
    } catch (error) {
      if (current()) status.textContent = controller?.signal.aborted ? 'שירות הניתוב לא ענה בזמן. אפשר לנסות שוב.'
        : error instanceof TypeError ? 'לא ניתן להגיע לשירות המפות. בדקו את החיבור ונסו שוב.'
        : error.message || 'חישוב המסלול נכשל. אפשר לנסות שוב.';
    } finally {
      clearTimeout(timer);
      if (routingController === controller) routingController = undefined;
      if (current()) busy(false);
    }
  }
  keepRepeats.addEventListener('click', () => {
    allowRepeatedStops = true;
    keepRepeats.hidden = true;
    run();
  });
  form.addEventListener('submit', event => { event.preventDefault(); run(); });
  window.addEventListener('hashchange', readLink);
  readLink();
}
