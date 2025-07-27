let map = L.map('map').setView([36.7783, -119.4179], 6);
let markerGroup = L.layerGroup().addTo(map);
let facilityTable;
let greenhouseData = [];
const iconCache = {};

// Map tile layers
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

const facilityIconMap = {
  'Greenhouse': 'GH.png',
  'Indoor Farming': 'IF.png',
  'Vertical Farming': 'VF.png'
};

function getCheckedValues(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map(cb => cb.value);
}

function getFacilityIcon(facilityTypes) {
  const key = facilityTypes.sort().join('-');
  if (iconCache[key]) return Promise.resolve(iconCache[key]);

  const size = 64;
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
    const angleStep = (2 * Math.PI) / validImages.length;
    const radius = size / 2.5;

    validImages.forEach((img, index) => {
      const angle = index * angleStep;
      const x = size / 2 + radius * Math.cos(angle) - img.width / 2.5;
      const y = size / 2 + radius * Math.sin(angle) - img.height / 2.5;
      ctx.drawImage(img, x, y, size / 2, size / 2);
    });

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

  for (let type of [...typeSet].sort()) {
    const iconFile = facilityIconMap[type] || '';
    const iconImg = iconFile ? `<img src="icons/${iconFile}" alt="${type}" style="height: 20px; vertical-align: middle; margin-right: 6px;">` : '';
    const checkbox = `<div class="form-check">
    <input class="form-check-input" type="checkbox" value="${type}" id="type-${type}">
    <label class="form-check-label" for="type-${type}">${iconImg}${type}</label>
  </div>`;
    typeContainer.insertAdjacentHTML('beforeend', checkbox);
  }


  for (let crop of [...cropSet].sort()) {
    const checkbox = `<div class="form-check">
      <input class="form-check-input" type="checkbox" value="${crop}" id="crop-${crop}">
      <label class="form-check-label" for="crop-${crop}">${crop}</label>
    </div>`;
    cropContainer.insertAdjacentHTML('beforeend', checkbox);
  }

  document.getElementById('typeCheckboxes').addEventListener('change', updateView);
  document.getElementById('cropCheckboxes').addEventListener('change', updateView);
}

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
    lengthChange: false
  });
}

async function updateView() {
  markerGroup.clearLayers();
  const selectedTypes = getCheckedValues('typeCheckboxes');
  const selectedCrops = getCheckedValues('cropCheckboxes');
  const searchText = document.getElementById('searchInput').value.toLowerCase().trim();

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

  facilityTable.clear().rows.add(filtered).draw();

  for (let facility of filtered) {
    const lat = facility['Latitude'];
    const lon = facility['Longitude'];

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

document.getElementById('toggleDarkMode').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('dark-mode', isDark);
  document.getElementById('toggleDarkMode').textContent = isDark ? '☀️' : '🌙';
});

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('dark-mode') === 'true';
  if (saved) {
    document.body.classList.add('dark-mode');
    document.getElementById('toggleDarkMode').textContent = '☀️';
  }

  fetch('CEA_Facilities_geocoded.json')
    .then(response => response.json())
    .then(data => {
      greenhouseData = data;
      populateFilters();
      setupTable();
      updateView();

      const nameList = greenhouseData.map(row => row["Name of Facility"] || '');
      const cropList = greenhouseData.flatMap(row => row["Crops"] || []);
      const addressList = greenhouseData.map(row => row["Address"] || '');

      const uniqueSuggestions = Array.from(new Set([
        ...nameList,
        ...cropList,
        ...addressList
      ])).filter(x => x && x.trim() !== '');

      $("#searchInput").autocomplete({
        source: uniqueSuggestions.sort(),
        minLength: 1,
        select: function (event, ui) {
          document.getElementById('searchInput').value = ui.item.value;
          updateView();
        }
      });
      document.getElementById('searchInput').addEventListener('input', updateView);
    });
});
