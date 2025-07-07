// Global data variable
let trainData = {
    stations: [],
    tracks: [],
    trains: []
};

// Fare calculation parameters
const fareConfig = {

    baseFarePerKm: {
        'sleeper': 0.6,
        '3ac': 1.5,
        '2ac': 2.2,
        '1ac': 4.0,
        'chair car': 1.8,
        'executive chair car': 3.0
    },
    quotaMultipliers: {
        'general': 1.0,
        'tatkal': 1.3,
        'premium tatkal': 1.5,
        'ladies': 0.75,
        'senior citizen': 0.5
    },

    trainMultipliers: {
        'default': 1.0, // fallback multiplier

        // Premium high-speed trains
        'Rajdhani Express': 1.6,
        'Shatabdi Express': 1.6,
        'Duronto Express': 1.6,

        // Semi-premium/long-distance fast trains
        'Garib Rath Express': 1.3,
        'Sampark Kranti Express': 1.3,
        'Superfast Express': 1.2,
        'Jan Shatabdi Express': 1.1,
        'Intercity Express': 1.0,

        // Regular express/mail trains
        'Mail Express': 1.0,

        // Slow trains
        'Passenger Special': 0.8
    }

};

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function () {
    loadTrainData();
    setupEventListeners();
    setupModal();

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
    document.getElementById('date').min = today;
});

function swap() {
    let from = document.getElementById('from');
    let to = document.getElementById('to');

    const temp = from.value;
    from.value = to.value;
    to.value = temp;
}

// Load train data from server
function loadTrainData() {
    fetch('http://localhost:5000/api/data')
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(data => {
            trainData = data;
            populateStationDropdowns();
        })
        .catch(err => {
            console.error("Error loading train data:", err);
            showCaptureModal("Error loading train data. Please try again later.", "error");
            // showError("Error loading train data. Please try again later.");
        });
}

function populateStationDropdowns() {
    const fromSelect = document.getElementById('from');
    const toSelect = document.getElementById('to');

    const sortedStations = [...trainData.stations].sort((a, b) =>
        a.name.localeCompare(b.name)
    );

    sortedStations.forEach(station => {
        const option1 = new Option(`${station.name} (${station.id})`, station.id);
        fromSelect.add(option1);

        const option2 = new Option(`${station.name} (${station.id})`, station.id);
        toSelect.add(option2);
    });
}

function setupEventListeners() {
    document.getElementById('bookingForm').addEventListener('submit', function (e) {
        e.preventDefault();
        searchTrains();
    });

    document.querySelectorAll('.sort-option').forEach(option => {
        option.addEventListener('click', function () {
            document.querySelectorAll('.sort-option').forEach(opt =>
                opt.classList.remove('active')
            );
            this.classList.add('active');
            document.getElementById('sort').value = this.dataset.sort;

            if (document.getElementById('results').children.length > 0) {
                const from = document.getElementById('from').value;
                const to = document.getElementById('to').value;
                const date = document.getElementById('date').value;
                const classType = document.getElementById('class').value;
                const quota = document.getElementById('quota').value;

                if (from && to && date) {
                    let results = findAvailableTrains(from, to);
                    results = this.dataset.sort === 'fare' ?
                        sortByFare(results, classType, quota) :
                        sortByTime(results);
                    displayResults(results, date, classType, quota);
                }
            }
        });
    });

    document.getElementById('viewTicketsBtn').addEventListener('click', viewBookedTickets);
}

function setupModal() {
    const modal = document.getElementById("bookingModal");
    const span = document.getElementsByClassName("close")[0];

    span.onclick = function () {
        modal.style.display = "none";
    }

    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    document.getElementById('bookingForm-modal').addEventListener('submit', handleModalSubmit);
}

async function handleModalSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const passengerName = document.getElementById('passenger-name').value;
    const passengerAge = document.getElementById('passenger-age').value;
    const passengerGender = document.getElementById('passenger-gender').value;
    const passengerCount = document.getElementById('passenger-count').value;

    if (!passengerName || !passengerAge || !passengerGender || !passengerCount) {
        showError("Please fill all passenger details");
        return;
    }

    const submitBtn = form.querySelector('.btn');
    // submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Processing...';

    try {
        const trainId = form.dataset.trainId;
        const date = form.dataset.date;
        const classType = form.dataset.classType;
        const quota = form.dataset.quota;

        const train = trainData.trains.find(t => t.id === trainId);
        const from = document.getElementById('from').value;
        const to = document.getElementById('to').value;
        const fromStation = trainData.stations.find(s => s.id === from);
        const toStation = trainData.stations.find(s => s.id === to);

        const distance = calculateDistance(train.route, from, to);
        const farePerPerson = calculateFare(distance, classType, quota, train.type, train.speed);
        const totalFare = farePerPerson * passengerCount;

        const bookingData = {
            bookingId: generateBookingId(),
            trainId,
            trainName: train.name,
            from: fromStation.id,
            fromName: fromStation.name,
            to: toStation.id,
            toName: toStation.name,
            date,
            class: classType,
            quota,
            fare: totalFare.toFixed(2),
            departureTime: train.timings[train.route.indexOf(from)],
            arrivalTime: train.timings[train.route.indexOf(to)],
            bookingTime: new Date().toISOString(),
            status: 'confirmed',
            passengerCount: parseInt(passengerCount),
            passengerDetails: {
                name: passengerName,
                age: passengerAge,
                gender: passengerGender
            }
        };

        const response = await fetch('http://localhost:5000/api/bookings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bookingData)
        });

        if (!response.ok)
        {
            showCaptureModal("Booking failed. Please try again.", "error");
            // showCaptureModal("Booking failed", "error");
            throw new Error('Booking failed');
        }

        const result = await response.json();
        document.getElementById("bookingModal").style.display = "none";
        form.reset();
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-ticket-alt"></i> Confirm Booking';


        showCaptureModal(`Booking confirmed! Reference: ${result.bookingId}`, "success");

        // showSuccess(`Booking confirmed! Reference: ${result.bookingId}`);

        const trainCard = document.querySelector(`.train-card[data-train-id="${trainId}"]`);
        if (trainCard) {
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn btn-primary';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download Ticket';
            downloadBtn.onclick = () => downloadTicket(result.bookingId);
            trainCard.querySelector('.book-btn').after(downloadBtn);
        }
    } catch (error) {
        console.error('Booking error:', error);
        // showCaptureModal("Booking failed. Please try again.", "error");
        
        showCaptureModal("Booking failed. Please try again.", "error");


        // showError("Booking failed. Please try again.");
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-ticket-alt"></i> Confirm Booking';
    }
}

window.bookTicket = function (trainId, date, classType, quota) {
    const train = trainData.trains.find(t => t.id === trainId);
    if (!train) {
        showCaptureModal("Train not found", "error");

        // showError("Train not found");
        return;
    }

    const from = document.getElementById('from').value;
    const to = document.getElementById('to').value;
    const fromStation = trainData.stations.find(s => s.id === from);
    const toStation = trainData.stations.find(s => s.id === to);

    const distance = calculateDistance(train.route, from, to);
    const fare = calculateFare(distance, classType, quota, train.type, train.speed);

    document.getElementById('modal-train-name').textContent = `${train.name} (${train.id})`;
    document.getElementById('modal-train-timings').textContent =
        `Dep: ${train.timings[train.route.indexOf(from)]} (${fromStation.name}) → Arr: ${train.timings[train.route.indexOf(to)]} (${toStation.name})`;
    document.getElementById('modal-train-class').textContent =
        `Class: ${classType} | Quota: ${quota.charAt(0).toUpperCase() + quota.slice(1)}`;
    document.getElementById('modal-train-fare').textContent = `Approx. Fare: ₹${fare.toFixed(2)} per person`;

    const modalForm = document.getElementById('bookingForm-modal');
    modalForm.dataset.trainId = trainId;
    modalForm.dataset.date = date;
    modalForm.dataset.classType = classType;
    modalForm.dataset.quota = quota;

    document.getElementById("bookingModal").style.display = "block";
};

async function downloadTicket(bookingId) {
    try {
        // Fetch booking data from backend using the specific booking ID
        const response = await fetch(`http://localhost:5000/api/get_booking/${bookingId}`);
        if (!response.ok) {
            showCaptureModal("Failed to fetch booking data", "error");
            throw new Error('Failed to fetch booking data');
        }
        
        const booking = await response.json();
        
        // Create a new jsPDF instance
        const doc = new jspdf.jsPDF();
        
        // Add logo/title
        doc.setFontSize(24);
        doc.setTextColor(0, 102, 204);
        doc.text('RAILWAY RESERVATION', 105, 20, { align: 'center' });
        doc.setFontSize(18);
        doc.setTextColor(0, 0, 0);
        doc.text('E-TICKET', 105, 30, { align: 'center' });
        
        // Format date for display
        const bookingDate = new Date(booking.date);
        const formattedDate = bookingDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
        
        // Format booking time
        const bookingTime = new Date(booking.bookingTime);
        const formattedBookingTime = bookingTime.toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
        
        // Add ticket details using real booking data
        doc.setFontSize(12);
        doc.text(`Booking ID: ${booking.bookingId}`, 20, 50);
        doc.text(`Train: ${booking.trainName} (${booking.trainId})`, 20, 60);
        doc.text(`From: ${booking.fromName} (${booking.from})`, 20, 70);
        doc.text(`To: ${booking.toName} (${booking.to})`, 20, 80);
        doc.text(`Date: ${formattedDate}`, 20, 90);
        doc.text(`Departure: ${booking.departureTime}`, 20, 100);
        doc.text(`Arrival: ${booking.arrivalTime}`, 20, 110);
        doc.text(`Class: ${booking.class.toUpperCase()}`, 20, 120);
        doc.text(`Quota: ${booking.quota.toUpperCase()}`, 20, 130);
        doc.text(`Passenger: ${booking.passengerDetails.name} (${booking.passengerDetails.gender}, ${booking.passengerDetails.age} years)`, 20, 140);
        doc.text(`Fare: Rs ${booking.fare}`, 20, 150);
        doc.text(`Status: ${booking.status.toUpperCase()}`, 20, 160);
        doc.text(`Booked on: ${formattedBookingTime}`, 20, 170);
        
        // Add barcode (simple text representation)
        doc.setFontSize(36);
        doc.text(`*${booking.bookingId}*`, 105, 190, { align: 'center' });
        
        // Add footer
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text('Please carry valid ID proof when traveling', 105, 220, { align: 'center' });
        doc.text(`© ${new Date().getFullYear()} Railway Reservation System`, 105, 230, { align: 'center' });
        
        // Save the PDF
        doc.save(`Ticket_${booking.bookingId}.pdf`);
        
    } catch (error) {
        console.error('Error generating ticket:', error);
        showCaptureModal(`Error generating ticket: ${error.message}`, "error");

        // alert(`Error generating ticket: ${error.message}`);
    }
}


window.cancelBooking = async function (bookingId) {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    try {
        const bookingCard = document.querySelector(`.booking-card:has(button[onclick*="${bookingId}"])`);
        if (bookingCard) {
            bookingCard.style.transition = 'all 0.3s';
            bookingCard.style.opacity = '0.5';
            const cancelBtn = bookingCard.querySelector('.btn btn-primary');
            if (cancelBtn) {
                cancelBtn.disabled = true;
                cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelling...';
            }
        }

        const response = await fetch(`http://localhost:5000/api/bookings/${bookingId}`, {
            method: 'DELETE'
        });

        if (!response.ok)
        {
            showCaptureModal("Error in cancel ticket. Please try later. !", "error");
            throw new Error(await response.text());
        }

        showCaptureModal("Booking cancelled successfully", "success");

        if (bookingCard) {
            bookingCard.style.height = `${bookingCard.offsetHeight}px`;
            bookingCard.offsetHeight;
            bookingCard.style.height = '0';
            bookingCard.style.padding = '0';
            bookingCard.style.margin = '0';
            bookingCard.style.border = 'none';

            setTimeout(() => {
                bookingCard.remove();
                if (!document.querySelector('.booking-card')) {
                    document.getElementById('results').innerHTML = `
                        <div class="no-trains">
                            <p>No bookings found.</p>
                        </div>
                    `;
                }
                // showSuccess('Booking cancelled successfully');
            }, 300);
        }
    } catch (error) {
        console.error('Cancellation error:', error);
        const bookingCard = document.querySelector(`.booking-card:has(button[onclick*="${bookingId}"])`);
        if (bookingCard) {
            bookingCard.style.opacity = '1';
            const cancelBtn = bookingCard.querySelector('.cancel-btn');
            if (cancelBtn) {
                cancelBtn.disabled = false;
                cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel Booking';
            }
        }
        showCaptureModal(`error.message || "Failed to cancel booking"`, "error");
        // showError(error.message || "Failed to cancel booking");
    }
};

function searchTrains() {
    const from = document.getElementById('from').value;
    const to = document.getElementById('to').value;
    const date = document.getElementById('date').value;
    const classType = document.getElementById('class').value;
    const quota = document.getElementById('quota').value;
    const sortBy = document.getElementById('sort').value;

    if (!from || !to) {
        showError("Please select From and To stations");
        return;
    }

    if (!date) {
        showError("Please select a travel date");
        return;
    }

    const fromStation = trainData.stations.find(s => s.id === from);
    const toStation = trainData.stations.find(s => s.id === to);

    if (!fromStation || !toStation) {
        showError("Invalid station selection");
        return;
    }

    let results = findAvailableTrains(from, to);
    results = sortBy === 'fare' ?
        sortByFare(results, classType, quota) :
        sortByTime(results);

    displayResults(results, date, classType, quota);
}

function findAvailableTrains(source, destination) {
    const availableTrains = trainData.trains.filter(train => {
        const sourceIndex = train.route.indexOf(source);
        const destIndex = train.route.indexOf(destination);

        if (sourceIndex === -1 || destIndex === -1 || sourceIndex >= destIndex) {
            return false;
        }

        for (let i = sourceIndex; i < destIndex; i++) {
            const track = findTrack(train.route[i], train.route[i + 1]);
            if (!track) return false;
        }

        return true;
    });

    return availableTrains.map(train => {
        const sourceIndex = train.route.indexOf(source);
        const destIndex = train.route.indexOf(destination);

        let totalDistance = 0;
        for (let i = sourceIndex; i < destIndex; i++) {
            const track = findTrack(train.route[i], train.route[i + 1]);
            totalDistance += track.distance;
        }

        const [depH, depM] = train.timings[sourceIndex].split(':').map(Number);
        const [arrH, arrM] = train.timings[destIndex].split(':').map(Number);
        let durationMinutes = (arrH * 60 + arrM) - (depH * 60 + depM);
        if (durationMinutes < 0) durationMinutes += 1440;

        return {
            id: train.id,
            name: train.name,
            type: train.type || 'Express',
            speed: train.speed || 80,
            departureTime: train.timings[sourceIndex],
            arrivalTime: train.timings[destIndex],
            duration: formatDuration(durationMinutes),
            durationMinutes: durationMinutes,
            distance: totalDistance,
            route: train.route.slice(sourceIndex, destIndex + 1),
            routeStations: train.route.slice(sourceIndex, destIndex + 1).map(stationId => {
                const station = trainData.stations.find(s => s.id === stationId);
                return station ? station.name : stationId;
            }),
            timings: train.timings.slice(sourceIndex, destIndex + 1)
        };
    });
}

function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
}

function sortByFare(trains, classType, quota) {
    return [...trains].sort((a, b) => {
        const fareA = calculateFare(a.distance, classType, quota, a.type, a.speed);
        const fareB = calculateFare(b.distance, classType, quota, b.type, b.speed);
        return fareA - fareB;
    });
}

function sortByTime(trains) {
    return [...trains].sort((a, b) => a.durationMinutes - b.durationMinutes);
}

function findTrack(source, destination) {
    return trainData.tracks.find(track =>
        (track.source === source && track.destination === destination) ||
        (track.bidirectional && track.source === destination && track.destination === source)
    );
}

function calculateFare(distance, classType, quota, trainType) {
    const baseFare = fareConfig.baseFarePerKm[classType];
    const trainFactor = fareConfig.trainMultipliers[trainType] || fareConfig.trainMultipliers.default;
    const quotaFactor = fareConfig.quotaMultipliers[quota];

    let fare = distance * baseFare * trainFactor * quotaFactor;
    return fare;
}


function displayResults(trains, date, classType, quota) {
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = '';

    if (trains.length === 0) {
        resultsContainer.innerHTML = `
        <div class="no-trains">
          <p>No trains found for the selected route.</p>
          <p>Please try different stations or check back later.</p>
        </div>
      `;
        return;
    }

    trains.forEach(train => {
        const fare = calculateFare(train.distance, classType, quota, train.type, train.speed);
        const routeSummary = train.routeStations.map((station, index) =>
            `${station} (${train.timings[index]})`
        ).join(' → ');

        const trainCard = document.createElement('div');
        trainCard.className = 'train-card';
        trainCard.setAttribute('data-train-id', train.id);
        trainCard.innerHTML = `
        <div class="train-header">
          <h3>${train.name} (${train.id})</h3>
          <span class="train-type">${train.type}</span>
        </div>
        
        <div class="train-timings">
          <div class="timing">
            <span class="time">${train.departureTime}</span>
            <span class="station">${train.routeStations[0]}</span>
          </div>
          <div class="duration">
            ${train.duration}
          </div>
          <div class="timing">
            <span class="time">${train.arrivalTime}</span>
            <span class="station">${train.routeStations[train.routeStations.length - 1]}</span>
          </div>
        </div>
        
        <div class="train-details">
          <div><strong>Distance:</strong> ${train.distance.toFixed(2)} km</div>
          <div><strong>Duration:</strong> ${train.duration}</div>
          <div><strong>Fare (per person):</strong> ₹${fare.toFixed(2)}</div>
        </div>
        
        <div class="route-details">
            <div class="route-line">
                <h4>Route:</h4>
                ${routeSummary}
          </div>
        </div>
        
        <button class="btn btn-primary btn-block" onclick="bookTicket('${train.id}', '${date}', '${classType}', '${quota}')">
          <i class="fas fa-ticket-alt mr-2"></i> Book Now
        </button>
      `;

        resultsContainer.appendChild(trainCard);
    });
}

async function viewBookedTickets() {
    try {
        const response = await fetch('http://localhost:5000/api/bookings');
        if (!response.ok) throw new Error('Failed to fetch bookings');
        const bookings = await response.json();
        displayBookings(bookings);
        showCaptureModal(`Booked tickets are ...`, "success");
    } catch (error) {
        console.error('Error fetching bookings:', error);
        showCaptureModal("Failed to load bookings. Please try again.", "error");

        // showError("Failed to load bookings. Please try again.");
    }
}

function displayBookings(bookings) {
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = '';

    if (bookings.length === 0) {
        resultsContainer.innerHTML = `
        <div class="no-trains">
          <p>No bookings found.</p>
        </div>
      `;
        return;
    }

    const bookingsList = document.createElement('div');
    bookingsList.className = 'bookings-list';
    bookingsList.innerHTML = `
      <div class="bookings-header flex-b mb-3">
        <h2><i class="fas fa-ticket-alt"></i> My Bookings</h2>
        <button class="close-btn" onclick="document.getElementById('results').innerHTML=''">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    bookings.forEach(booking => {
        const bookingCard = document.createElement('div');
        bookingCard.className = 'booking-card';
        bookingCard.innerHTML = `
        <div class="train-header">
          <h3>${booking.trainName} (${booking.trainId})</h3>
          <span class="train-type ${booking.status}">${booking.status}</span>
        </div>
        
        <div class="booking-details">
          <div><strong>Passenger Name :</strong> ${booking.passengerDetails.name}</div>
          <div><strong>Age :</strong> ${booking.passengerDetails.age} Y</div>
          <div><strong>Gender :</strong> ${booking.passengerDetails.gender}</div>
          <div><strong>From:</strong> ${booking.fromName}</div>
          <div><strong>To:</strong> ${booking.toName}</div>
          <div><strong>Date:</strong> ${booking.date}</div>
          <div><strong>Class:</strong> ${booking.class}</div>
          <div><strong>Quota:</strong> ${booking.quota}</div>
          <div><strong>Fare:</strong> ₹${booking.fare}</div>
          <div><strong>Passengers:</strong> ${booking.passengerCount || 1}</div>
          <div><strong>Booking ID:</strong> ${booking.bookingId}</div>
        </div>
        
        <div class="train-timings mb-3">
          <div class="timing">
            <span class="time">${booking.departureTime}</span>
            <span class="station">${booking.fromName}</span>
          </div>
          <div class="duration">
            ${formatDuration(calculateDuration(booking.departureTime, booking.arrivalTime))}
          </div>
          <div class="timing">
            <span class="time">${booking.arrivalTime}</span>
            <span class="station">${booking.toName}</span>
          </div>
        </div>
        
            <button class="btn btn-primary mr-2" onclick="downloadTicket('${booking.bookingId}', event)">
            <i class="fas fa-download mr-2"></i> Download Ticket
            </button>
            
            ${booking.status === 'confirmed' ? `
            <button class="btn btn-delete" onclick="cancelBooking('${booking.bookingId}')">
                <i class="fas fa-times mr-2"></i> Cancel Booking
            </button>
            ` : ''}
      `;

        bookingsList.appendChild(bookingCard);
    });

    resultsContainer.appendChild(bookingsList);
}

function calculateDistance(route, from, to) {
    const fromIndex = route.indexOf(from);
    const toIndex = route.indexOf(to);
    let distance = 0;

    for (let i = fromIndex; i < toIndex; i++) {
        const track = findTrack(route[i], route[i + 1]);
        if (track) distance += track.distance;
    }

    return distance;
}

function generateBookingId() {
    return 'B' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

function calculateDuration(departureTime, arrivalTime) {
    const [depH, depM] = departureTime.split(':').map(Number);
    const [arrH, arrM] = arrivalTime.split(':').map(Number);

    let durationMinutes = (arrH * 60 + arrM) - (depH * 60 + depM);
    if (durationMinutes < 0) durationMinutes += 1440;
    return durationMinutes;
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message d-flex align-items-center';
    successDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.querySelector('.booking-card').insertBefore(successDiv, document.querySelector('#bookingForm'));
    setTimeout(() => successDiv.remove(), 5000);
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message d-flex align-items-center';
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    document.querySelector('.booking-card').insertBefore(errorDiv, document.querySelector('#bookingForm'));
    setTimeout(() => errorDiv.remove(), 5000);
}



// // for message modal 
function showCaptureModal(message, type) {
    let modal = document.getElementById("msg-modal");
    let messageElement = document.getElementById("showMessage");

    let icon = type === "success" ? '<i class="fa-solid fa-check-circle fa-xl mr-2"></i>' : '<i class="fa-solid fa-times-circle fa-xl mr-2"></i>';

    messageElement.innerHTML = `${icon} ${message}`;
    modal.className = `msg-modal show ${type}`; // Add success/error class
    modal.style.display = "block";

    // Auto-close modal after 2 seconds
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
