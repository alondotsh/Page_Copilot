# Maintainer Guide: Icons and Promo Assets

## Scope

This document is for maintainers who need to generate or refresh the extension icon assets.

The extension runtime and Chrome Web Store distribution both require PNG icons, so the workflow below focuses on producing those files from the source artwork.

## Option 1: Convert the SVG online

This is the simplest approach.

1. Open https://svgtopng.com/ or https://convertio.co/svg-png/
2. Upload `assets/icons/icon.svg`
3. Export these sizes:
   - `16x16` → `assets/icons/icon16.png`
   - `48x48` → `assets/icons/icon48.png`
   - `128x128` → `assets/icons/icon128.png`
4. Save the exported files back into `assets/icons/`

## Option 2: Use temporary icons for quick testing

Only use this during short local testing sessions.

```bash
touch assets/icons/icon16.png assets/icons/icon48.png assets/icons/icon128.png
```

These placeholders let the extension load, but they are not suitable for release builds.

## Option 3: Use ImageMagick

If ImageMagick is installed:

```bash
brew install imagemagick

convert assets/icons/icon.svg -resize 16x16 assets/icons/icon16.png
convert assets/icons/icon.svg -resize 48x48 assets/icons/icon48.png
convert assets/icons/icon.svg -resize 128x128 assets/icons/icon128.png
```

## Option 4: Generate new artwork with an AI or design tool

Useful tools:

- https://favicon.io/
- https://realfavicongenerator.net/

Suggested keywords:

- robot
- AI assistant
- speech bubble
- purple gradient

## Design guidance

- Theme: AI assistant, robot, or chat-oriented visual metaphor
- Color: consistent with the product branding
- Style: modern, simple, and readable at small sizes
- Constraint: the icon should remain recognizable at `16x16`

## Notes

- The extension can run without polished icons, but Chrome will show fallback visuals
- Transparent-background PNG files are recommended
- These assets are visible in the toolbar, the extension management UI, and store materials
