#!/usr/bin/env python3
"""
Simple HTTP server for Homeless Aid UK website
Serves static files with proper headers and CORS support
"""

import http.server
import socketserver
import os
import mimetypes
from urllib.parse import urlparse

PORT = 8000

class HomelessAidHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    
    def end_headers(self):
        # Disable caching for development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        
        # Enable CORS for all origins (useful for LocalTunnel)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        
        # Security headers
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-XSS-Protection', '1; mode=block')
        
        super().end_headers()
    
    def do_GET(self):
        """Handle GET requests with proper MIME types and routing"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        # Serve index.html for root path
        if path == '/':
            path = '/index.html'
        
        # Remove leading slash for file system
        file_path = path.lstrip('/')
        
        try:
            # Check if file exists
            if os.path.isfile(file_path):
                # Get the correct MIME type
                mime_type, _ = mimetypes.guess_type(file_path)
                
                # Set default MIME type for unknown files
                if mime_type is None:
                    if file_path.endswith('.css'):
                        mime_type = 'text/css'
                    elif file_path.endswith('.js'):
                        mime_type = 'application/javascript'
                    elif file_path.endswith('.csv'):
                        mime_type = 'text/csv'
                    else:
                        mime_type = 'text/plain'
                
                # Send response
                self.send_response(200)
                self.send_header('Content-Type', mime_type)
                self.end_headers()
                
                # Read and serve the file
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
                    
                self.log_message(f"Served: {file_path} ({mime_type})")
                
            else:
                # File not found
                self.send_error(404, f"File not found: {path}")
                
        except Exception as e:
            print(f"Error serving {path}: {e}")
            self.send_error(500, f"Internal server error: {str(e)}")
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.end_headers()
    
    def log_message(self, format, *args):
        """Override to customize log format"""
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    """Start the HTTP server"""
    # Change to the directory containing the website files
    website_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(website_dir)
    
    # Verify essential files exist
    required_files = ['index.html', 'styles.css', 'script.js', 'feed-times.csv']
    missing_files = [f for f in required_files if not os.path.exists(f)]
    
    if missing_files:
        print(f"WARNING: Missing files: {', '.join(missing_files)}")
    else:
        print("All essential files found")
    
    # Create and start the server
    try:
        with socketserver.TCPServer(("", PORT), HomelessAidHTTPRequestHandler) as httpd:
            print("\n" + "="*60)
            print("Homeless Aid UK Website Server")
            print("="*60)
            print(f"Server running at: http://localhost:{PORT}")
            print(f"Serving from: {website_dir}")
            print("\nAvailable pages:")
            print(f"   * Homepage: http://localhost:{PORT}")
            print(f"   * Donate: http://localhost:{PORT}/donate.html")
            print(f"   * Volunteer: http://localhost:{PORT}/volunteer.html")
            print(f"   * Contact: http://localhost:{PORT}/contact.html")
            print("\nFor LocalTunnel access:")
            print(f"   1. Install LocalTunnel: npm install -g localtunnel")
            print(f"   2. Run: lt --port {PORT} --subdomain homeless-aid")
            print(f"   3. Access at: https://homeless-aid.loca.lt")
            print("\nPress Ctrl+C to stop the server")
            print("="*60 + "\n")
            
            # Start serving
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n\nServer stopped by user")
    except OSError as e:
        if e.errno == 10048:  # Port already in use on Windows
            print(f"\nError: Port {PORT} is already in use")
            print(f"   Try a different port or stop the other service using port {PORT}")
        else:
            print(f"\nError starting server: {e}")
    except Exception as e:
        print(f"\nUnexpected error: {e}")

if __name__ == "__main__":
    main()