================================================================
MOSS BCI Platform — Predict Package
Mental State Classifier using NeuroLM + Muse 2
================================================================
Version: 1.0  |  March 2026  |  UBC MINT Team

----------------------------------------------------------------
WHAT THIS DOES
----------------------------------------------------------------
Given a Muse 2 EEG recording (CSV from Mind Monitor app),
this tool predicts your mental state using a frozen NeuroLM
foundation model + trained classifiers.

Available tasks:
  activity  — what you were doing: eat / game / read / rest / toy / tv
  focus     — attention level: relaxed / neutral / concentrating
  emotion   — emotional state: neutral / anger / fear / happiness / sadness
  stress    — stress level: Low / Moderate / High  (experimental, not reliable)

----------------------------------------------------------------
REQUIREMENTS
----------------------------------------------------------------
- Windows 10/11 (Mac/Linux also works with minor path changes)
- Miniconda or Anaconda: https://www.anaconda.com/download
- ~4GB free disk space (for NeuroLM weights + environment)
- Muse 2 headband + Mind Monitor app (iOS/Android, ~$15)

----------------------------------------------------------------
ONE-TIME SETUP (do this once)
----------------------------------------------------------------
1. Install Miniconda if you don't have it
   https://docs.anaconda.com/miniconda/

2. Double-click setup.bat  (or run it from Anaconda Prompt)
   This will:
   - Create a Python environment called "MOSS"
   - Install all required packages
   - Takes about 5-10 minutes

3. Download NeuroLM model weights (ONE required file, ~500MB):
   https://huggingface.co/username/neurolm  (ask Natalia for link)

   Place the file here:
   MOSS\checkpoints\checkpoints\NeuroLM-B.pt

   Your folder structure should look like:
   MOSS\
     checkpoints\
       checkpoints\
         NeuroLM-B.pt       <-- put it here
     moss_models\
       muse2_classifier.pkl
       focus_classifier.pkl
       emotion_classifier.pkl
       stress_classifier.pkl
     muse2_predict.py
     setup.bat
     predict.bat
     README.txt

----------------------------------------------------------------
RECORDING YOUR EEG
----------------------------------------------------------------
1. Open Mind Monitor app on your phone
2. Connect your Muse 2 headband
3. Press record — sit still and do your task for at least 2 minutes
   (longer = more reliable prediction)
4. Export the CSV:
   Mind Monitor → Menu → Export CSV → save to your computer

The CSV will have columns like:
  TimeStamp, RAW_TP9, RAW_AF7, RAW_AF8, RAW_TP10, ...

----------------------------------------------------------------
RUNNING A PREDICTION
----------------------------------------------------------------
Option A — Double-click predict.bat
  It will ask you to:
  1. Paste the path to your CSV file
  2. Choose a task (activity / focus / emotion / stress)

Option B — Run from Anaconda Prompt manually:
  conda activate MOSS
  cd path\to\MOSS
  python muse2_predict.py --input "path\to\your_recording.csv" --task activity

  Change --task to: activity, focus, emotion, or stress

----------------------------------------------------------------
EXAMPLE OUTPUT
----------------------------------------------------------------
  MOSS Prediction
  ===============
  Input:  my_recording.csv
  Task:   focus
  Model:  trained on 4 subjects, 633 segments

  Segment-by-segment predictions:
  [   0s-4s]  relaxed       94.2%  ██████████████████
  [   2s-6s]  relaxed       87.1%  █████████████████
  [   4s-8s]  concentrating 78.3%  ███████████████
  [   6s-10s] neutral       65.4%  ████████████
  ...

  Overall prediction:  RELAXED  (67% of segments)

  Class probabilities (mean across all segments):
    relaxed       58.1%  ███████████████████████
    neutral       24.3%  █████████
    concentrating 17.6%  ███████

----------------------------------------------------------------
CLASSIFIER PERFORMANCE (what to expect)
----------------------------------------------------------------
  Task       Classes   Accuracy   Chance   Notes
  --------   -------   --------   ------   -----
  Activity   6         91.7%      16.7%    Very reliable
  Focus      3         71.9%      33.3%    Reliable
  Emotion    5         45.5%      20.0%    Use with caution
  Stress     3         28.0%      33.3%    Not reliable yet

Accuracy is Leave-One-Subject-Out cross-validation —
meaning the model was tested on people it had never seen before.

----------------------------------------------------------------
TIPS FOR BEST RESULTS
----------------------------------------------------------------
- Record at least 2 minutes (ideally 5+) for stable predictions
- Sit still — jaw clenching and movement create artifacts
- Make sure headband fits snugly (check Mind Monitor signal quality)
- Do one clearly defined task per recording
- Green signal quality bars in Mind Monitor = good contact

----------------------------------------------------------------
TROUBLESHOOTING
----------------------------------------------------------------
"No module named X"
  → Re-run setup.bat or run: conda activate MOSS

"File not found: NeuroLM-B.pt"
  → Make sure checkpoint is at MOSS\checkpoints\checkpoints\NeuroLM-B.pt

"Recording too short"
  → Record at least 4 seconds; 2+ minutes recommended

"ERROR loading CSV"
  → Check that your CSV has RAW_TP9/AF7/AF8/TP10 columns
  → Export directly from Mind Monitor (not Muse Direct)

----------------------------------------------------------------
CONTACT
----------------------------------------------------------------
Questions? Contact Natalia (UBC MINT Team)
Project: MOSS — Modular Open-Source Signal System
GitHub: [link TBD]

================================================================
