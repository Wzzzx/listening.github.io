@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ================== 配置参数（可按需修改） ==================
set BITRATE=64k
REM ==========================================================

echo 当前目录：%cd%
echo 即将递归压缩所有子文件夹中的 MP3 文件...
echo 压缩参数：比特率 %BITRATE%
echo 处理方式：**彻底移除内嵌封面图 (丢弃图片流)**
echo.
echo ⚠️  警告：压缩成功后，原始文件将被新文件直接替换！
echo.
pause

for /R %%i in (*.mp3) do (
    echo.
    echo [处理] %%i

    REM 定义临时文件（与源文件同目录）
    set "tempfile=%%~dpni_temp.mp3"

    REM 执行压缩：-vn 丢弃图片，-map_metadata 0 保留歌曲名/专辑等文字信息
    ffmpeg -i "%%i" -vn -map_metadata 0 -b:a %BITRATE% -y "!tempfile!" 2>nul

    REM 判断是否压缩成功
    if !errorlevel! equ 0 (
        REM 成功则用临时文件覆盖源文件
        move "!tempfile!" "%%i" >nul
        echo [成功] 已覆盖（已移除封面图）：%%i
    ) else (
        REM 失败则删除临时文件，跳过此文件
        del "!tempfile!" 2>nul
        echo [失败] 压缩出错，已跳过：%%i
    )
)

echo.
echo ========== 全部处理完成 ==========
pause