function mountAddressSearch(input, searchButton, results, israelOnly, onPick, imported = false) {
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
      const choices = await RouteGeocode.findAddresses(query, israelOnly(), isCurrent);
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

function mountMessageImport(israelOnly, onPick) {
  const message = document.getElementById('importMessage');
  const preview = document.getElementById('importRows');
  const status = document.getElementById('importStatus');
  const resets = new Set();
  let rowId = 0;

  function clearPreview() {
    resets.forEach(reset => reset());
    resets.clear();
    preview.replaceChildren();
    status.textContent = '';
  }

  function addRow({ address, name, phone }) {
    const row = document.createElement('div');
    row.className = 'rounded-xl border border-slate-200 dark:border-slate-600 p-3 mt-3';
    if (name || phone) {
      const contact = document.createElement('p');
      contact.className = 'text-sm mb-2';
      contact.textContent = 'פרטי מסירה במכשיר: ' + [name, phone].filter(Boolean).join(' · ');
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
    const reset = mountAddressSearch(input, searchButton, results, israelOnly, location => {
      if (!onPick(location)) return false;
      discard();
      status.textContent = preview.children.length ? 'העצירה נוספה. אפשר להמשיך לכתובת הבאה.' : 'כל הכתובות שברשימה טופלו.';
      return true;
    }, true);
    function discard() {
      reset();
      resets.delete(reset);
      row.remove();
    }
    resets.add(reset);
    remove.addEventListener('click', discard);
    row.append(label, input, searchButton, remove, results);
    preview.append(row);
  }

  message.addEventListener('input', clearPreview);
  document.getElementById('previewMessageBtn').addEventListener('click', () => {
    clearPreview();
    const rows = RouteGeocode.extractDeliveryRows(message.value);
    if (!rows.length) {
      status.textContent = 'לא זוהתה כתובת. אפשר להקליד כתובת לבדיקה בשורה למטה.';
      addRow({ address: '' });
      return;
    }
    status.textContent = 'כתובות לבדיקה: ' + rows.length + '. יש להסיר פרטים אישיים משדה הכתובת לפני החיפוש.';
    rows.forEach(addRow);
  });
  return {
    resetSearches() { resets.forEach(reset => reset()); },
    clear() { message.value = ''; clearPreview(); }
  };
}
