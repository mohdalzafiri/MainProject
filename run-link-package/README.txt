MainProject Run Link Package

1) Double-click RUN_PROGRAM.bat to start the server and open the login page.
2) Or open RUN_PROGRAM.url after the server is already running.
3) Double-click START_WITH_TUNNEL.bat to start the server and create a public link.

Login URL:
http://localhost:5000/login.html

Setup on another Windows device:
1) Copy the complete MainProject.Api folder. Do not copy run-link-package alone.
2) Install Node.js, then open Command Prompt in MainProject.Api and run: npm install
3) Install Cloudflare Tunnel with: winget install --id Cloudflare.cloudflared
4) Close and reopen Command Prompt after installation.
5) Run START_WITH_TUNNEL.bat from the run-link-package folder.

The public URL is written to tunnel-url.log in the MainProject.Api folder.
