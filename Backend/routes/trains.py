from datetime import datetime

from flask import Blueprint, request, jsonify

from services.data_store import load_data, save_data, update_metrics_cache, is_active

trains_bp = Blueprint('trains', __name__, url_prefix='/api')

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

# --------------------------
# Train Endpoints
# --------------------------

@trains_bp.route('/trains-add', methods=['POST'])
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
            *[c for c in data.get('station_closures', []) if is_active(c, current_time)],
            *[c for c in data.get('track_closures', []) if is_active(c, current_time)]
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

@trains_bp.route('/trains', methods=['GET'])
def get_trains():
    data = load_data()
    return jsonify(data['trains'])

@trains_bp.route('/trains/<train_id>', methods=['DELETE'])
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

@trains_bp.route('/trains/<train_id>', methods=['PUT'])
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
