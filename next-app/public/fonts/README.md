# Embedded report fonts

Noto Sans Regular and Bold are unmodified fonts from the official Noto repository:
https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans

License: SIL Open Font License 1.1 (see LICENSE).

SHA-256:

- NotoSans-Regular.ttf: `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`
- NotoSans-Bold.ttf: `c976e4b1b99edc88775377fcc21692ca4bfa46b6d6ca6522bfda505b28ff9d6a`

The shared PDF renderer embeds a font subset into each report using pdf-lib and
fontkit. No system font or remote font fetch is required during report rendering.
Next output tracing includes these assets in API deployments. Do not replace
this with SVG text rasterization without testing on a host without system fonts.
