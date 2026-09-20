"""
AWS Native Database & Storage Client for KisanMind
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Replaces Supabase with AWS-native and EC2-local architecture:
- Database: Embedded SQLite with WAL mode on EC2 (ACID, sub-millisecond, zero cost)
- Object Storage: Amazon S3 (kisanmind-data-058264544789) via boto3

Provides a drop-in compatible interface matching the Supabase query builder.
"""

import os
import sqlite3
import hashlib
from datetime import datetime
from typing import Any, Dict, List, Optional
S3_BUCKET_NAME = os.getenv("S3_DATA_BUCKET", "kisanmind-data-058264544789")
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "ap-south-1")

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, "kisanmind.db")


def init_sqlite_db():
    """Create tables if they don't exist and configure WAL mode."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        
        # 1. users table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT UNIQUE,
            city TEXT,
            phone TEXT,
            land_owned TEXT,
            password_hash TEXT,
            created_at TEXT
        );
        """)

        # 2. admins table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT UNIQUE,
            password_hash TEXT,
            created_at TEXT
        );
        """)

        # 3. reports table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            crop TEXT,
            location TEXT,
            query TEXT,
            report_markdown TEXT,
            execution_time REAL,
            user_id INTEGER,
            created_at TEXT
        );
        """)

        # 4. report_chats table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS report_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id TEXT,
            role TEXT,
            message TEXT,
            user_id INTEGER,
            created_at TEXT
        );
        """)

        # Seed default admin if none exists
        cursor = conn.execute("SELECT COUNT(*) FROM admins WHERE email = 'admin@kisanmind.com'")
        if cursor.fetchone()[0] == 0:
            admin_pw_hash = hashlib.sha256("admin123".encode()).hexdigest()
            conn.execute(
                "INSERT INTO admins (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                ("System Administrator", "admin@kisanmind.com", admin_pw_hash, datetime.utcnow().isoformat())
            )
        conn.commit()


# Initialize database schema on module import
init_sqlite_db()


class QueryResult:
    def __init__(self, data: List[Dict[str, Any]], count: Optional[int] = None):
        self.data = data
        self.count = count if count is not None else len(data)


class QueryBuilder:
    def __init__(self, table_name: str):
        self.table_name = table_name
        self._action = "SELECT"
        self._select_cols = "*"
        self._count_exact = False
        self._where_clauses: List[str] = []
        self._params: List[Any] = []
        self._order_by: Optional[str] = None
        self._limit: Optional[int] = None
        self._insert_data: Optional[List[Dict[str, Any]]] = None
        self._update_data: Optional[Dict[str, Any]] = None

    def select(self, columns: str = "*", count: Optional[str] = None):
        self._action = "SELECT"
        self._select_cols = columns
        if count == "exact":
            self._count_exact = True
        return self

    def insert(self, data: Any):
        self._action = "INSERT"
        if isinstance(data, list):
            self._insert_data = data
        else:
            self._insert_data = [data]
        return self

    def update(self, data: Dict[str, Any]):
        self._action = "UPDATE"
        self._update_data = data
        return self

    def delete(self):
        self._action = "DELETE"
        return self

    def eq(self, column: str, value: Any):
        self._where_clauses.append(f'"{column}" = ?')
        self._params.append(value)
        return self

    def in_(self, column: str, values: List[Any]):
        if not values:
            self._where_clauses.append("1=0")
            return self
        placeholders = ",".join("?" for _ in values)
        self._where_clauses.append(f'"{column}" IN ({placeholders})')
        self._params.extend(values)
        return self

    def order(self, column: str, desc: bool = False):
        direction = "DESC" if desc else "ASC"
        self._order_by = f'"{column}" {direction}'
        return self

    def limit(self, count: int):
        self._limit = count
        return self

    def execute(self) -> QueryResult:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            if self._action == "SELECT":
                where_sql = (" WHERE " + " AND ".join(self._where_clauses)) if self._where_clauses else ""
                
                total_count = None
                if self._count_exact:
                    count_query = f"SELECT COUNT(*) FROM \"{self.table_name}\"{where_sql}"
                    cursor.execute(count_query, self._params)
                    total_count = cursor.fetchone()[0]

                query = f"SELECT {self._select_cols} FROM \"{self.table_name}\"{where_sql}"
                if self._order_by:
                    query += f" ORDER BY {self._order_by}"
                if self._limit is not None:
                    query += f" LIMIT {self._limit}"

                cursor.execute(query, self._params)
                rows = cursor.fetchall()
                data = [dict(r) for r in rows]
                return QueryResult(data=data, count=total_count if total_count is not None else len(data))

            elif self._action == "INSERT":
                if not self._insert_data:
                    return QueryResult(data=[])
                
                inserted_rows = []
                for item in self._insert_data:
                    cols = list(item.keys())
                    placeholders = ",".join("?" for _ in cols)
                    col_names = ",".join(f'"{c}"' for c in cols)
                    values = [item[c] for c in cols]
                    
                    sql = f"INSERT INTO \"{self.table_name}\" ({col_names}) VALUES ({placeholders})"
                    cursor.execute(sql, values)
                    last_id = cursor.lastrowid
                    
                    # Fetch inserted row
                    cursor.execute(f"SELECT * FROM \"{self.table_name}\" WHERE id = ?", (last_id,))
                    row = cursor.fetchone()
                    if row:
                        inserted_rows.append(dict(row))
                    else:
                        row_dict = dict(item)
                        row_dict["id"] = last_id
                        inserted_rows.append(row_dict)
                
                conn.commit()
                return QueryResult(data=inserted_rows)

            elif self._action == "UPDATE":
                if not self._update_data:
                    return QueryResult(data=[])
                
                set_clauses = [f'"{col}" = ?' for col in self._update_data.keys()]
                values = list(self._update_data.values())
                where_sql = (" WHERE " + " AND ".join(self._where_clauses)) if self._where_clauses else ""
                
                sql = f"UPDATE \"{self.table_name}\" SET {', '.join(set_clauses)}{where_sql}"
                cursor.execute(sql, values + self._params)
                conn.commit()
                return QueryResult(data=[self._update_data])

            elif self._action == "DELETE":
                where_sql = (" WHERE " + " AND ".join(self._where_clauses)) if self._where_clauses else ""
                sql = f"DELETE FROM \"{self.table_name}\"{where_sql}"
                cursor.execute(sql, self._params)
                conn.commit()
                return QueryResult(data=[])

            return QueryResult(data=[])


class S3BucketStorage:
    def __init__(self, bucket_name: str):
        self.bucket_name = bucket_name
        self._s3_client = None

    @property
    def _s3(self):
        if self._s3_client is None:
            import boto3
            self._s3_client = boto3.client("s3", region_name=AWS_REGION)
        return self._s3_client

    def upload(self, path: str, file_bytes: bytes, file_options: Optional[Dict[str, Any]] = None):
        content_type = "application/octet-stream"
        if file_options and "content-type" in file_options:
            content_type = file_options["content-type"]
        
        self._s3.put_object(
            Bucket=self.bucket_name,
            Key=path,
            Body=file_bytes,
            ContentType=content_type
        )
        return {"Key": path}

    def get_public_url(self, path: str) -> str:
        return f"https://{self.bucket_name}.s3.{AWS_REGION}.amazonaws.com/{path}"


class StorageService:
    def __init__(self):
        self.default_bucket = S3_BUCKET_NAME

    def from_(self, bucket_name: str = S3_BUCKET_NAME) -> S3BucketStorage:
        return S3BucketStorage(bucket_name or S3_BUCKET_NAME)


class AWSAppClient:
    def __init__(self):
        self.storage = StorageService()

    def table(self, table_name: str) -> QueryBuilder:
        return QueryBuilder(table_name)


_aws_app_client: Optional[AWSAppClient] = None


def get_supabase() -> AWSAppClient:
    """
    Returns the AWS native database and storage client.
    Named `get_supabase()` for 100% backward compatibility with main.py endpoints.
    """
    global _aws_app_client
    if _aws_app_client is None:
        _aws_app_client = AWSAppClient()
    return _aws_app_client
