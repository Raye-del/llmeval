import json
import mimetypes
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"
DATA_DIR = WEB_DIR / "data"
CONFIG_PATH = ROOT / "server" / "config.json"
SUBMISSION_DIR = ROOT / "server" / "submissions"


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


CONFIG = load_json(
    CONFIG_PATH,
    {
        "default_question_count": 15,
        "autosave_interval_ms": 15000,
        "save_dir": "server/submissions",
    },
)
QUESTIONS = load_json(DATA_DIR / "questions.json", [])


def normalize_text(value):
    return str(value or "").strip().lower()


def select_questions(start, count, nationality):
    eligible = []
    normalized_nationality = normalize_text(nationality)
    for question in QUESTIONS:
        if question["row_id"] < start:
            continue
        if normalized_nationality and normalize_text(question["country"]) == normalized_nationality:
            continue
        eligible.append(question)
        if len(eligible) >= count:
            break
    return eligible


def session_path(session_id):
    SUBMISSION_DIR.mkdir(parents=True, exist_ok=True)
    return SUBMISSION_DIR / f"{session_id}.json"


def export_path(student, assignment, total_questions):
    start = max(1, int((assignment or {}).get("start") or 1))
    total = max(0, int(total_questions or 0))
    end = start + max(total - 1, 0)
    name = str((student or {}).get("name") or "未命名").strip()
    safe_name = "".join("_" if ch in '\\/:*?"<>|' else ch for ch in name).strip() or "未命名"
    return SUBMISSION_DIR / f"{start}-{end}_{safe_name}.json"


def read_session(session_id):
    return load_json(session_path(session_id), None)


def write_session(payload):
    path = session_path(payload["session_id"])
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_export(payload):
    total_questions = payload.get("total_questions", len(payload.get("questions", [])))
    path = export_path(payload.get("student", {}), payload.get("assignment", {}), total_questions)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


class QuizHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/config":
            self.send_json(
                {
                    "default_question_count": CONFIG["default_question_count"],
                    "autosave_interval_ms": CONFIG["autosave_interval_ms"],
                    "question_bank_size": len(QUESTIONS),
                }
            )
            return

        if parsed.path == "/":
            self.serve_static("index.html")
            return

        self.serve_static(parsed.path.lstrip("/"))

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            payload = self.read_json_body()
        except json.JSONDecodeError:
            return

        if parsed.path == "/api/session/start":
            self.handle_session_start(payload)
            return

        if parsed.path == "/api/session/save":
            self.handle_session_save(payload, submitted=False)
            return

        if parsed.path == "/api/session/submit":
            self.handle_session_save(payload, submitted=True)
            return

        if parsed.path == "/api/session/reset":
            self.handle_session_reset(payload)
            return

        self.send_error_json(HTTPStatus.NOT_FOUND, "接口不存在。")

    def handle_session_start(self, payload):
        student = payload.get("student") or {}
        assignment = payload.get("assignment") or {}
        start = max(1, int(assignment.get("start") or 1))
        count = max(1, int(assignment.get("count") or CONFIG["default_question_count"]))
        nationality = student.get("nationality", "")

        selected = select_questions(start, count, nationality)
        if not selected:
            self.send_error_json(HTTPStatus.BAD_REQUEST, "没有找到符合条件的题目。")
            return

        session_id = uuid.uuid4().hex
        now = utc_now()
        session_payload = {
            "session_id": session_id,
            "student": student,
            "assignment": {
                "start": start,
                "count": count,
                "actual_count": len(selected),
                "excluded_nationality": nationality,
            },
            "questions": selected,
            "answers": {},
            "responses": [],
            "submitted_at": "",
            "last_saved_at": now,
            "created_at": now,
            "status": "in_progress",
        }
        write_session(session_payload)
        self.send_json(session_payload)

    def handle_session_save(self, payload, submitted):
        session_id = payload.get("session_id")
        if not session_id:
            self.send_error_json(HTTPStatus.BAD_REQUEST, "缺少 session_id。")
            return

        existing = read_session(session_id)
        if existing is None:
            self.send_error_json(HTTPStatus.NOT_FOUND, "会话不存在。")
            return

        now = utc_now()
        merged = {
            **existing,
            "student": payload.get("student", existing.get("student", {})),
            "assignment": payload.get("assignment", existing.get("assignment", {})),
            "responses": payload.get("responses", existing.get("responses", [])),
            "answered_questions": payload.get("answered_questions", existing.get("answered_questions", 0)),
            "total_questions": payload.get("total_questions", existing.get("total_questions", len(existing.get("questions", [])))),
            "last_saved_at": now,
            "status": "submitted" if submitted else "in_progress",
        }
        if submitted:
            merged["submitted_at"] = payload.get("submitted_at") or now
        write_session(merged)
        if submitted:
            write_export(merged)

        self.send_json(
            {
                "session_id": session_id,
                "saved_at": now,
                "submitted_at": merged.get("submitted_at", ""),
                "status": merged["status"],
            }
        )

    def handle_session_reset(self, payload):
        session_id = payload.get("session_id")
        if not session_id:
            self.send_error_json(HTTPStatus.BAD_REQUEST, "缺少 session_id。")
            return

        path = session_path(session_id)
        if path.exists():
            path.unlink()
        self.send_json({"session_id": session_id, "deleted": True})

    def serve_static(self, relative_path):
        safe_path = (WEB_DIR / relative_path).resolve()
        if WEB_DIR.resolve() not in safe_path.parents and safe_path != WEB_DIR.resolve():
            self.send_error_json(HTTPStatus.FORBIDDEN, "禁止访问该路径。")
            return

        if safe_path.is_dir():
            safe_path = safe_path / "index.html"

        if not safe_path.exists() or not safe_path.is_file():
            self.send_error_json(HTTPStatus.NOT_FOUND, "文件不存在。")
            return

        content_type = mimetypes.guess_type(str(safe_path))[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.end_headers()
        self.wfile.write(safe_path.read_bytes())

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error_json(HTTPStatus.BAD_REQUEST, "请求体不是有效 JSON。")
            raise

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status, message):
        self.send_json({"error": message}, status=status)

    def log_message(self, format, *args):
        return


def main():
    SUBMISSION_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 8000), QuizHandler)
    print("Server running at http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
