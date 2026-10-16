import os

from flask import Flask
from flask_cors import CORS

from config import PORT
from services.data_store import acquire_data_lock, release_data_lock
from routes.network import network_bp
from routes.closures import closures_bp
from routes.trains import trains_bp
from routes.bookings import bookings_bp

app = Flask(__name__, static_folder='static')
CORS(app)  # Enable CORS for all routes

# One request at a time touches the JSON file (see services/data_store.py)
app.before_request(acquire_data_lock)
app.teardown_request(release_data_lock)

# using all the routes here
app.register_blueprint(network_bp)    # /api/data, /api/get_count, stations, tracks
app.register_blueprint(closures_bp)   # station and track closures
app.register_blueprint(trains_bp)     # trains
app.register_blueprint(bookings_bp)   # bookings

if __name__ == '__main__':
    # Debug mode exposes an interactive debugger, so it is opt-in: set FLASK_DEBUG=1 locally
    app.run(debug=os.environ.get('FLASK_DEBUG') == '1', port=PORT)
