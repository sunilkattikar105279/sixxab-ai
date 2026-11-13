# SIXXAB Money daily brief — standing rules (from Sunil)
- Title card ("SIXXAB MONEY · DAILY BRIEF", date, two-line trend headline) and the clone start TOGETHER at frame 0. The title is fully visible on the very first frame.
- That first frame is the cover: Instagram `thumb_offset: 0` on every reel container; LinkedIn uploads include a thumbnail extracted from frame 0 (initializeUpload `uploadThumbnail: true`).
- Composite in two stages (first 5 s with the Host chromakeyed, then the rest) to avoid sandbox out-of-memory; render in the background.
- Captions show figures, not spelled-out numbers (merge "zero point three five percent" → "0.35%", "seventy five seventy seven" → "7,577").
- Auto-approved: publish to @sixxab_money, @sunil.kattikar (separate post) and LinkedIn at 8:00 AM CST; safety stops on account mismatch, unverifiable numbers, stale levels, failed render.

## Transparent title overlay (from Nov 16)
- With the clone on (HOST=true), reel.js no longer draws the solid title box; the green-key screen only carries captions in the intro.
- `python3 make_title.py title.json out/title.png` makes a 1080x1920 RGBA title: soft see-through shade at the top, shadowed text, no box.
- Workbench stage A overlays title.png on the clone + keyed screen from frame 0, fading out over the last 0.25 s before S.market (see composite_stageA.md). Frame 0 = cover (IG thumb_offset 0, LinkedIn thumbnail from frame 0).
- Fallback (HOST=false) keeps the drawn title card.
