import os
import json
import math
import re
import tempfile
from pathlib import Path
from difflib import SequenceMatcher
from typing import Dict, Any, Optional, List, Tuple

import pandas as pd
import gspread
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
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
LOCAL_SERVICE_ACCOUNT_FILE = DATA_DIR / "service-account.json"
RENDER_SECRET_FILE = Path("/etc/secrets/service-account.json")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

APP_ACCESS_PASSWORD = os.getenv("APP_ACCESS_PASSWORD", "").strip()


def require_auth(x_app_password: str = Header(default="")):
    """
    Simple team-login protection.
    Set APP_ACCESS_PASSWORD in Render.
    Frontend sends it as X-App-Password after user logs in.
    """
    if not APP_ACCESS_PASSWORD:
        return True

    if x_app_password != APP_ACCESS_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized. Please log in again.")

    return True

# Put your real workbook IDs here.
MASTER_WORKBOOK_IDS = {
    ("2026", "Q1"): "1WO6ck6-ZDe-4tozRkvG-bj0q7B7KgBGm0Ar7AebESIo",
    ("2026", "Q2"): "1UtHfkfyQbZgXhbGul9RVPWpcWo_8fQliVDCsM0DL3tM",
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

PMTCT_WORKBOOK_IDS = {
    ("2026", "Q2"): "13XZxAwsmZCZ8ECk_FI2UPUwqO5Wxmmxj7NUMClBVV3g",
}

PMTCT_REPORT_TYPE = "Community PMTCT Upload"

PMTCT_SOURCE_SHEET_NAME = "cPMTCT"

PMTCT_TARGET_TAB_BY_MONTH = {
    "January": "cPMTCT_Jan", "Jan": "cPMTCT_Jan",
    "February": "cPMTCT_Feb", "Feb": "cPMTCT_Feb",
    "March": "cPMTCT_Mar", "Mar": "cPMTCT_Mar",
    "April": "cPMTCT_Apr", "Apr": "cPMTCT_Apr",
    "May": "cPMTCT_May",
    "June": "cPMTCT_Jun", "Jun": "cPMTCT_Jun",
    "July": "cPMTCT_Jul", "Jul": "cPMTCT_Jul",
    "August": "cPMTCT_Aug", "Aug": "cPMTCT_Aug",
    "September": "cPMTCT_Sep", "Sep": "cPMTCT_Sep",
    "October": "cPMTCT_Oct", "Oct": "cPMTCT_Oct",
    "November": "cPMTCT_Nov", "Nov": "cPMTCT_Nov",
    "December": "cPMTCT_Dec", "Dec": "cPMTCT_Dec",
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
        # Corrected: TBA starts after Standalone Lab total column CD.
        # So write only into CE:CJ, not CD:CI.
        "tba":       ["CE", "CF", "CG", "CH", "CI", "CJ"],
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
    # child_tb_notification intentionally omitted from upload payload.
    # It is auto-derived in the master sheet.
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
    try:
        env_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")

        if env_json:
            service_account_info = json.loads(env_json)
            creds = Credentials.from_service_account_info(
                service_account_info,
                scopes=SCOPES,
            )
            return gspread.authorize(creds)

        service_account_file = RENDER_SECRET_FILE if RENDER_SECRET_FILE.exists() else LOCAL_SERVICE_ACCOUNT_FILE

        if not service_account_file.exists():
            raise HTTPException(
                status_code=500,
                detail=(
                    "Google credentials not found. Add GOOGLE_SERVICE_ACCOUNT_JSON in Render "
                    f"or provide local file at {LOCAL_SERVICE_ACCOUNT_FILE}"
                ),
            )

        creds = Credentials.from_service_account_file(
            str(service_account_file),
            scopes=SCOPES,
        )
        return gspread.authorize(creds)

    except HTTPException:
        raise
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
                detail="Google Sheets is temporarily unreachable. Check internet, DNS, VPN, firewall, or try another network.",
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
    """
    Convert spreadsheet numeric cells to normal JSON-safe Python numbers.
    Empty, NaN, inf, -inf, pandas NA, and non-numeric text become 0.
    """
    try:
        if val is None:
            return 0

        if hasattr(val, "item"):
            try:
                val = val.item()
            except Exception:
                pass

        try:
            missing = pd.isna(val)
            if isinstance(missing, bool) and missing:
                return 0
        except Exception:
            pass

        if isinstance(val, str):
            cleaned = val.strip().replace(",", "")
            if cleaned.lower() in ["", "nan", "none", "null", "inf", "+inf", "-inf", "infinity", "-infinity"]:
                return 0
            val = cleaned

        num = pd.to_numeric(val, errors="coerce")

        try:
            if pd.isna(num):
                return 0
        except Exception:
            pass

        num = float(num)
        if not math.isfinite(num):
            return 0

        return int(num) if num.is_integer() else num

    except Exception:
        return 0


def clean_cell_value(value):
    """
    Convert any value to something JSON-safe for Google Sheets/FastAPI.
    This is intentionally strict because Google requests reject NaN/Infinity.
    """
    try:
        if value is None:
            return ""

        if hasattr(value, "item"):
            try:
                value = value.item()
            except Exception:
                pass

        try:
            missing = pd.isna(value)
            if isinstance(missing, bool) and missing:
                return ""
        except Exception:
            pass

        if isinstance(value, bool):
            return value

        if isinstance(value, int):
            return int(value)

        if isinstance(value, float):
            if not math.isfinite(value):
                return ""
            return int(value) if value.is_integer() else float(value)

        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned.lower() in ["nan", "none", "null", "inf", "+inf", "-inf", "infinity", "-infinity"]:
                return ""
            return cleaned

        # pandas Timestamp / datetime-like values
        if hasattr(value, "isoformat"):
            try:
                return value.isoformat()
            except Exception:
                pass

        return str(value)

    except Exception:
        return ""


def make_json_safe(obj):
    """Recursively clean dicts/lists/tuples/scalars so json.dumps(..., allow_nan=False) cannot fail."""
    if isinstance(obj, dict):
        return {str(k): make_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [make_json_safe(v) for v in obj]
    return clean_cell_value(obj)


def clean_update_values(values):
    return make_json_safe(values)


def assert_json_safe(obj, context="payload"):
    try:
        json.dumps(obj, allow_nan=False)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Internal upload payload still contains a non-JSON-safe value in {context}: {str(exc)}",
        )


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
    """
    Load the exact selected monthly worksheet.

    Do not silently fall back to the first worksheet. A silent fallback could
    validate the wrong month and allow an invalid report to pass.
    """
    source_tab = get_target_tab_from_month(source_month_sheet)

    try:
        workbook = pd.ExcelFile(file_path)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unable to open the uploaded Excel workbook: {str(exc)}",
        )

    available_tabs = [str(name).strip() for name in workbook.sheet_names]
    tab_lookup = {name.lower(): name for name in available_tabs}
    actual_tab = tab_lookup.get(source_tab.lower())

    if not actual_tab:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    f"The selected month worksheet '{source_tab}' was not found in the uploaded report. "
                    "Validation has been stopped to prevent checking the wrong worksheet."
                ),
                "selected_month": source_month_sheet,
                "expected_worksheet": source_tab,
                "available_worksheets": available_tabs,
            },
        )

    try:
        return pd.read_excel(workbook, sheet_name=actual_tab, header=None)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unable to read worksheet '{actual_tab}': {str(exc)}",
        )


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
        for col in [3, 4, 5, 6]:
            total += clean_number(df.iloc[row, col])
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



# Detailed source age bands used in the Field Officer/Linkage Coordinator report.
# These are validated BEFORE aggregation into 0–4, 5–14 and 15+ for the master sheet.
SOURCE_AGE_BANDS = [
    "<1", "1-4", "5-9", "10-14", "15-19",
    "20-24", "25-29", "30-34", "35-39", "40-44",
    "45-49", "50-54", "55-59", "60-64", "65+",
]

SEX_LABELS = ("Male", "Female")

PROVIDER_ROW_PAIRS = {
    "attendance": {
        "facility": (5, 6), "pmv": (8, 9), "community": (11, 12),
        "lab": (14, 15), "tba": (17, 18),
    },
    "screened": {
        "facility": (24, 25), "pmv": (27, 28), "community": (30, 31),
        "lab": (33, 34), "tba": (36, 37),
    },
    "presumptive": {
        "facility": (43, 44), "pmv": (46, 47), "community": (49, 50),
        "lab": (52, 53), "tba": (55, 56),
    },
    "diagnosed": {
        "facility": (81, 82), "pmv": (84, 85), "community": (87, 88),
        "lab": (90, 91), "tba": (93, 94),
    },
    "notified": {
        "facility": (215, 216), "pmv": (218, 219), "community": (221, 222),
        "lab": (224, 225), "tba": (227, 228),
    },
}

EVALUATED_ROW_PAIRS = [
    (62, 63), (65, 66), (68, 69), (71, 72), (74, 75),
]

NOTIFIED_BREAKDOWN_ROW_PAIRS = [
    (241, 242), (244, 245), (247, 248), (250, 251), (253, 254),
]

CATEGORY_STARTED_ROW_PAIRS = {
    "new": (270, 271),
    "relapse": (273, 274),
    "other": (276, 277),
}

HIV_STATUS_ROW_PAIRS = {
    "positive": (280, 281),
    "negative": (283, 284),
    "unknown": (286, 287),
}

CPT_ROW_PAIR = (290, 291)
ART_ROW_PAIR = (294, 295)


def extract_detailed_age_pair(df: pd.DataFrame, male_row: int, female_row: int) -> Dict[str, List[float]]:
    """Return all 15 source age bands separately for male and female rows."""
    return {
        "Male": [clean_number(df.iloc[male_row, c]) for c in range(3, 18)],
        "Female": [clean_number(df.iloc[female_row, c]) for c in range(3, 18)],
    }


def add_detailed_pairs(*pairs: Dict[str, List[float]]) -> Dict[str, List[float]]:
    result = {sex: [0] * len(SOURCE_AGE_BANDS) for sex in SEX_LABELS}
    for pair in pairs:
        for sex in SEX_LABELS:
            for idx, value in enumerate(pair[sex]):
                result[sex][idx] += clean_number(value)
    return result


def extract_provider_detailed(df: pd.DataFrame, section: str) -> Dict[str, Dict[str, List[float]]]:
    return {
        provider: extract_detailed_age_pair(df, male_row, female_row)
        for provider, (male_row, female_row) in PROVIDER_ROW_PAIRS[section].items()
    }


def aggregate_provider_detailed(provider_data: Dict[str, Dict[str, List[float]]]) -> Dict[str, List[float]]:
    return add_detailed_pairs(*provider_data.values())


def extract_many_detailed(df: pd.DataFrame, row_pairs: List[Tuple[int, int]]) -> Dict[str, List[float]]:
    return add_detailed_pairs(*(extract_detailed_age_pair(df, m, f) for m, f in row_pairs))


def _age_issue(
    rule: str,
    upstream_name: str,
    downstream_name: str,
    upstream_value: float,
    downstream_value: float,
    sex: str,
    age_band: str,
    provider: Optional[str] = None,
    relation: str = "lte",
) -> Dict[str, Any]:
    provider_text = f" for provider '{provider}'" if provider else ""
    if relation == "equal":
        message = (
            f"Detailed age-band mismatch{provider_text}: {downstream_name} must equal "
            f"{upstream_name} for {sex} {age_band}. "
            f"{upstream_name}={upstream_value}, {downstream_name}={downstream_value}."
        )
    else:
        message = (
            f"Detailed age-band cascade error{provider_text}: {downstream_name} cannot exceed "
            f"{upstream_name} for {sex} {age_band}. "
            f"{upstream_name}={upstream_value}, {downstream_name}={downstream_value}."
        )
    return {
        "rule": rule,
        "provider": provider,
        "sex": sex,
        "age_band": age_band,
        "upstream_indicator": upstream_name,
        "downstream_indicator": downstream_name,
        "upstream_value": upstream_value,
        "downstream_value": downstream_value,
        "message": message,
    }


def compare_detailed_age_bands(
    upstream: Dict[str, List[float]],
    downstream: Dict[str, List[float]],
    upstream_name: str,
    downstream_name: str,
    rule: str,
    provider: Optional[str] = None,
    require_equal: bool = False,
) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    for sex in SEX_LABELS:
        for idx, age_band in enumerate(SOURCE_AGE_BANDS):
            up = clean_number(upstream[sex][idx])
            down = clean_number(downstream[sex][idx])
            invalid = (down != up) if require_equal else (down > up)
            if invalid:
                issues.append(_age_issue(
                    rule=rule,
                    upstream_name=upstream_name,
                    downstream_name=downstream_name,
                    upstream_value=up,
                    downstream_value=down,
                    sex=sex,
                    age_band=age_band,
                    provider=provider,
                    relation="equal" if require_equal else "lte",
                ))
    return issues


def validate_detailed_age_template(df: pd.DataFrame) -> None:
    """
    Confirm that the selected worksheet has the expected detailed DHIS age-band
    layout before any cascade validation or aggregation is performed.
    """
    expected_headers = [
        "<1", "1-4", "5-9", "10-14", "15-19",
        "20-24", "25-29", "30-34", "35-39", "40-44",
        "45-49", "50-54", "55-59", "60-64", "65+",
    ]

    if df.shape[0] <= 295 or df.shape[1] < 18:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    "The uploaded TB report does not contain the complete expected "
                    "Field Officer/Linkage Coordinator template."
                ),
                "minimum_rows_required": 296,
                "minimum_columns_required": 18,
                "rows_found": int(df.shape[0]),
                "columns_found": int(df.shape[1]),
            },
        )

    def normalize_age_header(value: Any) -> str:
        value = "" if value is None or pd.isna(value) else str(value)
        value = value.strip().replace("–", "-").replace("—", "-")
        value = re.sub(r"\s+", "", value)
        return value.lower()

    actual_headers = [
        normalize_age_header(df.iloc[4, col])
        for col in range(3, 18)
    ]
    expected_normalized = [normalize_age_header(value) for value in expected_headers]

    if actual_headers != expected_normalized:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    "Detailed age-band headers do not match the expected DHIS structure. "
                    "Validation and upload have been stopped."
                ),
                "expected_age_bands": expected_headers,
                "age_bands_found": [
                    clean_cell_value(df.iloc[4, col])
                    for col in range(3, 18)
                ],
            },
        )


def validate_detailed_source_age_bands(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Validate the original DHIS-style age bands before any aggregation.

    Rules:
    - Screened <= Attendance, by provider, sex and detailed age band.
    - Presumptive <= Screened, by provider, sex and detailed age band.
    - Evaluated <= Presumptive (all providers combined).
    - Diagnosed <= Evaluated (all providers combined).
    - Notified <= Diagnosed (all providers combined).
    - Notified diagnostic breakdown must equal total notified, by sex/age band.
    - Treatment started <= Notified.
    - Treatment-category total must equal HIV-status total, by sex/age band.
    - CPT and ART <= HIV-positive, by sex/age band.
    """
    validate_detailed_age_template(df)
    issues: List[Dict[str, Any]] = []

    attendance = extract_provider_detailed(df, "attendance")
    screened = extract_provider_detailed(df, "screened")
    presumptive = extract_provider_detailed(df, "presumptive")
    diagnosed = extract_provider_detailed(df, "diagnosed")
    notified = extract_provider_detailed(df, "notified")

    for provider in PROVIDER_ROW_PAIRS["attendance"].keys():
        issues.extend(compare_detailed_age_bands(
            attendance[provider], screened[provider],
            "Attendance", "Screened", "screened_not_above_attendance", provider,
        ))
        issues.extend(compare_detailed_age_bands(
            screened[provider], presumptive[provider],
            "Screened", "Presumptive", "presumptive_not_above_screened", provider,
        ))

    presumptive_total = aggregate_provider_detailed(presumptive)
    evaluated_total = extract_many_detailed(df, EVALUATED_ROW_PAIRS)
    diagnosed_total = aggregate_provider_detailed(diagnosed)
    notified_total = aggregate_provider_detailed(notified)
    notified_breakdown_total = extract_many_detailed(df, NOTIFIED_BREAKDOWN_ROW_PAIRS)

    category_started_total = extract_many_detailed(df, list(CATEGORY_STARTED_ROW_PAIRS.values()))
    hiv_status_total = extract_many_detailed(df, list(HIV_STATUS_ROW_PAIRS.values()))
    hiv_positive = extract_detailed_age_pair(df, *HIV_STATUS_ROW_PAIRS["positive"])
    cpt = extract_detailed_age_pair(df, *CPT_ROW_PAIR)
    art = extract_detailed_age_pair(df, *ART_ROW_PAIR)

    issues.extend(compare_detailed_age_bands(
        presumptive_total, evaluated_total,
        "Presumptive", "Presumptive evaluated", "evaluated_not_above_presumptive",
    ))
    issues.extend(compare_detailed_age_bands(
        evaluated_total, diagnosed_total,
        "Presumptive evaluated", "Diagnosed", "diagnosed_not_above_evaluated",
    ))
    issues.extend(compare_detailed_age_bands(
        diagnosed_total, notified_total,
        "Diagnosed", "Notified", "notified_not_above_diagnosed",
    ))
    issues.extend(compare_detailed_age_bands(
        notified_total, notified_breakdown_total,
        "Total notified", "Notified diagnostic breakdown",
        "notified_breakdown_equals_notified", require_equal=True,
    ))
    issues.extend(compare_detailed_age_bands(
        notified_total, category_started_total,
        "Notified", "Treatment started", "treatment_started_not_above_notified",
    ))
    issues.extend(compare_detailed_age_bands(
        category_started_total, hiv_status_total,
        "Treatment-category total", "HIV-status total",
        "hiv_status_equals_treatment_started", require_equal=True,
    ))
    issues.extend(compare_detailed_age_bands(
        hiv_positive, cpt, "HIV positive", "CPT", "cpt_not_above_hiv_positive",
    ))
    issues.extend(compare_detailed_age_bands(
        hiv_positive, art, "HIV positive", "ART", "art_not_above_hiv_positive",
    ))

    return {
        "status": "passed" if not issues else "failed",
        "error_count": len(issues),
        "issues": issues,
        "age_bands_checked": SOURCE_AGE_BANDS,
    }


def enforce_detailed_age_validation(df: pd.DataFrame) -> Dict[str, Any]:
    result = validate_detailed_source_age_bands(df)
    if result["issues"]:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    "Detailed source age-band validation failed. Correct the Field Officer/"
                    "Linkage Coordinator report before aggregation or upload."
                ),
                "error_count": result["error_count"],
                "age_bands_checked": result["age_bands_checked"],
                "issues": result["issues"],
            },
        )
    return result

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


def column_letter_to_number(col: str) -> int:
    number = 0
    for char in col.upper():
        number = number * 26 + (ord(char) - ord("A") + 1)
    return number


def column_number_to_letter(number: int) -> str:
    letters = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def split_cell_ref(cell_ref: str) -> Tuple[str, int]:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    digits = "".join(ch for ch in cell_ref if ch.isdigit())
    return letters, int(digits)


def compact_cell_dict_to_row_update(cell_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Converts a dict like {M12: 1, N12: 2, O12: 3} into one row update:
    {range: M12:O12, values: [[1, 2, 3]]}

    This avoids sending one Google API call per cell. The previous per-cell method
    could write attendance/screened, then slow down or stop before the rest.
    """
    parsed = []
    for cell, value in cell_dict.items():
        col, row = split_cell_ref(cell)
        parsed.append((column_letter_to_number(col), col, row, value))

    if not parsed:
        return {"range": "", "values": [[]]}

    rows = {item[2] for item in parsed}
    if len(rows) != 1:
        # Fallback, though our mapping is all same-row writes.
        first_cell = next(iter(cell_dict.keys()))
        return {"range": first_cell, "values": [[cell_dict[first_cell]]]}

    row_number = parsed[0][2]
    parsed.sort(key=lambda x: x[0])
    start_num = parsed[0][0]
    end_num = parsed[-1][0]
    start_col = column_number_to_letter(start_num)
    end_col = column_number_to_letter(end_num)

    value_lookup = {item[0]: item[3] for item in parsed}
    values = [value_lookup.get(col_num, "") for col_num in range(start_num, end_num + 1)]

    return {
        "range": f"{start_col}{row_number}:{end_col}{row_number}",
        "values": clean_update_values([values]),
    }


def flatten_preview_to_updates(preview_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Builds compact row-range updates instead of hundreds of individual cell updates.
    This keeps the working mapping but makes the deployed version reliable.
    """
    updates: List[Dict[str, Any]] = []

    def walk(obj):
        if not isinstance(obj, dict):
            return

        # Leaf dictionary: keys are cell references like M12, N12, O12.
        if obj and all(isinstance(k, str) and any(ch.isdigit() for ch in k) for k in obj.keys()):
            updates.append(compact_cell_dict_to_row_update(obj))
            return

        for value in obj.values():
            if isinstance(value, dict):
                walk(value)

    walk(preview_payload)
    return [u for u in updates if u.get("range")]


def strip_sheet_name_from_range(cell_range: str) -> str:
    """
    worksheet.update() expects A1 ranges without sheet prefixes.
    If gspread/API returns or receives a quoted sheet range, strip it safely.
    """
    if "!" in cell_range:
        return cell_range.split("!", 1)[1].replace("'", "")
    return cell_range.replace("'", "")


def sanitize_updates(updates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Clean ranges and recursively clean all values before any Google API call."""
    sanitized: List[Dict[str, Any]] = []

    for update in updates:
        cleaned_range = strip_sheet_name_from_range(str(update.get("range", ""))).strip()
        if not cleaned_range:
            continue

        raw_values = update.get("values", [[]])
        cleaned_values = clean_update_values(raw_values)

        sanitized.append({
            "range": cleaned_range,
            "values": cleaned_values,
        })

    sanitized = make_json_safe(sanitized)
    assert_json_safe(sanitized, context="Google Sheets updates")
    return sanitized


def safe_apply_updates(worksheet, updates: List[Dict[str, Any]]) -> Tuple[int, List[Dict[str, str]]]:
    """
    Apply updates safely.
    1. Sanitises all ranges and values.
    2. Confirms payload is valid JSON with no NaN/Infinity.
    3. Uses batch update first.
    4. If batch fails because of protected cells/ranges, falls back range-by-range.
    """
    failed: List[Dict[str, str]] = []
    updates = sanitize_updates(updates)

    if not updates:
        return 0, failed

    try:
        worksheet.batch_update(updates, value_input_option="USER_ENTERED")
        return len(updates), failed
    except Exception as batch_exc:
        print(f"BATCH UPDATE FAILED, FALLING BACK TO RANGE UPDATES: {batch_exc}")

    successful = 0
    for update in updates:
        cell_range = strip_sheet_name_from_range(update["range"])
        values = clean_update_values(update["values"])
        try:
            assert_json_safe(values, context=f"range {cell_range}")
            worksheet.update(
                range_name=cell_range,
                values=values,
                value_input_option="USER_ENTERED",
            )
            successful += 1
        except Exception as exc:
            failed.append({"range": cell_range, "error": str(exc)})
            print(f"SKIPPED WRITE {cell_range}: {exc}")

    return successful, failed


def aggressive_normalize(value: str) -> str:
    value = normalize_text(value)
    return re.sub(r"[^a-z0-9]", "", value)


def similarity_score(a: str, b: str) -> float:
    return SequenceMatcher(None, aggressive_normalize(a), aggressive_normalize(b)).ratio() * 100


def get_pmtct_target_tab_from_month(report_month: str) -> str:
    report_month = str(report_month).strip()
    tab = PMTCT_TARGET_TAB_BY_MONTH.get(report_month)
    if not tab:
        raise HTTPException(
            status_code=400,
            detail=f"No PMTCT master-sheet tab mapping found for month: {report_month}",
        )
    return tab


def get_pmtct_workbook_id(report_year: str, report_month: str) -> str:
    quarter = get_quarter_from_month(report_month)
    workbook_id = PMTCT_WORKBOOK_IDS.get((str(report_year), quarter))

    if not workbook_id or workbook_id.startswith("PUT_") or workbook_id.startswith("PASTE_"):
        raise HTTPException(
            status_code=400,
            detail=f"PMTCT workbook ID is not configured for year {report_year} and quarter {quarter}.",
        )

    return workbook_id


def open_pmtct_master_sheet(report_year: str, report_month: str):
    target_tab = get_pmtct_target_tab_from_month(report_month)
    workbook_id = get_pmtct_workbook_id(report_year, report_month)
    client = get_gspread_client()

    try:
        workbook = client.open_by_key(workbook_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to open PMTCT master workbook by key. {str(exc)}",
        )

    try:
        worksheet = workbook.worksheet(target_tab)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"PMTCT worksheet/tab '{target_tab}' not found. {str(exc)}",
        )

    return workbook, worksheet, workbook_id, target_tab


def load_pmtct_source_df(file_path: str) -> pd.DataFrame:
    try:
        return pd.read_excel(file_path, sheet_name=PMTCT_SOURCE_SHEET_NAME, header=None)
    except Exception:
        return pd.read_excel(file_path, sheet_name=0, header=None)


def col_to_num(col: str) -> int:
    return column_letter_to_number(col)


def num_to_col(num: int) -> str:
    return column_number_to_letter(num)


def make_row_range_update(start_col: str, row_number: int, values: List[Any]) -> Dict[str, Any]:
    start_num = col_to_num(start_col)
    end_col = num_to_col(start_num + len(values) - 1)
    return {
        "range": f"{start_col}{row_number}:{end_col}{row_number}",
        "values": clean_update_values([values]),
    }


PMTCT_INDICATORS = [
    (0, "presumed_pregnant_identified"),
    (1, "screened_for_tb"),
    (2, "screened_for_hiv"),
    (3, "eligible_for_hiv_testing_not_started_anc"),
    (4, "tested_for_hiv"),
    (5, "new_hiv_positive"),
    (6, "previously_known_hiv_positive_retested"),

    # Original block index 7 skipped:
    # total_hiv_positive is formula-derived in the master sheet.

    (8, "referred_for_general_anc"),
    (9, "hiv_positive_referred_for_art"),
    (10, "hiv_positive_placed_on_art"),
    (11, "tested_for_syphilis"),
    (12, "positive_for_syphilis"),
    (13, "syphilis_positive_treated_or_referred"),
    (14, "tested_for_hbv"),
    (15, "positive_for_hbv"),
    (16, "hiv_hbv_coinfected"),
    (17, "presumptive_tb"),
    (18, "evaluated_for_tb"),
    (19, "tb_results_received"),
    (20, "diagnosed_tb_dstb"),
    (21, "started_tb_treatment_dstb"),
    (22, "diagnosed_tb_drtb"),
    (23, "started_tb_treatment_drtb"),
    (24, "hiv_positive_diagnosed_tb"),
    (25, "hiv_positive_started_tb_treatment"),
    (26, "infants_delivered_by_wlhiv"),
    (27, "infant_hiv_testing_within_2_months"),
]

PMTCT_START_COL_NUM = col_to_num("H")
PMTCT_BLOCK_WIDTH = 10


def extract_pmtct_input_groups(df: pd.DataFrame, source_index: int, indicator_original_position: int) -> Dict[str, List[int]]:
    """
    Each PMTCT block has 10 columns.
    We write only editable input cells and skip formula cells:
    - Community <20, 20+
    - At Home <20, 20+
    - Unconventional <20, 20+
    We skip Community Total, At Home Total, Unconventional Total, and G.Total.
    """
    block_start_idx = 7 + (indicator_original_position * PMTCT_BLOCK_WIDTH)

    return {
        "community": [
            int(clean_number(df.iloc[source_index, block_start_idx + 0])),
            int(clean_number(df.iloc[source_index, block_start_idx + 1])),
        ],
        "at_home": [
            int(clean_number(df.iloc[source_index, block_start_idx + 3])),
            int(clean_number(df.iloc[source_index, block_start_idx + 4])),
        ],
        "unconventional": [
            int(clean_number(df.iloc[source_index, block_start_idx + 6])),
            int(clean_number(df.iloc[source_index, block_start_idx + 7])),
        ],
    }


def build_pmtct_indicator_updates(row_number: int, df: pd.DataFrame, source_index: int, indicator_original_position: int) -> List[Dict[str, Any]]:
    block_start_num = PMTCT_START_COL_NUM + (indicator_original_position * PMTCT_BLOCK_WIDTH)
    groups = extract_pmtct_input_groups(df, source_index, indicator_original_position)

    return [
        make_row_range_update(num_to_col(block_start_num + 0), row_number, groups["community"]),
        make_row_range_update(num_to_col(block_start_num + 3), row_number, groups["at_home"]),
        make_row_range_update(num_to_col(block_start_num + 6), row_number, groups["unconventional"]),
    ]


def get_pmtct_source_rows(df: pd.DataFrame, source_month_sheet: str) -> List[Dict[str, Any]]:
    source_month = str(source_month_sheet).strip().upper()
    rows = []
    data_start_index = 5

    for idx in range(data_start_index, len(df)):
        month_value = normalize_text(df.iloc[idx, 1])
        facility_name = str(df.iloc[idx, 4]).strip() if not pd.isna(df.iloc[idx, 4]) else ""

        if not facility_name or facility_name.lower() == "nan":
            continue

        if source_month and source_month.lower() not in month_value:
            continue

        rows.append({
            "source_index": idx,
            "excel_row": idx + 1,
            "month": df.iloc[idx, 1],
            "state": df.iloc[idx, 2],
            "lga": str(df.iloc[idx, 3]).strip() if not pd.isna(df.iloc[idx, 3]) else "",
            "facility_name": facility_name,
            "captured_sdp": df.iloc[idx, 5],
            "captured_ndars": df.iloc[idx, 6],
        })

    return rows


def build_pmtct_target_indexes(worksheet) -> Tuple[Dict[str, int], Dict[str, int], Dict[int, str], List[int]]:
    target_values = worksheet.get_all_values()

    target_facility_rows_exact: Dict[str, int] = {}
    target_facility_rows_aggressive: Dict[str, int] = {}
    target_facility_display: Dict[int, str] = {}
    empty_target_rows: List[int] = []

    master_data_start_row = 6

    for row_number in range(master_data_start_row, len(target_values) + 1):
        row = target_values[row_number - 1]
        facility_value = row[4] if len(row) > 4 else ""

        norm_exact = normalize_text(facility_value)
        norm_aggressive = aggressive_normalize(facility_value)

        if norm_exact:
            target_facility_rows_exact[norm_exact] = row_number
            target_facility_rows_aggressive[norm_aggressive] = row_number
            target_facility_display[row_number] = facility_value
        else:
            empty_target_rows.append(row_number)

    return target_facility_rows_exact, target_facility_rows_aggressive, target_facility_display, empty_target_rows


def find_pmtct_best_target_row(
    source_facility_name: str,
    target_facility_rows_exact: Dict[str, int],
    target_facility_rows_aggressive: Dict[str, int],
    target_facility_display: Dict[int, str],
    threshold: float = 90,
) -> Dict[str, Any]:
    norm_exact = normalize_text(source_facility_name)
    norm_aggressive = aggressive_normalize(source_facility_name)

    if norm_exact in target_facility_rows_exact:
        row = target_facility_rows_exact[norm_exact]
        return {
            "target_row": row,
            "match_type": "exact",
            "matched_name": target_facility_display.get(row, ""),
            "score": 100,
        }

    if norm_aggressive in target_facility_rows_aggressive:
        row = target_facility_rows_aggressive[norm_aggressive]
        return {
            "target_row": row,
            "match_type": "aggressive",
            "matched_name": target_facility_display.get(row, ""),
            "score": 100,
        }

    best_score = 0
    best_row = None

    for row, target_name in target_facility_display.items():
        score = similarity_score(source_facility_name, target_name)
        if score > best_score:
            best_score = score
            best_row = row

    if best_row and best_score >= threshold:
        return {
            "target_row": best_row,
            "match_type": "fuzzy",
            "matched_name": target_facility_display.get(best_row, ""),
            "score": round(best_score, 2),
        }

    return {
        "target_row": None,
        "match_type": "new_row_needed",
        "matched_name": target_facility_display.get(best_row, "") if best_row else "",
        "score": round(best_score, 2),
    }


def build_pmtct_updates(df: pd.DataFrame, worksheet, source_month_sheet: str) -> Dict[str, Any]:
    source_rows = get_pmtct_source_rows(df, source_month_sheet)
    target_values = worksheet.get_all_values()

    (
        target_facility_rows_exact,
        target_facility_rows_aggressive,
        target_facility_display,
        empty_target_rows,
    ) = build_pmtct_target_indexes(worksheet)

    updates: List[Dict[str, Any]] = []
    matched: List[Dict[str, Any]] = []
    newly_added: List[Dict[str, Any]] = []

    def get_next_empty_target_row() -> int:
        nonlocal target_values

        if empty_target_rows:
            return empty_target_rows.pop(0)

        next_row = len(target_values) + 1
        worksheet.add_rows(1)
        target_values.append([])
        return next_row

    for item in source_rows:
        source_index = item["source_index"]
        facility_name = item["facility_name"]

        match_result = find_pmtct_best_target_row(
            facility_name,
            target_facility_rows_exact,
            target_facility_rows_aggressive,
            target_facility_display,
            threshold=90,
        )

        target_row = match_result["target_row"]

        if not target_row:
            target_row = get_next_empty_target_row()

            target_facility_rows_exact[normalize_text(facility_name)] = target_row
            target_facility_rows_aggressive[aggressive_normalize(facility_name)] = target_row
            target_facility_display[target_row] = facility_name

            newly_added.append({
                **item,
                "target_row": target_row,
                "action": "new row created",
                "match_type": match_result["match_type"],
                "closest_master_name": match_result["matched_name"],
                "match_score": match_result["score"],
            })

            # Identity fields B:G.
            updates.append(make_row_range_update("B", target_row, [
                clean_cell_value(df.iloc[source_index, 1]),
                clean_cell_value(df.iloc[source_index, 2]),
                clean_cell_value(df.iloc[source_index, 3]),
                clean_cell_value(df.iloc[source_index, 4]),
                clean_cell_value(df.iloc[source_index, 5]),
                clean_cell_value(df.iloc[source_index, 6]),
            ]))

        else:
            matched.append({
                **item,
                "target_row": target_row,
                "action": "matched existing row",
                "match_type": match_result["match_type"],
                "matched_name": match_result["matched_name"],
                "match_score": match_result["score"],
            })

        for indicator_original_position, _indicator in PMTCT_INDICATORS:
            updates.extend(
                build_pmtct_indicator_updates(
                    target_row,
                    df,
                    source_index,
                    indicator_original_position,
                )
            )

    summary: Dict[str, int] = {}

    for indicator_original_position, indicator in PMTCT_INDICATORS:
        indicator_total = 0

        for item in source_rows:
            groups = extract_pmtct_input_groups(
                df,
                item["source_index"],
                indicator_original_position,
            )
            indicator_total += sum(groups["community"])
            indicator_total += sum(groups["at_home"])
            indicator_total += sum(groups["unconventional"])

        summary[indicator] = indicator_total

    return {
        "source_rows": source_rows,
        "matched": matched,
        "newly_added": newly_added,
        "updates": updates,
        "summary": summary,
    }


def validation_summary_from_pmtct_result(result: Dict[str, Any]) -> Dict[str, Any]:
    summary = result["summary"]

    return {
        "source_rows_total": len(result["source_rows"]),
        "matched_existing_rows": len(result["matched"]),
        "new_rows_to_create": len(result["newly_added"]),
        "range_updates_total": len(result["updates"]),
        "presumed_pregnant_identified": summary.get("presumed_pregnant_identified", 0),
        "screened_for_tb": summary.get("screened_for_tb", 0),
        "screened_for_hiv": summary.get("screened_for_hiv", 0),
        "eligible_for_hiv_testing_not_started_anc": summary.get("eligible_for_hiv_testing_not_started_anc", 0),
        "tested_for_hiv": summary.get("tested_for_hiv", 0),
        "new_hiv_positive": summary.get("new_hiv_positive", 0),
        "previously_known_hiv_positive_retested": summary.get("previously_known_hiv_positive_retested", 0),
        "referred_for_general_anc": summary.get("referred_for_general_anc", 0),
        "tested_for_syphilis": summary.get("tested_for_syphilis", 0),
        "tested_for_hbv": summary.get("tested_for_hbv", 0),
        "positive_for_hbv": summary.get("positive_for_hbv", 0),
    }


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
    return {"message": "ARFH FCT backend is running.", "version": "pmtct-detailed-age-validation-v5"}


@app.get("/api/upload-logs")
def get_upload_logs(_: bool = Depends(require_auth)):
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
    _: bool = Depends(require_auth),
):
    temp_path = None

    try:
        temp_path = save_upload_temporarily(file)

        if report_type == PMTCT_REPORT_TYPE:
            _, worksheet, workbook_id, actual_target_tab = open_pmtct_master_sheet(
                report_year=report_year,
                report_month=source_month_sheet,
            )

            source_df = load_pmtct_source_df(temp_path)
            pmtct_result = build_pmtct_updates(source_df, worksheet, source_month_sheet)
            summary = validation_summary_from_pmtct_result(pmtct_result)

            return {
                "message": "PMTCT preview loaded successfully.",
                "report_type": report_type,
                "lga": lga,
                "state": state,
                "target_tab": actual_target_tab,
                "report_year": report_year,
                "quarter": get_quarter_from_month(source_month_sheet),
                "master_workbook_id": workbook_id,
                "uploaded_filename": file.filename,
                "source_rows_total": len(pmtct_result["source_rows"]),
                "matched_existing_rows": len(pmtct_result["matched"]),
                "new_rows_to_create": len(pmtct_result["newly_added"]),
                "range_updates_total": len(pmtct_result["updates"]),
                "matched_preview": pmtct_result["matched"][:20],
                "new_rows_preview": pmtct_result["newly_added"][:20],
                "summary": summary,
            }

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

        source_df = load_source_df(temp_path, source_month_sheet)
        detailed_age_validation = enforce_detailed_age_validation(source_df)
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
            "detailed_age_validation": detailed_age_validation,
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
    _: bool = Depends(require_auth),
):
    temp_path = None

    try:
        temp_path = save_upload_temporarily(file)

        if report_type == PMTCT_REPORT_TYPE:
            _, worksheet, workbook_id, actual_target_tab = open_pmtct_master_sheet(
                report_year=report_year,
                report_month=source_month_sheet,
            )

            source_df = load_pmtct_source_df(temp_path)
            pmtct_result = build_pmtct_updates(source_df, worksheet, source_month_sheet)
            summary = validation_summary_from_pmtct_result(pmtct_result)

            issues = []
            if summary["source_rows_total"] <= 0:
                issues.append("No PMTCT source rows found for the selected month.")
            if summary["presumed_pregnant_identified"] <= 0:
                issues.append("Presumed pregnant women identified total is zero or invalid.")
            if summary["screened_for_hiv"] <= 0:
                issues.append("Pregnant women screened for HIV total is zero or invalid.")

            return {
                "status": "passed" if not issues else "failed",
                "message": "PMTCT validation completed successfully." if not issues else "PMTCT validation failed.",
                "report_type": report_type,
                "sheet_checked": actual_target_tab,
                "master_workbook_id": workbook_id,
                "error_count": len(issues),
                "issues": issues,
                "source_rows_total": len(pmtct_result["source_rows"]),
                "matched_existing_rows": len(pmtct_result["matched"]),
                "new_rows_to_create": len(pmtct_result["newly_added"]),
                "new_rows_preview": pmtct_result["newly_added"][:20],
                "summary": summary,
            }

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

        source_df = load_source_df(temp_path, source_month_sheet)
        detailed_age_validation = validate_detailed_source_age_bands(source_df)
        source_blocks = build_source_blocks(source_df)
        summary = validation_summary_from_source_blocks(source_blocks)

        issues = [item["message"] for item in detailed_age_validation["issues"]]
        if summary["attendance_total"] <= 0:
            issues.append("Attendance total is zero or invalid.")
        if summary["screened_total"] <= 0:
            issues.append("Screened total is zero or invalid.")
        if summary["presumptive_total"] < 0:
            issues.append("Presumptive total cannot be negative.")

        return {
            "status": "passed" if not issues else "failed",
            "message": "Validation completed successfully." if not issues else "Validation failed.",
            "sheet_checked": actual_target_tab,
            "matched_target_row": matched_row,
            "master_workbook_id": workbook_id,
            "error_count": len(issues),
            "issues": issues,
            "detailed_age_validation": detailed_age_validation,
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
    _: bool = Depends(require_auth),
):
    temp_path = None

    try:
        temp_path = save_upload_temporarily(file)

        if report_type == PMTCT_REPORT_TYPE:
            _, worksheet, workbook_id, actual_target_tab = open_pmtct_master_sheet(
                report_year=report_year,
                report_month=source_month_sheet,
            )

            source_df = load_pmtct_source_df(temp_path)
            pmtct_result = build_pmtct_updates(source_df, worksheet, source_month_sheet)
            updates = pmtct_result["updates"]

            successful_updates, failed_updates = safe_apply_updates(worksheet, updates)
            summary = validation_summary_from_pmtct_result(pmtct_result)

            status = "uploaded" if successful_updates > 0 else "failed"
            message = (
                f"PMTCT upload completed. Successful writes: {successful_updates}. "
                f"Skipped writes: {len(failed_updates)}. "
                f"Matched rows: {len(pmtct_result['matched'])}. "
                f"New rows created: {len(pmtct_result['newly_added'])}."
            )

            log_upload(
                facility_name=f"Community PMTCT - {lga}",
                lga=lga,
                state=state,
                report_year=report_year,
                report_month=source_month_sheet,
                target_tab=actual_target_tab,
                quarter=get_quarter_from_month(source_month_sheet),
                workbook_id=workbook_id,
                matched_row=0,
                uploaded_filename=file.filename,
                updated_cells=successful_updates,
                status=status,
                message=message,
                summary={
                    "attendance_total": summary.get("presumed_pregnant_identified", 0),
                    "screened_total": summary.get("screened_for_hiv", 0),
                    "presumptive_total": summary.get("eligible_for_hiv_testing_not_started_anc", 0),
                    "diagnosed_total": summary.get("new_hiv_positive", 0),
                    "notified_total": summary.get("hiv_positive_placed_on_art", 0),
                },
            )

            return {
                "status": status,
                "message": message,
                "report_type": report_type,
                "target_tab": actual_target_tab,
                "quarter": get_quarter_from_month(source_month_sheet),
                "master_workbook_id": workbook_id,
                "uploaded_filename": file.filename,
                "matched_existing_rows": len(pmtct_result["matched"]),
                "new_rows_created": len(pmtct_result["newly_added"]),
                "updated_cells": successful_updates,
                "skipped_cells": failed_updates,
                "summary": summary,
            }

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

        source_df = load_source_df(temp_path, source_month_sheet)
        detailed_age_validation = enforce_detailed_age_validation(source_df)
        source_blocks = build_source_blocks(source_df)
        preview_payload = build_preview_payload_for_row(source_blocks, matched_row)
        updates = flatten_preview_to_updates(preview_payload)

        successful_updates, failed_updates = safe_apply_updates(worksheet, updates)
        summary = validation_summary_from_source_blocks(source_blocks)

        status = "uploaded" if successful_updates > 0 else "failed"
        message = f"Upload completed for {facility_name}. Successful writes: {successful_updates}. Skipped writes: {len(failed_updates)}."

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
            updated_cells=successful_updates,
            status=status,
            message=message,
            summary=summary,
        )

        return {
            "status": status,
            "message": message,
            "target_tab": actual_target_tab,
            "quarter": get_quarter_from_month(source_month_sheet),
            "master_workbook_id": workbook_id,
            "uploaded_filename": file.filename,
            "matched_target_row": matched_row,
            "updated_cells": successful_updates,
            "skipped_cells": failed_updates,
            "detailed_age_validation": detailed_age_validation,
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
