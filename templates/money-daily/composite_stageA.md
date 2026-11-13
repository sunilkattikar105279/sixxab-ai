# Stage A (workbench) — clone + keyed screen + transparent title, from frame 0
ffmpeg -i host.mp4 -i screen.mp4 -loop 1 -i title.png -t 5 -filter_complex "
 [0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[h];
 [1:v]colorkey=0x00FF00:0.30:0.08[s];
 [h][s]overlay[hs];
 [2:v]format=rgba,fade=t=out:st=${MARKET_MINUS_025}:d=0.25:alpha=1[ti];
 [hs][ti]overlay=0:0:shortest=1[v]" -map "[v]" -an -threads 1 segA.mp4
