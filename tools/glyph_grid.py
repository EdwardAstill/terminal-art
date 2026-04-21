#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import tempfile
from pathlib import Path


DEFAULT_LEGACY_GLYPHS = (
    "🬼🬽🬾🬿🭀🭁🭂🭃🭄🭅🭆🭇"
    "🭈🭉🭊🭋🭌🭍🭎🭏🭐🭑🭒🭓"
    "🭔🭕🭖🭗🭘🭙🭚🭛🭜🭝🭞🭟"
    "🭠🭡🭢🭣🭤🭥🭦🭧🭨🭩🭪🭫"
    "🭬🭭🭮🭯"
)


def run(cmd: list[str], *, input_data: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        cmd,
        input=input_data,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )


def resolve_font(font: str) -> str:
    path = Path(font)
    if path.exists():
        return str(path)
    try:
        result = run(["fc-match", "-f", "%{file}\n", font])
        candidate = result.stdout.decode("utf-8", errors="replace").strip().splitlines()[0]
        if candidate:
            return candidate
    except Exception:
        pass
    return font


def render_glyph(font: str, glyph: str, width: int, height: int, point_size: int, out_path: str) -> None:
    cmd = [
        "magick",
        "-background",
        "black",
        "-fill",
        "white",
        "-font",
        font,
        "-pointsize",
        str(point_size),
        "-size",
        f"{width}x{height}",
        "-gravity",
        "center",
        f"label:{glyph}",
        "-alpha",
        "off",
        out_path,
    ]
    run(cmd)


def add_grid_overlay(src: str, dst: str, cols: int, rows: int) -> None:
    info = run(["magick", "identify", "-format", "%w %h", src]).stdout.decode("utf-8").strip()
    width, height = [int(part) for part in info.split()]
    cell_w = width / cols
    cell_h = height / rows
    draw: list[str] = []

    for c in range(1, cols):
        x = round(c * cell_w)
        draw.append(f"line {x},0 {x},{height}")
    for r in range(1, rows):
        y = round(r * cell_h)
        draw.append(f"line 0,{y} {width},{y}")

    cmd = [
        "magick",
        src,
        "-stroke",
        "#00d9ff88",
        "-fill",
        "none",
        "-strokewidth",
        "1",
    ]
    for item in draw:
        cmd.extend(["-draw", item])
    cmd.append(dst)
    run(cmd)


def read_gray_pixels(path: str) -> tuple[int, int, bytes]:
    info = run(["magick", "identify", "-format", "%w %h", path]).stdout.decode("utf-8").strip()
    width, height = [int(part) for part in info.split()]
    pixels = run(["magick", path, "-colorspace", "Gray", "-depth", "8", "gray:-"]).stdout
    if len(pixels) != width * height:
        raise RuntimeError(f"unexpected pixel count: got {len(pixels)}, expected {width * height}")
    return width, height, pixels


def sample_cells(width: int, height: int, pixels: bytes, cols: int, rows: int) -> list[list[float]]:
    cell_w = width / cols
    cell_h = height / rows
    grid: list[list[float]] = []
    for r in range(rows):
        row: list[float] = []
        y0 = math.floor(r * cell_h)
        y1 = math.ceil((r + 1) * cell_h)
        for c in range(cols):
            x0 = math.floor(c * cell_w)
            x1 = math.ceil((c + 1) * cell_w)
            total = 0
            covered = 0.0
            for y in range(y0, min(height, y1)):
                base = y * width
                for x in range(x0, min(width, x1)):
                    covered += pixels[base + x] / 255.0
                    total += 1
            row.append(covered / total if total else 0.0)
        grid.append(row)
    return grid


def format_grid(grid: list[list[float]], threshold: float) -> tuple[list[str], list[str]]:
    mask_rows: list[str] = []
    heat_rows: list[str] = []
    for row in grid:
        mask_rows.append("".join("1" if value >= threshold else "0" for value in row))
        heat_rows.append(" ".join(f"{value:0.2f}" for value in row))
    return mask_rows, heat_rows


def ts_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def format_ts_rows(entries: list[dict[str, object]]) -> str:
    lines = [
        "export const renderedLegacyGlyphRows = {",
    ]
    for entry in entries:
        glyph = str(entry["glyph"])
        rows = entry["mask"]
        rows_literal = ", ".join(ts_string(str(row)) for row in rows)  # type: ignore[union-attr]
        lines.append(f"  {ts_string(glyph)}: [{rows_literal}],")
    lines.append("} as const")
    return "\n".join(lines)


def build_entry(
    glyph: str,
    font: str,
    cols: int,
    rows: int,
    width: int,
    height: int,
    point_size: int,
    threshold: float,
    overlay_dir: str | None = None,
) -> dict[str, object]:
    with tempfile.TemporaryDirectory() as tmpdir:
        raw_path = os.path.join(tmpdir, "glyph.png")
        render_glyph(font, glyph, width, height, point_size, raw_path)

        if overlay_dir:
            os.makedirs(overlay_dir, exist_ok=True)
            safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", f"U+{ord(glyph):04X}_{glyph}")
            add_grid_overlay(raw_path, os.path.join(overlay_dir, f"{safe_name}.png"), cols, rows)

        actual_width, actual_height, pixels = read_gray_pixels(raw_path)
        grid = sample_cells(actual_width, actual_height, pixels, cols, rows)
        mask_rows, heat_rows = format_grid(grid, threshold)

    return {
        "glyph": glyph,
        "codepoint": f"U+{ord(glyph):04X}",
        "mask": mask_rows,
        "coverage": heat_rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a glyph into a 4x8 grid and inspect its coverage.")
    parser.add_argument("glyphs", nargs="+", help="glyphs to inspect, for example 🭿 or a set of glyphs")
    parser.add_argument("--font", default="Noto Sans Symbols 2", help="font family or font file path")
    parser.add_argument("--cols", type=int, default=4)
    parser.add_argument("--rows", type=int, default=8)
    parser.add_argument("--width", type=int, default=256)
    parser.add_argument("--height", type=int, default=512)
    parser.add_argument("--point-size", type=int, default=0, help="override rendered font size")
    parser.add_argument("--threshold", type=float, default=0.5, help="coverage threshold for 1/0 mask")
    parser.add_argument("--out", default="", help="write a grid-overlay PNG here")
    parser.add_argument("--overlay-dir", default="", help="write one overlay PNG per glyph here")
    parser.add_argument("--bank-json", action="store_true", help="print a JSON glyph bank instead of text")
    parser.add_argument("--ts-rows", action="store_true", help="print a TypeScript glyph rows object")
    parser.add_argument("--default-legacy", action="store_true", help="use the U+1FB3C..U+1FB6F glyph set")
    parser.add_argument("--json", action="store_true", help="print JSON instead of the text report")
    args = parser.parse_args()

    font = resolve_font(args.font)
    point_size = args.point_size if args.point_size > 0 else max(64, round(args.height * 0.78))
    glyphs = list(DEFAULT_LEGACY_GLYPHS) if args.default_legacy else args.glyphs

    entries = [
        build_entry(
            glyph,
            font,
            args.cols,
            args.rows,
            args.width,
            args.height,
            point_size,
            args.threshold,
            overlay_dir=args.overlay_dir or None,
        )
        for glyph in glyphs
    ]

    if args.out:
        if len(entries) != 1:
            raise SystemExit("--out only works with one glyph")
        glyph = glyphs[0]
        with tempfile.TemporaryDirectory() as tmpdir:
            raw_path = os.path.join(tmpdir, "glyph.png")
            render_glyph(font, glyph, args.width, args.height, point_size, raw_path)
            add_grid_overlay(raw_path, args.out, args.cols, args.rows)

    if args.bank_json:
        bank = {
            "version": 1,
            "font": font,
            "sample": {"cols": args.cols, "rows": args.rows},
            "glyphs": entries,
        }
        print(json.dumps(bank, indent=2, ensure_ascii=False))
        return 0

    if args.ts_rows:
        print(format_ts_rows(entries))
        return 0

    if args.json:
        print(json.dumps({"glyphs": entries}, indent=2, ensure_ascii=False))
        return 0

    for entry in entries:
        print(f"glyph: {entry['glyph']}")
        print(f"font: {font}")
        print(f"grid: {args.cols}x{args.rows}  threshold: {args.threshold}")
        print("coverage:")
        for row in entry["coverage"]:  # type: ignore[index]
            print(f"  {row}")
        print("mask:")
        for row in entry["mask"]:  # type: ignore[index]
            print(f"  {row}")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
