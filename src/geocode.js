(function(root, factory){
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var exports = factory();
    root.detectLanguage = exports.detectLanguage;
    root.fetchAddressSuggestions = exports.fetchAddressSuggestions;
    root.updateSuggestions = exports.updateSuggestions;
    root.geocodeAddress = exports.geocodeAddress;
  }
}(typeof self !== 'undefined' ? self : this, function(){
  function detectLanguage(text) {
    return /[\u0590-\u05FF]/.test(text) ? 'he' : 'en';
  }

  function shortenAddress(displayName) {
    return displayName.split(',').slice(0, 3).join(',').trim();
  }

  async function fetchAddressSuggestions(query, lang) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=${lang}&q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Suggestion fetch failed');
      }
      const data = await response.json();
      return data.map(item => ({
        full: item.display_name,
        short: shortenAddress(item.display_name)
      }));
    } catch (e) {
      console.error('Autocomplete error:', e);
      return [];
    }
  }

  async function geocodeAddress(address, lang = 'en') {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=${lang}&q=${encodeURIComponent(address)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Nominatim geocoding failed with status: ${response.status}`);
      }
      const data = await response.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), address: data[0].display_name };
      }
      return null;
    } catch (error) {
      console.error('Geocoding failed:', error);
      return null;
    }
  }

  async function updateSuggestions(inputElem, listElem) {
    const q = inputElem.value.trim();
    if (q.length < 2) {
      listElem.innerHTML = '';
      return;
    }
    const lang = detectLanguage(q);
    const suggestions = await fetchAddressSuggestions(q, lang);
    listElem.innerHTML = suggestions
      .map(s => `<option value="${s.full}" label="${s.short}"></option>`)
      .join('');
    if (suggestions.length > 0) {
      const val = inputElem.value;
      inputElem.value = '';
      inputElem.value = val;
    }
  }

  return { detectLanguage, fetchAddressSuggestions, geocodeAddress, updateSuggestions };
}));
