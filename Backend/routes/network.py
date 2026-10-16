from flask import Blueprint, request, jsonify

from services.data_store import load_data, save_data, update_metrics_cache, metrics_cache

network_bp = Blueprint('network', __name__, url_prefix='/api')

# --------------------------
# Data Endpoint with Active Closures
# --------------------------

@network_bp.route('/data', methods=['GET'])
def get_all_data():
    """Endpoint to get all railway data with active closures"""
    data = load_data()  # load_data has already removed expired closures

    response_data = {
        'stations': data['stations'],
        'tracks': data['tracks'],
        'trains': data['trains'],
        'bookings': data.get('bookings', []),
        'station_closures': data['station_closures'],
        'track_closures': data['track_closures']
    }

    return jsonify(response_data)

@network_bp.route('/get_count', methods=['GET'])
def get_count():
    update_metrics_cache()
    return jsonify(metrics_cache)

# --------------------------
# Station Endpoints
# --------------------------

@network_bp.route('/stations', methods=['GET'])
def get_stations():
    data = load_data()
    return jsonify(data['stations'])

@network_bp.route('/add-station', methods=['POST'])
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

@network_bp.route('/stations/<station_id>', methods=['DELETE'])
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

@network_bp.route('/tracks', methods=['GET'])
def get_tracks():
    data = load_data()
    return jsonify(data['tracks'])

@network_bp.route('/add-track', methods=['POST'])
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

@network_bp.route('/tracks/<source>/<destination>', methods=['DELETE'])
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
# Utility Endpoints
# --------------------------

@network_bp.route('/check_login', methods=['GET'])
def check_login():
    return jsonify({'logged_in': True})
