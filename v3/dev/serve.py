#!/usr/bin/env python3
"""Kleiner Testserver fürs Entwickeln.

    python3 dev/serve.py [port]

Mehrthreadig — der eingebaute `python -m http.server` hängt sich auf, sobald
der Browser mehrere Verbindungen offen hält, und dann lädt kein Modul mehr.
Zusätzlich wird Caching abgeschaltet, damit Änderungen sofort ankommen.
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Server(('127.0.0.1', PORT), Handler) as httpd:
        print(f'Potato Dungeons: http://127.0.0.1:{PORT}/  (Strg+C beendet)')
        httpd.serve_forever()
