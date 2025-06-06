#!/usr/bin/env python3
"""
serve.py

A simple HTTP server to serve all files in the current directory
on localhost:3000. Place this script in the same folder as your
HTML (or other static) files and run it from the command line:

    python serve.py

Then open your browser to http://localhost:3000/ to view your files.
"""

import http.server
import socketserver
import os
import sys

# Port number to listen on
PORT = 3000

def run():
    """
    Start an HTTP server on localhost:3000 serving all files
    from the directory where this script is located.
    """
    # Ensure we're serving from the directory containing this script
    script_directory = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_directory)

    # Handler that serves files from the current directory
    HandlerClass = http.server.SimpleHTTPRequestHandler

    # Create the TCP server
    with socketserver.TCPServer(("localhost", PORT), HandlerClass) as httpd:
        print(f"Serving HTTP on http://localhost:{PORT}/ (Press Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped by user.")
        finally:
            httpd.server_close()

if __name__ == "__main__":
    # Allow overriding the port via command line, e.g. `python serve.py 8000`
    if len(sys.argv) > 1:
        try:
            PORT = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port '{sys.argv[1]}'; using default port {PORT}.")
    run()
