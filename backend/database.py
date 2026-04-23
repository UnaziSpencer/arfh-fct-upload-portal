from pathlib import Path
import sqlite3

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "app_data.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS upload_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            facility_name TEXT NOT NULL,
            lga TEXT,
            state TEXT,
            report_year TEXT,
            report_month TEXT,
            target_tab TEXT,
            quarter TEXT,
            workbook_id TEXT,
            matched_row INTEGER,
            uploaded_filename TEXT,
            updated_cells INTEGER,
            status TEXT NOT NULL,
            message TEXT,
            attendance_total REAL,
            screened_total REAL,
            presumptive_total REAL,
            diagnosed_total REAL,
            notified_total REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.commit()
    conn.close()