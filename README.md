# terminal-art

Terminal-art is a React + TypeScript editor for building ANSI and ASCII art on a shared grid canvas.

The app stores work in a `.termart` JSON file and now ships with a companion CLI in `cli/` for machine-driven workflows.

## What The Model Is

- Canvas is a fixed grid of `cols × rows`.
- A `.termart` file contains:
  - `canvas`
  - `layers`
  - `images`
- Layers are either:
  - `ansi` for color/base fills
  - `ascii` for visible text and line-art, exposed to users as Unicode glyph mode
- ASCII sits over ANSI when both touch the same cell.

## CLI Overview

The CLI binary is `term-art`.

Common commands:

- `term-art init [--cols N --rows N] [--out file.termart] [--print]`
- `term-art info <file.termart>`
- `term-art resize <file.termart> --cols N --rows N [--out file.termart] [--print]`
- `term-art demo [ansi|ascii] [--out file.termart] [--print]`
- `term-art run <script.termartcli>`
- `term-art export ansi|ascii <file.termart> [--out file.txt] [--print]`

Drawing modes:

- `term-art <file.termart> ...` for Unicode glyph mode
- `term-art ansi ...`
- `term-art ascii ...`

## Drawing Commands

### ANSI mode

ANSI mode is strict. Draw commands require an explicit character and colors:

- `--char X`
- `--fg #hex`
- `--bg #hex`

Supported commands:

- `put x y`
- `text x y "hello"`
- `line x1 y1 x2 y2 [--thickness N]`
- `rect x1 y1 x2 y2 [--fill]`
- `fill x1 y1 x2 y2`
- `subfill x1 y1 x2 y2`
- `triangle x1 y1 x2 y2 x3 y3`
- `circle cx cy r [--fill] [--aspect-y N]`
- `ellipse cx cy rx ry [--fill] [--aspect-y N]`
- `spline x1 y1 x2 y2 x3 y3 ... [--thickness N]`
- `clear [x1 y1 x2 y2] [--all]`

### Unicode glyph mode

Unicode glyph mode uses the same grid coordinates, but visible characters are the primary output.

Supported commands:

- `put x y`
- `text x y "hello"`
- `line x1 y1 x2 y2 [--char auto|X] [--thickness N]`
- `rect x1 y1 x2 y2 [--fill]`
- `fill x1 y1 x2 y2`
- `subfill x1 y1 x2 y2`
- `triangle x1 y1 x2 y2 x3 y3`
- `circle cx cy r [--fill] [--aspect-y N]`
- `ellipse cx cy rx ry [--fill] [--aspect-y N]`
- `spline x1 y1 x2 y2 x3 y3 ... [--thickness N]`
- `clear [x1 y1 x2 y2] [--all]`

## Sub-Cell Shapes

Some commands rasterize using sub-cell coverage instead of only full cells.

- `subfill`
- `circle`
- `ellipse`
- edge coverage from `triangle`

The fitter chooses the closest visible glyph from:

- quarter blocks
- half blocks
- full blocks

This gives better edges for small shapes and non-grid-aligned geometry.

Shape commands accept decimal coordinates when you want sub-cell placement:

- `subfill`
- `triangle`
- `circle`
- `ellipse`
- `spline`

Circles and ellipses are corrected for terminal cell aspect ratio, so they look round on screen instead of vertically stretched.
Edge cells use 4x8 sampled glyph masks, which compare each cell against a stored bitmap for each glyph.
Missing filled area is penalized more heavily than slight overpaint, so filled shapes avoid visual holes.
The Unicode glyph bank now includes the `U+1FB3C..U+1FB6F` diagonal and triangular legacy-computing blocks, including `🬼 🬽 🬾 🬿 🭀 🭁 🭂 🭃 🭄 🭅 🭆 🭇 🭈 🭉 🭊 🭋 🭌 🭍 🭎 🭏 🭐 🭑 🭒 🭓 🭔 🭕 🭖 🭗 🭘 🭙 🭚 🭛 🭜 🭝 🭞 🭟 🭠 🭡 🭢 🭣 🭤 🭥 🭦 🭧 🭨 🭩 🭪 🭫 🭬 🭭 🭮 🭯`. These glyphs are stored as explicit 4x8 masks sampled from a symbol font.
Use `--aspect-y` to tune that correction for your terminal font. The default is `1.3`.

## `--print`

`--print` forces stdout output instead of writing the result to `--out`.

Examples:

```bash
term-art init --cols 80 --rows 24 --print
term-art ascii art.termart put 3 4 --char X --print
term-art demo ansi --print
```

When used on draw commands, `--print` prints the updated `.termart` JSON.

## Script Mode

`term-art run <script.termartcli>` reads one command per line.

Example:

```text
init --cols 32 --rows 16 --out scene.termart
ascii scene.termart circle 10 8 5 --layer ascii-1
ansi scene.termart fill 0 0 31 15 --char=@ --fg=#d9d9d9 --bg=#101827
export ansi scene.termart --out scene.txt
```

Rules:

- Blank lines are ignored.
- Lines beginning with `#` are comments.
- Quoted strings are supported.

## Shell Notes

When passing hex colors, prefer `=` form so your shell does not treat `#` as a comment:

```bash
term-art ansi file.termart fill 0 0 10 5 --char=@ --fg=#d9d9d9 --bg=#101827
```

## Build And Link

Build the CLI:

```bash
npm run cli:build
```

Run it locally without installing globally:

```bash
node cli/dist/index.js demo ansi
```

If you want `term-art` on your PATH via Bun, link the built binary from `cli/dist/index.js` into Bun's global bin directory.

## Examples

```bash
term-art demo ansi
term-art demo ascii
term-art draft.termart circle 11.5 6.5 4.5 --fill
term-art draft.termart line 2 2 18 10
term-art init --cols 120 --rows 40 --out draft.termart
term-art ansi draft.termart triangle 4 10 18 2 30 10 --char=█ --fg=#ffffff --bg=#7c3aed
term-art ascii draft.termart spline 2 14 8 2 18 13 28 3 33 14 --thickness 1
term-art export ansi draft.termart --out draft.txt
```
