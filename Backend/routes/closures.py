import uuid
from datetime import datetime

from flask import Blueprint, request, jsonify

from services.data_store import load_data, save_data, is_active

closures_bp = Blueprint('closures', __name__, url_prefix='/api')

# --------------------------
# Station Closure Endpoints
# --------------------------

@closures_bp.route('/station-closures', methods=['GET'])
def get_station_closures():
    """Get all active station closures"""
    data = load_data()
    current_time = datetime.now()

    active_closures = [c for c in data.get('station_closures', []) if is_active(c, current_time)]

    return jsonify(active_closures)

@closures_bp.route('/add-station-closure', methods=['POST'])
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
    closure_data['id'] = f"stclos_{uuid.uuid4().hex[:12]}"
    closure_data['type'] = 'station'

    # Initialize closures list if it doesn't exist
    if 'station_closures' not in data:
        data['station_closures'] = []

    # Add the closure
    data['station_closures'].append(closure_data)
    save_data(data)
    return jsonify({"status": "success", "closure": closure_data})

@closures_bp.route('/station-closures/<closure_id>', methods=['DELETE'])
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

@closures_bp.route('/track-closures', methods=['GET'])
def get_track_closures():
    """Get all active track closures"""
    data = load_data()
    current_time = datetime.now()

    active_closures = [c for c in data.get('track_closures', []) if is_active(c, current_time)]

    return jsonify(active_closures)

@closures_bp.route('/add-track-closure', methods=['POST'])
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
    closure_data['id'] = f"trclos_{uuid.uuid4().hex[:12]}"
    closure_data['type'] = 'track'

    # Initialize closures list if it doesn't exist
    if 'track_closures' not in data:
        data['track_closures'] = []

    # Add the closure
    data['track_closures'].append(closure_data)
    save_data(data)
    return jsonify({"status": "success", "closure": closure_data})

@closures_bp.route('/track-closures/<closure_id>', methods=['DELETE'])
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
