@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 goto run_py

where python >nul 2>nul
if not errorlevel 1 goto run_python

echo Khong tim thay Python. Hay cai Python tu python.org va chon "Add Python to PATH".
pause
exit /b 1

:run_py
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 40; $i++) { try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8080' -TimeoutSec 1 | Out-Null; Start-Process 'http://127.0.0.1:8080'; exit } catch { Start-Sleep -Milliseconds 500 } }; Start-Process 'http://127.0.0.1:8080'"
py -m http.server 8080 --bind 127.0.0.1
goto finished

:run_python
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 40; $i++) { try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8080' -TimeoutSec 1 | Out-Null; Start-Process 'http://127.0.0.1:8080'; exit } catch { Start-Sleep -Milliseconds 500 } }; Start-Process 'http://127.0.0.1:8080'"
python -m http.server 8080 --bind 127.0.0.1

:finished
if errorlevel 1 echo May chu da dung hoac khong the khoi dong.
pause
