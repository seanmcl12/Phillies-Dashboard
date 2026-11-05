from pprint import pprint

from db import get_connection


def main() -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW TABLES")
            tables = [row[0] for row in cursor.fetchall()]
            print("Tables:")
            pprint(tables)
            if not tables:
                print("No tables found.")
                return

            table = tables[0].replace("`", "``")
            cursor.execute(f"SHOW COLUMNS FROM `{table}`")
            columns = [row[0] for row in cursor.fetchall()]
            cursor.execute(f"SELECT * FROM `{table}` LIMIT 3")
            rows = cursor.fetchall()

            print(f"\nFirst table: {tables[0]}")
            print("Columns:")
            pprint(columns)
            print("First 3 rows:")
            pprint(rows)
    finally:
        connection.close()


if __name__ == "__main__":
    main()
