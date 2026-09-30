# Map glyphs

Signed-distance-field glyphs for the map's labels, bundled with the app so
labels render with no network connection (#183).

MapLibre loads these through the style's `glyphs` URL,
`asset://glyphs/{fontstack}/{range}.pbf`. The `withMapGlyphs` config plugin
writes them into the iOS app bundle and Android's `assets/` at prebuild.

- **Fonts:** `Open Sans Regular` and `Open Sans Bold`, the two stacks the
  style's `text-font` uses. A new font in the style needs its directory here;
  `__tests__/services/StyleBuilder.test.ts` fails if one is missing.
- **Ranges:** only the ranges each font has glyphs in are kept here (15 per
  font). MapLibre requests every range a label's text touches, and a range it
  cannot load fails the whole style, so at prebuild the plugin writes all 256
  ranges, filling the rest with the empty glyph set the server returns for them
  — byte-identical to the originals.
- **Source:** `https://fonts.openmaptiles.org/{fontstack}/{range}.pbf`, the URL
  the style used before, downloaded 2026-09-29.
- **Licence:** Open Sans is licensed under the Apache License 2.0 (Google
  Fonts). These files are generated from it by OpenMapTiles.
