import os
from pathlib import Path
import ssl

import certifi
import pymysql
from pymysql.connections import Connection


def _database_password() -> str:
    password = os.environ.get("DATABASE_PASSWORD")
    if password is not None:
        if password:
            return password
        raise RuntimeError("DATABASE_PASSWORD environment variable is empty")

    env_path = Path(__file__).with_name(".env")
    if not env_path.is_file():
        raise RuntimeError(
            "Missing DATABASE_PASSWORD environment variable and "
            f"local credentials file {env_path}"
        )

    for line in env_path.read_text().splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() == "database-password":
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            if value:
                return value
            raise RuntimeError("database-password in .env is empty")
    raise RuntimeError(f"Missing database-password in {env_path}")


def get_connection() -> Connection:
    return pymysql.connect(
        host="gateway01.us-east-1.prod.aws.tidbcloud.com",
        port=4000,
        user="3U7raqwJGtCCHu6.root",
        password=_database_password(),
        database="sys",
        ssl=ssl.create_default_context(cafile=certifi.where()),
        connect_timeout=10,
    )