"""Build words.js from a Viewmax voiceover result (JSON with 'words'), section start words and the title.
usage: python3 make_words.py vo.json  (section markers + title are set below)"""
import json, sys
vo = json.load(open(sys.argv[1]))
W = [[w['w'], w['start'], w['end']] for w in vo['words']]
MARK = {'market': 'Yesterday', 'why': 'My', 'money': 'For', 'watch': 'Next', 'levels': 'Now', 'cta': 'Follow'}   # first word of each section, searched in order
SEC, i = {'hook': 0}, 0
for k, word in MARK.items():
    while i < len(W) and W[i][0].strip('.,:?') != word: i += 1
    SEC[k] = round(max(0, W[i][1] - 0.15), 2) if i < len(W) else None
TITLE = json.load(open('title.json'))
dur = round(vo['timing']['speechEndSeconds'] + 1.7, 2)
open('words.js', 'w').write(f"export const RAW = {json.dumps(W)};\nexport const SEC = {json.dumps(SEC)};\nexport const DUR = {dur};\nexport const TITLE = {json.dumps(TITLE)};\n")
print(SEC, dur)
