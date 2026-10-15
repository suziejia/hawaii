@echo off
rem ---------------------------------------------------------------
rem Compatibility shim.
rem The desktop shortcut "Hawaii.lnk" targets this filename (legacy name
rem from when the app was called OutputMaster). Do not delete this file,
rem or the desktop shortcut will fail with "cannot find the file".
rem
rem All real logic (stale-build detection, rebuild, readiness poll)
rem lives in start-hawaii.bat / scripts\launch.mjs.
rem ---------------------------------------------------------------
call "%~dp0start-hawaii.bat"
