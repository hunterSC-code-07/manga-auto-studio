# Manga Auto-Studio Pro ⚡

A complete, modular, AI-powered desktop and web application for automated manga creation, dataset processing, and VLM/LLM script generation.

## Features
- **2-Step Agentic Pipeline:** Uses a Vision Model (VLM) to analyze images and a Text Model (LLM) to write strictly formatted JSON dialogue.
- **Dynamic Bubble Engine:** Automatically draws speech, thought, and action bubbles using YOLO face detection.
- **4-Koma Compiler:** Automatically stitches individual panels into beautiful manga pages.
- **React.js Web UI:** A stunning, modern, glass-morphism dashboard.

## Installation Instructions

### 1. Clone the Repository
\`\`\`bash
git clone https://github.com/YourUsername/manga-auto-studio.git
cd manga-auto-studio
\`\`\`

### 2. Install Python Dependencies (Backend)
Make sure you have Python installed, then run:
\`\`\`bash
pip install -r requirements.txt
\`\`\`
*(Note: You will need to download a YOLOv8 face detection model like `face_yolov8s.pt` and place it in the root directory).*

### 3. Install React Dependencies (Frontend)
Make sure you have Node.js installed, then navigate to the frontend folder and install the UI packages:
\`\`\`bash
cd frontend
npm install
\`\`\`

## How to Run
You must start both the backend server and the frontend UI.

**Terminal 1 (Backend):**
\`\`\`bash
# In the main folder
python server.py
\`\`\`
*(If you want to use the legacy Tkinter desktop UI instead, run `python main.py`)*

**Terminal 2 (Frontend):**
\`\`\`bash
# In the /frontend folder
npm run dev
\`\`\`
Open the `http://localhost:5173` link in your browser to use the app!