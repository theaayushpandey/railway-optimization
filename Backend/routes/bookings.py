import hashlib
import hmac
import secrets
import uuid

from flask import Blueprint, request, jsonify

from services.data_store import load_data, save_data, update_metrics_cache

bookings_bp = Blueprint('bookings', __name__, url_prefix='/api')

# --------------------------
# Who owns a booking
# --------------------------
# The app has no user accounts, so each browser gets a secret "owner token" from the server.
# The browser sends it in the X-Owner-Token header. A booking stores only the token's hash,
# so even someone who reads the data file cannot act as its owner.
# Every booking route looks up bookings by owner as well as by id: knowing (or guessing)
# a booking id is not enough to read or cancel someone else's booking.

OWNER_HEADER = 'X-Owner-Token'


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_owner():
    """Hash of the caller's owner token, or None if they did not send one"""
    token = request.headers.get(OWNER_HEADER, '')
    return hash_token(token) if token else None


def owned_by(booking, owner):
    return owner is not None and hmac.compare_digest(booking.get('ownerHash', ''), owner)


def public(booking):
    """The booking without the owner hash, which never leaves the server"""
    return {k: v for k, v in booking.items() if k != 'ownerHash'}


@bookings_bp.route('/owner-token', methods=['POST'])
def new_owner_token():
    return jsonify({"ownerToken": secrets.token_urlsafe(32)})

# --------------------------
# Booking Endpoints
# --------------------------

@bookings_bp.route('/bookings', methods=['GET', 'POST'])
def handle_bookings():
    owner = current_owner()
    if not owner:
        return jsonify({"error": "Missing owner token"}), 401

    data = load_data()

    if request.method == 'GET':
        mine = [public(b) for b in data.get('bookings', []) if owned_by(b, owner)]
        return jsonify(mine)

    booking_data = request.json or {}
    # The server picks the id and the owner; values sent by the browser are ignored
    booking_data.pop('ownerHash', None)
    booking_data['bookingId'] = 'B' + uuid.uuid4().hex[:12].upper()
    booking_data['ownerHash'] = owner

    if 'bookings' not in data:
        data['bookings'] = []

    # Same owner, same train and date: add the passengers to their existing booking.
    # Another person's booking is never merged into.
    existing_booking = next(
        (b for b in data['bookings']
         if owned_by(b, owner)
         and b['trainId'] == booking_data.get('trainId')
         and b['date'] == booking_data.get('date')
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

@bookings_bp.route('/bookings/<booking_id>', methods=['DELETE'])
def cancel_booking(booking_id):
    owner = current_owner()
    data = load_data()
    bookings = data.get('bookings', [])

    # Someone else's booking gets the same 404 as a missing one, so its existence is not revealed
    keep = [b for b in bookings if not (b['bookingId'] == booking_id and owned_by(b, owner))]
    if len(keep) == len(bookings):
        return jsonify({"error": "Booking not found"}), 404

    data['bookings'] = keep
    save_data(data)
    update_metrics_cache()
    return jsonify({"message": "Booking deleted successfully"}), 200

@bookings_bp.route('/get_booking/<booking_id>', methods=['GET'])
def get_booking(booking_id):
    owner = current_owner()
    data = load_data()

    booking = next(
        (b for b in data.get('bookings', []) if b['bookingId'] == booking_id and owned_by(b, owner)),
        None
    )
    if not booking:
        return jsonify({"error": "Booking not found"}), 404

    return jsonify(public(booking))
