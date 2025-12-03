# Songs Folder

Place audio files (MP3/OGG) for sharing or victory sounds in this folder.

Guidelines:
- Use `kebab-case` filenames (e.g. `victory-sound.mp3`).
- Keep each file under a reasonable size for web delivery (recommended < 2MB for short clips).
- Add an entry to `manifest.json` for songs you want the app to reference.

Example:

```json
{
  "filename": "victory-sound.mp3",
  "title": "Victory Fanfare",
  "artist": "Game",
  "duration_seconds": 5
}
```

Usage:
- The end-game modal can trigger a download or share of the generated image; you can also include an MP3 in share packages if needed.

Replace `placeholder.txt` with your actual audio files. Ensure the web server serves files from `public/` (Vite does by default).