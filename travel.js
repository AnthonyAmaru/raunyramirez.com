(() => {
  const mapElement = document.querySelector("#travel-map");
  if (!mapElement) return;

  const destinations = {
    hawaii: { name: "Hawaii", coordinates: [20.7984, -156.3319], zoom: 7 },
    europe: { name: "Europe", coordinates: [50.1109, 8.6821], zoom: 4 },
    pittsburgh: { name: "Pittsburgh", coordinates: [40.4406, -79.9959], zoom: 10 },
    "las-vegas": { name: "Las Vegas", coordinates: [36.1699, -115.1398], zoom: 10 },
    canada: { name: "Canada", coordinates: [56.1304, -106.3468], zoom: 4 },
  };

  if (!window.L) {
    mapElement.innerHTML = '<p class="map-message">The interactive map could not load.</p>';
    return;
  }

  const map = L.map(mapElement, { worldCopyJump: true, minZoom: 2, zoomControl: true });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
    subdomains: "abcd",
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  const markers = {};
  const bounds = [];
  Object.entries(destinations).forEach(([key, destination], index) => {
    const icon = L.divIcon({ className: "", html: `<span class="travel-marker">${index + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -14] });
    markers[key] = L.marker(destination.coordinates, { icon, title: destination.name }).addTo(map).bindPopup(destination.name);
    bounds.push(destination.coordinates);
  });

  const allBounds = L.latLngBounds(bounds).pad(0.16);
  const buttons = [...document.querySelectorAll("[data-travel-place]")];

  function showAll() {
    buttons.forEach((button) => button.classList.remove("active"));
    map.closePopup();
    map.fitBounds(allBounds, { padding: [24, 24], maxZoom: 3 });
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.travelPlace;
      const destination = destinations[key];
      if (!destination) return;
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      map.flyTo(destination.coordinates, destination.zoom, { duration: 0.8 });
      markers[key].openPopup();
    });
  });

  document.querySelector("#show-all-travel")?.addEventListener("click", showAll);
  showAll();
})();
