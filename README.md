# Railway Optimization

A railway network simulator. Stations and tracks form a weighted graph drawn on a map, and the app runs graph algorithms on it: shortest routes, a minimum spanning tree, and the maximum traffic the tracks can carry between two stations. A second page lets you search trains and book tickets.

## What it does

| Feature | Algorithm | Where |
| --- | --- | --- |
| Shortest route between two stations | Dijkstra with a binary min-heap, O((V + E) log V) | `findShortestPath` in `Frontend/js/script.js` |
| Shortest route, second method | Bellman-Ford, O(V * E) | `findPathsWithBellmanFord` |
| K shortest routes | Best-first search over partial paths with a straight-line (haversine) heuristic | `findAllPaths` |
| Cheapest set of tracks that connects every station | Prim's minimum spanning tree | `calculateMST` |
| Maximum traffic the tracks can carry between two stations, from each track's capacity | Edmonds-Karp max flow (Ford-Fulkerson with BFS), O(V * E^2) | `calculateMaxFlow` |
| Station and track closures with a timer | Closed tracks are left out of the graph | `buildGraph`, `Backend/routes/closures.py` |
| Train search, fares and ticket booking | Route lookup over each train's station list | `Frontend/js/booking.js` |

The sample network in `Backend/data/railways.json` has 71 stations, 204 tracks and 24 trains.

## Folder structure

```
railway-optimization/
├── Backend/                    Flask REST API (Python)
│   ├── app.py                  starts the server and registers the routes
│   ├── config.py               data file path and port
│   ├── requirements.txt
│   ├── routes/                 one file per group of endpoints
│   │   ├── network.py          /api/data, /api/get_count, stations, tracks
│   │   ├── closures.py         station and track closures
│   │   ├── trains.py           add, edit and delete trains (checks closures)
│   │   └── bookings.py         book, look up and cancel tickets
│   ├── services/
│   │   └── data_store.py       reads and writes the JSON file, request lock, counts
│   └── data/
│       └── railways.json       stations, tracks, trains, bookings, closures
└── Frontend/                   HTML, CSS, JavaScript
    ├── index.html              network map and algorithms
    ├── booking.html            train search and booking
    ├── css/                    style.css, booking.css, utility.css
    ├── js/
    │   ├── config.js           API address used by both pages
    │   ├── script.js           map, graph algorithms, admin forms
    │   └── booking.js          search, fares, tickets
    └── assets/                 icons
```

## Tech stack

- Frontend: HTML, CSS, JavaScript. All graph algorithms run in the browser.
- Backend: Python, Flask REST API (`Backend/app.py`).
- Storage: one JSON file, `Backend/data/railways.json`. There is no database.

## Run it locally

```bash
git clone https://github.com/theaayushpandey/railway-optimization.git
cd railway-optimization/Backend
pip install -r requirements.txt
python app.py
```

Then open `Frontend/index.html` (network and algorithms) or `Frontend/booking.html` (search and booking) in a browser. The pages call the API at `http://localhost:5000/api`, set in `Frontend/js/config.js`.

## Known limitations

- Storage is a single JSON file that is rewritten on every change. A lock makes requests take turns, which is safe but means only one request is handled at a time. A real system would use a database with transactions.
- There is no login. `/api/check_login` always answers true.
- A new booking for the same train and date is merged into the existing booking instead of being stored as a separate ticket.
- Fares are stored as strings and calculated in the browser, so the server trusts whatever fare the page sends.

## Author

Aayush Pandey, [github.com/theaayushpandey](https://github.com/theaayushpandey)
