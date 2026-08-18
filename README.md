# ⚡ Manga Auto-Studio Pro

A production-grade, AI-powered software suite for automated manga creation, dataset processing, and intelligent comic script generation. 

Built with a modular backend and a modern React.js frontend, this tool combines **Vision Language Models (VLMs)**, **Large Language Models (LLMs)**, and **YOLO Object Detection** into a seamless, end-to-end comic generation pipeline.

![App Layout](https://img.shields.io/badge/UI-React_|_Tailwind_|_CustomTkinter-blue)
![Backend](https://img.shields.io/badge/Backend-FastAPI_|_Python-green)
![AI Tech](https://img.shields.io/badge/AI-YOLOv8_|_LLMs_|_VLMs-orange)

---

## 🌟 Core Features

### 🧠 2-Step Agentic Story Engine
Unlike basic image-to-text generators, this app utilizes a dual-agent system to write continuous manga scripts:
* **Agent 1 (The Eyes - VLM):** Scans the image, recognizes characters via metadata scraping, and writes a hyper-detailed forensic breakdown of the scene's action and emotion.
* **Agent 2 (The Brain - LLM):** Takes the visual report, reads the **Global Story Memory Bank** (the running history of previous panels), and generates highly stylized, context-aware dialogue in strict JSON format.

### 💬 Dynamic Bubble & Shape Engine
Using **YOLOv8 face detection**, the app dynamically calculates where to place speech bubbles to avoid covering faces. 
* Includes **Background Safe-Zones** (Canny edge detection) to actively route bubbles away from highly detailed background art.
* The LLM dictates the *emotion* of the text, prompting the engine to automatically draw specific shapes:
  * `Speech`: Standard oval with a directional tail pointing to the speaker's mouth.
  * `Thought`: Cloud shapes with trailing mini-bubbles.
  * `Shout`: Jagged, 16-point starburst impact polygons.
  * `Action`: Borderless, heavy-stroke impact text directly on the canvas.

### 🛠️ Interactive WYSIWYG Sandbox
A complete visual editor allowing users to load images, type dialogue, and manually drag-and-drop bubbles anywhere on the canvas with real-time scaling and auto-tail rendering.

### 📄 4-Koma Manga Compiler
Automatically stitches thousands of individual output panels into beautifully formatted, sequential comic book pages. Supports alternating grid rows (e.g., 4 images on row one, 6 on row two) and randomized batching.

### 🗄️ Dataset Preparation Suite
A full suite of tools for model-trainers and AI artists:
* **Auto-Tagger:** Automatically captions massive image datasets using models like Florence-2 or WD-14.
* **Tag Cleaner:** A global Find & Replace engine to instantly scrub or swap specific tags across thousands of `.txt` sidecar files.
* **Smart Face Cropper:** Automatically detects faces and crops images to specific aspect ratios (1024x1024, 832x1216) with adjustable padding scales.
* **AI Upscaler:** Batch upscales images to 2x or 4x resolution.
* **Standalone Watermark:** Injects text or PNG watermarks into batches with customizable anchor coordinates and opacity.

---

## 🚀 Installation & Setup

### Prerequisites
* **Python 3.10+**
* **Node.js 20+**
* A YOLOv8 Face Detection model (`face_yolov8s.pt`) placed in the root directory.

### 1. Clone the Repository
```bash
git clone https://github.com/YourUsername/manga-auto-studio.git
cd manga-auto-studio
```

### 2. Install Backend Dependencies
Make sure you have Python installed, then run:
```bash
pip install -r requirements.txt
```

### 3. Install Frontend Dependencies
Make sure you have Node.js installed, then navigate to the frontend folder and install the UI packages:
```bash
cd frontend
npm install
```

---

## 💻 How to Run

Because this app utilizes a professional, decoupled architecture, you must run both the backend API and the frontend UI.

**1. Start the Python Backend (FastAPI):**
Open a terminal in the root folder and run:
```bash
python server.py
```
*(Note: If you prefer the legacy desktop app, you can run `python main.py` to launch the CustomTkinter GUI instead).*

**2. Start the React Frontend:**
Open a second terminal inside the `frontend` folder and run:
```bash
npm run dev
```

Click the `http://localhost:5173` link provided in the terminal to open the UI in your web browser.

---

## ⚙️ Architecture
* **Frontend:** React.js, TailwindCSS, Lucide-React.
* **Backend:** FastAPI, Python, PIL, OpenCV.
* **AI Integration:** Direct REST API hooks compatible with LM Studio, Ollama, and OpenAI endpoints.