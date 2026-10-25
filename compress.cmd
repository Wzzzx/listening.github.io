@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion

REM 配置参数（可按需修改）
set "BITRATE=64k"

REM 索引脚本通过环境变量传入单个文件，不暂停、不遍历目录。
if /i "%~1"=="--from-env" goto single
if not "%~1"=="" (
    echo Usage: compress.cmd [--from-env]
    exit /b 1
)
echo 即将递归压缩当前目录中的 MP3 文件，比特率 %BITRATE%。
echo 压缩将移除内嵌封面，成功后替换原文件。
pause
set "failed=0"
for /R %%i in (*.mp3) do (
    set "AUDIO_COMPRESS_INPUT=%%i"
    call :compress
    if errorlevel 1 set "failed=1"
)
echo 全部处理完成。
pause
exit /b %failed%

:single
call :compress
exit /b %errorlevel%

:compress
if not defined AUDIO_COMPRESS_INPUT (
    echo AUDIO_COMPRESS_INPUT is required.
    exit /b 1
)
if not exist "%AUDIO_COMPRESS_INPUT%" (
    echo [失败] 文件不存在："%AUDIO_COMPRESS_INPUT%"
    exit /b 1
)
for %%i in ("%AUDIO_COMPRESS_INPUT%") do (
    if /i not "%%~xi"==".mp3" exit /b 1
    set "tempdir=%%~dpi.compress-%RANDOM%-%RANDOM%"
)
REM 使用独立临时目录，避免覆盖用户文件。
mkdir "%tempdir%" 2>nul
if errorlevel 1 exit /b 1
echo [处理] "%AUDIO_COMPRESS_INPUT%"
ffmpeg -nostdin -hide_banner -loglevel error -i "%AUDIO_COMPRESS_INPUT%" -vn -map_metadata 0 -b:a %BITRATE% -y "%tempdir%\output.mp3"
if errorlevel 1 goto compressionFailed
move /y "%tempdir%\output.mp3" "%AUDIO_COMPRESS_INPUT%" >nul
if errorlevel 1 goto compressionFailed
rd "%tempdir%"
echo [成功] "%AUDIO_COMPRESS_INPUT%"
exit /b 0

:compressionFailed
if exist "%tempdir%\output.mp3" del "%tempdir%\output.mp3"
rd "%tempdir%"
echo [失败] "%AUDIO_COMPRESS_INPUT%"
exit /b 1
