# SIXXAB Money · Sunday weekend brief

A ~59 s vertical reel: the market-sentiment cycle line draws itself and each SIXXAB agent reports.
Scene 1 is the clean cover (Sunil's photo, no captions); captions start at scene 2.

- `render.py`: the renderer (PIL frames piped to ffmpeg). `python3 render.py video wk-MMDD/story.json silent.mp4`
- `wk-MMDD/story.json`: everything that changes weekly (7 VO lines with word timings from Viewmax, cards, stage_now, progress).
- `sunil.jpg`: cover photo. `log.json`: one entry per week (stage, S&P, VIX, Pulse, HY spread) for the "last week / this week" line.

Fonts: FONT_HEAD = DejaVuSansCondensed-Bold (https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSansCondensed-Bold.ttf), FONT_BODY = DejaVuSans-Bold.
Audio: concat the 7 WAVs with 0.25 s gaps (1.2 s tail), atempo=1.06, loudnorm I=-15; mux with the silent video.
