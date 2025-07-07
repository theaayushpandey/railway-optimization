// Initialize the map
let map = L.map('map').setView([21.1458, 79.0882], 5.3);

// Add tile layer with proper attribution
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

// Custom icons
const hubIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/484/484167.png',
    iconSize: [25, 25],
    iconAnchor: [12, 12]
});

// Data structure
let data = {
    stations: [],
    tracks: [],
    trains: [],
    station_closures: [],
    track_closures: []
};
// Graph representation for algorithms
let graph = {
    adjacencyList: {},
    capacities: {}
};

// Global variables
let currentEditingTrainId = null;
let currentWidth = 750;
let formSubmitted = false;
// let currentMST = [];

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function () {
    loadData();
    setupEventListeners();
    setupTabSwitching();
    setupTrainManagement();

    loadStationClosures();
    loadTrackClosures();

    const tabsPanel = document.querySelector('.control-panel');
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach((button, index) => {
        button.addEventListener('click', () => {
            const lastTab = (index === tabButtons.length - 1);
            tabsPanel.style.width = lastTab ? '100vw' : `${currentWidth}px`;
        });
    });

    document.querySelector('#trains-table').addEventListener('click', function (e) {
        if (e.target.classList.contains('edit-train')) {
            const trainId = e.target.getAttribute('data-id');
            editTrain(trainId);
        }
    });
});

// Setup all event listeners
function setupEventListeners() {
    // Station form
    document.getElementById('station-form').addEventListener('submit', function (e) {
        e.preventDefault();
        addStation();
    });

    // Track form
    document.getElementById('track-form').addEventListener('submit', function (e) {
        e.preventDefault();
        addTrack();
    });

    // Path form
    document.getElementById('path-form').addEventListener('submit', function (event) {
        event.preventDefault();
        const startId = document.getElementById('start-station').value;
        const endId = document.getElementById('end-station').value;

        if (!startId || !endId) {
            showCaptureModal("Please select both start and end stations.", "error");
            // alert("Please select both start and end stations.");
            return;
        }

        if (event.submitter.id === 'find-path-btn') {
            findShortestPath(startId, endId);
        } else if (event.submitter.id === 'find-all-paths-btn') {
            findAllPaths(startId, endId);
        }
        else if (event.submitter.id === 'find-bellman-btn') {
            findPathsWithBellmanFord(startId, endId);
        }
    });

    // Flow form
    document.getElementById('flow-form').addEventListener('submit', function (e) {
        e.preventDefault();
        calculateMaxFlow();
    });

    // MST button
    document.getElementById('calculate-mst').addEventListener('click', function () {
        calculateMST();
    });

    // Closure form
    // document.getElementById('closure-form').addEventListener('submit', function (e) {
    //     e.preventDefault();
    //     addClosure();
    // });

    // Closure type change handler
    document.getElementById('closure-type').addEventListener('change', function () {
        const stationFields = document.getElementById('station-closure-fields');
        const trackFields = document.getElementById('track-closure-fields');

        if (this.value === 'station') {
            stationFields.classList.remove('d-none');
            trackFields.classList.add('d-none');
        } else {
            stationFields.classList.add('d-none');
            trackFields.classList.remove('d-none');
        }
    });

    // Train modal
    document.getElementById('open-add-train-modal').addEventListener('click', function () {
        // resetTrainForm();
        if (data.stations.length === 0) {
            loadData().then(() => {
                document.getElementById('train-modal').style.display = 'block';
                populateAllStationDropdowns();
            });
        } else {
            document.getElementById('train-modal').style.display = 'block';
            populateAllStationDropdowns();
        }
    });

    document.getElementById('close-add-train-modal').addEventListener('click', function () {
        document.getElementById('train-modal').style.display = 'none';
    });

    // Train form
    document.getElementById('add-train-form').addEventListener('submit', function (e) {
        e.preventDefault();
        handleAddTrain(e);
    });
}

// Tab switching functionality
function setupTabSwitching() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab') + '-tab';
            document.getElementById(tabId).classList.add('active');

            // Load closures when network tab is opened
            if (tabId === 'network-tab') {
                // loadStationClosures();
                // loadTrackClosures();
            }
        });
    });
}

function loadData() {
    return fetch('http://localhost:5000/api/data')
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return res.json();
        })
        .then(backendData => {
            data = backendData;
            buildGraph();
            render();
            updateDropdowns();
            renderTrainsTable();
            return data;
        })
        .catch(err => {
            showCaptureModal("Error loading station data", "error");
            throw err;
        });
}

// Build graph representation for algorithms
function buildGraph() {
    graph = {
        adjacencyList: {},
        capacities: {}
    };

    // Initialize adjacency list for all stations
    data.stations.forEach(station => {
        graph.adjacencyList[station.id] = [];
    });

    // Add edges
    data.tracks.forEach(track => {
        // Skip closed tracks
        if (isTrackClosed(track.source, track.destination)) {
            return;
        }

        // Add forward edge
        graph.adjacencyList[track.source].push({
            destination: track.destination,
            distance: track.distance,
            capacity: track.capacity
        });

        // Add backward edge if bidirectional
        if (track.bidirectional && !isTrackClosed(track.destination, track.source)) {
            graph.adjacencyList[track.destination].push({
                destination: track.source,
                distance: track.distance,
                capacity: track.capacity
            });
        }

        // Set capacities for max flow
        if (!graph.capacities[track.source]) {
            graph.capacities[track.source] = {};
        }
        graph.capacities[track.source][track.destination] = track.capacity;

        if (track.bidirectional) {
            if (!graph.capacities[track.destination]) {
                graph.capacities[track.destination] = {};
            }
            graph.capacities[track.destination][track.source] = track.capacity;
        }
    });
}



function render() {
    // Clear existing layers except base map
    const layersToRemove = [];
    map.eachLayer(layer => {
        if (layer._url === undefined) layersToRemove.push(layer);
    });
    layersToRemove.forEach(layer => map.removeLayer(layer));

    // Define styles
    const TRACK_COLORS = {
        bidirectional: '#3182bd',
        oneway: '#e6550d',
        closed: '#ff0000' // Red for closed tracks
    };

    const STATION_STYLES = {
        hub: { icon: hubIcon, riseOnHover: true },
        regular: {
            radius: 6,
            fillColor: 'white',
            color: 'black',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.5
        },
        closed: {
            radius: 8, // Slightly larger to stand out
            fillColor: '#ff0000', // Red fill
            color: '#000',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }
    };

    const TRACK_STYLES = {
        weight: 3,
        hoverWeight: 5,
        opacity: 0.8
    };

    const stationCache = {};
    data.stations.forEach(station => {
        stationCache[station.id] = station;
    });

    // Function to create popup content
    const createPopupContent = (title, properties) => {
        const items = Object.entries(properties)
            .map(([key, value]) => `<p>${key}: ${value}</p>`)
            .join('');
        return `<div class="popup-content"><h3>${title}</h3>${items}</div>`;
    };

    // Render stations
    const stationLayer = L.layerGroup();
    data.stations.forEach(station => {
        const isClosed = isStationClosed(station.id);

        const marker = station.isHub
            ? L.marker([station.latitude, station.longitude], STATION_STYLES.hub)
            : L.circleMarker([station.latitude, station.longitude],
                isClosed ? STATION_STYLES.closed : STATION_STYLES.regular);

        marker.bindPopup(createPopupContent(
            isClosed ? `[CLOSED] ${station.name}` : station.name,
            {
                ID: station.id,
                Status: isClosed ? 'CLOSED' : 'OPEN',
                ...(isClosed ? { 'Closed Until': getClosureEndTime(station.id) } : {})
            }
        )).addTo(stationLayer);
    });
    stationLayer.addTo(map);

    // Render tracks
    const trackLayer = L.layerGroup();
    data.tracks.forEach(track => {
        const fromStation = stationCache[track.source];
        const toStation = stationCache[track.destination];

        if (!fromStation || !toStation) return;

        const isClosed = isTrackClosed(track.source, track.destination);
        const coordinates = [
            [fromStation.latitude, fromStation.longitude],
            [toStation.latitude, toStation.longitude]
        ];

        const line = L.polyline(coordinates, {
            color: isClosed ? TRACK_COLORS.closed :
                (track.bidirectional ? TRACK_COLORS.bidirectional : TRACK_COLORS.oneway),
            weight: isClosed ? TRACK_STYLES.weight + 1 : TRACK_STYLES.weight,
            opacity: isClosed ? 1 : TRACK_STYLES.opacity,
            dashArray: isClosed ? '5, 5' : (track.bidirectional ? null : '5, 5')
        });

        line.bindPopup(createPopupContent(
            isClosed ? `[CLOSED] Track` : 'Track Details',
            {
                From: track.source,
                To: track.destination,
                Distance: `${track.distance} km`,
                Weight:`${track.weight} km`,
                Capacity: track.capacity,
                Type: track.bidirectional ? 'Bidirectional' : 'One-way',
                Status: isClosed ? 'CLOSED' : 'OPEN',
                ...(isClosed ? { 'Closed Until': getTrackClosureEndTime(track.source, track.destination) } : {})
            }
        )).addTo(trackLayer);

        if (track.bidirectional && L.PolylineDecorator && !isClosed) {
            L.polylineDecorator(coordinates, {
                patterns: [{
                    offset: '50%',
                    repeat: 0,
                    symbol: L.Symbol.arrowHead({
                        pixelSize: 10,
                        pathOptions: {
                            color: TRACK_COLORS.bidirectional,
                            fillOpacity: 0.8,
                            weight: 0
                        }
                    })
                }]
            }).addTo(trackLayer);
        }
    });
    trackLayer.addTo(map);
}



function getClosureEndTime(stationId) {
    const closure = data.station_closures?.find(c =>
        c.stationId === stationId &&
        (new Date() - new Date(c.startTime)) < c.duration * 3600000
    );
    if (!closure) return '';

    const endTime = new Date(new Date(closure.startTime).getTime() + closure.duration * 3600000);
    return new Date(endTime).toLocaleString();
}

function getTrackClosureEndTime(source, destination) {
    const closure = data.track_closures?.find(c =>
        ((c.source === source && c.destination === destination) ||
            (c.bidirectional && c.source === destination && c.destination === source)) &&
        (new Date() - new Date(c.startTime)) < c.duration * 3600000
    );
    if (!closure) return '';

    const endTime = new Date(new Date(closure.startTime).getTime() + closure.duration * 3600000);
    return new Date(endTime).toLocaleString();
}


function updateDropdowns() {
    updateStationDropdown('track-source');
    updateStationDropdown('track-destination');
    updateStationDropdown('start-station');
    updateStationDropdown('end-station');
    updateStationDropdown('source-station');
    updateStationDropdown('sink-station');
    updateStationDropdown('train-route');
    updateStationDropdown('closure-station');
    updateStationDropdown('closure-track-source');
    updateStationDropdown('closure-track-destination');
}

function updateStationDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="">Select station</option>' +
        [...data.stations]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(s => `<option value="${s.id}">${s.name} - ${s.id}</option>`)
            .join('');
}

// Add a new station
function addStation() {
    const id = document.getElementById('stationId').value.trim();
    const name = document.getElementById('stationName').value.trim();
    const lat = parseFloat(document.getElementById('stationLat').value);
    const lng = parseFloat(document.getElementById('stationLng').value);

    if (!id || !name || isNaN(lat) || isNaN(lng)) {
        showCaptureModal("Please enter valid station details.", "error");
        // alert("Please enter valid station details.");
        return;
    }

    const station = { id, name, latitude: lat, longitude: lng };

    fetch('http://localhost:5000/api/add-station', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(station)
    })
        .then(res => res.json())
        .then(response => {
            if (response.status === 'success') {
                document.getElementById('station-form').reset();
                showCaptureModal("Station added successfully", "success");
                loadData();
            } else {
                showCaptureModal(response.message || "Error adding station", "error");
            }
        })
        .catch(err => {
            showCaptureModal("Error saving station", "error");
            console.error("Error adding station:", err);
        });
}

// Add a new track
function addTrack() {
    const source = document.getElementById('track-source').value;
    const destination = document.getElementById('track-destination').value;
    const distance = parseFloat(document.getElementById('track-distance').value);
    const weight = parseInt(document.getElementById('track-weight').value);
    const capacity = parseInt(document.getElementById('track-capacity').value);
    const bidirectional = document.getElementById('track-bidirectional').checked;

    if (!source || !destination || isNaN(distance) || isNaN(capacity) || source === destination) {
        alert("Please enter valid track information.");
        return;
    }

    const track = {
        source, destination, distance, capacity, bidirectional,
        weight: weight ? parseFloat(weight) : distance // Fallback to distance 
    };

    fetch('http://localhost:5000/api/add-track', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(track)
    })
        .then(res => res.json())
        .then(response => {
            if (response.status === 'success') {
                showCaptureModal("Track added successfully!", "success");
                document.getElementById('track-form').reset();
                loadData();
            } else {
                showCaptureModal("Error adding track", "error");
            }
        })
        .catch(err => {
            showCaptureModal("Error saving track", "error");
            console.error("Error adding track:", err);
        });
}


function loadStationClosures() {
    fetch('http://localhost:5000/api/station-closures')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(closures => {
            // Process station closures
            updateClosuresUI(closures, 'station');
        })
        .catch(err => {
            console.error("Error loading station closures:", err);
        });
}

function loadTrackClosures() {
    fetch('http://localhost:5000/api/track-closures')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(closures => {
            // Process track closures
            updateClosuresUI(closures, 'track');
        })
        .catch(err => {
            console.error("Error loading track closures:", err);
        });
}
function updateClosuresUI(closures, type) {
    const closuresList = document.getElementById('closures-list');

    closures.forEach(closure => {
        const closureItem = document.createElement('div');
        closureItem.className = 'closure-item';

        let closureText;
        if (type === 'station') {
            const station = data.stations.find(s => s.id === closure.stationId);
            closureText = `Station: ${station ? station.name : closure.stationId}`;
        } else {
            const srcStation = data.stations.find(s => s.id === closure.source);
            const destStation = data.stations.find(s => s.id === closure.destination);
            closureText = `Track: ${srcStation ? srcStation.name : closure.source} → ${destStation ? destStation.name : closure.destination}`;
        }

        const endTime = new Date(new Date(closure.startTime).getTime() + closure.duration * 3600000);
        const initialRemaining = endTime - new Date();
        const initialHoursRemaining = Math.ceil(initialRemaining / 3600000);

        closureItem.innerHTML = `
            <div class="closure-header">
                <span class="closure-type">${type}</span>
                <span class="closure-time">${formatTimeRemaining(initialRemaining)}</span>
                <button onclick="removeClosure('${closure.id}', '${type}')"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="closure-details">
                <p>${closureText}</p>
                <p>Reason: ${closure.reason}</p>
            </div>
        `;

        closuresList.appendChild(closureItem);

        // Only start countdown if time remains
        if (initialRemaining > 0) {
            startCountdown(closureItem.querySelector('.closure-time'), endTime);
        }
    });
}

function formatTimeRemaining(ms) {
    if (ms <= 0) return 'Expired';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s remaining`;
    if (minutes > 0) return `${minutes}m ${seconds}s remaining`;
    return `${seconds}s remaining`;
}

function startCountdown(timeElement, endTime) {
    function update() {
        const remainingMs = endTime - new Date();

        if (remainingMs <= 0) {
            timeElement.textContent = 'Expired';
            return;
        }

        timeElement.textContent = formatTimeRemaining(remainingMs);

        // Continue updating if time remains
        if (remainingMs > 0) {
            setTimeout(update, 1000);
        }
    }

    // Start the countdown
    update();
}

function removeClosure(closureId, type) {
    fetch(`http://localhost:5000/api/${type}-closures/${closureId}`, {
        method: 'DELETE'
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to delete closure');
            }
            // Refresh the closures list
            showCaptureModal(`${type} " : " ${trainId} "is removed successfully", `, "success");
            document.getElementById('closures-list').innerHTML = '';
            loadStationClosures();
            loadTrackClosures();
        })
        .catch(err => {
            console.error("Error deleting closure:", err);
            showCaptureModal("Failed to remove closure", "error");
        });
}

// Update your form submission for closures
document.getElementById('closure-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const type = document.getElementById('closure-type').value;

    if (type === 'station') {
        addStationClosure();
    } else {
        addTrackClosure();
    }
});

document.getElementById('closure-minutes').addEventListener('change', function () {
    if (this.value > 59) this.value = 59;
    if (this.value < 0) this.value = 0;
});

document.getElementById('closure-hours').addEventListener('change', function () {
    if (this.value < 0) this.value = 0;
});

function addStationClosure() {
    const hours = parseInt(document.getElementById('closure-hours').value) || 0;
    const minutes = parseInt(document.getElementById('closure-minutes').value) || 0;
    const totalDuration = hours + (minutes / 60); // Convert to hours for backend
    const closureData = {
        stationId: document.getElementById('closure-station').value,
        reason: document.getElementById('closure-reason').value,
        duration: totalDuration
    };
    fetch('http://localhost:5000/api/add-station-closure', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(closureData)
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // alert("hello");
                showCaptureModal("Station closure added", "success");
                document.getElementById('closure-form').reset();
                document.getElementById('closures-list').innerHTML = '';
                loadStationClosures();
            }
        })
        .catch(err => {
            console.error("Error adding station closure:", err);
            showCaptureModal("Failed to add station closure", "error");
        });
}

function addTrackClosure() {

    const hours = parseInt(document.getElementById('closure-hours').value) || 0;
    const minutes = parseInt(document.getElementById('closure-minutes').value) || 0;
    const totalDuration = hours + (minutes / 60); // Convert to hours for backend

    const closureData = {
        source: document.getElementById('closure-track-source').value,
        destination: document.getElementById('closure-track-destination').value,
        reason: document.getElementById('closure-reason').value,
        duration: totalDuration,
        bidirectional: document.getElementById('track-bidirectional').checked
    };
    fetch('http://localhost:5000/api/add-track-closure', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(closureData)
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                showCaptureModal("Track closure added", "success");
                document.getElementById('closure-form').reset();
                document.getElementById('closures-list').innerHTML = '';
                loadTrackClosures();
            }
        })
        .catch(err => {
            console.error("Error adding track closure:", err);
            showCaptureModal("Failed to add track closure", "error");
        });
}


function isStationClosed(stationId) {
    return data.station_closures?.some(c =>
        c.type === 'station' &&
        c.stationId === stationId &&
        (new Date() - new Date(c.startTime)) < c.duration * 3600000
    );
}

function isTrackClosed(source, destination) {
    return data.track_closures?.some(c =>
        c.type === 'track' &&
        ((c.source === source && c.destination === destination) ||
            (c.bidirectional && c.source === destination && c.destination === source)) &&
        (new Date() - new Date(c.startTime)) < c.duration * 3600000
    );
}

// Path finding algorithms (updated to consider closures)
function findShortestPath(startId, endId) {
    // First check if start or end stations are closed
    if (isStationClosed(startId)) {
        showCaptureModal("Start station is temporarily closed", "error");
        return;
    }

    if (isStationClosed(endId)) {
        showCaptureModal("Destination station is temporarily closed", "error");
        return;
    }

    const distances = {};
    const previous = {};
    const nodes = new Set();
    const path = [];
    let smallest;

    data.stations.forEach(station => {
        distances[station.id] = station.id === startId ? 0 : Infinity;
        nodes.add(station.id);
    });

    while (nodes.size) {
        smallest = null;
        nodes.forEach(node => {
            if (smallest === null || distances[node] < distances[smallest]) {
                smallest = node;
            }
        });

        if (smallest === endId || distances[smallest] === Infinity) {
            break;
        }

        graph.adjacencyList[smallest]?.forEach(neighbor => {
            // Skip closed tracks
            if (isTrackClosed(smallest, neighbor.destination)) {
                return;
            }

            const alt = distances[smallest] + neighbor.distance;
            if (alt < distances[neighbor.destination]) {
                distances[neighbor.destination] = alt;
                previous[neighbor.destination] = smallest;
            }
        });

        nodes.delete(smallest);
    }

    const resultContainer = document.getElementById('path-results');
    resultContainer.innerHTML = '';

    if (distances[endId] !== Infinity) {
        let current = endId;
        while (current) {
            path.unshift(current);
            current = previous[current];
        }

        const template = document.getElementById('shortest-path-result-template').content.cloneNode(true);
        const resultElement = template.querySelector('.result-card');

        const total_path = document.getElementById('all-paths-result-template').content.cloneNode(true);
        total_path.querySelector('#total-path').textContent = 'Shortest Path is : ';
        resultContainer.appendChild(total_path);

        resultElement.querySelector('#path-distance').textContent = distances[endId] + ' km';

        const pathStationsElement = resultElement.querySelector('#path-stations');
        const pathDiv = document.createElement('div');
        pathDiv.className = 'result-details';
        pathDiv.textContent = path.join(' → ');
        pathDiv.style.cursor = 'pointer';

        const fullNames = path.map(stationId => {
            const station = data.stations.find(s => s.id === stationId);
            return station ? station.name : stationId;
        }).join(' → ');

        resultElement.title = fullNames;
        pathStationsElement.appendChild(pathDiv);
        resultContainer.appendChild(resultElement);
        highlightPath(path, '#4CAF50');
    } else {
        showAlert(resultContainer, "No path exists between these stations.");
    }
}

function findPathsWithBellmanFord(startId, endId) {
    // First check if start or end stations are closed
    if (isStationClosed(startId)) {
        showCaptureModal("Start station is temporarily closed", "error");
        return;
    }

    if (isStationClosed(endId)) {
        showCaptureModal("Destination station is temporarily closed", "error");
        return;
    }

    const distances = {};
    const previous = {};
    const numStations = data.stations.length;

    // Initialize distances - use Number.MAX_SAFE_INTEGER instead of Infinity
    data.stations.forEach(station => {
        distances[station.id] = station.id === startId ? 0 : Number.MAX_SAFE_INTEGER;
        previous[station.id] = null;
    });

    // Main relaxation loop
    for (let i = 0; i < numStations - 1; i++) {
        let updated = false;

        // Process all tracks in both directions
        data.tracks.forEach(track => {
            if (isTrackClosed(track.source, track.destination)) return;

            const u = track.source;
            const v = track.destination;
            const weight = track.weight;

            // Forward direction
            if (distances[u] !== Number.MAX_SAFE_INTEGER && 
                distances[u] + weight < distances[v]) {
                distances[v] = distances[u] + weight;
                previous[v] = u;
                updated = true;
            }

            // Reverse direction if bidirectional
            if (track.bidirectional && !isTrackClosed(track.destination, track.source)) {
                if (distances[v] !== Number.MAX_SAFE_INTEGER && 
                    distances[v] + weight < distances[u]) {
                    distances[u] = distances[v] + weight;
                    previous[u] = v;
                    updated = true;
                }
            }
        });

        // Debug output
        console.log(`After iteration ${i}:`, distances);

        if (!updated) break;
    }

    // Check if path exists
    if (distances[endId] === Number.MAX_SAFE_INTEGER) {
        showAlert(document.getElementById('path-results'), 
                 "No path exists between these stations");
        return;
    }

    // Reconstruct path with cycle detection
    const path = [];
    let current = endId;
    const visited = new Set();
    let cycleDetected = false;

    while (current !== null) {
        if (visited.has(current)) {
            cycleDetected = true;
            break;
        }
        visited.add(current);
        path.unshift(current);
        current = previous[current];
        
        // Safety check
        if (path.length > numStations * 2) {
            cycleDetected = true;
            break;
        }
    }

    // Display results
    const resultContainer = document.getElementById('path-results');
    resultContainer.innerHTML = '';

    if (cycleDetected) {
        showAlert(resultContainer, "Path contains a cycle - check for negative weights");
    } else {
        const template = document.getElementById('shortest-path-result-template').content.cloneNode(true);
        template.querySelector('#path-distance').textContent = `${distances[endId]} km`;
        
        const pathText = path.map(id => {
            const station = data.stations.find(s => s.id === id);
            return station ? station.name : id;
        }).join(' → ');
        
        template.querySelector('#path-stations').textContent = pathText;
        resultContainer.appendChild(template);
        highlightPath(path, '#FFA500');
    }
}

function findAllPaths(startId, endId) {
    const kInput = document.getElementById('k-value');
    const K = kInput ? parseInt(kInput.value) || 3 : 3;

    // A* Algorithm with your display pattern
    function aStarKShortestPaths(start, end, K) {
        // Priority queue sorted by fScore (distance + heuristic)
        const openSet = new PriorityQueue((a, b) => a.fScore - b.fScore);
        const results = [];

        // Precompute straight-line heuristic distances
        const endStation = data.stations.find(s => s.id === end);
        const heuristic = {};
        data.stations.forEach(station => {
            heuristic[station.id] = endStation
                ? haversineDistance(
                    station.latitude, station.longitude,
                    endStation.latitude, endStation.longitude
                )
                : 0;
        });

        // Add initial path
        openSet.enqueue({
            path: [start],
            gScore: 0,
            fScore: heuristic[start]
        });

        while (!openSet.isEmpty() && results.length < K) {
            const current = openSet.dequeue();
            const lastNode = current.path[current.path.length - 1];

            if (lastNode === end) {
                results.push({
                    path: current.path,
                    distance: current.gScore
                });
                continue;
            }

            // Explore neighbors
            (graph.adjacencyList[lastNode] || []).forEach(edge => {
                if (!current.path.includes(edge.destination)) {
                    openSet.enqueue({
                        path: [...current.path, edge.destination],
                        gScore: current.gScore + edge.distance,
                        fScore: current.gScore + edge.distance + heuristic[edge.destination]
                    });
                }
            });
        }

        return results;
    }

    // Haversine distance calculation
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // Priority Queue (optimized for A*)
    class PriorityQueue {
        constructor(comparator) {
            this.heap = [];
            this.comparator = comparator;
        }

        enqueue(item) {
            this.heap.push(item);
            this.bubbleUp(this.heap.length - 1);
        }

        dequeue() {
            const top = this.heap[0];
            const bottom = this.heap.pop();
            if (this.heap.length > 0) {
                this.heap[0] = bottom;
                this.sinkDown(0);
            }
            return top;
        }

        isEmpty() {
            return this.heap.length === 0;
        }

        bubbleUp(index) {
            while (index > 0) {
                const parent = (index - 1) >> 1;
                if (this.comparator(this.heap[index], this.heap[parent]) >= 0) break;
                [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
                index = parent;
            }
        }

        sinkDown(index) {
            const left = (index << 1) + 1;
            const right = (index << 1) + 2;
            let min = index;

            if (left < this.heap.length && this.comparator(this.heap[left], this.heap[min]) < 0) {
                min = left;
            }

            if (right < this.heap.length && this.comparator(this.heap[right], this.heap[min]) < 0) {
                min = right;
            }

            if (min !== index) {
                [this.heap[index], this.heap[min]] = [this.heap[min], this.heap[index]];
                this.sinkDown(min);
            }
        }
    }

    // Run A* search
    const paths = aStarKShortestPaths(startId, endId, K);

    // Display results using your existing UI pattern
    const resultContainer = document.getElementById('path-results');
    resultContainer.innerHTML = '';

    if (paths.length === 0) {
        showAlert(resultContainer, "No paths found between these stations.");
        return;
    }


    const total_path = document.getElementById('all-paths-result-template').content.cloneNode(true);
    total_path.querySelector('#total-path').textContent = `${kInput.value} Shortest Paths are : `;
    resultContainer.appendChild(total_path);

    const template = document.getElementById('shortest-path-result-template');
    if (template) {
        paths.forEach((pathObj, index) => {
            const clone = template.content.cloneNode(true);
            const card = clone.querySelector('.result-card');


            card.querySelector('#path-distance').textContent =
                `${index + 1}.   ${pathObj.distance.toFixed(1)} km `;

            const pathElement = card.querySelector('#path-stations');
            pathElement.innerHTML = '';

            const pathDiv = document.createElement('div');
            // pathDiv.className = 'path-item';
            pathDiv.className = 'result-details';
            pathDiv.textContent = pathObj.path.join(' → ');

            // Create tooltip with full station names
            const fullNames = pathObj.path.map(stationId => {
                const station = data.stations.find(s => s.id === stationId);
                return station ? station.name : stationId;
            }).join(' → ');

            card.title = fullNames; // Set tooltip

            pathDiv.style.cursor = 'pointer';
            pathDiv.addEventListener('click', () =>
                highlightPath(pathObj.path, index === 0 ? '#4CAF50' : '#2196F3'));

            pathElement.appendChild(pathDiv);
            resultContainer.appendChild(clone);
        });
    }


    // Highlight the first path by default
    if (paths.length > 0) {
        highlightPath(paths[0].path, '#4CAF50');
    }
}



let currentMST = [];

function calculateMST() {
    const resultContainer = document.getElementById('mst-results');
    if (!resultContainer) {
        console.error("Results container not found");
        return;
    }

    if (data.stations.length === 0 || data.tracks.length === 0) {
        showAlert(resultContainer, "Not enough stations or tracks to calculate MST.");
        return;
    }

    // Clear previous results
    resultContainer.innerHTML = '';
    clearHighlights();

    // Prim's algorithm
    const mst = [];
    const visited = new Set();
    const edges = [];
    let totalWeight = 0;
    const startStation = data.stations[0];
    visited.add(startStation.id);

    while (visited.size < data.stations.length) {
        edges.length = 0;
        visited.forEach(u => {
            graph.adjacencyList[u]?.forEach(edge => {
                if (!visited.has(edge.destination)) {
                    edges.push({
                        u,
                        v: edge.destination,
                        weight: edge.distance,
                        trackId: edge.trackId
                    });
                }
            });
        });

        if (edges.length === 0) break;
        edges.sort((a, b) => a.weight - b.weight);
        const minEdge = edges[0];
        mst.push(minEdge);
        visited.add(minEdge.v);
        totalWeight += minEdge.weight;
    }

    if (visited.size === data.stations.length) {
        currentMST = mst;
        showMSTResult(mst, totalWeight);
        highlightMST();
    } else {
        showAlert(resultContainer, "Network is disconnected. Cannot create spanning tree.");
    }
}


function showMSTResult(mst, totalWeight) {
    const resultContainer = document.getElementById('mst-results');
    resultContainer.innerHTML = '';

    // Create main result card for total distance
    const mainTemplate = document.getElementById('mst-result-template').content.cloneNode(true);
    const mainCard = mainTemplate.querySelector('.mst-summary');

    mainCard.querySelector('.total-value').textContent = `${totalWeight.toFixed(1)} km`;
    mainCard.querySelector('.station-count').textContent = `${data.stations.length} stations`;

    resultContainer.appendChild(mainCard);

    const template = document.getElementById('shortest-path-result-template');

    if (template) {
        mst.forEach((edge, index) => {
            const clone = template.content.cloneNode(true);
            const card = clone.querySelector('.result-card');

            card.querySelector('#path-distance').textContent =
                `${index + 1}.   ${edge.weight.toFixed(1)} km`;

            const pathElement = card.querySelector('#path-stations');
            pathElement.innerHTML = '';

            const pathDiv = document.createElement('div');
            pathDiv.className = 'result-details';
            pathDiv.textContent = `${edge.u} ↔ ${edge.v}`;
            pathDiv.style.cursor = 'pointer';

            // Highlight this specific edge when clicked
            card.addEventListener('click', () =>
                highlightPath([edge.u, edge.v], '#FFA500'));

            // Show station names in tooltip
            const uStation = data.stations.find(s => s.id === edge.u);
            const vStation = data.stations.find(s => s.id === edge.v);
            if (uStation && vStation) {
                card.title = `${uStation.name} ↔ ${vStation.name}`;
            }

            pathElement.appendChild(pathDiv);
            resultContainer.appendChild(clone);
        });
        showCaptureModal(`Stations: ${data.stations.length}, with MST ${totalWeight.toFixed(1)} km`, "success");
    }

    // Highlight the entire MST by default
    highlightMST();
}


function highlightMST() {
    if (currentMST.length > 0) {
        const allNodes = new Set();
        currentMST.forEach(edge => {
            allNodes.add(edge.u);
            allNodes.add(edge.v);
        });
        highlightPath(Array.from(allNodes), 'orange');
    }
}

function clearMSTResults() {
    document.getElementById('mst-result').innerHTML = '';
}
function showMSTAlert(message) {
    const resultDiv = document.getElementById('mst-result');
    resultDiv.innerHTML = `
        <div class="mst-alert">
            <span class="mst-alert-icon">⚠️</span>
            <span class="mst-alert-text">${message}</span>
        </div>
    `;
}

// Clear all highlighted paths and stations
function clearHighlights() {
    // Clear station highlights
    document.querySelectorAll('.station').forEach(station => {
        station.style.backgroundColor = '';
        station.style.border = '';
        station.style.boxShadow = '';
        station.classList.remove('highlighted-station');
    });

    // Clear track/path highlights
    document.querySelectorAll('.track').forEach(track => {
        track.style.stroke = '';
        track.style.strokeWidth = '';
        track.classList.remove('highlighted-track');
    });

    // Clear any temporary highlights
    document.querySelectorAll('.temp-highlight').forEach(el => {
        el.style.stroke = '';
        el.style.strokeWidth = '';
    });
}



// Highlight a path on the map
function highlightPath(stationIds, color) {
    // First clear existing highlights
    map.eachLayer(layer => {
        if (layer.options && layer.options.highlight) {
            map.removeLayer(layer);
        }
    });

    // Draw new highlights
    stationIds.forEach((id, index) => {
        const station = data.stations.find(s => s.id === id);
        if (!station) return;

        // Highlight station
        L.circleMarker([station.latitude, station.longitude], {
            radius: 10,
            color: color,
            fillColor: color,
            fillOpacity: 1,
            highlight: true,
            className: 'highlighted-station'
        }).addTo(map);

        // Highlight line to next station
        if (index < stationIds.length - 1) {
            const nextStation = data.stations.find(s => s.id === stationIds[index + 1]);
            if (nextStation) {
                L.polyline(
                    [
                        [station.latitude, station.longitude],
                        [nextStation.latitude, nextStation.longitude]
                    ],
                    {
                        color: color,
                        weight: 6,
                        opacity: 1,
                        highlight: true,
                        className: 'highlighted-path'
                    }
                ).addTo(map);
            }
        }
    });
}
function calculateMaxFlow() {
    const source = document.getElementById('source-station').value;
    const sink = document.getElementById('sink-station').value;

    if (!source || !sink) {
        alert("Please select both source and sink stations.");
        return;
    }

    // Ford-Fulkerson implementation
    let maxFlow = 0;
    const residualGraph = JSON.parse(JSON.stringify(graph.capacities));
    const parent = {};

    function bfs() {
        const visited = new Set();
        const queue = [source];
        visited.add(source);
        parent[source] = null;

        while (queue.length) {
            const u = queue.shift();

            for (const v in residualGraph[u]) {
                if (!visited.has(v) && residualGraph[u][v] > 0) {
                    parent[v] = u;
                    visited.add(v);
                    queue.push(v);

                    if (v === sink) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    while (bfs()) {
        let pathFlow = Infinity;
        let v = sink;

        while (v !== source) {
            const u = parent[v];
            pathFlow = Math.min(pathFlow, residualGraph[u][v]);
            v = u;
        }

        v = sink;
        while (v !== source) {
            const u = parent[v];
            residualGraph[u][v] -= pathFlow;
            residualGraph[v][u] = (residualGraph[v][u] || 0) + pathFlow;
            v = u;
        }

        maxFlow += pathFlow;
    }

    // Clear previous results
    const resultContainer = document.getElementById('path-results-mst');
    resultContainer.innerHTML = '';

    // Clone and populate the template
    const template = document.getElementById('max-flow-result-template').content.cloneNode(true);
    const resultElement = template.querySelector('.result-card');

    // Update values
    resultElement.querySelector('#max-flow-value').textContent = maxFlow;
    resultElement.querySelector('#flow-source').textContent = source;
    resultElement.querySelector('#flow-sink').textContent = sink;

    resultContainer.appendChild(resultElement);
    showCaptureModal(`Maximum flow calculated: ${maxFlow}`, "success");
}



function showAlert(container, message) {
    const alert = document.createElement('div');
    alert.className = 'result-alert';
    alert.textContent = message;
    container.appendChild(alert);
}


// let formSubmitted = false;

function handleAddTrain(e) {
    e.preventDefault();
    e.stopImmediatePropagation();

    if (formSubmitted) return;
    formSubmitted = true;

    try {
        // Collect form data
        const trainId = document.getElementById('train-id').value.trim();
        const trainName = document.getElementById('train-name').value.trim();
        const trainSpeed = document.getElementById('train-speed').value;
        const type = document.getElementById('train-type').value;
        const route = [];
        const timings = [];

        // Validate form data
        if (!trainId || !trainName || !trainSpeed || !type) {
            throw new Error("Please fill all required fields");
        }

        // Collect route data
        let validationError = false;
        document.querySelectorAll('.route-entry').forEach(entry => {
            const stationId = entry.querySelector('.station-select').value;
            const time = entry.querySelector('.station-time').value;
            if (!stationId || !time) {
                validationError = true;
                return;
            }
            route.push(stationId);
            timings.push(time);
        });

        if (validationError) {
            throw new Error("Please complete all station entries");
        }

        if (route.length < 2) {
            throw new Error("Route must have at least 2 stations");
        }

        // Prepare request data
        const trainData = {
            id: trainId,
            name: trainName,
            speed: Number(trainSpeed),
            route: route,
            type: type,
            timings: timings
        };

        // console.log("Submitting train:", trainData); // This will print once
        showCaptureModal(`"Submitting train:", ${trainId}`, "success");


        return fetch('http://localhost:5000/api/trains-add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(trainData)
        })
            .then(response => {
                console.log("Status:", response.status);
                if (!response.ok) {
                    return response.text().then(text => {
                        // alert(text || `HTTP error! status: ${response.status}`)
                        showCaptureModal(text || `HTTP error! status: ${response.status}`, "error");
                        // throw new Error(text || `HTTP error! status: ${response.status}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                if (!data) {
                    throw new Error("Empty response from server");
                }
                closeTrainModal();
                loadData();
            });
    } catch (error) {
        // console.error("Validation error:", error.message);
        alert(error.message);
        showCaptureModal("error.message", "error");
    } finally {
        formSubmitted = false;
    }
}

function closeTrainModal() {
    const trainModal = document.getElementById('train-modal');
    trainModal.style.display = 'none';
}

function editTrain(trainId) {
    const train = data.trains.find(t => t.id === trainId);
    if (!train) {
        alert('Train not found');
        return;
    }

    // Populate form
    document.getElementById('edit-train-id').value = train.id;
    document.getElementById('edit-train-name').value = train.name;
    document.getElementById('edit-train-speed').value = train.speed;
    document.getElementById('edit-train-type').value = train.type || 'passenger';

    // Clear and rebuild route entries
    const routeContainer = document.getElementById('edit-route-entries');
    routeContainer.innerHTML = '';

    train.route.forEach((stationId, index) => {
        const entry = document.createElement('div');
        entry.className = 'route-entry';
        entry.innerHTML = `
            <select class="station-select" required>
                ${generateStationOptions(stationId)}
            </select>
            <input type="time" class="station-time" value="${train.timings?.[index] || '00:00'}" required>
            <button type="button" class="remove-station">×</button>
        `;
        routeContainer.appendChild(entry);
    });

    // Show modal
    document.getElementById('edit-train-modal').style.display = 'block';
    currentEditingTrainId = trainId;
}



function generateStationOptions(selectedId) {
    let options = '<option value="">Select Station</option>';
    data.stations.forEach(station => {
        const selected = station.id === selectedId ? 'selected' : '';
        options += `<option value="${station.id}" ${selected}>${station.name} (${station.id})</option>`;
    });
    return options;
}

function closeEditTrainModal() {
    document.getElementById('edit-train-modal').style.display = 'none';
    currentEditingTrainId = null;
}




// Train Management Functions
function setupTrainManagement() {
    // Modal controls
    const openAddTrainModalBtn = document.getElementById('open-add-train-modal');
    const closeAddTrainModalBtn = document.getElementById('close-add-train-modal');
    const trainModal = document.getElementById('train-modal');
    const addTrainForm = document.getElementById('add-train-form');
    const routeEntries = document.getElementById('route-entries');
    const editRouteEntries = document.getElementById('edit-route-entries');
    const addStationBtn = document.getElementById('add-station');
    const trainsTableBody = document.querySelector('#trains-table tbody');

    // Event listeners
    openAddTrainModalBtn.addEventListener('click', openTrainModal);
    closeAddTrainModalBtn.addEventListener('click', closeTrainModal);
    addStationBtn.addEventListener('click', addStationEntry);
    addTrainForm.addEventListener('submit', handleAddTrain);

    // Event delegation for dynamic elements
    routeEntries.addEventListener('click', function (e) {
        if (e.target.classList.contains('remove-station')) {
            e.target.closest('.route-entry').remove();
        }
    });
    editRouteEntries.addEventListener('click', function (e) {
        if (e.target.classList.contains('remove-station')) {
            e.target.closest('.route-entry').remove();
        }
    });

    trainsTableBody.addEventListener('click', function (e) {
        if (e.target.classList.contains('delete-train')) {
            const trainId = e.target.getAttribute('data-train-id');
            deleteTrain(trainId);
        } else if (e.target.classList.contains('edit-train')) {
            const trainId = e.target.getAttribute('data-train-id');
            editTrain(trainId);
        }
    });

    function openTrainModal() {
        // Ensure data is loaded first
        if (data.stations.length === 0) {
            loadData().then(() => {
                document.getElementById('train-modal').style.display = 'block';
                populateAllStationDropdowns();
                resetTrainForm();
            });
        } else {
            document.getElementById('train-modal').style.display = 'block';
            populateAllStationDropdowns();
        }
    }

    function resetTrainForm() {
        addTrainForm.reset();
        // Clear all but first station entry
        const entries = routeEntries.querySelectorAll('.route-entry');
        for (let i = 1; i < entries.length; i++) {
            entries[i].remove();
        }
        // Reset first entry
        const firstEntry = entries[0];
        firstEntry.querySelector('.station-select').value = '';
        firstEntry.querySelector('.station-time').value = '';
    }
    function resetTrainForm() {
        addTrainForm.reset();
        // Clear all but first station entry
        const entries = routeEntries.querySelectorAll('.route-entry');
        for (let i = 1; i < entries.length; i++) {
            entries[i].remove();
        }
        // Reset first entry
        const firstEntry = entries[0];
        firstEntry.querySelector('.station-select').value = '';
        firstEntry.querySelector('.station-time').value = '';
    }

    function addStationEntry() {
        const newEntry = document.createElement('div');
        newEntry.className = 'route-entry';
        newEntry.innerHTML = `
            <select class="station-select" required>
                <option value="">Select Station</option>
            </select>
            <input type="time" class="station-time" required>
            <button type="button" class="remove-station">×</button>
        `;
        document.getElementById('route-entries').appendChild(newEntry);

        // Populate the new dropdown
        populateStationDropdown(newEntry.querySelector('.station-select'));
    }

    document.getElementById('edit-train-form').addEventListener('submit', async function (e) {
        e.preventDefault();

        try {
            // Collect form data
            const trainData = {
                id: document.getElementById('edit-train-id').value,
                name: document.getElementById('edit-train-name').value,
                speed: parseInt(document.getElementById('edit-train-speed').value),
                type: document.getElementById('edit-train-type').value,
                route: [],
                timings: []
            };

            // Collect route data
            document.querySelectorAll('#edit-route-entries .route-entry').forEach(entry => {
                const stationId = entry.querySelector('.station-select').value;
                const time = entry.querySelector('.station-time').value;
                if (stationId && time) {
                    trainData.route.push(stationId);
                    trainData.timings.push(time);
                }
            });

            // Validate
            if (trainData.route.length < 2) {
                throw new Error('Route must have at least 2 stations');
            }

            // Show loading state
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            // Send to server
            const response = await fetch(`http://localhost:5000/api/trains/${currentEditingTrainId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(trainData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                showCaptureModal(errorData.message || 'Failed to update train', "error");
                throw new Error(errorData.message || 'Failed to update train');
            }

            const result = await response.json();

            if (result.status === 'success') {
                // Close modal and refresh data
                closeEditTrainModal();
                loadData();
                showCaptureModal("Train updated successfully", "success");

                // alert('Train updated successfully');
            } else {
                showCaptureModal(result.message || 'Train update failed', "error");
                throw new Error(result.message || 'Train update failed');
            }
        } catch (error) {
            showCaptureModal(`'Error updating train:', error`, "error");
            console.error('Error updating train:', error);
            alert(error.message);
        } finally {
            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Changes';
            }
        }
    });

    // Add station button for edit form
    document.getElementById('add-edit-station').addEventListener('click', function () {
        const entry = document.createElement('div');
        entry.className = 'route-entry';
        entry.innerHTML = `
            <select class="station-select" required>
                <option value="">Select Station</option>
            </select>
            <input type="time" class="station-time" required>
            <button type="button" class="remove-station flex-c">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        document.getElementById('edit-route-entries').appendChild(entry);
        populateStationDropdown(entry.querySelector('.station-select'));
    });

}

function populateAllStationDropdowns() {
    document.querySelectorAll('.station-select').forEach(select => {
        populateStationDropdown(select);
    });
}

function populateStationDropdown(selectElement) {
    // Clear existing options except first one
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    // Add station options
    data.stations.forEach(station => {
        const option = document.createElement('option');
        option.value = station.id;
        option.textContent = `${station.name} (${station.id})`;
        selectElement.appendChild(option);
    });
}


function renderTrainsTable() {
    const tbody = document.querySelector('#trains-table tbody');
    tbody.innerHTML = '';

    // Create station ID to name mapping
    const stationNames = {};
    data.stations.forEach(station => {
        stationNames[station.id] = station.name;
    });

    data.trains.forEach(train => {
        const tr = document.createElement('tr');

        // Format route with timings
        let routeDisplay = '';
        if (train.route && train.timings && train.route.length === train.timings.length) {
            routeDisplay = train.route.map((stationId, index) => {
                return `${stationNames[stationId] || stationId} (${train.timings[index]})`;
            }).join(' → ');
        } else {
            routeDisplay = train.route.join(' → ');
        }

        tr.innerHTML = `
        <td>${train.id}</td>
        <td>${train.name}</td>
        <td>${routeDisplay}</td>
        <td>${train.speed} km/h</td>
        <td><button class="btn btn-primary btn-edit" data-id="${train.id}">Edit</button></td>
        <td><button class="btn btn-delete" data-id="${train.id}">Delete</button></td>
    `;
        tbody.appendChild(tr);
    });

    // Add event listeners for edit/delete buttons
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', function () {
            const trainId = this.getAttribute('data-id');
            editTrain(trainId);
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', function () {
            const trainId = this.getAttribute('data-id');
            if (confirm(`Delete train ${trainId}?`)) {
                deleteTrain(trainId);
            }
        });
    });
}

// Utility Functions
function showCaptureModal(message, type) {
    let modal = document.getElementById("msg-modal");
    let messageElement = document.getElementById("showMessage");

    let icon = type === "success" ? '<i class="fa-solid fa-check-circle fa-xl mr-2"></i>' : '<i class="fa-solid fa-times-circle fa-xl mr-2"></i>';

    messageElement.innerHTML = `${icon} ${message}`;
    modal.className = `msg-modal show ${type}`;
    modal.style.display = "block";

    setTimeout(() => {
        modal.classList.remove("show");
        setTimeout(() => { modal.style.display = "none"; }, 500);
    }, 2000);
}

function closeMsgModal() {
    let modal = document.getElementById("msg-modal");
    modal.classList.remove("show");
    setTimeout(() => { modal.style.display = "none"; }, 500);
}


// for dashboard
function animateCount(elementId, targetNumber, duration = 1000) {
    const element = document.getElementById(elementId);
    const startNumber = parseInt(element.textContent) || 0;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const currentNumber = Math.floor(startNumber + (targetNumber - startNumber) * progress);
        element.textContent = currentNumber;

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

function updateMetrics() {
    fetch('http://localhost:5000/api/get_count')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            animateCount('total-trains', data.total_trains);
            animateCount('total-stations', data.total_stations);
            animateCount('total-tracks', data.total_tracks);
            animateCount('total-bookings', data.total_bookings);
            animateCount('total-track-close', data.total_track_closures);
            animateCount('total-stations-close', data.total_station_closures);
            document.getElementById('last-updated-time').textContent = new Date().toLocaleString();
        })
        .catch(error => {
            console.error('Error fetching metrics:', error);
            document.getElementById('total-trains').textContent = 'N/A';
            document.getElementById('total-stations').textContent = 'N/A';
            document.getElementById('total-tracks').textContent = 'N/A';
            document.getElementById('total-bookings').textContent = 'N/A';
        });
}

// Initialize metrics
updateMetrics();
setInterval(updateMetrics, 30000);








// for message modal 
function showCaptureModal(message, type) {
    let modal = document.getElementById("msg-modal");
    let messageElement = document.getElementById("showMessage");

    let icon = type === "success" ? '<i class="fa-solid fa-check-circle fa-xl mr-2"></i>' : '<i class="fa-solid fa-times-circle fa-xl mr-2"></i>';

    messageElement.innerHTML = `${icon} ${message}`;
    modal.className = `msg-modal show ${type}`; // Add success/error class
    modal.style.display = "block";

    // Auto-close modal after 3 seconds
    setTimeout(() => {
        modal.classList.remove("show");
        setTimeout(() => { modal.style.display = "none"; }, 500);
    }, 3000);
}

function closeMsgModal() {
    let modal = document.getElementById("msg-modal");
    modal.classList.remove("show");
    setTimeout(() => { modal.style.display = "none"; }, 500);
}




// for draggable dispaly 
document.addEventListener('DOMContentLoaded', function () {
    const container = document.querySelector('.container');
    const controlPanel = document.querySelector('.control-panel');
    const map = document.getElementById('map');
    const resizeHandle = document.createElement('div');

    // Create and add resize handle
    resizeHandle.classList.add('resize-handle');
    controlPanel.appendChild(resizeHandle);


    // tooltip element
    resizeHandle.classList.add('resize-handle');
    resizeHandle.title = 'Drag to resize';

    let isResizing = false;
    let startX, startWidth;

    // Mouse down event - start resizing
    resizeHandle.addEventListener('mousedown', function (e) {
        isResizing = true;
        startX = e.clientX;
        startWidth = parseInt(document.defaultView.getComputedStyle(controlPanel).width, 10);
        resizeHandle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    // Mouse move event - handle resizing
    document.addEventListener('mousemove', function (e) {
        if (!isResizing) return;

        const newWidth = startWidth + e.clientX - startX;
        const minWidth = parseInt(getComputedStyle(controlPanel).minWidth, 10);
        const maxWidth = parseInt(getComputedStyle(controlPanel).maxWidth, 10);

        // Apply boundary checks
        const clampedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
        controlPanel.style.width = `${clampedWidth}px`;

        void controlPanel.offsetHeight;
        currentWidth = clampedWidth;

    });

    // Mouse up event - stop resizing
    document.addEventListener('mouseup', function () {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('active');
            document.body.style.cursor = '';
        }
    });

    // Touch events for mobile
    resizeHandle.addEventListener('touchstart', function (e) {
        isResizing = true;
        startX = e.touches[0].clientX;
        startWidth = parseInt(document.defaultView.getComputedStyle(controlPanel).width, 10);
        resizeHandle.classList.add('active');
        e.preventDefault();
    });

    document.addEventListener('touchmove', function (e) {
        if (!isResizing) return;
        const newWidth = startWidth + e.touches[0].clientX - startX;
        const minWidth = parseInt(getComputedStyle(controlPanel).minWidth, 10);
        const maxWidth = parseInt(getComputedStyle(controlPanel).maxWidth, 10);
        const clampedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
        controlPanel.style.width = `${clampedWidth}px`;
        e.preventDefault();
    });


    document.addEventListener('touchend', function () {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('active');
        }
    });
});