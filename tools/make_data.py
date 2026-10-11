"""층별 보상 표 → 층수 계산기용 stages.json 만들기.

층마다 1마리 기본 보상 두 가지만 담는다 (경험치·골드는 표에서 값이 같아 하나로, 정수는 alchemyPoint).
값은 게임 표기처럼 유효숫자 3자리 (가수 x100 정수) 와 10의 지수로 저장한다 (표 값 자체가 "1.78E+148" 처럼 3자리라 손실 없음).

실행: uv run python -I make_data.py <층별 보상 표 파일> <출력 stages.json>
"""
import json
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8")


def split(value: str) -> tuple[int, int]:
    mantissa, exponent = value.upper().split("E")
    return round(float(mantissa) * 100), int(exponent) - 2


def main() -> None:
    rows = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    rows.sort(key=lambda row: int(row["stage"]))
    stages = [int(row["stage"]) for row in rows]
    if stages != list(range(1, len(rows) + 1)):
        raise SystemExit("층 번호가 1부터 빠짐없이 이어지지 않음")
    mismatched = sum(1 for row in rows if row["gold"] != row["exp"])
    if mismatched:
        raise SystemExit(f"경험치와 골드 값이 다른 층 {mismatched}개 — 따로 저장하도록 고쳐야 함")
    gold = [split(row["gold"]) for row in rows]
    ess = [split(row["alchemyPoint"]) for row in rows]
    data = {
        "count": len(rows),
        "goldM": [m for m, _ in gold], "goldE": [e for _, e in gold],
        "essM": [m for m, _ in ess], "essE": [e for _, e in ess],
    }
    out = pathlib.Path(sys.argv[2])
    out.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(out, len(rows), "층", out.stat().st_size, "바이트")


if __name__ == "__main__":
    main()
