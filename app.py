"""
app.py
======
This is the web server. It does two jobs:

1. Serves the dashboard page (templates/index.html) when someone
   visits the site.
2. Exposes one API endpoint, /api/simulate, which runs the real
   Python simulation (scan_engine.py) and returns the results as
   JSON for the page's JavaScript to draw.

Run it with:
    python app.py

Then open the link it prints (usually http://127.0.0.1:5000) in your
browser.
"""

from flask import Flask, render_template, request, jsonify
import scan_engine

app = Flask(__name__)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/simulate", methods=["POST"])
def simulate():
    data = request.get_json(force=True) or {}

    # Read settings sent by the browser, with safe fallbacks.
    num_bands = int(data.get("num_bands", 30))
    num_steps = int(data.get("num_steps", 400))
    num_hotspots = int(data.get("num_hotspots", 4))
    epsilon = float(data.get("epsilon", 0.15))

    # Keep values in a sane range so the page can't crash the server.
    num_bands = max(5, min(num_bands, 80))
    num_steps = max(50, min(num_steps, 1500))
    num_hotspots = max(1, min(num_hotspots, num_bands))
    epsilon = max(0.0, min(epsilon, 1.0))

    result = scan_engine.run_simulation(
        num_bands=num_bands,
        num_steps=num_steps,
        num_hotspots=num_hotspots,
        hotspot_prob=0.28,
        baseline_prob=0.01,
        epsilon=epsilon,
    )
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)
