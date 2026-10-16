from flask import Blueprint, request, jsonify

from services.data_store import load_data, save_data, update_metrics_cache

bookings_bp = Blueprint('bookings', __name__, url_prefix='/api')

# --------------------------
# Booking Endpoints
# --------------------------

@bookings_bp.route('/bookings', methods=['GET', 'POST'])
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

@bookings_bp.route('/bookings/<booking_id>', methods=['DELETE'])
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

@bookings_bp.route('/get_booking/<booking_id>', methods=['GET'])
def get_booking(booking_id):
    data = load_data()

    if 'bookings' not in data:
        return jsonify({"error": "No bookings found"}), 404

    booking = next((b for b in data['bookings'] if b['bookingId'] == booking_id), None)

    if not booking:
        return jsonify({"error": "Booking not found"}), 404

    return jsonify(booking)
