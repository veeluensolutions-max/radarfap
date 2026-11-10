@echo off
chcp 65001 >nul
title RadarFAP Brasil — Captação de Recursos para Pesquisas
echo ==================================================================
echo Iniciando RadarFAP Brasil em http://localhost:3000 ...
echo ==================================================================
start "" "http://localhost:3000"
node server.mjs
pause

