# Glyph Fitting Ideas

This note tracks approaches to try for Unicode glyph fitting. The current system uses fixed-cell rendered glyph masks and compares a target shape cell against candidate glyph masks.

## Current Baseline

- Cell mask size: `4x8`, so 32 bits per terminal cell.
- Glyph bank: fixed-cell masks rendered from `Noto Sans Symbols 2`.
- Current default score:

```text
2  target=1 glyph=1
-1 target=0 glyph=1
-3 target=1 glyph=0
 0 target=0 glyph=0
```

Problem observed:

- Filled circles and large filled triangles usually choose quadrant/block glyphs.
- Diagonal wedge glyphs like `🬿`, `🭊`, `🭚`, and `🭥` rarely win.
- Pure filled-area matching does not strongly reward boundary angle, so a block can win even when a wedge looks visually better.

## Glyphs To Keep Testing

The `🬿`-style diagonal wedge positions:

```text
🬿 U+1FB3F
🭊 U+1FB4A
🭚 U+1FB5A
🭥 U+1FB65
```

Quarter triangle glyphs:

```text
🭬 U+1FB6C
🭭 U+1FB6D
🭮 U+1FB6E
🭯 U+1FB6F
```

## Ideas To Try

## 1. Higher Resolution Masks

Move from `4x8` to something like `8x16` or `12x24` internally.

Why:

- `4x8` is too coarse to distinguish many diagonal edges.
- Several diagonal wedge glyphs collapse into masks that look too similar to small block fragments.

Keep output glyphs the same, but score with higher-resolution masks.

## 2. Boundary-Aware Score

Score both area and edge agreement.

Possible score:

```text
score = area_score + edge_score
```

Where:

```text
area_score:
  +2 target=1 glyph=1
  -1 target=0 glyph=1
  -3 target=1 glyph=0

edge_score:
  reward when target boundary direction matches glyph boundary direction
  punish jagged changes across adjacent cells
```

Why:

- The current score only sees filled pixels.
- It does not know whether the glyph creates a smooth diagonal contour.

## 3. Candidate Filtering By Coverage

Split candidates by target coverage ratio before scoring.

Example:

```text
0-25% coverage: use small triangles and sparse wedges
25-75% coverage: use wedge, half, and quadrant glyphs
75-100% coverage: use blocks and dense wedges only
```

Why:

- This stops tiny sliver glyphs from being considered for dense cells.
- It also stops dense block glyphs from beating triangles on sparse diagonal edge cells.

## 4. Contour-First Edge Cells

Detect whether a cell is an edge cell. If it is, fit the contour line before fitting area.

Process:

```text
sample target cell
if cell has both filled and empty pixels:
  estimate boundary direction
  prefer glyphs with similar boundary direction
else:
  use normal area score
```

Why:

- Wedges are primarily contour glyphs, not area glyphs.
- Large filled shapes need the boundary to look good more than they need per-cell area to be perfect.

## 5. Neighbor Continuity Penalty

After choosing a glyph, add a local penalty if it creates isolated spikes, gaps, or teeth relative to neighboring cells.

Possible checks:

- Penalize a glyph if its filled edge does not touch a filled neighbor edge.
- Penalize a glyph if it creates a one-cell protrusion along a smooth curve.
- Penalize a glyph if it creates a single missing notch in an otherwise filled boundary.

Why:

- A per-cell winner can still look bad in context.
- The circle failures were visually obvious because isolated glyphs made teeth.

## 6. Two-Pass Fitting

First pass:

- Fill with conservative block and quadrant glyphs.

Second pass:

- Revisit edge cells and replace them with wedges only when the replacement improves local continuity.

Why:

- This protects filled shapes from losing too much mass.
- Wedges become refinements instead of primary fill choices.

## 7. Compare Rendered Bitmaps, Not Masks Alone

Use a larger rendered bitmap per terminal cell and compare actual anti-aliased coverage, not only binary mask bits.

Why:

- Some legacy glyphs occupy unusual vertical positions inside the cell.
- A binary threshold loses useful information from anti-aliased glyph edges.

Possible dimensions:

```text
16x32 per cell
24x48 per cell
```

## Current Recommendation

Try these in order:

1. Higher-resolution fixed-cell glyph masks.
2. Candidate filtering by coverage ratio.
3. Boundary-aware score.
4. Neighbor continuity penalty.

This keeps the algorithm understandable while directly targeting the current failure mode: blocks win the area score even when a wedge would make the edge read better.
