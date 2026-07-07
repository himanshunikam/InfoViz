#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./gen_mpvie.sh [input_video] [strip_png] [output_video]
# Defaults:
#   input_video = movie.mp4
#   strip_png   = output/EEG_Liniengrafik_Streifen.png
#   output_video= output/movie_with_eeg_strip.mp4

INPUT_VIDEO="${1:-movie.mp4}"
STRIP_PNG="${2:-output/EEG_Liniengrafik_Streifen.png}"
OUTPUT_VIDEO="${3:-output/movie_with_eeg_strip.mp4}"

if [[ ! -f "$INPUT_VIDEO" ]]; then
	echo "Fehler: Video nicht gefunden: $INPUT_VIDEO" >&2
	exit 1
fi

if [[ ! -f "$STRIP_PNG" ]]; then
	echo "Fehler: PNG-Streifen nicht gefunden: $STRIP_PNG" >&2
	exit 1
fi

STRIP_HEIGHT="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$STRIP_PNG")"

if [[ -z "$STRIP_HEIGHT" ]]; then
	echo "Fehler: Streifenhöhe konnte nicht ermittelt werden." >&2
	exit 1
fi

mkdir -p "$(dirname "$OUTPUT_VIDEO")"

# Exakte Filmdauer in Sekunden (mit Nachkommastellen)
DURATION="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$INPUT_VIDEO")"

if [[ -z "$DURATION" ]]; then
	echo "Fehler: Filmdauer konnte nicht ermittelt werden." >&2
	exit 1
fi

# Bewegung so, dass die Mitte des Films als Start-/End-Referenz dient:
# t=0     -> Anfang des Streifens liegt in der horizontalen Filmmitte
# t=Ende  -> Ende des Streifens liegt in der horizontalen Filmmitte
# Daraus folgt: x(t) = main_w/2 - overlay_w * progress
X_EXPR="main_w/2-overlay_w*min(1\,t/$DURATION)"

ffmpeg -y \
	-i "$INPUT_VIDEO" \
	-i "$STRIP_PNG" \
	-filter_complex "[0:v][1:v]overlay=x=$X_EXPR:y=main_h-overlay_h:eval=frame[base];[base]drawbox=x=iw/2-2:y=ih-$STRIP_HEIGHT:w=4:h=$STRIP_HEIGHT:color=orange@1:t=fill[v]" \
	-map "[v]" \
	-map 0:a? \
	-c:v libx264 \
	-preset medium \
	-crf 18 \
	-pix_fmt yuv420p \
	-c:a copy \
	"$OUTPUT_VIDEO"

echo "Fertig: $OUTPUT_VIDEO"

