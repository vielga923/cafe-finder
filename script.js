/* Morning Paper design: this file keeps live Places data quick and legible, translating Google results into an editorial cafe guide without losing map context. */
(() => {
  'use strict';

  const fallbackCafes = [
    { id: 'fallback-1', name: 'Morrow & Finch', address: 'North Loop · 0.4 mi', rating: 4.8, distance: 0.4, category: 'Quiet work', note: 'Window seats, low music, excellent pour-over.', tags: ['Wi-Fi', 'Outlets'], open: true, photo: '/manus-storage/cafe-finder-cafe-interior_f6e423b8.jpg', position: { lat: 44.978, lng: -93.271 } },
    { id: 'fallback-2', name: 'Grove Street Coffee', address: 'Warehouse District · 0.7 mi', rating: 4.7, distance: 0.7, category: 'All-day coffee', note: 'A sunny terrace for taking the long way home.', tags: ['Patio', 'Brunch'], open: true, photo: '/manus-storage/cafe-finder-cafe-terrace_3a6cb3a5.jpg', position: { lat: 44.974, lng: -93.265 } },
    { id: 'fallback-3', name: 'Soft Corner Bakehouse', address: 'Old Market · 1.1 mi', rating: 4.9, distance: 1.1, category: 'Pastry stop', note: 'Cardamom buns, bright tables, no laptop pressure.', tags: ['Bakery', 'Takeaway'], open: true, photo: '/manus-storage/cafe-finder-cafe-bakery_8f94a9df.jpg', position: { lat: 44.969, lng: -93.279 } }
  ];

  const FAVORITES_KEY = 'cuppa-favorites-v1';
  function readFavorites() {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []);
    } catch { return new Set(); }
  }
  const state = { cafes: [], center: { lat: 44.9778, lng: -93.265 }, map: null, markers: [], service: null, activeFilter: 'near', sort: 'recommended', query: '', saved: readFavorites(), usingFallback: false, searchTimer: null };
  const $ = (selector) => document.querySelector(selector);
  const resultList = $('#result-list');
  const searchInput = $('#search-input');
  const notice = $('#notice');

  function showNotice(message, tone = 'info') {
    notice.hidden = false;
    notice.className = `notice ${tone}`;
    notice.textContent = message;
  }

  function hideNotice() { notice.hidden = true; notice.textContent = ''; }

  function setSaved(id) {
    if (state.saved.has(id)) state.saved.delete(id); else state.saved.add(id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.saved]));
    $('#saved-count').textContent = state.saved.size;
    renderResults();
  }

  function getPhoto(place) {
    if (place.photos && place.photos[0]) return place.photos[0].getUrl({ maxWidth: 500, maxHeight: 360 });
    return '/manus-storage/cafe-finder-map-texture_1c1c6026.jpg';
  }

  function deriveTags(place) {
    const tags = [];
    const searchable = `${place.name || ''} ${(place.types || []).join(' ')}`.toLowerCase();
    if (searchable.includes('bakery') || searchable.includes('bake')) tags.push('Bakery');
    if (searchable.includes('brunch')) tags.push('Brunch');
    if (searchable.includes('patio') || searchable.includes('terrace') || searchable.includes('outdoor')) tags.push('Outdoor');
    if (place.website || searchable.includes('cafe')) tags.push('Wi-Fi');
    if (!tags.length) tags.push('Coffee');
    return tags.slice(0, 2);
  }

  function normalizePlace(place) {
    const position = place.geometry?.location;
    const lat = typeof position?.lat === 'function' ? position.lat() : position?.lat;
    const lng = typeof position?.lng === 'function' ? position.lng() : position?.lng;
    const distance = state.center && lat && lng ? haversine(state.center.lat, state.center.lng, lat, lng) : 0;
    const open = place.opening_hours?.isOpen?.() ?? place.opening_hours?.open_now ?? false;
    const rating = Number(place.rating || 0);
    return { id: place.place_id || crypto.randomUUID(), name: place.name || 'Unnamed cafe', address: place.vicinity || place.formatted_address || 'Nearby', rating, distance, category: categoryFor(place), note: rating ? `${rating.toFixed(1)} Google rating · ${place.user_ratings_total || 0} local ratings.` : 'A nearby coffee stop from Google Places.', tags: deriveTags(place), open, photo: getPhoto(place), position: { lat, lng }, url: place.place_id ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${place.place_id}` : '#' };
  }

  function categoryFor(place) {
    const types = (place.types || []).join(' ');
    if (types.includes('bakery')) return 'Pastry stop';
    if (types.includes('restaurant')) return 'All-day coffee';
    return 'Coffee nearby';
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const radians = (value) => value * Math.PI / 180;
    const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
    return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function filteredCafes() {
    const query = state.query.trim().toLowerCase();
    let cafes = state.cafes.filter((cafe) => !query || `${cafe.name} ${cafe.address} ${cafe.category} ${cafe.tags.join(' ')}`.toLowerCase().includes(query));
    if (state.activeFilter === 'saved') cafes = cafes.filter((cafe) => state.saved.has(cafe.id));
    if (state.activeFilter === 'open') cafes = cafes.filter((cafe) => cafe.open);
    if (state.activeFilter === 'quiet') cafes = cafes.filter((cafe) => /quiet|work|calm|study|laptop|coffee/i.test(`${cafe.name} ${cafe.note} ${cafe.category}`));
    if (state.activeFilter === 'outdoor') cafes = cafes.filter((cafe) => cafe.tags.some((tag) => /outdoor|patio/i.test(tag)));
    return cafes.sort((a, b) => state.sort === 'distance' ? a.distance - b.distance : state.sort === 'rating' ? b.rating - a.rating : state.sort === 'name' ? a.name.localeCompare(b.name) : b.rating - a.rating || a.distance - b.distance);
  }

  function renderResults() {
    const cafes = filteredCafes();
    $('#result-count').textContent = cafes.length;
    $('#result-filter-label').textContent = state.activeFilter === 'near' ? 'NEAR ME' : state.activeFilter.toUpperCase();
    if (!cafes.length) { resultList.innerHTML = '<div class="empty-state"><h3>No exact match yet.</h3><p>Try a neighborhood, “quiet,” or “bakery.”</p></div>'; updateMarkers([]); return; }
    resultList.innerHTML = cafes.map((cafe, index) => `<article class="cafe-card" style="--delay:${index * 45}ms" data-id="${cafe.id}"><div class="cafe-image-wrap"><img src="${cafe.photo}" alt="${escapeHtml(cafe.name)} cafe" loading="lazy"><span class="distance-badge">${cafe.distance.toFixed(1)} mi</span></div><div class="cafe-details"><div class="card-topline"><span class="category-label">${escapeHtml(cafe.category)}</span><button class="save-button ${state.saved.has(cafe.id) ? 'saved' : ''}" data-save="${cafe.id}" aria-label="${state.saved.has(cafe.id) ? 'Remove' : 'Save'} ${escapeHtml(cafe.name)}">${state.saved.has(cafe.id) ? '♥' : '♡'}</button></div><h3>${escapeHtml(cafe.name)}</h3><p class="neighborhood">${escapeHtml(cafe.address)} <span>·</span> ${walkTime(cafe.distance)}</p><p class="cafe-note">${escapeHtml(cafe.note)}</p><div class="card-meta"><span class="rating"><span>★</span> ${cafe.rating ? cafe.rating.toFixed(1) : 'New'}</span>${cafe.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}<span class="open-status"><span class="open-dot"></span> ${cafe.open ? 'Open now' : 'Hours unavailable'}</span></div></div></article>`).join('');
    resultList.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); setSaved(button.dataset.save); }));
    resultList.querySelectorAll('.cafe-card').forEach((card) => card.addEventListener('click', () => focusCafe(card.dataset.id)));
    updateMarkers(cafes);
  }

  function walkTime(distance) { return `${Math.max(2, Math.round(distance * 15))} min walk`; }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

  function updateMarkers(cafes) {
    if (!state.map || !window.google) return;
    state.markers.forEach((marker) => { marker.map = null; });
    state.markers = cafes.map((cafe) => {
      const marker = new google.maps.marker.AdvancedMarkerElement({ map: state.map, position: cafe.position, title: cafe.name });
      marker.addListener('click', () => focusCafe(cafe.id));
      return marker;
    });
  }

  function focusCafe(id) {
    const cafe = state.cafes.find((item) => item.id === id);
    if (!cafe || !state.map) return;
    state.map.panTo(cafe.position); state.map.setZoom(16);
    document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function initMap() {
    state.map = new google.maps.Map($('#google-map'), { center: state.center, zoom: 14, mapId: 'DEMO_MAP_ID', mapTypeControl: false, streetViewControl: false, fullscreenControl: false, zoomControl: true, clickableIcons: false });
    state.service = new google.maps.places.PlacesService(state.map);
    searchPlaces();
  }

  function loadMaps() {
    if (window.google?.maps) { initMap(); return; }
    const base = import.meta.env.VITE_FRONTEND_FORGE_API_URL || document.querySelector('meta[name="maps-proxy-url"]').content || 'https://forge.manus.ai';
    const key = import.meta.env.VITE_FRONTEND_FORGE_API_KEY || document.querySelector('meta[name="maps-api-key"]').content;
    const script = document.createElement('script');
    script.src = `${base.replace(/\/$/, '')}/v1/maps/proxy/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=places,marker,geometry&callback=initCuppaMap`;
    script.async = true; script.defer = true;
    script.onerror = () => { state.usingFallback = true; state.cafes = fallbackCafes; renderResults(); showNotice('Google Places could not load, so the guide is showing local fallback content. Try refreshing to reconnect.', 'warning'); };
    document.head.appendChild(script);
  }

  async function searchPlaces() {
    if (!state.service) return;
    const request = { location: state.center, radius: 5000, type: 'cafe', keyword: state.query || undefined };
    state.service.nearbySearch(request, (results, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) { state.cafes = []; renderResults(); showNotice('No Google Places cafes matched this search. Try a broader neighborhood or mood.', 'info'); return; }
      state.cafes = results.slice(0, 16).map(normalizePlace); hideNotice(); renderResults();
      $('#map-area').textContent = state.query ? `Cafes near “${state.query}”` : 'Cafes near you';
      $('#map-summary').textContent = `${state.cafes.length} places from Google Places within 5 miles.`;
    });
  }

  function locate() {
    if (!navigator.geolocation) { showNotice('Location is not available in this browser. Search a neighborhood instead.', 'warning'); return; }
    $('#location-button').querySelector('span:last-child').textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition((position) => { state.center = { lat: position.coords.latitude, lng: position.coords.longitude }; $('#location-button').querySelector('span:last-child').textContent = 'Near your location'; if (state.map) { state.map.setCenter(state.center); state.map.setZoom(14); } searchPlaces(); }, () => { $('#location-button').querySelector('span:last-child').textContent = 'Use my location'; showNotice('We could not access your location. Search still works without it.', 'warning'); }, { enableHighAccuracy: true, timeout: 7000 });
  }

  function bindEvents() {
    $('#location-button').addEventListener('click', locate); $('#recenter-button').addEventListener('click', locate); $('#map-expand').addEventListener('click', () => window.open(`https://www.google.com/maps/search/cafes/@${state.center.lat},${state.center.lng},14z`, '_blank', 'noopener'));
    $('#filter-toggle').addEventListener('click', () => $('#filter-row').classList.toggle('expanded'));
    $('#saved-nav').addEventListener('click', (event) => { event.preventDefault(); const savedButton = document.querySelector('[data-filter="saved"]'); document.querySelectorAll('[data-filter]').forEach((item) => item.classList.remove('active')); savedButton.classList.add('active'); state.activeFilter = 'saved'; renderResults(); $('#explore').scrollIntoView({ behavior: 'smooth' }); });
    document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-filter]').forEach((item) => item.classList.remove('active')); button.classList.add('active'); state.activeFilter = button.dataset.filter; renderResults(); }));
    $('#sort-select').addEventListener('change', (event) => { state.sort = event.target.value; renderResults(); });
    searchInput.addEventListener('input', () => { state.query = searchInput.value; clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => state.service ? searchPlaces() : renderResults(), 360); });
  }

  window.initCuppaMap = initMap;
  window.addEventListener('storage', (event) => { if (event.key !== FAVORITES_KEY) return; state.saved = readFavorites(); $('#saved-count').textContent = state.saved.size; renderResults(); });
  window.addEventListener('DOMContentLoaded', () => { $('#saved-count').textContent = state.saved.size; bindEvents(); loadMaps(); });
})();
