# Unicode Art Library

Runnable `.termartcli` studies for reusable Unicode terminal-art forms.

These examples only use the Unicode glyph layer. There is no ANSI colour or background styling in this library.

Build the CLI first:

```bash
npm --prefix cli run build
```

Run one study:

```bash
node cli/dist/index.js run examples/art-library/filled-circle.termartcli
node cli/dist/index.js export ascii examples/art-library/filled-circle.termart --print
```

The CLI export command is currently named `export ascii` for the Unicode glyph layer.

Run the full starter set:

```bash
node cli/dist/index.js run examples/art-library/all.termartcli
```

## Starter Studies

- `filled-circle.termartcli` - filled circle using fill-preserving sub-cell scoring.
- `outline-circle.termartcli` - outline circle using outline scoring.
- `wide-triangle.termartcli` - filled triangle with block plus diagonal wedge fitting.
- `fitted-lines.termartcli` - auto fitted straight lines.
- `fitted-spline.termartcli` - auto fitted spline.
- `quadrant-diamond.termartcli` - hand-authored quadrant/half-block diamond.
