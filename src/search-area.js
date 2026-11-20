function mountSearchArea(onChange) {
  const city = document.getElementById('searchCity');
  const country = document.getElementById('israelOnlySearch');
  const locate = document.getElementById('locateSearchArea');
  const clear = document.getElementById('clearSearchArea');
  const status = document.getElementById('searchAreaStatus');
  const hint = status.textContent;
  const cityKey = 'route-optimizer-search-city';
  const countryKey = 'route-optimizer-israel-only';
  let position = null;
  let request = 0;

  function remember(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch { /* The area stays usable for this visit. */ }
  }

  try {
    const savedCity = localStorage.getItem(cityKey);
    if (savedCity && RouteGeocode.validSearchCity(savedCity)) city.value = savedCity;
    else if (savedCity) remember(cityKey, '');
    country.checked = localStorage.getItem(countryKey) === 'true';
  } catch { /* Browser storage is optional. */ }

  function updateStatus(message) {
    status.textContent = message || (city.value.trim() ? 'העיר שנבחרה תשמש לחיפוש בכל העצירות.' : hint);
    clear.classList.toggle('hidden', !city.value && !position && !locate.disabled);
  }

  function useTypedCity() {
    request++;
    position = null;
    locate.disabled = false;
    const value = city.value.trim();
    const valid = !value || RouteGeocode.validSearchCity(value);
    remember(cityKey, valid ? value : '');
    updateStatus(valid ? '' : 'הזינו שם עיר בלבד, ללא פרטי קשר או מסירה.');
    onChange();
  }
  city.addEventListener('input', useTypedCity);
  clear.addEventListener('click', () => {
    city.value = '';
    useTypedCity();
    city.focus();
  });
  country.addEventListener('change', () => {
    remember(countryKey, country.checked ? 'true' : '');
    onChange();
  });

  locate.addEventListener('click', () => {
    if (!navigator.geolocation) {
      updateStatus('המיקום אינו זמין בדפדפן הזה. אפשר להזין עיר.');
      return;
    }
    const current = ++request;
    locate.disabled = true;
    updateStatus('ממתינים לאישור ולמיקום מהמכשיר…');

    function failed(error) {
      if (request !== current) return;
      locate.disabled = false;
      updateStatus(error.code === 1 ? 'לא ניתנה הרשאת מיקום. אפשר להזין עיר.' : 'לא התקבל מיקום. אפשר לנסות שוב או להזין עיר.');
    }
    try {
      navigator.geolocation.getCurrentPosition(({coords}) => {
        if (request !== current) return;
        // Keep just the approximate search centre in memory for this visit.
        const round = value => Math.round(value * 100) / 100;
        position = {lat: round(coords.latitude), lng: round(coords.longitude)};
        city.value = '';
        remember(cityKey, '');
        locate.disabled = false;
        updateStatus('חיפוש באזור המיקום שלך פעיל לביקור הזה.');
        onChange();
      }, failed, {enableHighAccuracy: false, timeout: 12000, maximumAge: 300000});
    } catch (error) {
      failed(error);
    }
  });
  updateStatus();
  return () => ({israelOnly: country.checked, area: {city: city.value.trim(), ...position}});
}
