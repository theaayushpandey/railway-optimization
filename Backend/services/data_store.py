import json
import os
import threading
from datetime import datetime, timedelta

from config import DATA_FILE

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

# Every endpoint reads the whole file, changes it and writes it back. Without a lock,
# two requests at the same moment can both read the old file and one write is lost.
data_lock = threading.Lock()

def acquire_data_lock():
    data_lock.acquire()

def release_data_lock(exc):
    if data_lock.locked():
        data_lock.release()

def is_active(closure, current_time):
    """A closure lasts `duration` hours from its startTime"""
    return (
        'startTime' in closure and
        current_time - datetime.fromisoformat(closure['startTime']) < timedelta(hours=closure.get('duration', 0))
    )

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
        data['station_closures'] = [c for c in data['station_closures'] if is_active(c, current_time)]
        if len(data['station_closures']) != initial_count:
            save_data(data)  # Save if we removed any

    # Clean up expired track closures
    if 'track_closures' in data:
        initial_count = len(data['track_closures'])
        data['track_closures'] = [c for c in data['track_closures'] if is_active(c, current_time)]
        if len(data['track_closures']) != initial_count:
            save_data(data)  # Save if we removed any

    return data

def save_data(data):
    """Save railway data to JSON file"""
    # Write to a temp file and swap it in, so a crash mid-write cannot leave a half-written JSON file
    tmp_file = DATA_FILE + '.tmp'
    with open(tmp_file, 'w') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp_file, DATA_FILE)

def update_metrics_cache():
    """Update the cached metrics"""
    data = load_data()
    metrics_cache['total_trains'] = len(data['trains'])
    metrics_cache['total_stations'] = len(data['stations'])
    metrics_cache['total_tracks'] = len(data['tracks'])
    metrics_cache['total_station_closures'] = len(data['station_closures'])
    metrics_cache['total_track_closures'] = len(data['track_closures'])
    metrics_cache['total_bookings'] = len(data.get('bookings', []))
