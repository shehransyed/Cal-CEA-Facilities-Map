// Initialize Leaflet map centered on California
const map = L.map('map', {
  zoomControl: false // disable default top-left zoom control
}).setView([36.7783, -119.4179], 6);
L.control.zoom({ position: 'topright' }).addTo(map);
const markerGroup = L.layerGroup().addTo(map);

let facilityTable;
let greenhouseData = [];
const iconCache = {};

// Define map base layers
const baseLayers = {
  "Map": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map),
  "Satellite": L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
  }),
  "Topography": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
  })
};
L.control.layers(baseLayers).addTo(map);

// Map facility types to icon filenames
const facilityIconMap = {
  'Greenhouse': 'GH.png',
  'Indoor Farming': 'IF.png',
  'Vertical Farming': 'VF.png'
};

// Utility: Get array of checked checkbox values from a container
function getCheckedValues(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map(cb => cb.value);
}

// Generate or reuse facility icon (single or combined icons)
function getFacilityIcon(facilityTypes) {
  const key = facilityTypes.slice().sort().join('-');
  if (iconCache[key]) return Promise.resolve(iconCache[key]);

  const size = 50;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const loadImages = facilityTypes.map(type => {
    return new Promise(resolve => {
      const img = new Image();
      img.src = `icons/${facilityIconMap[type]}`;
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
    });
  });

  return Promise.all(loadImages).then(images => {
    const validImages = images.filter(img => img);
    if (validImages.length === 1) {
      // Single icon, draw full size centered
      ctx.drawImage(validImages[0], 0, 0, size, size);
    } else if (validImages.length > 1) {
      // Multiple icons: draw smaller icons evenly spaced in a circle
      const angleStep = (2 * Math.PI) / validImages.length;
      const radius = size / 3;

      // Draw circle background for combined icon
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
      ctx.fill();

      validImages.forEach((img, i) => {
        const angle = i * angleStep - Math.PI / 2; // start at top
        const x = size / 2 + radius * Math.cos(angle) - 15; // 30x30 icon
        const y = size / 2 + radius * Math.sin(angle) - 15;
        ctx.drawImage(img, x, y, 30, 30);
      });
    }

    const icon = L.icon({
      iconUrl: canvas.toDataURL(),
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });

    iconCache[key] = icon;
    return icon;
  });
}

// Populate facility type and crop filters dynamically
function populateFilters() {
  const typeSet = new Set();
  const cropSet = new Set();

  greenhouseData.forEach(row => {
    if (row['Latitude'] && row['Longitude']) {
      row['Facility Type'].forEach(t => typeSet.add(t));
      row['Crops'].forEach(c => cropSet.add(c));
    }
  });

  const typeContainer = document.getElementById('typeCheckboxes');
  const cropContainer = document.getElementById('cropCheckboxes');

  typeContainer.innerHTML = '';
  cropContainer.innerHTML = '';

  // Facility type filter with icons
  [...typeSet].sort().forEach(type => {
    const iconFile = facilityIconMap[type] || '';
    const iconImg = iconFile
      ? `<img src="icons/${iconFile}" alt="${type}" style="height: 20px; vertical-align: middle; margin-right: 6px;">`
      : '';
    const checkboxHTML = `
      <div class="form-check">
        <input class="form-check-input" type="checkbox" value="${type}" id="type-${type}">
        <label class="form-check-label" for="type-${type}">${iconImg}${type}</label>
      </div>
    `;
    typeContainer.insertAdjacentHTML('beforeend', checkboxHTML);
  });

  // Crop type filter
  [...cropSet].sort().forEach(crop => {
    const checkboxHTML = `
      <div class="form-check">
        <input class="form-check-input" type="checkbox" value="${crop}" id="crop-${crop}">
        <label class="form-check-label" for="crop-${crop}">${crop}</label>
      </div>
    `;
    cropContainer.insertAdjacentHTML('beforeend', checkboxHTML);
  });

  // Event listeners for filter changes
  typeContainer.addEventListener('change', updateView);
  cropContainer.addEventListener('change', updateView);
}

// Initialize DataTable with columns and renderers
function setupTable() {
  facilityTable = $('#facilityTable').DataTable({
    columns: [
      { data: 'Name of Facility' },
      { data: 'Facility Type', render: arr => arr.join(', ') },
      { data: 'Crops', render: arr => arr.join(', ') },
      { data: 'Contact Number' },
      {
        data: 'E-mail address',
        render: email => email ? `<a href="mailto:${email}">${email}</a>` : ''
      },
      { data: 'Address' },
      {
        data: 'Website',
        render: url => url ? `<a href="${url}" target="_blank">${url}</a>` : ''
      }
    ],
    paging: false,
    info: false,
    searching: false,
    lengthChange: false,
    order: []
  });
}

// Main function: update markers and table based on filters and search
async function updateView() {
  markerGroup.clearLayers();

  const selectedTypes = getCheckedValues('typeCheckboxes');
  const selectedCrops = getCheckedValues('cropCheckboxes');
  const searchText = document.getElementById('searchInput').value.toLowerCase().trim();

  // Filter data by coordinates, filters, and search text (name, crops, address)
  const filtered = greenhouseData.filter(row => {
    if (!row['Latitude'] || !row['Longitude']) return false;

    const typeMatch = selectedTypes.length === 0 || row['Facility Type'].some(t => selectedTypes.includes(t));
    const cropMatch = selectedCrops.length === 0 || row['Crops'].some(c => selectedCrops.includes(c));

    const nameMatch = row['Name of Facility']?.toLowerCase().includes(searchText);
    const cropTextMatch = (row['Crops'] || []).some(c => c.toLowerCase().includes(searchText));
    const addressMatch = row['Address']?.toLowerCase().includes(searchText);

    const searchMatch = !searchText || nameMatch || cropTextMatch || addressMatch;

    return typeMatch && cropMatch && searchMatch;
  });

  // Update DataTable with filtered data
  facilityTable.clear().rows.add(filtered).draw();

  // Add markers for filtered facilities with popups
  for (const facility of filtered) {
    const { Latitude: lat, Longitude: lon } = facility;

    try {
      const icon = await getFacilityIcon(facility['Facility Type']);
      const marker = L.marker([lat, lon], { icon }).addTo(markerGroup);

      const popupContent = `
        <strong>${facility['Name of Facility']}</strong><br>
        <b>Type:</b> ${facility['Facility Type'].join(', ')}<br>
        <b>Crops:</b> ${facility['Crops'].join(', ')}<br>
        <b>Contact:</b> ${facility['Contact Number'] || 'N/A'}<br>
        <b>E-mail:</b> ${facility['E-mail address'] || 'N/A'}<br>
        <b>Address:</b> ${facility['Address'] || 'N/A'}<br>
        <b>Website:</b> ${facility['Website'] ? `<a href="${facility['Website']}" target="_blank">${facility['Website']}</a>` : 'N/A'}
      `;

      marker.bindPopup(popupContent);
    } catch (err) {
      console.warn('Failed to load icon:', facility, err);
    }
  }
}

// Dark mode toggle and persistence
document.getElementById('toggleDarkMode').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('dark-mode', isDark);
  document.getElementById('toggleDarkMode').textContent = isDark ? '☀️' : '🌙';
});

// Initialization on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Restore dark mode from localStorage
  if (localStorage.getItem('dark-mode') === 'true') {
    document.body.classList.add('dark-mode');
    document.getElementById('toggleDarkMode').textContent = '☀️';
  }

  // Add toggle for filter overlay
  const filterOverlay = document.getElementById('filterOverlay');
  const filterToggleBtn = document.getElementById('filterToggleBtn');

  filterToggleBtn.addEventListener('click', () => {
    const expanded = filterOverlay.classList.toggle('expanded');
    filterToggleBtn.setAttribute('aria-expanded', expanded);
    filterToggleBtn.textContent = expanded ? 'Filters ▲' : 'Filters ▼';
  });

  // Load JSON data and initialize app
  fetch('CEA_Facilities_geocoded.json')
    .then(resp => resp.json())
    .then(data => {
      greenhouseData = data;

      populateFilters();
      setupTable();
      updateView();

      // Setup autocomplete search for name, crops, and address
      const nameList = greenhouseData.map(r => r["Name of Facility"] || '');
      const cropList = greenhouseData.flatMap(r => r["Crops"] || []);
      const addressList = greenhouseData.map(r => r["Address"] || '');

      const uniqueSuggestions = Array.from(new Set([...nameList, ...cropList, ...addressList]))
        .filter(x => x && x.trim() !== '')
        .sort();

      $("#searchInput").autocomplete({
        source: uniqueSuggestions,
        minLength: 1,
        select: (event, ui) => {
          document.getElementById('searchInput').value = ui.item.value;
          updateView();
        }
      });

      // Update view as user types (clearing resets to all)
      document.getElementById('searchInput').addEventListener('input', () => {
        updateView();
      });

      // Prevent scroll on filter overlay from zooming the map
      document.getElementById('filterOverlay').addEventListener('wheel', function (e) {
        e.stopPropagation();
      }, { passive: false });

    })
    .catch(err => {
      console.error("Failed to load facility data:", err);
      alert("Error loading facility data.");
    });
});
