MainProject Run Link Package

1) Double-click RUN_PROGRAM.bat. It uses the running local or PC-SERVER service and starts a local server only when neither is available.
2) Or open RUN_PROGRAM.url after the server is already running.
3) Double-click START_WITH_TUNNEL.bat to wait for server readiness and create a public link.

Login URL:
http://localhost:5000/login.html

Setup on another Windows device:
1) Connect the device to the same network as PC-SERVER.
2) Open http://PC-SERVER:5000/login.html or create a shortcut to that address.
3) Do not copy the database or run another API server on client devices.

Cloudflare Tunnel setup on PC-SERVER:
1) Install Cloudflare Tunnel with: winget install --id Cloudflare.cloudflared
2) For a temporary URL, run START_WITH_TUNNEL.bat without extra configuration.
3) For a stable URL, run SETUP_NAMED_TUNNEL.bat once and enter the tunnel name and public hostname.
4) Define CLOUDFLARE_TUNNEL_NAME with that tunnel name before running START_WITH_TUNNEL.bat.
5) Run INSTALL_AUTO_START.bat once to start the API automatically at Windows sign-in.

The public URL is written to tunnel-url.log in the MainProject.Api folder.
