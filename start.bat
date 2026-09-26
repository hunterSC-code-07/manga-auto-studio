@echo off
:: Starts the frontend in a new window. 
:: The /d flag changes the directory to "frontend" before running npm.
start "Frontend Server" /d "frontend" npm run dev

:: Runs the Python server in the original window.
if exist "..\python_embeded\python.exe" (
    ..\python_embeded\python.exe server.py
) else (
    python server.py
)
pause