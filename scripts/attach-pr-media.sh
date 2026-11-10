#!/usr/bin/env bash
# Publishes screenshots and recordings for a pull request description and prints the Markdown
# that embeds them.
#
# GitHub has no API for the attachment uploads its web editor uses, so the files go into one
# commit on the current branch and the next commit removes them. GitHub keeps every commit of a
# pull request under refs/pull/<number>/head after the branch is merged and deleted, so the raw
# URLs of the first commit keep working. The squash merge into main contains neither the files nor
# any change from them, and ordinary clones don't fetch pull request refs.
#
# Recordings (.webm, .mov, .mp4) become an .mp4 to download and a .gif that plays inline, because
# GitHub plays video only from its own attachment uploads. Converting them needs ffmpeg.
#
# Usage: scripts/attach-pr-media.sh before-desktop.png after-desktop.png flow.webm
set -euo pipefail

media_dir=.pr-media
max_gif_bytes=$((10 * 1024 * 1024))

fail() {
  echo "attach-pr-media: $*" >&2
  exit 1
}

[ $# -gt 0 ] || fail "pass the screenshots and recordings to attach."

root=$(git rev-parse --show-toplevel)
branch=$(git symbolic-ref --quiet --short HEAD) || fail "check out the pull request branch first."
case "$branch" in
  main | master) fail "run this on the pull request branch, not $branch." ;;
esac

remote=$(git remote get-url origin)
case "$remote" in
  *github.com* | */git/*) ;;
  *) fail "origin ($remote) is not a GitHub repository." ;;
esac
slug=$(printf '%s' "$remote" | sed -E 's#\.git$##; s#^.*[:/]([^/:]+)/([^/]+)$#\1/\2#')

sources=()
for file in "$@"; do
  [ -f "$file" ] || fail "$file does not exist."
  name=$(basename "$file")
  case "$name" in
    *[!A-Za-z0-9._-]*) fail "rename $name to letters, digits, dots, dashes and underscores." ;;
  esac
  sources+=("$(cd "$(dirname "$file")" && pwd)/$name")
done

cd "$root"
[ ! -e "$media_dir" ] || fail "$media_dir already exists. Remove it before attaching new media."
mkdir "$media_dir"
trap 'rm -rf "$root/$media_dir"' EXIT

attached=()
for source in "${sources[@]}"; do
  name=$(basename "$source")
  stem=${name%.*}
  extension=$(printf '%s' "${name##*.}" | tr '[:upper:]' '[:lower:]')
  case "$extension" in
    png | jpg | jpeg | gif | webp)
      cp "$source" "$media_dir/$name"
      attached+=("$name")
      ;;
    webm | mov | mp4)
      command -v ffmpeg >/dev/null || fail "install ffmpeg to convert $name."
      ffmpeg -loglevel error -y -i "$source" -an -c:v libx264 -pix_fmt yuv420p \
        -vf 'scale=trunc(iw/2)*2:trunc(ih/2)*2' -movflags +faststart "$media_dir/$stem.mp4"
      ffmpeg -loglevel error -y -i "$source" \
        -vf "fps=12,scale='min(1280,iw)':-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
        "$media_dir/$stem.gif"
      if [ "$(wc -c <"$media_dir/$stem.gif")" -gt "$max_gif_bytes" ]; then
        fail "$stem.gif is over 10 MB, which GitHub won't show inline. Record a shorter flow."
      fi
      attached+=("$stem.gif" "$stem.mp4")
      ;;
    *) fail "$name is not a .png, .jpg, .gif, .webp, .webm, .mov or .mp4 file." ;;
  esac
done

git add --force -- "$media_dir"
git commit --quiet --no-verify -m "chore(pr): attach screenshots and recordings" -- "$media_dir"
sha=$(git rev-parse HEAD)
git rm -r --quiet -- "$media_dir"
git commit --quiet --no-verify -m "chore(pr): remove attached screenshots and recordings" -- "$media_dir"

echo "Attached in $sha. Push the branch, then paste this into the pull request description:"
echo
for name in "${attached[@]}"; do
  case "$name" in
    *.mp4) echo "[${name%.*} (MP4)](https://github.com/$slug/blob/$sha/$media_dir/$name)" ;;
    *) echo "![${name%.*}](https://raw.githubusercontent.com/$slug/$sha/$media_dir/$name)" ;;
  esac
done
