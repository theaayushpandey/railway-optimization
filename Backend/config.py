import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# One JSON file stores stations, tracks, trains, bookings and closures.
# The path is relative to this file, so the server can be started from any folder.
DATA_FILE = os.path.join(BASE_DIR, 'data', 'railways.json')

PORT = 5000
