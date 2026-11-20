function mountAddressSearch(input, searchButton, results, searchContext, onPick, imported = false) {
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
    if (imported && RouteGeocode.hasContactDetails(query)) {
      results.textContent = 'יש להסיר פרטי קשר מהכתובת לפני שליחתה לחיפוש.';
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
      for (const location of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'block w-full text-right rounded-xl border border-slate-200 dark:border-slate-600 px-3 py-3 mt-2';
        const label = RouteGeocode.displayFullAddress(location.fullAddress);
        const duplicate = choices.some(other => other !== location && RouteGeocode.displayFullAddress(other.fullAddress) === label);
        const coordinates = duplicate ? ' (' + location.lat + ', ' + location.lng + ')' : '';
        button.textContent = (location.approximate ? 'ללא מספר בית מאומת · ' : '') + label + coordinates;
        button.addEventListener('click', () => {
          if (!isCurrent() || onPick(location) === false) return;
          input.value = '';
          reset();
        });
        results.append(button);
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
  const rows = new Map();
  let current = null;
  let previewedText = '';
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
    previewedText = '';
    preview.replaceChildren();
    status.textContent = '';
    guidedButton.classList.add('hidden');
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
    }, true);
    function discard() {
      if (current === rows.get(row)) stopGuided();
      reset();
      rows.delete(row);
      row.remove();
      guidedButton.classList.toggle('hidden', !rows.size);
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
    if (message.value === previewedText) return;
    clearPreview();
    previewedText = message.value;
    if (!message.value.trim()) return;
    const deliveries = RouteGeocode.extractDeliveryRows(message.value);
    if (!deliveries.length) {
      status.textContent = 'לא זוהתה כתובת. אפשר להקליד כתובת לבדיקה בשורה למטה.';
      addRow({ address: '' });
      return;
    }
    status.textContent = 'כתובות לבדיקה: ' + deliveries.length + '. בדקו את הכתובות לפני תחילת החיפוש.';
    deliveries.forEach(addRow);
    guidedButton.classList.remove('hidden');
  }
  message.addEventListener('input', showPreview);
  document.getElementById('previewMessageBtn').addEventListener('click', showPreview);
  return {
    resetSearches() {
      stopGuided();
      rows.forEach(entry => entry.reset());
    },
    clear() { message.value = ''; clearPreview(); }
  };
}
