from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='static')
CORS(app)  # Enable CORS for all routes

# Configuration
DATA_FILE = 'data/railways.json'

# Global variable to cache counts
metrics_cache = {
    'total_trains': 0,
    'total_stations': 0,
    'total_tracks': 0,
    'total_bookings': 0,
    'total_track_closures':0,
    'total_station_closures':0
}

# Ensure data directory exists
os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)

def load_data():
    """Load railway data from JSON file and clean up expired closures"""
    if not os.path.exists(DATA_FILE):
        return {
            "stations": [],
            "tracks": [],
            "trains": [],
            "bookings": [],
            "station_closures": [],
            "track_closures": []
        }
    
    with open(DATA_FILE) as f:
        data = json.load(f)
    
    current_time = datetime.now()
    
    # Clean up expired station closures
    if 'station_closures' in data:
        initial_count = len(data['station_closures'])
        data['station_closures'] = [
            c for c in data['station_closures']
            if 'startTime' in c and 
            current_time - datetime.fromisoformat(c['startTime']) < timedelta(hours=c.get('duration', 0))
        ]
        if len(data['station_closures']) != initial_count:
            save_data(data)  # Save if we removed any
    
    # Clean up expired track closures
    if 'track_closures' in data:
        initial_count = len(data['track_closures'])
        data['track_closures'] = [
            c for c in data['track_closures']
            if 'startTime' in c and 
            current_time - datetime.fromisoformat(c['startTime']) < timedelta(hours=c.get('duration', 0))
        ]
        if len(data['track_closures']) != initial_count:
            save_data(data)  # Save if we removed any
    
    return data

def save_data(data):
    """Save railway data to JSON file"""
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def update_metrics_cache():
    """Update the cached metrics"""
    data = load_data()
    metrics_cache['total_trains'] = len(data['trains'])
    metrics_cache['total_stations'] = len(data['stations'])
    metrics_cache['total_tracks'] = len(data['tracks'])
    metrics_cache['total_station_closures'] = len(data['station_closures'])
    metrics_cache['total_track_closures'] = len(data['track_closures'])
    # print( len(data['track_closures']))
    metrics_cache['total_bookings'] = len(data.get('bookings', []))

# --------------------------
# Station Closure Endpoints
# --------------------------

@app.route('/api/station-closures', methods=['GET'])
def get_station_closures():
    """Get all active station closures"""
    data = load_data()
    current_time = datetime.now()
    
    active_closures = [
        c for c in data.get('station_closures', [])
        if 'startTime' in c and 
        current_time - datetime.fromisoformat(c['startTime']) < timedelta(hours=c.get('duration', 0))
    ]
    
    return jsonify(active_closures)

@app.route('/api/add-station-closure', methods=['POST'])
def add_station_closure():
    """Add a new station closure"""
    data = load_data()
    closure_data = request.json
    
    # Validation
    if 'stationId' not in closure_data or 'reason' not in closure_data or 'duration' not in closure_data:
        return jsonify({"status": "error", "message": "Missing required fields"}), 400
        
    # Check if station exists
    if not any(s['id'] == closure_data['stationId'] for s in data['stations']):
        return jsonify({"status": "error", "message": "Station not found"}), 400
    
    # Add timestamp and ID
    closure_data['startTime'] = datetime.now().isoformat()
    closure_data['id'] = f"stclos_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    closure_data['type'] = 'station'
    
    # Initialize closures list if it doesn't exist
    if 'station_closures' not in data:
        data['station_closures'] = []
    
    # Add the closure
    data['station_closures'].append(closure_data)
    save_data(data)
    return jsonify({"status": "success", "closure": closure_data})

@app.route('/api/station-closures/<closure_id>', methods=['DELETE'])
def remove_station_closure(closure_id):
    """Remove a station closure by ID"""
    data = load_data()
    
    if 'station_closures' not in data:
        return jsonify({"status": "error", "message": "No station closures found"}), 404
    
    # Find and remove closure
    initial_count = len(data['station_closures'])
    data['station_closures'] = [c for c in data['station_closures'] if c.get('id') != closure_id]
    
    if len(data['station_closures']) == initial_count:
        return jsonify({"status": "error", "message": "Station closure not found"}), 404
    
    save_data(data)
    return jsonify({"status": "success"})

# --------------------------
# Track Closure Endpoints
# --------------------------

@app.route('/api/track-closures', methods=['GET'])
def get_track_closures():
    """Get all active track closures"""
    data = load_data()
    current_time = datetime.now()
    
    active_closures = [
        c for c in data.get('track_closures', [])
        if 'startTime' in c and 
        current_time - datetime.fromisoformat(c['startTime']) < timedelta(hours=c.get('duration', 0))
    ]
    
    return jsonify(active_closures)

@app.route('/api/add-track-closure', methods=['POST'])
def add_track_closure():
    """Add a new track closure"""
    data = load_data()
    closure_data = request.json
    
    # Validation
    required_fields = ['source', 'destination', 'reason', 'duration']
    if not all(key in closure_data for key in required_fields):
        return jsonify({"status": "error", "message": "Missing required fields"}), 400
    
    # Check if track exists
    track_exists = any(
        (t['source'] == closure_data['source'] and t['destination'] == closure_data['destination']) or
        (t.get('bidirectional', False) and t['source'] == closure_data['destination'] and t['destination'] == closure_data['source'])
        for t in data['tracks']
    )
    
    if not track_exists:
        return jsonify({"status": "error", "message": "Track not found"}), 400
    
    # Add timestamp and ID
    closure_data['startTime'] = datetime.now().isoformat()
    closure_data['id'] = f"trclos_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    closure_data['type'] = 'track'
    
    # Initialize closures list if it doesn't exist
    if 'track_closures' not in data:
        data['track_closures'] = []
    
    # Add the closure
    data['track_closures'].append(closure_data)
    save_data(data)
    return jsonify({"status": "success", "closure": closure_data})

@app.route('/api/track-closures/<closure_id>', methods=['DELETE'])
def remove_track_closure(closure_id):
    """Remove a track closure by ID"""
    data = load_data()
    
    if 'track_closures' not in data:
        return jsonify({"status": "error", "message": "No track closures found"}), 404
    
    # Find and remove closure
    initial_count = len(data['track_closures'])
    data['track_closures'] = [c for c in data['track_closures'] if c.get('id') != closure_id]
    
    if len(data['track_closures']) == initial_count:
        return jsonify({"status": "error", "message": "Track closure not found"}), 404
    
    save_data(data)
    return jsonify({"status": "success"})

# --------------------------
# Data Endpoint with Active Closures
# --------------------------

@app.route('/api/data', methods=['GET'])
def get_all_data():
    """Endpoint to get all railway data with active closures"""
    data = load_data()
    current_time = datetime.now()
    
    # Filter out expired closures
    active_station_closures = [
        c for c in data.get('station_closures', [])
        if 'startTime' in c and 
        current_time - datetime.fromisoformat(c['startTime']) < timedelta(hours=c.get('duration', 0))
    ]
    
    active_track_closures = [
        c for c in data.get('track_closures', [])
        if 'startTime' in c and 
        current_time - datetime.fromisoformat(c['startTime']) < timedelta(hours=c.get('duration', 0))
    ]
    print(data['station_closures'])
    
    response_data = {
        'stations': data['stations'],
        'tracks': data['tracks'],
        'trains': data['trains'],
        'bookings': data.get('bookings', []),
        'station_closures': data['station_closures'],
        'track_closures': data['track_closures']
    }
    # print(response_data)
   
    return jsonify(response_data)

# --------------------------
# Train Validation with Closures
# --------------------------

def is_station_closed(station_id, closures):
    """Check if a station is closed"""
    return any(
        c['type'] == 'station' and c['stationId'] == station_id
        for c in closures
    )

def is_track_closed(source, destination, closures):
    """Check if a track is closed"""
    return any(
        c['type'] == 'track' and 
        ((c['source'] == source and c['destination'] == destination) or
         (c.get('bidirectional', False) and c['source'] == destination and c['destination'] == source))
        for c in closures
    )

@app.route('/api/trains-add', methods=['POST'])
def add_train():
    try:
        train_data = request.get_json()
        if not train_data:
            return jsonify({"status": "error", "message": "No data received"}), 400

        required_fields = ['id', 'name', 'speed', 'type', 'route', 'timings']
        missing_fields = [field for field in required_fields if field not in train_data]
        if missing_fields:
            return jsonify({
                "status": "error",
                "message": f"Missing required fields: {', '.join(missing_fields)}"
            }), 400

        data = load_data()
        
        if any(t['id'] == train_data['id'] for t in data['trains']):
            return jsonify({
                "status": "error",
                "message": f"Train ID {train_data['id']} already exists"
            }), 400
        
        # Get active closures
        current_time = datetime.now()
        active_closures = [
            *[c for c in data.get('station_closures', [])
              if 'startTime' in c and 
              current_time - datetime.fromisoformat(c['startTime']) < timedelta(hours=c.get('duration', 0))],
            *[c for c in data.get('track_closures', [])
              if 'startTime' in c and 
              current_time - datetime.fromisoformat(c['startTime']) < timedelta(hours=c.get('duration', 0))]
        ]
        
        # Route validation with closure check
        route = train_data['route']
        for i in range(len(route) - 1):
            src = route[i]
            dst = route[i + 1]

            # Check if station is closed
            if is_station_closed(src, active_closures):
                return jsonify({
                    "status": "error",
                    "message": f"Station {src} is temporarily closed"
                }), 400

            # Check if track exists and is not closed
            track = next(
                (t for t in data['tracks']
                if ((t['source'] == src and t['destination'] == dst) or
                    (t.get('bidirectional', False) and t['source'] == dst and t['destination'] == src))),
                None
            )

            if not track:
                return jsonify({
                    "status": "error",
                    "message": f"No direct track between {src} and {dst}"
                }), 400

            if is_track_closed(src, dst, active_closures):
                return jsonify({
                    "status": "error",
                    "message": f"Track between {src} and {dst} is temporarily closed"
                }), 400
        
        data['trains'].append(train_data)
        save_data(data)
        update_metrics_cache()
        
        return jsonify({
            "status": "success",
            "message": "Train added successfully",
            "train_id": train_data['id']
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Server error: {str(e)}"
        }), 500
    

@app.route('/api/get_count', methods=['GET'])
def get_count():
    update_metrics_cache()
    print(metrics_cache)
    return jsonify(metrics_cache)

# --------------------------
# Booking Endpoints
# --------------------------

@app.route('/api/bookings', methods=['GET', 'POST'])
def handle_bookings():
    data = load_data()
    
    if request.method == 'GET':
        return jsonify(data.get('bookings', []))
    
    elif request.method == 'POST':
        booking_data = request.json
        
        if 'bookings' not in data:
            data['bookings'] = []
        
        existing_booking = next(
            (b for b in data['bookings'] 
             if b['trainId'] == booking_data['trainId'] 
             and b['date'] == booking_data['date']
             and b['status'] == 'confirmed'),
            None
        )
        
        if existing_booking:
            existing_booking['passengerCount'] += booking_data.get('passengerCount', 1)
            existing_booking['fare'] = str(float(existing_booking['fare']) + float(booking_data['fare']))
            booking_id = existing_booking['bookingId']
            message = "Booking updated"
        else:
            data['bookings'].append(booking_data)
            booking_id = booking_data['bookingId']
            message = "Booking successful"
        
        save_data(data)
        update_metrics_cache()
        return jsonify({"message": message, "bookingId": booking_id})

@app.route('/api/bookings/<booking_id>', methods=['DELETE'])
def cancel_booking(booking_id):
    data = load_data()
    
    if 'bookings' not in data:
        return jsonify({"error": "No bookings found"}), 404
    
    initial_count = len(data['bookings'])
    data['bookings'] = [b for b in data['bookings'] if b['bookingId'] != booking_id]
    
    if len(data['bookings']) == initial_count:
        return jsonify({"error": "Booking not found"}), 404
    
    save_data(data)
    update_metrics_cache()
    return jsonify({"message": "Booking deleted successfully"}), 200

@app.route('/api/get_booking/<booking_id>', methods=['GET'])
def get_booking(booking_id):
    data = load_data()
    
    if 'bookings' not in data:
        return jsonify({"error": "No bookings found"}), 404
    
    booking = next((b for b in data['bookings'] if b['bookingId'] == booking_id), None)
    
    if not booking:
        return jsonify({"error": "Booking not found"}), 404
    
    return jsonify(booking)

# --------------------------
# Station Endpoints
# --------------------------

@app.route('/api/stations', methods=['GET'])
def get_stations():
    data = load_data()
    return jsonify(data['stations'])

@app.route('/api/add-station', methods=['POST'])
def add_station():
    data = load_data()
    station = request.json
    
    if not all(key in station for key in ['id', 'name', 'latitude', 'longitude']):
        return jsonify({"status": "error", "message": "Missing required fields"}), 400
        
    if any(s['id'] == station['id'] for s in data['stations']):
        return jsonify({"status": "error", "message": "Station ID already exists"}), 400
        
    data['stations'].append(station)
    save_data(data)
    update_metrics_cache()
    return jsonify({"status": "success", "station": station})

@app.route('/api/stations/<station_id>', methods=['DELETE'])
def delete_station(station_id):
    data = load_data()
    
    station = next((s for s in data['stations'] if s['id'] == station_id), None)
    if not station:
        return jsonify({"status": "error", "message": "Station not found"}), 404
    
    tracks_using_station = [t for t in data['tracks'] 
                          if t['source'] == station_id or t['destination'] == station_id]
    if tracks_using_station:
        return jsonify({
            "status": "error",
            "message": "Cannot delete station used in tracks",
            "tracks": tracks_using_station
        }), 400
    
    data['stations'] = [s for s in data['stations'] if s['id'] != station_id]
    save_data(data)
    update_metrics_cache()
    return jsonify({"status": "success"})

# --------------------------
# Track Endpoints
# --------------------------

@app.route('/api/tracks', methods=['GET'])
def get_tracks():
    data = load_data()
    return jsonify(data['tracks'])

@app.route('/api/add-track', methods=['POST'])
def add_track():
    data = load_data()
    track = request.json

    if 'weight' not in track:  # Auto-fill if missing
        track['weight'] = track['distance']
    
    required_fields = ['source', 'destination', 'distance', 'capacity']
    if not all(key in track for key in required_fields):
        return jsonify({"status": "error", "message": "Missing required fields"}), 400
    
    source_exists = any(s['id'] == track['source'] for s in data['stations'])
    dest_exists = any(s['id'] == track['destination'] for s in data['stations'])
    if not source_exists or not dest_exists:
        return jsonify({"status": "error", "message": "Source or destination station not found"}), 400
    
    existing_track = next((t for t in data['tracks'] 
                         if t['source'] == track['source'] and 
                         t['destination'] == track['destination']), None)
    if existing_track:
        return jsonify({"status": "error", "message": "Track already exists"}), 400
    
    if 'bidirectional' not in track:
        track['bidirectional'] = False
    
    data['tracks'].append(track)
    save_data(data)
    update_metrics_cache()
    return jsonify({"status": "success", "track": track})

@app.route('/api/tracks/<source>/<destination>', methods=['DELETE'])
def delete_track(source, destination):
    data = load_data()
    
    initial_count = len(data['tracks'])
    data['tracks'] = [t for t in data['tracks'] 
                     if not (t['source'] == source and t['destination'] == destination)]
    
    if len(data['tracks']) == initial_count:
        return jsonify({"status": "error", "message": "Track not found"}), 404
    
    save_data(data)
    update_metrics_cache()
    return jsonify({"status": "success"})

# --------------------------
# Train Endpoints
# --------------------------

@app.route('/api/trains', methods=['GET'])
def get_trains():
    data = load_data()
    return jsonify(data['trains'])

@app.route('/api/trains/<train_id>', methods=['DELETE'])
def delete_train(train_id):
    data = load_data()
    
    initial_count = len(data['trains'])
    data['trains'] = [t for t in data['trains'] if t['id'] != train_id]
    
    if len(data['trains']) == initial_count:
        return jsonify({
            "status": "error",
            "message": f"Train {train_id} not found"
        }), 404
    
    save_data(data)
    update_metrics_cache()
    return jsonify({
        "status": "success",
        "message": f"Train {train_id} deleted successfully",
        "remaining_trains": len(data['trains'])
    })

@app.route('/api/trains/<train_id>', methods=['PUT'])
def update_train(train_id):
    data = load_data()
    train_data = request.json
    
    train_index = next((i for i, t in enumerate(data['trains']) 
                      if t['id'] == train_id), None)
    if train_index is None:
        return jsonify({"status": "error", "message": "Train not found"}), 404
    
    for station_id in train_data.get('route', []):
        if not any(s['id'] == station_id for s in data['stations']):
            return jsonify({
                "status": "error",
                "message": f"Station {station_id} in route not found"
            }), 400
    
    data['trains'][train_index] = train_data
    save_data(data)
    update_metrics_cache()
    return jsonify({"status": "success", "train": train_data})

# --------------------------
# Utility Endpoints
# --------------------------

@app.route('/api/check_login', methods=['GET'])
def check_login():
    return jsonify({'logged_in': True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)