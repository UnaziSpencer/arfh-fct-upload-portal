from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

BASE_DIR = Path(__file__).resolve().parent
SERVICE_ACCOUNT_FILE = BASE_DIR / "data" / "service-account.json"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

TEST_WORKBOOK_ID = "1WO6ck6-ZDe-4tozRkvG-bj0q7B7KgBGm0Ar7AebESIo"
TEST_TAB_NAME = "Mar"

creds = Credentials.from_service_account_file(
    str(SERVICE_ACCOUNT_FILE),
    scopes=SCOPES,
)

client = gspread.authorize(creds)

sheet = client.open_by_key(TEST_WORKBOOK_ID)
worksheet = sheet.worksheet(TEST_TAB_NAME)

print("Connected successfully")
print("Workbook title:", sheet.title)
print("Worksheet title:", worksheet.title)