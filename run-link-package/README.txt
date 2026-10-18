MainProject Run Link Package

PC-SERVER runtime compatibility:
- The Windows 7 server uses the bundled Node.js 12.22.12 runtime.
- Keep backend runtime files compatible with Node 12 (no optional chaining or nullish coalescing).
- Before deployment, syntax-check server.js, database.js and all JavaScript files under
  auth, database, routes, services and utils with run-link-package\node\node.exe --check.
- Keep the server's existing node_modules; do not replace native dependencies with client builds.

Approved connection channels:
1) Local network server:
   http://PC-SERVER:5000
   IPv4 fallback: http://169.254.61.2:5000
2) Central/public server:
   http://37.34.208.209:5000
3) Installed application interface:
   http://localhost:5000
   localhost serves interface files only and proxies API/archive requests to an approved server channel.

External browser access:
1) Double-click RUN_PROGRAM.bat from a device outside the server network.
2) Or open RUN_PROGRAM.url directly.
3) RUN_PROGRAM.bat displays "الموقع متاح" when the server responds and opens the login page.
4) It displays "الموقع مغلق" when the server cannot be reached.

Public login URL:
http://37.34.208.209:5000/login.html

Installed application access inside the administration:
1) Keep the project files on the client device.
2) Double-click RUN_LOCAL_PROGRAM.bat.
3) The local client serves the pages from this device at http://localhost:5000.
4) API and archive requests are proxied to http://PC-SERVER:5000.
5) The local client never opens or copies database.db. PC-SERVER remains the only database owner.
6) Do not run RUN_LOCAL_PROGRAM.bat on LAPTOP-ABDULLAH; that laptop remains a gateway only.

Static public IP setup:
1) Connect the PC-SERVER Ethernet cable directly to LAPTOP-ABDULLAH.
2) Run SETUP_STATIC_PUBLIC_IP.bat as Administrator on LAPTOP-ABDULLAH once.
3) Keep router TCP WAN port 5000 forwarded to 192.168.8.4:5000.
4) Keep the DHCP reservation for 192.168.8.4 and keep LAPTOP-ABDULLAH running.
5) Test http://37.34.208.209:5000/api/health from mobile data or another external network.
6) The laptop is only a gateway; it must not run a local API or copy the SQLite database file.
