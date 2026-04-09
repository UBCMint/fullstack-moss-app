@echo off
echo ================================================================
echo  MOSS BCI Platform - Mental State Prediction
echo ================================================================
echo.

:: Check environment exists
call conda activate MOSS 2>nul
if %errorlevel% neq 0 (
    echo ERROR: MOSS environment not found.
    echo Please run setup.bat first.
    pause
    exit /b 1
)

:: Check checkpoint exists
if not exist "%~dp0checkpoints\checkpoints\NeuroLM-B.pt" (
    echo ERROR: NeuroLM-B.pt not found.
    echo.
    echo Please download the model weights and place them at:
    echo   %~dp0checkpoints\checkpoints\NeuroLM-B.pt
    echo.
    echo Contact Natalia ^(UBC MINT Team^) for the download link.
    pause
    exit /b 1
)

:: Get input file
echo Drag and drop your Muse 2 CSV file here, then press Enter:
echo ^(or type the full path manually^)
echo.
set /p INPUT_FILE="CSV path: "

:: Strip surrounding quotes if user dragged file
set INPUT_FILE=%INPUT_FILE:"=%

:: Check file exists
if not exist "%INPUT_FILE%" (
    echo.
    echo ERROR: File not found: %INPUT_FILE%
    pause
    exit /b 1
)

:: Choose task
echo.
echo Choose a task:
echo   1. activity  - what you were doing ^(eat/game/read/rest/toy/tv^)
echo   2. focus     - attention level ^(relaxed/neutral/concentrating^)
echo   3. emotion   - emotional state ^(neutral/anger/fear/happiness/sadness^)
echo   4. stress    - stress level ^(Low/Moderate/High^) ^[experimental^]
echo.
set /p TASK_NUM="Enter number (1-4): "

if "%TASK_NUM%"=="1" set TASK=activity
if "%TASK_NUM%"=="2" set TASK=focus
if "%TASK_NUM%"=="3" set TASK=emotion
if "%TASK_NUM%"=="4" set TASK=stress

if not defined TASK (
    echo Invalid choice. Please enter 1, 2, 3, or 4.
    pause
    exit /b 1
)

:: Run prediction
echo.
echo ================================================================
echo  Running %TASK% prediction...
echo ================================================================
echo.

cd /d "%~dp0"
python muse2_predict.py --input "%INPUT_FILE%" --task %TASK%

echo.
echo ================================================================
echo  Done! Press any key to close.
echo ================================================================
pause
