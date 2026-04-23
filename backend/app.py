import os
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple

import pandas as pd
import gspread
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google.oauth2.service_account import Credentials

from database import init_db, get_connection

app = FastAPI(title="ARFH FCT Upload Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    init_db()


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SERVICE_ACCOUNT_FILE = DATA_DIR / "service-account.json"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# IMPORTANT:
# Put your real workbook IDs here.
MASTER_WORKBOOK_IDS = {
    ("2026", "Q1"): "1WO6ck6-ZDe-4tozRkvG-bj0q7B7KgBGm0Ar7AebESIo",
    ("2026", "Q2"): "PASTE_YOUR_REAL_2026_Q2_WORKBOOK_ID_HERE",
    ("2026", "Q3"): "PASTE_YOUR_REAL_2026_Q3_WORKBOOK_ID_HERE",
    ("2026", "Q4"): "PASTE_YOUR_REAL_2026_Q4_WORKBOOK_ID_HERE",
}

MONTH_TO_TAB = {
    "January": "Jan", "Jan": "Jan",
    "February": "Feb", "Feb": "Feb",
    "March": "Mar", "Mar": "Mar",
    "April": "Apr", "Apr": "Apr",
    "May": "May",
    "June": "Jun", "Jun": "Jun",
    "July": "Jul", "Jul": "Jul",
    "August": "Aug", "Aug": "Aug",
    "September": "Sep", "Sep": "Sep",
    "October": "Oct", "Oct": "Oct",
    "November": "Nov", "Nov": "Nov",
    "December": "Dec", "Dec": "Dec",
}

MONTH_TO_QUARTER = {
    "January": "Q1", "Jan": "Q1",
    "February": "Q1", "Feb": "Q1",
    "March": "Q1", "Mar": "Q1",
    "April": "Q2", "Apr": "Q2",
    "May": "Q2",
    "June": "Q2", "Jun": "Q2",
    "July": "Q3", "Jul": "Q3",
    "August": "Q3", "Aug": "Q3",
    "September": "Q3", "Sep": "Q3",
    "October": "Q4", "Oct": "Q4",
    "November": "Q4", "Nov": "Q4",
    "December": "Q4", "Dec": "Q4",
}

TARGET_MAP = {
    "attendance": {
        "facility":  ["M", "N", "O", "P", "Q", "R"],
        "pmv":       ["T", "U", "V", "W", "X", "Y"],
        "community": ["AA", "AB", "AC", "AD", "AE", "AF"],
        "lab":       ["AH", "AI", "AJ", "AK", "AL", "AM"],
        "tba":       ["AO", "AP", "AQ", "AR", "AS", "AT"],
    },
    "screened": {
        "facility":  ["BC", "BD", "BE", "BF", "BG", "BH"],
        "pmv":       ["BJ", "BK", "BL", "BM", "BN", "BO"],
        "community": ["BQ", "BR", "BS", "BT", "BU", "BV"],
        "lab":       ["BX", "BY", "BZ", "CA", "CB", "CC"],
        "tba":       ["CD", "CE", "CF", "CG", "CH", "CI"],           
    },
    "presumptive": {
        "facility":  ["CS", "CT", "CU", "CV", "CW", "CX"],
        "pmv":       ["CZ", "DA", "DB", "DC", "DD", "DE"],
        "community": ["DG", "DH", "DI", "DJ", "DK", "DL"],
        "lab":       ["DN", "DO", "DP", "DQ", "DR", "DS"],
        "tba":       ["DU", "DV", "DW", "DX", "DY", "DZ"],
    },
    "evaluated": {
        "xpert": "EI",
        "afb": "EJ",
        "tblamp": "EK",
        "trunat": "EL",
        "lf_lam_clinical_chestxray": "EM",
        "clinical": "EN",
        "pdx": "EO",
        "chest_xray": "EP",
    },
    "diagnosed": {
        "facility":  ["ER", "ES", "ET", "EU", "EV", "EW"],
        "pmv":       ["EY", "EZ", "FA", "FB", "FC", "FD"],
        "community": ["FF", "FG", "FH", "FI", "FJ", "FK"],
        "lab":       ["FM", "FN", "FO", "FP", "FQ", "FR"],
        "tba":       ["FT", "FU", "FV", "FW", "FX", "FY"],
    },
    "diagnosed_mode": {
        "mtb_detected": "GH",
        "afb": "GI",
        "tblamp": "GJ",
        "trunat": "GK",
        "lf_lam_clinical_chestxray": "GL",
        "clinical": "GM",
        "pdx": "GN",
        "chest_xray": "GO",
    },
    "notified": {
        "facility":  ["GQ", "GR", "GS", "GT", "GU", "GV"],
        "pmv":       ["GX", "GY", "GZ", "HA", "HB", "HC"],
        "community": ["HE", "HF", "HG", "HH", "HI", "HJ"],
        "lab":       ["HL", "HM", "HN", "HO", "HP", "HQ"],
        "tba":       ["HS", "HT", "HU", "HV", "HW", "HX"],
    },
    # child_tb_notification intentionally omitted from upload payload
    "all_notified_xpert": "IH",
    "notified_breakdown": {
        "mtb_detected": "II",
        "afb": "IJ",
        "tblamp": "IK",
        "trunat": "IL",
        "lf_lam_clinical_chestxray": "IM",
        "clinical": "IN",
        "pdx": "IO",
        "chest_xray": "IP",
    },
    "followup": {
        "month_2_3": "IR",
        "month_5": "IS",
        "month_6": "IT",
    },
    "category_started": {
        "new":     ["IV", "IW", "IX", "IY", "IZ", "JA"],
        "relapse": ["JC", "JD", "JE", "JF", "JG", "JH"],
        "other":   ["JJ", "JK", "JL", "JM", "JN", "JO"],
    },
    "hiv_status": {
        "negative": ["JR", "JS", "JT", "JU", "JV", "JW"],
        "positive": ["JY", "JZ", "KA", "KB", "KC", "KD"],
        "unknown":  ["KF", "KG", "KH", "KI", "KJ", "KK"],
    },
    "cpt": ["KN", "KO", "KP", "KQ", "KR", "KS"],
    "art": ["KU", "KV", "KW", "KX", "KY", "KZ"],
}


def get_target_tab_from_month(report_month: str) -> str:
    report_month = str(report_month).strip()
    tab = MONTH_TO_TAB.get(report_month)
    if not tab:
        raise HTTPException(
            status_code=400,
            detail=f"No master-sheet tab mapping found for month: {report_month}",
        )
    return tab


def get_quarter_from_month(report_month: str) -> str:
    report_month = str(report_month).strip()
    quarter = MONTH_TO_QUARTER.get(report_month)
    if not quarter:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported report month: {report_month}",
        )
    return quarter


def get_master_workbook_id(report_year: str, report_month: str) -> str:
    quarter = get_quarter_from_month(report_month)
    workbook_id = MASTER_WORKBOOK_IDS.get((str(report_year), quarter))

    if not workbook_id or workbook_id.startswith("PUT_") or workbook_id.startswith("PASTE_"):
        raise HTTPException(
            status_code=400,
            detail=f"Master workbook ID is not configured for year {report_year} and quarter {quarter}.",
        )

    return workbook_id


def get_gspread_client():
    if not SERVICE_ACCOUNT_FILE.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Service account file not found at: {SERVICE_ACCOUNT_FILE}",
        )

    try:
        creds = Credentials.from_service_account_file(
            str(SERVICE_ACCOUNT_FILE),
            scopes=SCOPES,
        )
        return gspread.authorize(creds)
    except Exception as exc:
        text = str(exc)
        network_markers = [
            "oauth2.googleapis.com",
            "sheets.googleapis.com",
            "www.googleapis.com",
            "NameResolutionError",
            "getaddrinfo failed",
            "Max retries exceeded",
            "Failed to resolve",
        ]
        if any(marker in text for marker in network_markers):
            raise HTTPException(
                status_code=503,
                detail="Cannot connect to Google services right now. Please check your internet, DNS, VPN, firewall, or try another network.",
            )
        raise HTTPException(
            status_code=500,
            detail=f"Google authentication failed: {text}",
        )


def open_master_sheet(report_year: str, report_month: str):
    target_tab = get_target_tab_from_month(report_month)
    workbook_id = get_master_workbook_id(report_year, report_month)
    client = get_gspread_client()

    try:
        workbook = client.open_by_key(workbook_id)
    except Exception as exc:
        text = str(exc)
        network_markers = [
            "oauth2.googleapis.com",
            "sheets.googleapis.com",
            "www.googleapis.com",
            "NameResolutionError",
            "getaddrinfo failed",
            "Max retries exceeded",
            "Failed to resolve",
        ]
        if any(marker in text for marker in network_markers):
            raise HTTPException(
                status_code=503,
                detail="Google Sheets is temporarily unreachable from this computer or network. Check your internet, DNS, VPN, firewall, or try another network.",
            )
        raise HTTPException(
            status_code=500,
            detail=f"Unable to open master workbook by key. {text}",
        )

    try:
        worksheet = workbook.worksheet(target_tab)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Worksheet/tab '{target_tab}' not found in the selected master workbook. {str(exc)}",
        )

    return workbook, worksheet, workbook_id, target_tab


def normalize_text(value: str) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().lower().split())


def clean_number(val):
    if pd.isna(val):
        return 0

    if isinstance(val, str):
        val = val.strip().replace(",", "")
        if val == "":
            return 0

    num = pd.to_numeric(val, errors="coerce")
    return 0 if pd.isna(num) else float(num)


def save_upload_temporarily(upload_file: UploadFile) -> str:
    suffix = Path(upload_file.filename).suffix or ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(upload_file.file.read())
        return tmp.name


def find_facility_row(worksheet, facility_name: str) -> Optional[int]:
    sheet_values = worksheet.get_all_values()
    target = normalize_text(facility_name)

    for r in range(5, len(sheet_values) + 1):
        row = sheet_values[r - 1]
        facility_val = normalize_text(row[4]) if len(row) > 4 else ""
        if facility_val == target:
            return r

    return None


def load_source_df(file_path: str, source_month_sheet: str) -> pd.DataFrame:
    source_tab = get_target_tab_from_month(source_month_sheet)
    try:
        return pd.read_excel(file_path, sheet_name=source_tab, header=None)
    except Exception:
        return pd.read_excel(file_path, sheet_name=0, header=None)


def extract_grouped(df: pd.DataFrame, male_row: int, female_row: int) -> List[float]:
    male_0_4 = clean_number(df.iloc[male_row, 3]) + clean_number(df.iloc[male_row, 4])
    male_5_14 = clean_number(df.iloc[male_row, 5]) + clean_number(df.iloc[male_row, 6])
    male_15_plus = sum(clean_number(df.iloc[male_row, c]) for c in range(7, 18))

    female_0_4 = clean_number(df.iloc[female_row, 3]) + clean_number(df.iloc[female_row, 4])
    female_5_14 = clean_number(df.iloc[female_row, 5]) + clean_number(df.iloc[female_row, 6])
    female_15_plus = sum(clean_number(df.iloc[female_row, c]) for c in range(7, 18))

    return [
        male_0_4, male_5_14, male_15_plus,
        female_0_4, female_5_14, female_15_plus,
    ]


def grouped_sum(vals: List[float]) -> float:
    return sum(vals)


def sum_pair_total(df: pd.DataFrame, male_row: int, female_row: int) -> float:
    return grouped_sum(extract_grouped(df, male_row, female_row))


def sum_many_pair_totals(df: pd.DataFrame, row_pairs: List[Tuple[int, int]]) -> float:
    return sum(sum_pair_total(df, m, f) for m, f in row_pairs)


def under15_total(df: pd.DataFrame, male_row: int, female_row: int) -> float:
    total = 0
    for row in [male_row, female_row]:
        total += clean_number(df.iloc[row, 3])
        total += clean_number(df.iloc[row, 4])
        total += clean_number(df.iloc[row, 5])
        total += clean_number(df.iloc[row, 6])
    return total


def all_age_total(df: pd.DataFrame, male_row: int, female_row: int) -> float:
    total = 0
    for row in [male_row, female_row]:
        for c in range(3, 18):
            total += clean_number(df.iloc[row, c])
    return total


def build_source_blocks(df: pd.DataFrame) -> Dict[str, Any]:
    return {
        "attendance": {
            "facility":  extract_grouped(df, 5, 6),
            "pmv":       extract_grouped(df, 8, 9),
            "community": extract_grouped(df, 11, 12),
            "lab":       extract_grouped(df, 14, 15),
            "tba":       extract_grouped(df, 17, 18),
        },
        "screened": {
            "facility":  extract_grouped(df, 24, 25),
            "pmv":       extract_grouped(df, 27, 28),
            "community": extract_grouped(df, 30, 31),
            "lab":       extract_grouped(df, 33, 34),
            "tba":       extract_grouped(df, 36, 37),
        },
        "presumptive": {
            "facility":  extract_grouped(df, 43, 44),
            "pmv":       extract_grouped(df, 46, 47),
            "community": extract_grouped(df, 49, 50),
            "lab":       extract_grouped(df, 52, 53),
            "tba":       extract_grouped(df, 55, 56),
        },
        "evaluated": {
            "xpert": sum_pair_total(df, 62, 63),
            "afb": sum_pair_total(df, 65, 66),
            "tblamp": sum_pair_total(df, 68, 69),
            "trunat": sum_pair_total(df, 71, 72),
            "lf_lam_clinical_chestxray": sum_pair_total(df, 74, 75),
            "clinical": 0,
            "pdx": 0,
            "chest_xray": 0,
        },
        "diagnosed": {
            "facility":  extract_grouped(df, 81, 82),
            "pmv":       extract_grouped(df, 84, 85),
            "community": extract_grouped(df, 87, 88),
            "lab":       extract_grouped(df, 90, 91),
            "tba":       extract_grouped(df, 93, 94),
        },
        "diagnosed_mode": {
            "mtb_detected": sum_many_pair_totals(df, [(101, 102), (120, 121), (139, 140), (158, 159), (177, 178)]),
            "afb":          sum_many_pair_totals(df, [(104, 105), (123, 124), (142, 143), (161, 162), (180, 181)]),
            "tblamp":       sum_many_pair_totals(df, [(107, 108), (126, 127), (145, 146), (164, 165), (183, 184)]),
            "trunat":       sum_many_pair_totals(df, [(110, 111), (129, 130), (148, 149), (167, 168), (186, 187)]),
            "lf_lam_clinical_chestxray": sum_many_pair_totals(df, [(113, 114), (132, 133), (151, 152), (170, 171), (189, 190)]),
            "clinical": 0,
            "pdx": 0,
            "chest_xray": 0,
        },
        "notified": {
            "facility":  extract_grouped(df, 215, 216),
            "pmv":       extract_grouped(df, 218, 219),
            "community": extract_grouped(df, 221, 222),
            "lab":       extract_grouped(df, 224, 225),
            "tba":       extract_grouped(df, 227, 228),
        },
        "child_tb_notification": under15_total(df, 234, 235),
        "all_notified_xpert": sum_pair_total(df, 241, 242),
        "notified_breakdown": {
            "mtb_detected": sum_pair_total(df, 241, 242),
            "afb":          sum_pair_total(df, 244, 245),
            "tblamp":       sum_pair_total(df, 247, 248),
            "trunat":       sum_pair_total(df, 250, 251),
            "lf_lam_clinical_chestxray": sum_pair_total(df, 253, 254),
            "clinical": 0,
            "pdx": 0,
            "chest_xray": 0,
        },
        "followup": {
            "month_2_3": all_age_total(df, 257, 258),
            "month_5": all_age_total(df, 260, 261),
            "month_6": all_age_total(df, 263, 264),
        },
        "category_started": {
            "new": extract_grouped(df, 270, 271),
            "relapse": extract_grouped(df, 273, 274),
            "other": extract_grouped(df, 276, 277),
        },
        "hiv_status": {
            "positive": extract_grouped(df, 280, 281),
            "negative": extract_grouped(df, 283, 284),
            "unknown": extract_grouped(df, 286, 287),
        },
        "cpt": extract_grouped(df, 290, 291),
        "art": extract_grouped(df, 294, 295),
    }


def validation_summary_from_source_blocks(source_blocks: Dict[str, Any]) -> Dict[str, float]:
    return {
        "attendance_total": sum(sum(v) for v in source_blocks["attendance"].values()),
        "screened_total": sum(sum(v) for v in source_blocks["screened"].values()),
        "presumptive_total": sum(sum(v) for v in source_blocks["presumptive"].values()),
        "diagnosed_total": sum(sum(v) for v in source_blocks["diagnosed"].values()),
        "notified_total": sum(sum(v) for v in source_blocks["notified"].values()),
    }


def build_preview_payload_for_row(source_blocks: Dict[str, Any], matched_row: int) -> Dict[str, Any]:
    preview: Dict[str, Any] = {}

    for section_name in [
        "attendance",
        "screened",
        "presumptive",
        "diagnosed",
        "notified",
        "category_started",
        "hiv_status",
    ]:
        preview[section_name] = {}
        for provider, values in source_blocks[section_name].items():
            letters = TARGET_MAP[section_name][provider]
            preview[section_name][provider] = {
                f"{col}{matched_row}": val for col, val in zip(letters, values)
            }

    preview["evaluated"] = {
        f"{col}{matched_row}": source_blocks["evaluated"][key]
        for key, col in TARGET_MAP["evaluated"].items()
    }

    preview["diagnosed_mode"] = {
        f"{col}{matched_row}": source_blocks["diagnosed_mode"][key]
        for key, col in TARGET_MAP["diagnosed_mode"].items()
    }

    # Child TB notification intentionally excluded from write payload.
    # It is auto-derived in the master sheet.

    preview["all_notified_xpert"] = {
        f"{TARGET_MAP['all_notified_xpert']}{matched_row}": source_blocks["all_notified_xpert"]
    }

    preview["notified_breakdown"] = {
        f"{col}{matched_row}": source_blocks["notified_breakdown"][key]
        for key, col in TARGET_MAP["notified_breakdown"].items()
    }

    preview["followup"] = {
        f"{col}{matched_row}": source_blocks["followup"][key]
        for key, col in TARGET_MAP["followup"].items()
    }

    preview["cpt"] = {
        f"{col}{matched_row}": val
        for col, val in zip(TARGET_MAP["cpt"], source_blocks["cpt"])
    }

    preview["art"] = {
        f"{col}{matched_row}": val
        for col, val in zip(TARGET_MAP["art"], source_blocks["art"])
    }

    return preview


def flatten_preview_to_updates(preview_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    updates: List[Dict[str, Any]] = []

    def walk(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if isinstance(value, dict):
                    walk(value)
                else:
                    updates.append({"range": key, "values": [[value]]})

    walk(preview_payload)
    return updates


def log_upload(
    facility_name: str,
    lga: str,
    state: str,
    report_year: str,
    report_month: str,
    target_tab: str,
    quarter: str,
    workbook_id: str,
    matched_row: int,
    uploaded_filename: str,
    updated_cells: int,
    status: str,
    message: str,
    summary: Dict[str, float],
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO upload_logs (
            facility_name, lga, state, report_year, report_month, target_tab, quarter,
            workbook_id, matched_row, uploaded_filename, updated_cells, status, message,
            attendance_total, screened_total, presumptive_total, diagnosed_total, notified_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            facility_name,
            lga,
            state,
            report_year,
            report_month,
            target_tab,
            quarter,
            workbook_id,
            matched_row,
            uploaded_filename,
            updated_cells,
            status,
            message,
            summary.get("attendance_total"),
            summary.get("screened_total"),
            summary.get("presumptive_total"),
            summary.get("diagnosed_total"),
            summary.get("notified_total"),
        ),
    )

    conn.commit()
    conn.close()


@app.get("/")
def root():
    return {"message": "ARFH FCT backend is running."}


@app.get("/api/upload-logs")
def get_upload_logs():
    conn = get_connection()
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT *
        FROM upload_logs
        ORDER BY created_at DESC, id DESC
        LIMIT 30
        """
    ).fetchall()
    conn.close()

    return {"logs": [dict(row) for row in rows]}


@app.post("/api/preview")
async def preview(
    facility_name: str = Form(...),
    lga: str = Form(...),
    state: str = Form(...),
    report_year: str = Form(...),
    source_month_sheet: str = Form(...),
    target_tab: str = Form(...),
    report_type: str = Form(...),
    spreadsheet_name: str = Form(...),
    file: UploadFile = File(...),
):
    temp_path = None

    try:
        _, worksheet, workbook_id, actual_target_tab = open_master_sheet(
            report_year=report_year,
            report_month=source_month_sheet,
        )

        matched_row = find_facility_row(worksheet, facility_name)
        if not matched_row:
            raise HTTPException(
                status_code=404,
                detail=f"Facility '{facility_name}' was not found in tab '{actual_target_tab}'.",
            )

        temp_path = save_upload_temporarily(file)
        source_df = load_source_df(temp_path, source_month_sheet)
        source_blocks = build_source_blocks(source_df)
        preview_payload = build_preview_payload_for_row(source_blocks, matched_row)
        summary = validation_summary_from_source_blocks(source_blocks)

        return {
            "message": "Preview loaded successfully.",
            "facility_name": facility_name,
            "lga": lga,
            "state": state,
            "target_tab": actual_target_tab,
            "report_year": report_year,
            "quarter": get_quarter_from_month(source_month_sheet),
            "master_workbook_id": workbook_id,
            "uploaded_filename": file.filename,
            "matched_target_row": matched_row,
            "writes": preview_payload,
            "summary": summary,
        }

    except HTTPException:
        raise
    except Exception as exc:
        print("PREVIEW ERROR:", repr(exc))
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/api/validate")
async def validate(
    facility_name: str = Form(...),
    lga: str = Form(...),
    state: str = Form(...),
    report_year: str = Form(...),
    source_month_sheet: str = Form(...),
    target_tab: str = Form(...),
    report_type: str = Form(...),
    spreadsheet_name: str = Form(...),
    file: UploadFile = File(...),
):
    temp_path = None

    try:
        _, worksheet, workbook_id, actual_target_tab = open_master_sheet(
            report_year=report_year,
            report_month=source_month_sheet,
        )

        matched_row = find_facility_row(worksheet, facility_name)
        if not matched_row:
            raise HTTPException(
                status_code=404,
                detail=f"Facility '{facility_name}' not found in tab '{actual_target_tab}'.",
            )

        temp_path = save_upload_temporarily(file)
        source_df = load_source_df(temp_path, source_month_sheet)
        source_blocks = build_source_blocks(source_df)
        summary = validation_summary_from_source_blocks(source_blocks)

        issues = []
        if summary["attendance_total"] <= 0:
            issues.append("Attendance total is zero or invalid.")
        if summary["screened_total"] <= 0:
            issues.append("Screened total is zero or invalid.")
        if summary["presumptive_total"] <= 0:
            issues.append("Presumptive total is zero or invalid.")

        return {
            "status": "passed" if not issues else "failed",
            "message": "Validation completed successfully." if not issues else "Validation failed.",
            "sheet_checked": actual_target_tab,
            "matched_target_row": matched_row,
            "master_workbook_id": workbook_id,
            "error_count": len(issues),
            "issues": issues,
            "summary": summary,
        }

    except HTTPException:
        raise
    except Exception as exc:
        print("VALIDATE ERROR:", repr(exc))
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/api/upload")
async def upload(
    facility_name: str = Form(...),
    lga: str = Form(...),
    state: str = Form(...),
    report_year: str = Form(...),
    source_month_sheet: str = Form(...),
    target_tab: str = Form(...),
    report_type: str = Form(...),
    spreadsheet_name: str = Form(...),
    file: UploadFile = File(...),
):
    temp_path = None

    try:
        _, worksheet, workbook_id, actual_target_tab = open_master_sheet(
            report_year=report_year,
            report_month=source_month_sheet,
        )

        matched_row = find_facility_row(worksheet, facility_name)
        if not matched_row:
            raise HTTPException(
                status_code=404,
                detail=f"Facility '{facility_name}' not found in tab '{actual_target_tab}'.",
            )

        temp_path = save_upload_temporarily(file)
        source_df = load_source_df(temp_path, source_month_sheet)
        source_blocks = build_source_blocks(source_df)
        preview_payload = build_preview_payload_for_row(source_blocks, matched_row)
        updates = flatten_preview_to_updates(preview_payload)

        if updates:
            worksheet.batch_update(updates, value_input_option="USER_ENTERED")

        summary = validation_summary_from_source_blocks(source_blocks)

        log_upload(
            facility_name=facility_name,
            lga=lga,
            state=state,
            report_year=report_year,
            report_month=source_month_sheet,
            target_tab=actual_target_tab,
            quarter=get_quarter_from_month(source_month_sheet),
            workbook_id=workbook_id,
            matched_row=matched_row,
            uploaded_filename=file.filename,
            updated_cells=len(updates),
            status="uploaded",
            message=f"Upload successful for {facility_name}",
            summary=summary,
        )

        return {
            "status": "uploaded",
            "message": f"Upload successful for {facility_name}",
            "target_tab": actual_target_tab,
            "quarter": get_quarter_from_month(source_month_sheet),
            "master_workbook_id": workbook_id,
            "uploaded_filename": file.filename,
            "matched_target_row": matched_row,
            "updated_cells": len(updates),
            "summary": summary,
        }

    except HTTPException:
        raise
    except Exception as exc:
        print("UPLOAD ERROR:", repr(exc))
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)