@echo off
chcp 65001 >nul
title Publicar RadarFAP Brasil — GitHub & Vercel
echo ==================================================================
echo 1/2 - Enviando codigo para https://github.com/veeluensolutions-max/radarfap.git
echo ==================================================================
git push -u origin main

echo.
echo ==================================================================
echo 2/2 - Publicando em Producao na Vercel
echo ==================================================================
call vercel whoami >nul 2>&1
if %errorlevel% neq 0 (
    echo Sessao da Vercel expirada. Abrindo login no navegador...
    call vercel login
)
call vercel --prod --yes
echo.
echo Deploy finalizado!
pause

