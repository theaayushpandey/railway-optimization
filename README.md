# Railway Optimization

A railway network simulator. Stations and tracks form a weighted graph drawn on a map, and the app runs graph algorithms on it: shortest routes, a minimum spanning tree, and the maximum traffic the tracks can carry between two stations. A second page lets you search trains and book tickets.

## What it does

| Feature | Algorithm | Where |
| --- | --- | --- |
| Shortest route between two stations | Dijkstra with a binary min-heap, O((V + E) log V) | `findShortestPath` in `script/script.js` |
| Shortest route, second method | Bellman-Ford, O(V * E) | `findPathsWithBellmanFord` |
| K shortest routes | Best-first search over partial paths with a straight-line (haversine) heuristic | `findAllPaths` |
| Cheapest set of tracks that connects every station | Prim's minimum spanning tree | `calculateMST` |
| Maximum traffic the tracks can carry between two stations, from each track's capacity | Edmonds-Karp max flow (Ford-Fulkerson with BFS), O(V * E^2) | `calculateMaxFlow` |
| Station and track closures with a timer | Closed tracks are left out of the graph | `buildGraph`, `x.py` |
| Train search, fares and ticket booking | Route lookup over each train's station list | `script/booking.js` |

The sample network in `data/railways.json` has 71 stations, 204 tracks and 24 trains.

## Tech stack

- Frontend: HTML, CSS, JavaScript. All graph algorithms run in the browser.
- Backend: Python, Flask REST API (`x.py`).
- Storage: one JSON file, `data/railways.json`. There is no database.

## Run it locally

```bash
git clone https://github.com/theaayushpandey/railway-optimization.git
cd railway-optimization
pip install flask flask-cors
python x.py
```

Then open `index.html` (network and algorithms) or `booking.html` (search and booking) in a browser. The pages call the API at `http://localhost:5000`.

## Known limitations

- Storage is a single JSON file that is rewritten on every change. A lock makes requests take turns, which is safe but means only one request is handled at a time. A real system would use a database with transactions.
- There is no login. `/api/check_login` always answers true.
- A new booking for the same train and date is merged into the existing booking instead of being stored as a separate ticket.
- Fares are stored as strings and calculated in the browser, so the server trusts whatever fare the page sends.
- The API address is hard-coded to `localhost:5000`.

## Author

Aayush Pandey, [github.com/theaayushpandey](https://github.com/theaayushpandey)
