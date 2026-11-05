import argparse
import csv
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TABLE_NAME = "Phillies_Pitch_Data"
DEFAULT_CSV = ROOT / "phillies_pitch_data_enriched.csv"
CSV_COLUMNS = (
    "game_pk",
    "at_bat_number",
    "strikeout",
    "game_date",
    "pitch_number",
    "pitcher",
    "player_name",
    "batter",
    "home_team",
    "away_team",
    "inning_topbot",
    "events",
    "description",
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
INTEGER_COLUMNS = {
    "game_pk",
    "at_bat_number",
    "strikeout",
    "pitch_number",
    "pitcher",
    "batter",
    "release_spin_rate",
    "zone",
}
FLOAT_COLUMNS = {
    "release_speed",
    "pfx_x",
    "pfx_z",
    "plate_x",
    "plate_z",
}
TABLE_DEFINITION = """
    `game_pk` BIGINT NOT NULL,
    `at_bat_number` INT NOT NULL,
    `strikeout` TINYINT NOT NULL,
    `game_date` DATE NULL,
    `pitch_number` INT NULL,
    `pitcher` BIGINT NULL,
    `player_name` VARCHAR(100) NULL,
    `batter` BIGINT NULL,
    `home_team` CHAR(3) NULL,
    `away_team` CHAR(3) NULL,
    `inning_topbot` VARCHAR(8) NULL,
    `events` VARCHAR(64) NULL,
    `description` VARCHAR(64) NULL,
    `pitch_type` VARCHAR(8) NULL,
    `release_speed` DOUBLE NULL,
    `release_spin_rate` DOUBLE NULL,
    `pfx_x` DOUBLE NULL,
    `pfx_z` DOUBLE NULL,
    `plate_x` DOUBLE NULL,
    `plate_z` DOUBLE NULL,
    `zone` SMALLINT NULL,
    `stand` CHAR(1) NULL,
    `p_throws` CHAR(1) NULL
"""


def _read_rows(csv_path: Path) -> list[tuple[object, ...]]:
    with csv_path.open(newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        missing_columns = set(CSV_COLUMNS) - set(reader.fieldnames or ())
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise ValueError(f"{csv_path} is missing required columns: {missing}")

        rows = []
        for line_number, row in enumerate(reader, start=2):
            values = []
            for column in CSV_COLUMNS:
                value = (row[column] or "").strip()
                if not value or value == r"\N":
                    parsed_value = None
                elif column in INTEGER_COLUMNS:
                    number = float(value)
                    if not number.is_integer():
                        raise ValueError(
                            f"{csv_path}:{line_number}: {column} must be an integer"
                        )
                    parsed_value = int(number)
                elif column in FLOAT_COLUMNS:
                    parsed_value = float(value)
                else:
                    parsed_value = value
                values.append(parsed_value)

            if values[0] is None or values[1] is None or values[2] is None:
                raise ValueError(
                    f"{csv_path}:{line_number}: game_pk, at_bat_number, "
                    "and strikeout are required"
                )
            rows.append(tuple(values))

    if not rows:
        raise ValueError(f"{csv_path} contains no pitch rows")
    return rows


def _table_exists(cursor, table_name: str) -> bool:
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = %s
        """,
        (table_name,),
    )
    return cursor.fetchone()[0] == 1


def _load_and_replace(csv_path: Path) -> tuple[int, str | None]:
    rows = _read_rows(csv_path)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    staging_table = f"{TABLE_NAME}_staging_{timestamp}"
    backup_table = f"{TABLE_NAME}_backup_{timestamp}"
    quoted_columns = ", ".join(f"`{column}`" for column in CSV_COLUMNS)
    placeholders = ", ".join(["%s"] * len(CSV_COLUMNS))

    from db import get_connection

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"CREATE TABLE `{staging_table}` ({TABLE_DEFINITION}) "
                "CHARACTER SET utf8mb4"
            )
            insert_sql = (
                f"INSERT INTO `{staging_table}` ({quoted_columns}) "
                f"VALUES ({placeholders})"
            )
            cursor.executemany(insert_sql, rows)
            connection.commit()

            cursor.execute(f"SELECT COUNT(*) FROM `{staging_table}`")
            staged_count = cursor.fetchone()[0]
            if staged_count != len(rows):
                raise RuntimeError(
                    f"Staging verification failed: expected {len(rows)} rows, "
                    f"found {staged_count}"
                )

            previous_table = None
            if _table_exists(cursor, TABLE_NAME):
                # Keep the old table available if the new data needs rollback.
                cursor.execute(
                    f"RENAME TABLE `{TABLE_NAME}` TO `{backup_table}`, "
                    f"`{staging_table}` TO `{TABLE_NAME}`"
                )
                previous_table = backup_table
            else:
                cursor.execute(
                    f"RENAME TABLE `{staging_table}` TO `{TABLE_NAME}`"
                )
            connection.commit()
            return staged_count, previous_table
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Load the expanded Statcast CSV into TiDB. The current table is "
            "retained under a timestamped backup name."
        )
    )
    parser.add_argument(
        "csv_path",
        nargs="?",
        type=Path,
        default=DEFAULT_CSV,
        help=f"CSV to load (default: {DEFAULT_CSV.name})",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Create and verify a staging table, then atomically activate it",
    )
    args = parser.parse_args()

    if not args.replace:
        parser.error("pass --replace to stage, verify, and activate the new table")
    if not args.csv_path.is_file():
        parser.error(f"CSV file not found: {args.csv_path}")

    row_count, backup_table = _load_and_replace(args.csv_path)
    print(f"Loaded and verified {row_count:,} pitch rows into `{TABLE_NAME}`.")
    if backup_table:
        print(f"Previous table preserved as `{backup_table}`.")
    else:
        print("No previous table existed to back up.")


if __name__ == "__main__":
    main()
