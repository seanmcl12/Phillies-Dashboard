from flask import Flask, render_template

from db import get_connection

app = Flask(__name__)

PITCH_COLUMNS = (
    "game_pk",
    "at_bat_number",
    "strikeout",
    "pitch_type",
    "release_speed",
    "release_spin_rate",
    "pfx_x",
    "pfx_z",
    "plate_x",
    "plate_z",
    "zone",
    "stand",
    "p_throws",
)


def get_first_ten_pitch_rows() -> list[dict[str, object]]:
    columns_sql = ", ".join(f"`{column}`" for column in PITCH_COLUMNS)
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT {columns_sql} FROM `Phillies_Pitch_Data` LIMIT 10"
            )
            rows = cursor.fetchall()
            column_names = [description[0] for description in cursor.description]
            return [dict(zip(column_names, row)) for row in rows]
    finally:
        connection.close()


@app.get("/")
def index() -> str:
    rows = get_first_ten_pitch_rows()
    return render_template("index.html", columns=PITCH_COLUMNS, rows=rows)


@app.get("/about")
def about() -> str:
    return render_template("about.html")
