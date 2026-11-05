from flask import Flask, Response, redirect, render_template, url_for

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
    return _query_rows(
        f"SELECT {', '.join(f'`{column}`' for column in PITCH_COLUMNS)} "
        "FROM `Phillies_Pitch_Data` LIMIT 10"
    )


def _query_rows(query: str) -> list[dict[str, object]]:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(query)
            rows = cursor.fetchall()
            column_names = [description[0] for description in cursor.description]
            return [dict(zip(column_names, row)) for row in rows]
    finally:
        connection.close()


def _pitch_data_columns() -> set[str]:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COLUMN_NAME
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'Phillies_Pitch_Data'
                """
            )
            return {row[0].lower() for row in cursor.fetchall()}
    finally:
        connection.close()


def _legacy_pitch_rollup() -> list[dict[str, object]]:
    return _query_rows(
        """
        SELECT 'All pitchers (individual data unavailable)' AS player_name,
               NULL AS pitcher,
               `pitch_type`,
               COUNT(*) AS pitch_count,
               COUNT(DISTINCT CONCAT(`game_pk`, ':', `at_bat_number`))
                   AS completed_plate_appearances,
               COUNT(DISTINCT CASE WHEN `strikeout` = 1
                   THEN CONCAT(`game_pk`, ':', `at_bat_number`)
               END) AS strikeouts,
               0 AS swings,
               0 AS whiffs,
               AVG(`release_speed`) AS average_velocity,
               AVG(`release_spin_rate`) AS average_spin,
               AVG(`pfx_x`) AS average_horizontal_movement,
               AVG(`pfx_z`) AS average_vertical_movement
        FROM `Phillies_Pitch_Data`
        WHERE `pitch_type` IS NOT NULL
        GROUP BY `pitch_type`
        ORDER BY pitch_count DESC
        """
    )


@app.get("/")
def index() -> str:
    rows = get_first_ten_pitch_rows()
    return render_template("index.html", columns=PITCH_COLUMNS, rows=rows)


@app.get("/about")
def about() -> str:
    return render_template("about.html")


@app.get("/pitch-arsenal")
def pitch_arsenal() -> str:
    columns = _pitch_data_columns()
    if not {"pitcher", "player_name", "events", "description"} <= columns:
        return render_template(
            "pitch_arsenal.html",
            rows=_legacy_pitch_rollup(),
            data_notice=(
                "The database has the older pitch table. These rows show "
                "pitch-type totals across the loaded Phillies data, not "
                "individual pitchers. Load the expanded Statcast CSV to see "
                "each pitcher's arsenal and whiff rates."
            ),
        )

    rows = _query_rows(
        """
        SELECT `pitcher`, `player_name`, `pitch_type`,
               COUNT(*) AS pitch_count,
               COUNT(DISTINCT CASE
                   WHEN `events` IS NOT NULL AND `events` <> ''
                   THEN CONCAT(`game_pk`, ':', `at_bat_number`)
               END) AS completed_plate_appearances,
               COUNT(DISTINCT CASE
                   WHEN `strikeout` = 1 AND `events` IS NOT NULL AND `events` <> ''
                   THEN CONCAT(`game_pk`, ':', `at_bat_number`)
               END) AS strikeouts,
               SUM(CASE WHEN `description` IN (
                   'swinging_strike', 'swinging_strike_blocked',
                   'foul', 'foul_tip', 'foul_bunt', 'bunt_foul_tip',
                   'missed_bunt', 'hit_into_play', 'hit_into_play_no_out',
                   'hit_into_play_score'
               ) THEN 1 ELSE 0 END) AS swings,
               SUM(CASE WHEN `description` IN (
                   'swinging_strike', 'swinging_strike_blocked', 'missed_bunt'
               ) THEN 1 ELSE 0 END) AS whiffs,
               AVG(`release_speed`) AS average_velocity,
               AVG(`release_spin_rate`) AS average_spin,
               AVG(`pfx_x`) AS average_horizontal_movement,
               AVG(`pfx_z`) AS average_vertical_movement
        FROM `Phillies_Pitch_Data`
        WHERE `pitcher` IS NOT NULL AND `pitch_type` IS NOT NULL
        GROUP BY `pitcher`, `player_name`, `pitch_type`
        ORDER BY `player_name`, pitch_count DESC
        """
    )
    return render_template("pitch_arsenal.html", rows=rows)


@app.get("/pitchers")
def pitchers() -> Response:
    return redirect(url_for("pitch_arsenal"))


@app.get("/pitch-performance")
def pitch_performance() -> str:
    columns = _pitch_data_columns()
    if not {"events", "description"} <= columns:
        return render_template(
            "pitch_performance.html",
            rows=_legacy_pitch_rollup(),
            data_notice=(
                "The database has the older pitch table. Strikeout rates here "
                "count plate appearances that included each pitch type; they "
                "do not identify the pitch that ended the at-bat. Swing and "
                "whiff rates are unavailable until the expanded Statcast data "
                "is loaded."
            ),
        )

    rows = _query_rows(
        """
        SELECT `pitch_type`,
               COUNT(*) AS pitch_count,
               COUNT(DISTINCT CASE
                   WHEN `events` IS NOT NULL AND `events` <> ''
                   THEN CONCAT(`game_pk`, ':', `at_bat_number`)
               END) AS completed_plate_appearances,
               COUNT(DISTINCT CASE
                   WHEN `strikeout` = 1 AND `events` IS NOT NULL AND `events` <> ''
                   THEN CONCAT(`game_pk`, ':', `at_bat_number`)
               END) AS strikeouts,
               SUM(CASE WHEN `description` IN (
                   'swinging_strike', 'swinging_strike_blocked',
                   'foul', 'foul_tip', 'foul_bunt', 'bunt_foul_tip',
                   'missed_bunt', 'hit_into_play', 'hit_into_play_no_out',
                   'hit_into_play_score'
               ) THEN 1 ELSE 0 END) AS swings,
               SUM(CASE WHEN `description` IN (
                   'swinging_strike', 'swinging_strike_blocked', 'missed_bunt'
               ) THEN 1 ELSE 0 END) AS whiffs,
               AVG(`release_speed`) AS average_velocity,
               AVG(`release_spin_rate`) AS average_spin,
               AVG(`pfx_x`) AS average_horizontal_movement,
               AVG(`pfx_z`) AS average_vertical_movement
        FROM `Phillies_Pitch_Data`
        WHERE `pitch_type` IS NOT NULL
        GROUP BY `pitch_type`
        ORDER BY pitch_count DESC
        """
    )
    return render_template("pitch_performance.html", rows=rows)


@app.get("/stats")
def stats() -> Response:
    return redirect(url_for("pitch_performance"))


@app.get("/at-bat-analysis")
def at_bat_analysis() -> str:
    columns = _pitch_data_columns()
    if not {
        "home_team",
        "away_team",
        "events",
        "pitch_type",
        "game_pk",
        "at_bat_number",
        "strikeout",
    } <= columns:
        return render_template(
            "at_bat_analysis.html",
            rows=[],
            data_notice=(
                "At-bat analysis by opponent is unavailable because the "
                "database does not include opponent teams and pitch results. "
                "Load the expanded Statcast CSV to enable this page."
            ),
        )

    rows = _query_rows(
        """
        SELECT CASE
                   WHEN `home_team` = 'PHI' THEN `away_team`
                   ELSE `home_team`
               END AS opponent,
               `pitch_type`, `events`,
               COUNT(DISTINCT CONCAT(`game_pk`, ':', `at_bat_number`))
                   AS plate_appearances,
               COUNT(DISTINCT CASE WHEN `strikeout` = 1
                   THEN CONCAT(`game_pk`, ':', `at_bat_number`)
               END) AS strikeouts
        FROM `Phillies_Pitch_Data`
        WHERE `home_team` IS NOT NULL AND `away_team` IS NOT NULL
          AND `events` IS NOT NULL AND `events` <> ''
        GROUP BY opponent, `pitch_type`, `events`
        ORDER BY opponent, `pitch_type`, plate_appearances DESC
        """
    )
    return render_template("at_bat_analysis.html", rows=rows)
