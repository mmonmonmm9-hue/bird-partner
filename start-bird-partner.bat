@echo off
chcp 65001 >nul
title Bird Partner
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo ไม่พบ Node.js กรุณาติดตั้ง Node.js 22.5 ขึ้นไปจาก https://nodejs.org ก่อน
  pause
  exit /b 1
)

if not exist node_modules (
  echo กำลังติดตั้งแพ็กเกจ ครั้งแรกใช้เวลาสักครู่...
  call npm install
)

echo.
echo เปิดเว็บที่ http://localhost:5173  ^(ปิดหน้าต่างนี้เพื่อหยุดเซิร์ฟเวอร์^)
echo.
start "" http://localhost:5173
call npm run dev
pause
