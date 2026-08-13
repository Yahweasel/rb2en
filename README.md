This branch is the RB2-specific fork of mecha-translation-builder. Unless you
for some reason are also going to translate RB2, you probably want either the
master branch of this repository, or the
[mecha-translation-builder](https://github.com/Yahweasel/mecha-translation-builder)
repository.


# Mecha Translation Builder

This is a suite of tools for translating binaries in place, using AI (if you'd
like). They're in three components, each of which has their own README:


## Translation tools

[README](tools/README.md)

Tools for extracting strings from binaries, translating using AI, validating
translation, and applying to binaries.


## OCR tools

[README](ocr-tools/README.md)

Tools for OCR'ing and translating manuals and other physical materials.


## Live translation tools

[README](livetrans/README.md)

Tools for translation live, while playing. Also helps with the ahead-of-time
translation tools when strings can't fit (can look up the full strings).
