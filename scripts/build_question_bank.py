import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_CSV = ROOT / "combined_sample_answer_key_1.csv"
WEB_DIR = ROOT / "web"
DATA_DIR = WEB_DIR / "data"
SERVER_DIR = ROOT / "server"


def load_rows():
    with SOURCE_CSV.open("r", encoding="gb18030", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader)


def normalize_option(value):
    return (value or "").strip()


def build_student_questions(rows):
    questions = []
    for index, row in enumerate(rows, start=1):
        options = []
        for letter in ["A", "B", "C", "D", "E", "F"]:
            text = normalize_option(row.get(f"option_{letter}", ""))
            if text:
                options.append({"key": letter, "text": text})

        questions.append(
            {
                "row_id": index,
                "case_id": row["case_id"],
                "sample_type": row["sample_type"],
                "continent": row["continent"],
                "country": row["country"],
                "category": row["category"],
                "title": row["title"],
                "content": row["content"],
                "question": row["question"],
                "tags": row["tags"],
                "source_file": row["source_file"],
                "options": options,
            }
        )
    return questions


def build_answer_key(rows):
    answer_key = []
    for index, row in enumerate(rows, start=1):
        answer_key.append(
            {
                "row_id": index,
                "case_id": row["case_id"],
                "correct_answer": row["correct_answer"],
                "country": row["country"],
                "category": row["category"],
                "title": row["title"],
            }
        )
    return answer_key


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    rows = load_rows()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SERVER_DIR.mkdir(parents=True, exist_ok=True)

    student_questions = build_student_questions(rows)
    answer_key = build_answer_key(rows)

    write_json(DATA_DIR / "questions.json", student_questions)
    write_json(DATA_DIR / "answer_key.json", answer_key)
    write_json(
        SERVER_DIR / "config.json",
        {
            "default_question_count": 15,
            "autosave_interval_ms": 15000,
            "save_dir": "server/submissions",
        },
    )
    print(f"Built {len(student_questions)} questions into {DATA_DIR}")


if __name__ == "__main__":
    main()
