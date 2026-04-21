# CLI Reference

This document covers the `term-art` CLI in `cli/`.

## File Model

The CLI reads and writes the same `.termart` JSON format as the app.

Required top-level fields:

- `version`
- `canvas`
- `layers`
- `images`

Canvas coordinates are grid-based:

- `x` = column
- `y` = row
- `0,0` = top-left

## Global Flags

- `--out <path>` writes to a file
- `--print` prints to stdout instead of writing to `--out`
- `--layer <id>` targets a specific layer
- `--all` clears all layers of the current mode

`--print` overrides `--out`.

## Init

```bash
term-art init [--cols N --rows N] [--out file.termart] [--print]
```

Creates a blank `.termart` file with default ANSI and Unicode glyph layers.

## Unicode Default

If the first argument is a file path instead of a mode prefix, the CLI uses Unicode glyph mode by default:

```bash
term-art scene.termart circle 11 6 4
term-art scene.termart line 2 2 18 10
```

## Info

```bash
term-art info <file.termart>
```

Prints canvas size, layer counts, and image count.

## Resize

```bash
term-art resize <file.termart> --cols N --rows N [--out file.termart] [--print]
```

Resizes the canvas and crops cell data outside the new bounds.

## Demo

```bash
term-art demo ansi [--out file.termart] [--print]
term-art demo ascii [--out file.termart] [--print]
```

Prints a built-in demo scene or saves it as a `.termart` file.

## Run

```bash
term-art run <script.termartcli>
```

Runs a plain-text batch script with one command per line.

## Export

```bash
term-art export ansi <file.termart> [--out file.txt] [--print]
term-art export ascii <file.termart> [--out file.txt] [--print]
```

- `ansi` exports raw ANSI escape output.
- `ascii` exports only ASCII layer text.

## ANSI Mode

```bash
term-art ansi <file.termart> <op> ...
```

Ops:

- `put x y --char X --fg #hex --bg #hex`
- `text x y "hello" --fg #hex --bg #hex`
- `line x1 y1 x2 y2 --char X --fg #hex --bg #hex [--thickness N]`
- `rect x1 y1 x2 y2 --char X --fg #hex --bg #hex [--fill]`
- `fill x1 y1 x2 y2 --char X --fg #hex --bg #hex`
- `subfill x1 y1 x2 y2 --fg #hex --bg #hex`
- `triangle x1 y1 x2 y2 x3 y3 --char X --fg #hex --bg #hex`
- `circle cx cy r --char X --fg #hex --bg #hex [--fill] [--aspect-y N]`
- `ellipse cx cy rx ry --char X --fg #hex --bg #hex [--fill] [--aspect-y N]`
- `spline x1 y1 x2 y2 x3 y3 ... --char X --fg #hex --bg #hex [--thickness N]`
- `clear [x1 y1 x2 y2] [--all]`

Rules:

- ANSI mode is strict.
- Draw ops require explicit `--char`, `--fg`, and `--bg`.
- If you omit a draw char, the command fails.

## Unicode Glyph Mode

```bash
term-art <file.termart> <op> ...
```

Ops:

- `put x y [--char X]`
- `text x y "hello" [--char X]`
- `line x1 y1 x2 y2 [--char auto|X] [--thickness N]`
- `rect x1 y1 x2 y2 [--fill] [--char X]`
- `fill x1 y1 x2 y2 [--char X]`
- `subfill x1 y1 x2 y2 [--char X]`
- `triangle x1 y1 x2 y2 x3 y3 [--char X]`
- `circle cx cy r [--fill] [--char X] [--aspect-y N]`
- `ellipse cx cy rx ry [--fill] [--char X] [--aspect-y N]`
- `spline x1 y1 x2 y2 x3 y3 ... [--char auto|X] [--thickness N]`
- `clear [x1 y1 x2 y2] [--all]`

## Geometry Notes

- `line` uses Bresenham rasterization.
- `spline` smooths through control points with Catmull-Rom sampling.
- `circle` and `ellipse` use sub-cell fitting at the edges.
- `subfill`, `circle`, `ellipse`, and `triangle` can choose the closest glyph using quarter blocks, half blocks, and full blocks.
- `subfill`, `triangle`, `circle`, `ellipse`, and `spline` accept decimal coordinates for sub-cell placement.
- Circles and ellipses apply a rough terminal cell aspect-ratio correction so they render visually round.
- Edge cells are chosen by 4x8 sampled glyph masks: the shape is sampled inside each grid cell, that bitmap is compared against stored glyph masks, and the weighted error is minimized.
- Missing filled area is penalized more heavily than slight overpaint, so filled shapes avoid visual holes.
- The Unicode glyph bank includes the `U+1FB3C..U+1FB6F` diagonal and triangular legacy-computing blocks, including `🬼 🬽 🬾 🬿 🭀 🭁 🭂 🭃 🭄 🭅 🭆 🭇 🭈 🭉 🭊 🭋 🭌 🭍 🭎 🭏 🭐 🭑 🭒 🭓 🭔 🭕 🭖 🭗 🭘 🭙 🭚 🭛 🭜 🭝 🭞 🭟 🭠 🭡 🭢 🭣 🭤 🭥 🭦 🭧 🭨 🭩 🭪 🭫 🭬 🭭 🭮 🭯`. These glyphs are stored as explicit 4x8 masks sampled from a symbol font.
- Use `--aspect-y` to tune that correction for your terminal font. The default is `1.3`; lower values make shapes taller, and higher values make them shorter.

## Layer Ordering

Rendering composes:

- ANSI layers first as the base
- ASCII layers on top as visible characters

If both layers occupy the same cell, the ASCII character is shown over the ANSI background.

## Examples

```bash
term-art init --cols 24 --rows 12 --out demo.termart
term-art ansi demo.termart fill 0 0 23 11 --char=@ --fg=#d9d9d9 --bg=#101827
term-art ascii demo.termart triangle 4.5 9.5 11.5 2.5 18.5 9.5 --layer ascii-1
term-art export ansi demo.termart --print
```
