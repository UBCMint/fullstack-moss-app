@echo off
echo ================================================================
echo  MOSS BCI Platform - Environment Setup
echo ================================================================
echo.
echo This will create a Python environment and install all packages.
echo This takes about 5-10 minutes. Please wait...
echo.

:: Create conda environment
call conda create -n MOSS python=3.11 -y
if %errorlevel% neq 0 (
    echo ERROR: Failed to create conda environment.
    echo Make sure Miniconda/Anaconda is installed and try again.
    pause
    exit /b 1
)

:: Activate and install packages
call conda activate MOSS

echo.
echo Installing PyTorch (CPU)...
call pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

echo.
echo Installing other packages...
call pip install numpy pandas scipy scikit-learn einops transformers

echo.
echo ================================================================
echo  Setup complete!
echo ================================================================
echo.
echo Next step: place NeuroLM-B.pt in:
echo   %~dp0checkpoints\checkpoints\NeuroLM-B.pt
echo.
echo Then double-click predict.bat to run predictions.
echo.
pause
