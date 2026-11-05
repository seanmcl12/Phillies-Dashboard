from flask import Flask, redirect, render_template, url_for

app = Flask(__name__)


def _render_data_page(template: str, **context: object) -> str:
    context["pitch_data_url"] = url_for(
        "static", filename="data/2025-pitches.json"
    )
    return render_template(template, **context)


@app.get("/")
@app.get("/phillies")
def index() -> str:
    return _render_data_page("phillies.html")


@app.get("/about")
def about() -> str:
    return render_template("about.html")


@app.get("/pitch-arsenal")
@app.get("/pitchers")
def pitch_arsenal() -> str:
    return _render_data_page("pitch_arsenal.html")


@app.get("/pitchers/<int:pitcher_id>")
def pitcher_profile(pitcher_id: int) -> str:
    return _render_data_page("pitcher_profile.html", pitcher_id=pitcher_id)


@app.get("/pitch-comparison")
def pitch_comparison() -> str:
    return _render_data_page("pitch_performance.html")


@app.get("/pitch-performance")
def pitch_performance() -> str:
    return redirect(url_for("pitch_comparison"))


@app.get("/stats")
def stats() -> str:
    return redirect(url_for("pitch_comparison"))


@app.get("/opponents")
def opponents() -> str:
    return _render_data_page("opponents.html")


@app.get("/opponents/<string:team>")
def opponent_analysis(team: str) -> str:
    return _render_data_page("at_bat_analysis.html", opponent_code=team.upper())


@app.get("/at-bat-analysis")
def at_bat_analysis() -> str:
    return redirect(url_for("opponents"))
