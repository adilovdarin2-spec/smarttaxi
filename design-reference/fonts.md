# Bundled interface font

SmartTaxi uses **Inter Variable**, unmodified, for Flutter and React UI. It is
bundled locally; opening an application screen does not fetch Google Fonts or
another font service. Map labels retain their provider's glyph stack.

## Provenance

- Project: [Inter](https://github.com/rsms/inter).
- Pinned upstream revision: `e3a3d4c57d5ecc01453a575621882a384c1995a3`.
- Upstream files: `docs/font-files/InterVariable.ttf` and
  `docs/font-files/InterVariable.woff2` at that revision.
- License: SIL Open Font License 1.1, copied from upstream `LICENSE.txt` into
  each bundled font directory as `OFL.txt`. No font modification or renaming.
- Flutter registers the license with `LicenseRegistry`; web serves the copy
  at `/fonts/OFL.txt`.

| Local asset | SHA-256 |
|---|---|
| `apps/mobile/smarttaxi_app/assets/fonts/InterVariable.ttf` | `4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf` |
| `apps/web/public/fonts/InterVariable.woff2` | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` |

The TTF character map was checked for Russian and Kazakh characters including
`Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ Іі` and `₸`; none were missing. Actual Cyrillic/Kazakh
address text was also inspected on the connected Android phone. This does not
replace full localization QA or change any user-facing price currency.
