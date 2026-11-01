#!/usr/bin/env bash
# Trim a lullaby to its first 8 minutes and save it as the app's sleeping song.
#
#   scripts/make-sleep-song.sh <input-audio-or-video> [minutes]
#
# Example (download the source audio first, e.g. with yt-dlp):
#   yt-dlp -x --audio-format mp3 -o song.mp3 "https://youtu.be/RB1ZJoLIplw"
#   scripts/make-sleep-song.sh song.mp3
set -euo pipefail

in="${1:?usage: $0 <input> [minutes]}"
minutes="${2:-8}"
out="$(dirname "$0")/../public/audio/sleep-song.mp3"

mkdir -p "$(dirname "$out")"
ffmpeg -y -hide_banner -loglevel error -i "$in" -t "$((minutes * 60))" \
  -vn -ac 2 -ar 44100 -c:a libmp3lame -b:a 128k \
  -af "afade=t=out:st=$((minutes * 60 - 5)):d=5" "$out"
echo "Wrote $out ($(du -h "$out" | cut -f1))"
