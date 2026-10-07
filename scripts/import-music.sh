#!/usr/bin/env bash
# Re-encodes the library to 160 kbps stereo MP3 (to keep the repository small without audible loss), capping each track at 180 s with a short fade.
# usage: scripts/import-music.sh <source-dir> <dest-dir> file1.mp3 file2.mp3 ...
set -euo pipefail
src="$1"; dest="$2"; shift 2
mkdir -p "$dest"
for file in "$@"; do
  seconds=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src/$file")
  limit=180
  fade=""
  if awk "BEGIN{exit !($seconds > $limit)}"; then fade="-t $limit -af afade=t=out:st=$((limit-3)):d=3"; fi
  # shellcheck disable=SC2086
  ffmpeg -v error -y -i "$src/$file" -vn -map_metadata -1 $fade -ar 44100 -ac 2 -c:a libmp3lame -b:a 160k "$dest/$file"
  echo "$file $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dest/$file")"
done
