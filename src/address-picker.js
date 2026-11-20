function mountAddressSearch(input, searchButton, results, searchContext, onPick) {
  let version = 0;
  function reset() {
    version++;
    results.replaceChildren();
    searchButton.disabled = false;
  }

  async function search() {
    reset();
    const query = input.value.trim();
    if (!query) {
      results.textContent = 'יש להזין כתובת לחיפוש.';
      input.focus();
      return;
    }
    const requested = version;
    const isCurrent = () => requested === version && input.isConnected;
    searchButton.disabled = true;
    results.textContent = 'מחפש כתובות…';
    try {
      const { israelOnly, area } = searchContext();
      const choices = await RouteGeocode.findAddresses(query, israelOnly, isCurrent, area);
      if (!isCurrent()) return;
      results.replaceChildren();
      if (!choices.length) {
        results.textContent = 'לא נמצאו תוצאות. אפשר לדייק את הכתובת והעיר ולנסות שוב.';
        return;
      }
      if (choices.some(location => location.ambiguous)) {
        const hint = document.createElement('p');
        hint.className = 'mt-2 text-sm font-medium';
        hint.textContent = 'בחיפוש נמצאו נקודות מרוחקות זו מזו. בדקו את השכונה או את הסימון במפה ובחרו את היעד המתאים.';
        results.append(hint);
      }
      for (const location of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'block w-full text-right rounded-xl border border-slate-200 dark:border-slate-600 px-3 py-3 mt-2';
        const label = RouteGeocode.displayFullAddress(location.fullAddress);
        const duplicate = choices.some(other => other !== location && RouteGeocode.displayFullAddress(other.fullAddress) === label);
        const coordinates = duplicate ? ' (' + location.lat + ', ' + location.lng + ')' : '';
        if (location.ambiguous) {
          const area = location.localityDetail || '';
          const place = location.placeName || '';
          const repeatedParts = new Set([area, ...area.split(/[,·/]/).map(part => part.trim()), place]);
          const street = label.split(', ').filter(part => !repeatedParts.has(part)).join(', ');
          const heading = document.createElement('strong');
          heading.className = 'block';
          heading.textContent = area || 'נקודה במפה (' + location.lat + ', ' + location.lng + ')';
          button.append(heading);
          if (street) button.append(document.createTextNode(street + (area ? coordinates : '')));
          if (place && place !== area) {
            const business = document.createElement('span');
            business.className = 'block text-sm';
            business.textContent = 'מקום בכתובת · ' + place;
            button.append(business);
          }
        } else {
          button.textContent = (location.approximate ? 'ללא מספר בית מאומת · ' : '') + label + coordinates;
        }
        if (location.reference || location.referenceMatched) {
          const reference = document.createElement('span');
          reference.className = 'block text-sm text-slate-600 dark:text-slate-300';
          reference.textContent = location.reference
            ? 'נקודה ממאגר כתובות שפורסם ב־2024'
            : 'תואם למאגר כתובות נוסף';
          button.append(reference);
        }
        button.addEventListener('click', () => {
          if (!isCurrent() || onPick(location) === false) return;
          input.value = '';
          reset();
        });
        results.append(button);
        if (location.ambiguous) {
          const map = document.createElement('a');
          map.className = 'inline-flex min-h-[44px] items-center px-3 text-sm underline';
          const url = new URL('https://www.openstreetmap.org/');
          url.searchParams.set('mlat', location.lat);
          url.searchParams.set('mlon', location.lng);
          url.hash = 'map=19/' + location.lat + '/' + location.lng;
          map.href = url.href;
          map.target = '_blank';
          map.rel = 'noopener noreferrer';
          map.textContent = 'בדוק במפה';
          map.setAttribute('aria-label', 'בדוק במפה · ' + (location.localityDetail || label));
          results.append(map);
        }
      }
    } catch (error) {
      if (isCurrent()) results.textContent = error.message || 'חיפוש הכתובות נכשל. אפשר לנסות שוב.';
    } finally {
      if (isCurrent()) searchButton.disabled = false;
    }
  }

  input.addEventListener('input', reset);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      if (!searchButton.disabled) search();
    }
  });
  searchButton.addEventListener('click', search);
  return reset;
}

function mountMessageImport(searchContext, onPick) {
  const message = document.getElementById('importMessage');
  const preview = document.getElementById('importRows');
  const status = document.getElementById('importStatus');
  const guidedButton = document.getElementById('guidedImportBtn');
  const discardButton = document.getElementById('discardImportBtn');
  const rows = new Map();
  let current = null;
  let previewCurrent = false;
  let rowId = 0;

  function stopGuided() {
    if (current) {
      current.reset();
      status.textContent = 'החיפוש ברשימה נעצר. אפשר לחפש כתובת בנפרד או להתחיל שוב.';
    }
    current = null;
    guidedButton.textContent = 'התחל חיפוש ברשימה';
  }

  function searchNext() {
    current = rows.values().next().value;
    if (!current) {
      stopGuided();
      return;
    }
    guidedButton.textContent = 'עצור חיפוש ברשימה';
    status.textContent = 'יש לבחור את התוצאה המתאימה כדי להוסיף אותה ולעבור לכתובת הבאה.';
    current.searchButton.click();
    current.searchButton.scrollIntoView({ block: 'nearest' });
  }

  guidedButton.addEventListener('click', () => {
    if (current) {
      stopGuided();
    } else {
      searchNext();
    }
  });

  function clearPreview() {
    stopGuided();
    rows.forEach(entry => entry.reset());
    rows.clear();
    previewCurrent = false;
    preview.replaceChildren();
    status.textContent = '';
    guidedButton.classList.add('hidden');
  }

  function clearImport() {
    message.value = '';
    clearPreview();
    discardButton.hidden = true;
  }

  function addRow({ address, name, phone, details }) {
    const row = document.createElement('div');
    row.className = 'rounded-xl border border-slate-200 dark:border-slate-600 p-3 mt-3';
    if (name || phone || details) {
      const contact = document.createElement('p');
      contact.className = 'text-sm mb-2';
      contact.textContent = 'פרטי מסירה במכשיר: ' + [name, phone, details].filter(Boolean).join(' · ');
      row.append(contact);
    }
    const input = document.createElement('input');
    input.id = 'import-address-' + (++rowId);
    input.type = 'text';
    input.dir = 'auto';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = address;
    input.placeholder = 'רחוב, מספר ועיר';
    input.className = 'w-full rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2.5 mt-1';
    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.textContent = 'כתובת לחיפוש';
    const searchButton = document.createElement('button');
    searchButton.type = 'button';
    searchButton.className = 'rounded-xl bg-indigo-600 text-white px-4 py-2.5 mt-2';
    searchButton.textContent = 'חפש כתובת זו';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'px-4 py-2.5';
    remove.textContent = 'הסר שורה';
    const results = document.createElement('div');
    results.setAttribute('aria-live', 'polite');
    const reset = mountAddressSearch(input, searchButton, results, searchContext, location => {
      if (!onPick(location)) return false;
      const continueGuided = current === rows.get(row);
      discard();
      status.textContent = preview.children.length ? 'העצירה נוספה. אפשר להמשיך לכתובת הבאה.' : 'כל הכתובות שברשימה טופלו.';
      if (continueGuided) searchNext();
      return true;
    });
    function discard() {
      if (current === rows.get(row)) stopGuided();
      reset();
      rows.delete(row);
      row.remove();
      if (!rows.size) clearImport();
    }
    rows.set(row, {reset, searchButton});
    input.addEventListener('input', () => { if (current) stopGuided(); });
    searchButton.addEventListener('click', () => {
      if (current && current !== rows.get(row)) stopGuided();
    });
    remove.addEventListener('click', discard);
    row.append(label, input, searchButton, remove, results);
    preview.append(row);
  }

  function showPreview() {
    if (previewCurrent) return;
    clearPreview();
    discardButton.hidden = !message.value;
    previewCurrent = true;
    if (!message.value.trim()) return;
    let deliveries;
    try {
      deliveries = RouteGeocode.extractDeliveryRows(message.value);
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    if (!deliveries.length) {
      status.textContent = 'לא זוהתה כתובת. אפשר להקליד כתובת לבדיקה בשורה למטה.';
      addRow({ address: '' });
      return;
    }
    status.textContent = 'כתובות לבדיקה: ' + deliveries.length + '. בדקו את הכתובות לפני תחילת החיפוש.';
    deliveries.forEach(addRow);
    guidedButton.classList.remove('hidden');
  }
  message.addEventListener('input', () => { previewCurrent = false; showPreview(); });
  discardButton.addEventListener('click', () => {
    clearImport();
    status.textContent = 'ההודעה שהודבקה ופרטי המסירה נמחקו מהטופס.';
    message.focus();
  });
  document.getElementById('previewMessageBtn').addEventListener('click', showPreview);
  return {
    resetSearches() {
      stopGuided();
      rows.forEach(entry => entry.reset());
    },
    clear: clearImport
  };
}
