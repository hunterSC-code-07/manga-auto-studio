@echo off
:: Starts the frontend in a new window. 
:: The /d flag changes the directory to "frontend" before running npm.
start "Frontend Server" /d "frontend" npm run dev

:: Runs the Python server in the original window.
python server.py
pause