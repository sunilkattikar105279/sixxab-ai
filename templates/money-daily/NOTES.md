# SIXXAB Money daily brief — standing rules (from Sunil)
- Title card ("SIXXAB MONEY · DAILY BRIEF", date, two-line trend headline) and the clone start TOGETHER at frame 0. The title is fully visible on the very first frame.
- That first frame is the cover: Instagram `thumb_offset: 0` on every reel container; LinkedIn uploads include a thumbnail extracted from frame 0 (initializeUpload `uploadThumbnail: true`).
- Composite in two stages (first 5 s with the Host chromakeyed, then the rest) to avoid sandbox out-of-memory; render in the background.
- Captions show figures, not spelled-out numbers (merge "zero point three five percent" → "0.35%", "seventy five seventy seven" → "7,577").
- Auto-approved: publish to @sixxab_money, @sunil.kattikar (separate post) and LinkedIn at 8:00 AM CST; safety stops on account mismatch, unverifiable numbers, stale levels, failed render.
