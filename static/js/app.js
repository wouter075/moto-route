// MotoRoute Application Logic

// Initialize Map
// Start centered in Europe as a default, users can pan
const map = L.map('map', {
    zoomControl: false // We will add it to the bottom right
}).setView([46.8182, 8.2275], 6); // Centered on Switzerland

// Add Zoom control to bottom right
L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// Initialize Leaflet-Geoman controls
map.pm.addControls({
    position: 'topright',
    drawMarker: false,
    drawCircleMarker: false,
    drawPolygon: false,
    drawRectangle: false,
    drawCircle: false,
    drawText: false,
    editMode: true,
    dragMode: true,
    cutPolygon: true,
    removalMode: true,
});

// Add CartoDB Voyager Tile Layer (Lighter, highly detailed, premium look)
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// State
let waypoints = [];
let routeLayer = null;
let markers = [];
let importedRoutesGroup = L.featureGroup().addTo(map);
let importedRoutes = [];
let trafficLayerGroup = L.layerGroup().addTo(map);
let showingTraffic = false;

// Toast Notifications
function showToast(message, type = 'info', duration = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const msgDiv = document.createElement('div');
    msgDiv.innerHTML = message;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    };
    
    toast.appendChild(msgDiv);
    toast.appendChild(closeBtn);
    container.appendChild(toast);
    
    if (duration > 0) {
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.animation = 'fadeOut 0.3s ease forwards';
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }
}

// DOM Elements
const waypointsListEl = document.getElementById('waypoints-list');
const btnCalculate = document.getElementById('btn-calculate');
const btnClear = document.getElementById('btn-clear');
const btnExportGpx = document.getElementById('btn-export-gpx');
const loadingSpinner = document.getElementById('loading-spinner');
const errorMessage = document.getElementById('error-message');
const routeStats = document.getElementById('route-stats');
const statDistance = document.getElementById('stat-distance');
const statTime = document.getElementById('stat-time');
const selectProfile = document.getElementById('route-profile');

const searchInput = document.getElementById('search-input');
const btnSearch = document.getElementById('btn-search');

const btnTraffic = document.getElementById('btn-traffic');

const rtSearchInput = document.getElementById('rt-search-input');
const btnRtSearch = document.getElementById('btn-rt-search');
const btnRtClear = document.getElementById('btn-rt-clear');

const roundtripKm = document.getElementById('roundtrip-km');
const btnRoundtrip = document.getElementById('btn-roundtrip');

const gpxUpload = document.getElementById('gpx-upload');
const importedRoutesList = document.getElementById('imported-routes-list');
const btnImportClear = document.getElementById('btn-import-clear');

const simplifySlider = document.getElementById('simplify-slider');
const simplifyVal = document.getElementById('simplify-val');
const simplifyLabels = ['Off', 'Low', 'Medium', 'High'];
const simplifyTolerances = [0, 0.0005, 0.002, 0.008]; // Tolerance in degrees

simplifySlider.addEventListener('input', (e) => {
    simplifyVal.innerText = simplifyLabels[e.target.value];
});

const exportFilenameInput = document.getElementById('export-filename');
exportFilenameInput.addEventListener('input', (e) => {
    let val = e.target.value.trim();
    if (!val) val = 'motoroute';
    document.getElementById('btn-export-gpx').download = val + '.gpx';
});

// UI Interactions
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
});

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// Handle Map Clicks
map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    addWaypoint(lat, lng);
});

function addWaypoint(lat, lng) {
    waypoints.push({ lat, lng });
    updateUI();
    drawMarkers();
    
    if (waypoints.length >= 2) {
        btnCalculate.disabled = false;
        // Auto-recalculate the route instantly when a point is added
        const lonlats = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
        calculateAndDrawRoute(lonlats);
    }
}

function drawMarkers() {
    // Clear existing markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    
    waypoints.forEach((wp, index) => {
        let color = '#3b82f6'; // default blue
        let label = index + 1;
        
        if (index === 0) {
            color = '#10b981'; // start green
            label = 'S';
        } else if (index === waypoints.length - 1 && waypoints.length > 1) {
            color = '#ef4444'; // end red
            label = 'E';
        }
        
        const markerHtml = `
            <div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.5);">
                ${label}
            </div>
        `;
        
        const icon = L.divIcon({
            html: markerHtml,
            className: 'custom-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        
        const marker = L.marker([wp.lat, wp.lng], { 
            icon: icon,
            draggable: true 
        }).addTo(map);
        
        // Handle dragging to move waypoints
        marker.on('dragend', function(event) {
            const position = marker.getLatLng();
            waypoints[index] = { lat: position.lat, lng: position.lng };
            updateUI();
            drawMarkers();
            if (waypoints.length >= 2) {
                const lonlats = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
                calculateAndDrawRoute(lonlats);
            }
        });
        
        markers.push(marker);
    });
}

// Drag and drop state for waypoint reordering
let draggedItemIndex = null;

function handleDragStart(e) {
    draggedItemIndex = parseInt(this.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    this.style.opacity = '0.4';
}

function handleDragOver(e) {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.stopPropagation();
    this.classList.remove('drag-over');
    
    const targetIndex = parseInt(this.dataset.index);
    if (draggedItemIndex !== null && draggedItemIndex !== targetIndex) {
        // Reorder waypoints array
        const item = waypoints.splice(draggedItemIndex, 1)[0];
        waypoints.splice(targetIndex, 0, item);
        
        updateUI();
        drawMarkers();
        if (waypoints.length >= 2) {
            const lonlats = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
            calculateAndDrawRoute(lonlats);
        }
    }
    return false;
}

function handleDragEnd(e) {
    this.style.opacity = '1';
    const items = document.querySelectorAll('.waypoint-item');
    items.forEach(item => item.classList.remove('drag-over'));
}

// Remove waypoint
window.removeWaypoint = function(index) {
    waypoints.splice(index, 1);
    updateUI();
    drawMarkers();
    
    if (waypoints.length >= 2) {
        const lonlats = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
        calculateAndDrawRoute(lonlats);
    } else if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
        routeStats.classList.add('hidden');
    }
};

function updateUI() {
    waypointsListEl.innerHTML = '';
    
    waypoints.forEach((wp, index) => {
        const div = document.createElement('div');
        div.className = 'waypoint-item';
        div.style.position = 'relative';
        div.draggable = true;
        div.dataset.index = index;
        div.style.cursor = 'grab';
        
        // Add drag event listeners
        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('dragenter', handleDragEnter);
        div.addEventListener('dragleave', handleDragLeave);
        div.addEventListener('drop', handleDrop);
        div.addEventListener('dragend', handleDragEnd);
        
        let label = index + 1;
        let cName = '';
        if (index === 0) { label = 'S'; cName = 'start'; }
        else if (index === waypoints.length - 1 && waypoints.length > 1) { label = 'E'; cName = 'end'; }
        
        div.innerHTML = `
            <div style="display:flex; flex-direction:column; justify-content:center; margin-right:4px; color:var(--text-muted);">
                <span style="font-size:10px;">&#9776;</span>
            </div>
            <div class="waypoint-marker ${cName}">${label}</div>
            <div class="waypoint-coord">${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}</div>
            <button onclick="removeWaypoint(${index})" style="position:absolute; right:8px; background:none; border:none; color:var(--danger); cursor:pointer; font-size:18px; font-weight:bold;">&times;</button>
        `;
        waypointsListEl.appendChild(div);
    });
}

// Clear all
function clearAll() {
    waypoints = [];
    updateUI();
    drawMarkers();
    
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    btnCalculate.disabled = true;
    routeStats.classList.add('hidden');
    errorMessage.classList.add('hidden');
}

btnClear.addEventListener('click', clearAll);
btnRtClear.addEventListener('click', clearAll);

// Calculate Route Extracted Logic
async function calculateAndDrawRoute(lonlats) {
    const profile = selectProfile.value;
    const apiUrl = `https://brouter.de/brouter?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`;
    const gpxUrl = `https://brouter.de/brouter?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=gpx`;
    
    loadingSpinner.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    routeStats.classList.add('hidden');
    btnCalculate.disabled = true;
    
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error('Routing failed');
        
        const data = await response.json();
        
        if (routeLayer) {
            map.removeLayer(routeLayer);
        }
        
        // Draw new route
        routeLayer = L.geoJSON(data, {
            style: {
                color: '#f59e0b', // primary color
                weight: 6,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
            }
        }).addTo(map);
        
        // Make the route line clickable to add new waypoints
        routeLayer.on('click', function(e) {
            // Find which segment was clicked
            let bestIndex = -1;
            let minSum = Infinity;
            for (let i = 0; i < waypoints.length - 1; i++) {
                const d1 = map.distance([waypoints[i].lat, waypoints[i].lng], e.latlng);
                const d2 = map.distance(e.latlng, [waypoints[i+1].lat, waypoints[i+1].lng]);
                if (d1 + d2 < minSum) {
                    minSum = d1 + d2;
                    bestIndex = i;
                }
            }
            
            if (bestIndex !== -1) {
                // Insert new waypoint
                waypoints.splice(bestIndex + 1, 0, { lat: e.latlng.lat, lng: e.latlng.lng });
                updateUI();
                drawMarkers();
                const newLonlats = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
                calculateAndDrawRoute(newLonlats);
            }
        });
        
        // Fit map bounds to route
        map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
        
        // Extract stats
        const props = data.features[0].properties;
        const totalKm = (parseFloat(props['track-length']) / 1000).toFixed(1);
        const totalMin = Math.round(parseFloat(props['total-time']) / 60);
        
        let timeStr = `${totalMin} min`;
        if (totalMin >= 60) {
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            timeStr = `${h} hr ${m} min`;
        }
        
        statDistance.innerText = `${totalKm} km`;
        statTime.innerText = timeStr;
        
        // Show stats
        routeStats.classList.remove('hidden');
        
        // Update Export Filename asynchronously
        updateExportFilename();
        
    } catch (err) {
        console.error('Route calculation failed', err);
        showToast('Route calculation failed. Please try again.', 'error');
    } finally {
        loadingSpinner.classList.add('hidden');
        btnCalculate.disabled = false;
    }
} // Extracted to reuse logic

async function getCityName(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        if (data && data.address) {
            return data.address.city || data.address.town || data.address.village || data.address.county || 'location';
        }
    } catch (err) {
        console.error('Reverse geocode error', err);
    }
    return 'location';
}

async function updateExportFilename() {
    if (waypoints.length < 2) return;
    
    const startWp = waypoints[0];
    const endWp = waypoints[waypoints.length - 1];
    // Check if it's a closed loop
    const isRoundTrip = (startWp.lat === endWp.lat && startWp.lng === endWp.lng);
    
    const startCity = await getCityName(startWp.lat, startWp.lng);
    let filename = '';
    
    if (isRoundTrip) {
        const km = document.getElementById('roundtrip-km').value || document.getElementById('stat-distance').innerText.replace(' km', '');
        filename = `${startCity}_${km}km`;
    } else {
        const endCity = await getCityName(endWp.lat, endWp.lng);
        filename = `${startCity}_to_${endCity}`;
    }
    
    // Clean up filename (lowercase, underscores)
    filename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    exportFilenameInput.value = filename;
    document.getElementById('btn-export-gpx').download = filename + '.gpx';
}

btnCalculate.addEventListener('click', () => {
    if (waypoints.length < 2) return;
    const lonlats = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    calculateAndDrawRoute(lonlats);
});

// Location Search using Nominatim
async function performSearch(query) {
    if (!query) return;
    
    loadingSpinner.classList.remove('hidden');
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            map.setView([lat, lng], 13);
            
            // Optionally add it as a waypoint if it's the first
            if (waypoints.length === 0) {
                addWaypoint(lat, lng);
            }
        } else {
            showToast('Location not found', 'error');
        }
    } catch (err) {
        console.error('Search error', err);
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

btnSearch.addEventListener('click', () => performSearch(searchInput.value));
btnRtSearch.addEventListener('click', () => performSearch(rtSearchInput.value));

// Traffic Incidents
btnTraffic.addEventListener('click', () => {
    showingTraffic = !showingTraffic;
    if (showingTraffic) {
        btnTraffic.classList.replace('btn-secondary', 'btn-primary');
        btnTraffic.innerText = 'Hide Traffic Incidents';
        fetchTraffic();
    } else {
        btnTraffic.classList.replace('btn-primary', 'btn-secondary');
        btnTraffic.innerText = 'Show Traffic Incidents';
        trafficLayerGroup.clearLayers();
    }
});

map.on('moveend', () => {
    if (showingTraffic) fetchTraffic();
});

async function fetchTraffic() {
    const bounds = map.getBounds();
    const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
    const fields = encodeURIComponent('{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description}}}}');
    const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${TOMTOM_API_KEY}&bbox=${bbox}&fields=${fields}&language=en-GB`;
    
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Traffic API error");
        const data = await res.json();
        
        trafficLayerGroup.clearLayers();
        
        if (data && data.incidents) {
            data.incidents.forEach(inc => {
                let coords = inc.geometry.coordinates;
                let text = "<strong>Traffic Incident</strong><br>";
                if (inc.properties && inc.properties.events) {
                    text += inc.properties.events.map(e => e.description).join(', ');
                }
                if (inc.properties && inc.properties.magnitudeOfDelay) {
                    text += `<br>Delay: ${inc.properties.magnitudeOfDelay}s`;
                }
                
                if (inc.geometry.type === 'Point') {
                    L.marker([coords[1], coords[0]], {
                        icon: L.divIcon({
                            html: '<div style="font-size:20px; background:white; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.3);">🚧</div>',
                            className: 'traffic-icon',
                            iconSize: [24,24],
                            iconAnchor: [12,12]
                        })
                    }).bindPopup(text).addTo(trafficLayerGroup);
                } else if (inc.geometry.type === 'LineString') {
                    let latlngs = coords.map(c => [c[1], c[0]]);
                    L.polyline(latlngs, {color: 'red', weight: 4, dashArray: '5, 5'}).bindPopup(text).addTo(trafficLayerGroup);
                } else if (inc.geometry.type === 'MultiLineString') {
                    let latlngs = coords.map(line => line.map(c => [c[1], c[0]]));
                    L.polyline(latlngs, {color: 'red', weight: 4, dashArray: '5, 5'}).bindPopup(text).addTo(trafficLayerGroup);
                }
            });
        }
    } catch (err) {
        console.error("Traffic fetch error:", err);
    }
}

// Round Trip Generator
btnRoundtrip.addEventListener('click', () => {
    const km = parseFloat(roundtripKm.value);
    if (!km || km < 10) {
        showToast('Please enter a valid distance (min 10km).', 'warning');
        return;
    }
    
    if (waypoints.length === 0) {
        showToast('Please set a starting point first (Search or click the map).', 'warning');
        return;
    }
    
    // Clear existing waypoints except the first one
    const startWp = waypoints[0];
    waypoints = [startWp];
    updateUI();
    drawMarkers();
    
    // Algorithm to generate circular points
    // 1. Calculate rough radius. Detour factor ~1.3
    // We use 6 points now for a rounder hexagon shape.
    // Hexagon perimeter = 6 * R. 
    // Target circumference = km / 1.3
    // R = (km / 1.3) / 6
    const radiusKm = (km / 1.3) / 6;
    
    // Earth radius in km
    const R = 6371; 
    
    // Pick a random starting angle
    const startAngle = Math.random() * 360;
    
    // Generate 6 points at 60 degree intervals
    for (let i = 0; i < 6; i++) {
        const bearing = (startAngle + i * 60) * (Math.PI / 180); // radians
        const d = radiusKm;
        
        const lat1 = startWp.lat * (Math.PI / 180);
        const lon1 = startWp.lng * (Math.PI / 180);
        
        const lat2 = Math.asin(Math.sin(lat1)*Math.cos(d/R) + Math.cos(lat1)*Math.sin(d/R)*Math.cos(bearing));
        const lon2 = lon1 + Math.atan2(Math.sin(bearing)*Math.sin(d/R)*Math.cos(lat1), Math.cos(d/R)-Math.sin(lat1)*Math.sin(lat2));
        
        const newLat = lat2 * (180 / Math.PI);
        const newLng = lon2 * (180 / Math.PI);
        
        waypoints.push({lat: newLat, lng: newLng});
    }
    
    // Add start waypoint again to close the loop
    waypoints.push(startWp);
    
    updateUI();
    drawMarkers();
    
    // Auto-calculate the route
    const lonlats = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    calculateAndDrawRoute(lonlats);
});

// --------------------------------------------------------
// GPX Import Logic
// --------------------------------------------------------
const routeColors = ['#ef4444', '#8b5cf6', '#ec4cc9', '#10b981', '#f59e0b', '#06b6d4', '#3b82f6'];
let colorIndex = 0;

gpxUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        parseGPX(text, file.name);
    };
    reader.readAsText(file);
});

function parseGPX(xmlText, filename) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    // Extract tracks
    const trks = xmlDoc.getElementsByTagName('trk');
    Array.from(trks).forEach((trk, idx) => {
        const nameNode = trk.getElementsByTagName('name')[0];
        const name = nameNode ? nameNode.textContent : `${filename.replace('.gpx', '')} - Track ${idx + 1}`;
        extractLinePoints(trk, name);
    });

    // Extract routes
    const rtes = xmlDoc.getElementsByTagName('rte');
    Array.from(rtes).forEach((rte, idx) => {
        const nameNode = rte.getElementsByTagName('name')[0];
        const name = nameNode ? nameNode.textContent : `${filename.replace('.gpx', '')} - Route ${idx + 1}`;
        extractLinePoints(rte, name);
    });
    
    if (importedRoutesGroup.getLayers().length > 0) {
        map.fitBounds(importedRoutesGroup.getBounds(), { padding: [50, 50] });
        routeStats.classList.remove('hidden'); // Show export button
    } else {
        showToast("No route data found in this file.", 'warning');
    }
}

function extractLinePoints(element, name) {
    let pts = [];
    const trkpts = element.getElementsByTagName('trkpt');
    const rtepts = element.getElementsByTagName('rtept');
    const points = trkpts.length > 0 ? trkpts : rtepts;
    
    Array.from(points).forEach(pt => {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) pts.push([lat, lon]);
    });
    
    if (pts.length > 1) {
        // Apply Simplification if enabled
        const level = parseInt(simplifySlider.value);
        if (level > 0 && typeof turf !== 'undefined') {
            try {
                const lineString = turf.lineString(pts.map(p => [p[1], p[0]])); // turf uses [lon, lat]
                const simplified = turf.simplify(lineString, {
                    tolerance: simplifyTolerances[level], 
                    highQuality: true
                });
                pts = simplified.geometry.coordinates.map(p => [p[1], p[0]]); // back to [lat, lon]
            } catch (err) {
                console.error("Simplification error", err);
            }
        }

        const color = routeColors[colorIndex % routeColors.length];
        colorIndex++;
        
        const polyline = L.polyline(pts, {
            color: color,
            weight: 5,
            opacity: 0.8
        });
        
        polyline.on('click', () => {
            if (polyline.pm.enabled()) {
                polyline.pm.disable();
            } else {
                // Disable others first to focus on this one
                importedRoutesGroup.eachLayer(l => l.pm.disable());
                polyline.pm.enable();
            }
        });
        
        importedRoutesGroup.addLayer(polyline);
        const routeObj = { id: L.stamp(polyline), name, color, layer: polyline };
        importedRoutes.push(routeObj);
        
        updateImportedRoutesUI();
    }
}

function updateImportedRoutesUI() {
    importedRoutesList.innerHTML = '';
    importedRoutes.forEach(route => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';
        div.style.padding = '8px';
        div.style.background = 'rgba(255, 255, 255, 0.05)';
        div.style.border = '1px solid var(--border)';
        div.style.borderRadius = '4px';
        div.style.color = 'var(--text-main)';
        
        const eyeStyle = route.hidden ? 'opacity:0.5;' : 'opacity:1;';
        
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                <div style="width:16px; height:16px; border-radius:50%; background-color:${route.color}; flex-shrink:0;"></div>
                <span style="font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${route.name}">${route.name}</span>
            </div>
            <div style="display:flex; gap:4px;">
                <button class="btn-toggle-route" data-id="${route.id}" title="Toggle Visibility" style="background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:16px; ${eyeStyle}">👁️</button>
                <button class="btn-analyze-route" data-id="${route.id}" title="Analyze Traffic" style="background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:16px;">🚦</button>
                <button class="btn-remove-route" data-id="${route.id}" title="Remove Route" style="background:none; border:none; cursor:pointer; color:var(--danger); font-size:18px;">&times;</button>
            </div>
        `;
        importedRoutesList.appendChild(div);
    });
    
    document.querySelectorAll('.btn-remove-route').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
            const index = importedRoutes.findIndex(r => r.id === id);
            if (index > -1) {
                importedRoutesGroup.removeLayer(importedRoutes[index].layer);
                importedRoutes.splice(index, 1);
                updateImportedRoutesUI();
                if (importedRoutes.length === 0 && !routeLayer) {
                    routeStats.classList.add('hidden');
                }
            }
        });
    });
    
    document.querySelectorAll('.btn-toggle-route').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
            const route = importedRoutes.find(r => r.id === id);
            if (route) {
                route.hidden = !route.hidden;
                if (route.hidden) {
                    importedRoutesGroup.removeLayer(route.layer);
                } else {
                    importedRoutesGroup.addLayer(route.layer);
                }
                updateImportedRoutesUI(); // Re-render to update eye icon opacity
            }
        });
    });
    
    document.querySelectorAll('.btn-analyze-route').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.target.dataset.id);
            await analyzeRouteTraffic(id);
        });
    });
}

async function analyzeRouteTraffic(id) {
    const route = importedRoutes.find(r => r.id === id);
    if (!route) return;
    
    const originalBtn = document.querySelector(`.btn-analyze-route[data-id="${id}"]`);
    if(originalBtn) originalBtn.innerText = '⏳';
    
    try {
        const bounds = route.layer.getBounds();
        const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
        const fields = encodeURIComponent('{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description}}}}');
        const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${TOMTOM_API_KEY}&bbox=${bbox}&fields=${fields}&language=en-GB`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error("Traffic fetch failed");
        const data = await res.json();
        
        trafficLayerGroup.clearLayers();
        let foundIncidents = 0;
        
        if (data && data.incidents && typeof turf !== 'undefined') {
            const pts = route.layer.getLatLngs().map(p => [p.lng, p.lat]);
            if(pts.length < 2) return;
            const routeLine = turf.lineString(pts);
            
            data.incidents.forEach(inc => {
                let coords = inc.geometry.coordinates;
                let incidentGeo;
                
                if (inc.geometry.type === 'Point') {
                    incidentGeo = turf.point(coords);
                } else if (inc.geometry.type === 'LineString') {
                    incidentGeo = turf.lineString(coords);
                } else if (inc.geometry.type === 'MultiLineString') {
                    incidentGeo = turf.multiLineString(coords);
                }
                
                if (!incidentGeo) return;
                
                let intersects = false;
                
                if (inc.geometry.type === 'Point') {
                    const dist = turf.pointToLineDistance(incidentGeo, routeLine, {units: 'kilometers'});
                    if (dist < 0.05) intersects = true; // 50 meters
                } else {
                    if (turf.booleanIntersects(incidentGeo, routeLine)) {
                        intersects = true;
                    } else {
                        const points = turf.explode(incidentGeo);
                        for(let pt of points.features) {
                            if (turf.pointToLineDistance(pt, routeLine, {units: 'kilometers'}) < 0.05) {
                                intersects = true;
                                break;
                            }
                        }
                    }
                }
                
                if (intersects) {
                    foundIncidents++;
                    let text = "<strong>⚠️ Traffic Incident on Route!</strong><br>";
                    if (inc.properties && inc.properties.events) {
                        text += inc.properties.events.map(e => e.description).join(', ');
                    }
                    if (inc.properties && inc.properties.magnitudeOfDelay) {
                        text += `<br>Delay: ${inc.properties.magnitudeOfDelay}s`;
                    }
                    
                    if (inc.geometry.type === 'Point') {
                        L.marker([coords[1], coords[0]], {
                            icon: L.divIcon({
                                html: '<div style="font-size:24px; background:yellow; border:2px solid red; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px red;">🚧</div>',
                                className: 'traffic-icon',
                                iconSize: [32,32],
                                iconAnchor: [16,16]
                            })
                        }).addTo(trafficLayerGroup).bindPopup(text).openPopup();
                    } else {
                        let latlngs = inc.geometry.type === 'LineString' ? coords.map(c => [c[1], c[0]]) : coords.map(line => line.map(c => [c[1], c[0]]));
                        L.polyline(latlngs, {color: 'red', weight: 8, dashArray: '10, 10'}).addTo(trafficLayerGroup).bindPopup(text).openPopup();
                    }
                }
            });
        }
        
        if (foundIncidents > 0) {
            showToast(`Found ${foundIncidents} traffic incident(s) on or very close to this route!`, 'warning');
        } else {
            showToast("No traffic incidents found on this route.", 'success');
        }
        
    } catch(err) {
        console.error(err);
        showToast(`Failed to analyze traffic: ${err.message}`, 'error');
    } finally {
        if(originalBtn) originalBtn.innerText = '🚦';
    }
}

window.removeImportedRoute = function(id) {
    const routeIndex = importedRoutes.findIndex(r => r.id === id);
    if (routeIndex > -1) {
        const route = importedRoutes[routeIndex];
        importedRoutesGroup.removeLayer(route.layer);
        importedRoutes.splice(routeIndex, 1);
        updateImportedRoutesUI();
        
        if (importedRoutes.length === 0 && !routeLayer) {
            routeStats.classList.add('hidden');
        }
    }
};

btnImportClear.addEventListener('click', () => {
    importedRoutesGroup.clearLayers();
    importedRoutes = [];
    updateImportedRoutesUI();
    gpxUpload.value = '';
    
    if (!routeLayer) {
        routeStats.classList.add('hidden');
    }
});

// --------------------------------------------------------
// Custom GPX Export
// --------------------------------------------------------
btnExportGpx.addEventListener('click', function(e) {
    e.preventDefault();
    
    if (!routeLayer && importedRoutes.length === 0) return;
    
    let gpxContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
    gpxContent += '<gpx version="1.1" creator="MotoRoute">\n';

    // 1. Export Calculated BRouter Route
    if (routeLayer) {
        gpxContent += '  <trk>\n    <name>Calculated Route</name>\n    <trkseg>\n';
        routeLayer.eachLayer(layer => {
            if (layer.getLatLngs) {
                const latlngs = layer.getLatLngs();
                const processLatLngs = (pts) => {
                    if (pts.length > 0 && Array.isArray(pts[0])) {
                        pts.forEach(p => processLatLngs(p));
                    } else {
                        pts.forEach(pt => {
                            gpxContent += `      <trkpt lat="${pt.lat}" lon="${pt.lng}"></trkpt>\n`;
                        });
                    }
                };
                processLatLngs(latlngs);
            }
        });
        gpxContent += '    </trkseg>\n  </trk>\n';
    }

    // 2. Export Imported/Edited Routes
    importedRoutes.forEach(r => {
        if (r.hidden) return; // Skip hidden routes
        gpxContent += `  <trk>\n    <name>${r.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</name>\n    <trkseg>\n`;
        
        // Geoman edited lines might be multiple coordinates arrays or slightly different structure
        const latlngs = r.layer.getLatLngs();
        
        const processImportedLatLngs = (pts) => {
            if (pts.length > 0 && Array.isArray(pts[0])) {
                pts.forEach(p => processImportedLatLngs(p));
            } else {
                pts.forEach(pt => {
                    gpxContent += `      <trkpt lat="${pt.lat}" lon="${pt.lng}"></trkpt>\n`;
                });
            }
        };
        processImportedLatLngs(latlngs);
        
        gpxContent += '    </trkseg>\n  </trk>\n';
    });

    gpxContent += '</gpx>';

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = document.getElementById('export-filename').value + '.gpx' || 'motoroute.gpx';
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
});
