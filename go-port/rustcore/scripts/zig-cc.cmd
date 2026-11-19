@echo off
rem zig-cc.sh for a Windows HOST: cargo/cc-rs start CC_<triple> and AR_<triple>
rem with CreateProcess, which runs a .cmd but not a shell script. build.sh sets
rem ZIGZAG_BASH to the bash running it (never PATH lookup: that can find WSL).
"%ZIGZAG_BASH%" "%~dp0zig-cc.sh" %*
exit /b %errorlevel%
