#!/usr/bin/env python3
import hashlib
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
WATCHED_EXTENSIONS = {".html", ".css", ".js"}
RELOAD_SCRIPT = """<script>
(() => {
  let version;
  let warned = false;
  async function checkForChanges() {
    try {
      const response = await fetch("/__reload", {cache: "no-store"});
      if (!response.ok) throw new Error(`Live reload returned ${response.status}`);
      const nextVersion = await response.text();
      if (version !== undefined && nextVersion !== version) {
        window.location.reload();
        return;
      }
      version = nextVersion;
      warned = false;
    } catch (error) {
      if (!warned) console.error("Live reload check failed.", error);
      warned = true;
    }
    window.setTimeout(checkForChanges, 1000);
  }
  checkForChanges();
})();
</script>"""


class DevHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        request_path = urlsplit(self.path).path
        if request_path == "/__reload":
            self.send_reload_version()
            return
        if request_path in {"/", "/index.html"}:
            self.send_index_with_reload()
            return
        super().do_GET()

    def send_reload_version(self):
        digest = hashlib.sha256()
        for directory, subdirectories, filenames in os.walk(ROOT):
            subdirectories[:] = [
                name for name in subdirectories
                if name not in {".git", ".github", "__pycache__"}
            ]
            subdirectories.sort()
            for filename in sorted(filenames):
                path = Path(directory) / filename
                if path.suffix.lower() not in WATCHED_EXTENSIONS:
                    continue
                digest.update(path.relative_to(ROOT).as_posix().encode())
                digest.update(path.read_bytes())

        payload = digest.hexdigest().encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_index_with_reload(self):
        index_path = ROOT / "index.html"
        content = index_path.read_text(encoding="utf-8")
        content = content.replace("</body>", f"{RELOAD_SCRIPT}\n</body>")
        payload = content.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    port = int(os.environ.get("PORT", "4173"))
    handler = partial(DevHandler, directory=ROOT)
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Aviation24 live reload server: http://127.0.0.1:{port}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping live reload server.")


if __name__ == "__main__":
    main()
