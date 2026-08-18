import os
import io 
import base64 
import asyncio
import threading
import tkinter as tk
from tkinter import filedialog
from fastapi import FastAPI, WebSocket, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from core_packager import PackagerManager
from core_image import ImageManager 
from core_ai import AIManager
from core_pipeline import PipelineManager
from app_config import ConfigManager
from core_dataset import DatasetManager 
import textwrap
from PIL import Image, ImageDraw, ImageFont
from core_culler import CullerManager 

app = FastAPI()
config_manager = ConfigManager()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- WEBSOCKET MANAGER ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@app.websocket("/ws/monitor")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except:
        manager.disconnect(websocket)

# --- API ENDPOINTS ---

@app.get("/api/profiles")
def get_profiles():
    return {
        "profiles": config_manager.get_profiles_list(), 
        "current": config_manager.current_profile
    }

@app.get("/api/config")
def get_config(profile: str = "default"):
    # This loads the JSON file from your hard drive
    data = config_manager.load_config(profile)
    return data

class SaveRequest(BaseModel):
    profile_name: str
    config_data: dict

@app.post("/api/config/save")
def save_config(req: SaveRequest):
    # This saves the JSON file to your hard drive
    config_manager.save_config(req.config_data, req.profile_name)
    return {"status": "success"}

@app.get("/api/browse/folder")
def browse_folder():
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    folder = filedialog.askdirectory()
    root.destroy()
    return {"path": folder}

@app.get("/api/browse/file")
def browse_file():
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    file = filedialog.askopenfilename()
    root.destroy()
    return {"path": file}


# --- PIPELINE EXECUTION ---
# This defines exactly what data React sends to Python
class PipelineConfig(BaseModel):
    mode: str = "single"  # <--- NEW: Tells Python if it's Single or Dual
    in_dir: str
    out_dir: str
    wildcard_dir: str
    model_path: str
    font_path: str
    font_size: int
    pad_x: int
    pad_y: int
    conf: float
    tail_len: int
    tail_thick: float
    autofit: bool
    safe_zones: bool
    needs_review: bool
    strip_meta: bool
    multicore: bool
    overwrite: bool
    custom_meta: str
    default_file: str
    char2_file: str = ""  # <--- NEW: Secondary character file
    mappings: list[dict]

# Global events for Start/Stop/Pause
pause_event = threading.Event()
pause_event.set()
stop_event = threading.Event()

@app.post("/api/pipeline/start")
async def start_pipeline(config: PipelineConfig, background_tasks: BackgroundTasks):
    stop_event.clear()
    cfg = config.model_dump()
    mode = cfg.get("mode", "single")
    
    # 1. Format the mappings into a clean dictionary
    formatted_mappings = {}
    for m in cfg.get('mappings', []):
        if m.get('trigger'):
            formatted_mappings[m['trigger'].strip().lower()] = m['file'].strip()
    cfg['mappings'] = formatted_mappings

    # 2. Read the actual text files from the Captions Directory
    wc_dir = cfg.get('wildcard_dir', '')
    wildcards = {}
    
    # Include the dual character file in the load list!
    files_to_load = set(list(cfg['mappings'].values()) + [cfg['default_file'], cfg.get('char2_file', '')])
    
    for f_name in files_to_load:
        if not f_name: continue
        try:
            with open(os.path.join(wc_dir, f_name), 'r', encoding='utf-8') as f:
                lines = [line.strip() for line in f if line.strip()]
                wildcards[f_name] = lines if lines else ["..."]
        except Exception:
            wildcards[f_name] = ["..."]
            
    cfg['wildcards'] = wildcards

    # Callbacks
    def log_cb(msg): asyncio.run(manager.broadcast({"type": "log", "data": msg}))
    def prog_cb(current, total): asyncio.run(manager.broadcast({"type": "progress", "current": current, "total": total}))
    def prev_cb(img):
        try:
            import io, base64
            buffered = io.BytesIO()
            preview_img = img.copy().convert("RGB")
            preview_img.thumbnail((700, 850)) 
            preview_img.save(buffered, format="JPEG", quality=85)
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
            asyncio.run(manager.broadcast({"type": "preview", "image": img_str}))
        except Exception as e:
            print(f"Preview Error: {e}")

    callbacks = {'log': log_cb, 'progress': prog_cb, 'preview': prev_cb}

    def run_job():
        log_cb(f"🚀 Initializing {mode.upper()} Pipeline...")
        # Notice we pass the 'mode' variable here now!
        success, msg = PipelineManager.process_standard_batch(cfg, callbacks, pause_event, stop_event, mode)
        log_cb(msg)

    threading.Thread(target=run_job, daemon=True).start()
    return {"status": "started"}
# --- VLM PIPELINE EXECUTION ---
class VLMConfig(BaseModel):
    in_dir: str
    out_dir: str
    model_path: str
    api_url: str
    llm_url: str
    dual_agent: bool
    sys_prompt: str
    llm_sys_prompt: str
    fallback_prompt: str
    temp: float
    tokens: int
    font_path: str
    font_size: int
    pad_x: int
    pad_y: int
    conf: float
    tail_len: int
    tail_thick: float
    safe_zones: bool
    use_smart_extract: bool
    use_full_meta: bool
    use_memory: bool
    external_memory: str
    autofit: bool
    overwrite: bool

@app.post("/api/vlm/start")
async def start_vlm(config: VLMConfig):
    stop_event.clear()
    cfg = config.model_dump()

    # Callbacks
    def log_cb(msg): asyncio.run(manager.broadcast({"type": "log", "data": msg}))
    def prog_cb(current, total): asyncio.run(manager.broadcast({"type": "progress", "current": current, "total": total}))
    def prev_cb(img):
        try:
            import io, base64
            buffered = io.BytesIO()
            preview_img = img.copy().convert("RGB")
            preview_img.thumbnail((700, 850)) 
            preview_img.save(buffered, format="JPEG", quality=85)
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
            asyncio.run(manager.broadcast({"type": "preview", "image": img_str}))
        except Exception:
            pass
            
    # The VLM logic also returns memory updates, we'll stream them as special logs
    def mem_cb(txt): asyncio.run(manager.broadcast({"type": "log", "data": f"🧠 MEMORY UPDATED: {txt}"}))

    callbacks = {'log': log_cb, 'progress': prog_cb, 'preview': prev_cb, 'memory': mem_cb}

    def run_job():
        log_cb("👁️ Initializing VLM Comic Pipeline...")
        success, msg = PipelineManager.process_vlm_batch(cfg, callbacks, pause_event, stop_event)
        log_cb(msg)

    threading.Thread(target=run_job, daemon=True).start()
    return {"status": "started"}

@app.post("/api/pipeline/stop")
async def stop_pipeline():
    stop_event.set()
    # NEW: We use 'await' here instead of asyncio.run because we are already inside an async function
    await manager.broadcast({"type": "log", "data": "🛑 STOP COMMAND SENT."})
    return {"status": "stopped"}

# --- TIER PACKAGER EXECUTION ---
class PackagerScanReq(BaseModel):
    directory: str

@app.post("/api/packager/scan")
def scan_packager_dir(req: PackagerScanReq):
    success, msg, total, _ = PackagerManager.scan_directory(req.directory)
    return {"success": success, "message": msg, "total": total}

class PackagerConfig(BaseModel):
    source_dir: str
    out_dir: str
    mode: str
    allocations: dict

@app.post("/api/packager/start")
async def start_packager(config: PackagerConfig):
    stop_event.clear()
    cfg = config.model_dump()

    def log_cb(msg): asyncio.run(manager.broadcast({"type": "log", "data": msg}))
    def prog_cb(current, total): asyncio.run(manager.broadcast({"type": "progress", "current": current, "total": total}))

    callbacks = {'log': log_cb, 'progress': prog_cb}

    def run_job():
        log_cb("📦 Initializing Tier Packager...")
        success, msg = PackagerManager.process_packaging(cfg, callbacks, pause_event, stop_event)
        log_cb(msg)

    threading.Thread(target=run_job, daemon=True).start()
    return {"status": "started"}

# --- WATERMARK EXECUTION ---
class WatermarkConfig(BaseModel):
    in_dir: str
    out_dir: str
    mode: str
    opacity: float
    strip_meta: bool
    custom_meta: str
    text: str
    font_path: str
    font_size: int
    color: str
    png_path: str
    anchor_x: float
    anchor_y: float

@app.post("/api/watermark/start")
async def start_watermark(config: WatermarkConfig):
    stop_event.clear()
    cfg = config.model_dump()

    def log_cb(msg): asyncio.run(manager.broadcast({"type": "log", "data": msg}))
    def prog_cb(current, total): asyncio.run(manager.broadcast({"type": "progress", "current": current, "total": total}))
    def prev_cb(img):
        try:
            import io, base64
            buffered = io.BytesIO()
            preview_img = img.copy().convert("RGB")
            preview_img.thumbnail((700, 850)) 
            preview_img.save(buffered, format="JPEG", quality=85)
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
            asyncio.run(manager.broadcast({"type": "preview", "image": img_str}))
        except Exception: pass

    def run_job():
        log_cb("💧 Initializing Watermark Batch...")
        success, msg = ImageManager.process_standalone_watermarks(cfg, prog_cb, prev_cb, pause_event, stop_event)
        log_cb(msg)

    threading.Thread(target=run_job, daemon=True).start()
    return {"status": "started"}
    
# --- AUTO-TAGGER EXECUTION ---
class TaggerConfig(BaseModel):
    in_dir: str
    model: str
    ext: str
    strategy: str
    prepend: str
    append: str
    batch_size: int
    recursive: bool

@app.post("/api/tagger/start")
async def start_tagger(config: TaggerConfig):
    stop_event.clear()
    cfg = config.model_dump()

    def log_cb(msg): asyncio.run(manager.broadcast({"type": "log", "data": msg}))
    def prog_cb(current, total): asyncio.run(manager.broadcast({"type": "progress", "current": current, "total": total}))

    def run_job():
        log_cb("🏷️ Initializing Auto-Tagger...")
        success, msg = AIManager.run_auto_tagger(
            cfg['in_dir'], cfg['model'], cfg['ext'], cfg['strategy'],
            cfg['prepend'], cfg['append'], cfg['batch_size'], cfg['recursive'],
            prog_cb, pause_event, stop_event
        )
        log_cb(msg)

    threading.Thread(target=run_job, daemon=True).start()
    return {"status": "started"}
    
# --- CROPPER EXECUTION ---
class CropperConfig(BaseModel):
    crop_in_dir: str
    crop_out_dir: str
    crop_res: str
    crop_pad: float

@app.post("/api/cropper/start")
async def start_cropper(config: CropperConfig):
    stop_event.clear()
    cfg = config.model_dump()

    def log_cb(msg): asyncio.run(manager.broadcast({"type": "log", "data": msg}))
    def prog_cb(current, total): asyncio.run(manager.broadcast({"type": "progress", "current": current, "total": total}))

    def run_job():
        log_cb("✂️ Initializing Smart Face Cropper...")
        success, msg = ImageManager.execute_cropping(
            cfg['crop_in_dir'], cfg['crop_out_dir'], cfg['crop_res'], cfg['crop_pad'],
            prog_cb, log_cb, pause_event
        )
        log_cb(msg)

    threading.Thread(target=run_job, daemon=True).start()
    return {"status": "started"}


# --- UPSCALER EXECUTION ---
# --- UPSCALER EXECUTION ---
class UpscalerConfig(BaseModel):
    up_in_dir: str
    up_out_dir: str
    up_factor: str
    up_model_path: str # <--- NEW

@app.post("/api/upscaler/start")
async def start_upscaler(config: UpscalerConfig):
    stop_event.clear()
    cfg = config.model_dump()

    def log_cb(msg): asyncio.run(manager.broadcast({"type": "log", "data": msg}))
    def prog_cb(current, total): asyncio.run(manager.broadcast({"type": "progress", "current": current, "total": total}))

    def run_job():
        log_cb("🔍 Initializing AI Upscaler...")
        success, msg = ImageManager.execute_upscale(
            cfg['up_in_dir'], cfg['up_out_dir'], cfg['up_factor'], cfg.get('up_model_path', ''),
            prog_cb, log_cb, pause_event, stop_event
        )
        log_cb(msg)

    threading.Thread(target=run_job, daemon=True).start()
    return {"status": "started"}

# --- TAG CLEANER EXECUTION ---
class CleanerScanReq(BaseModel):
    cleaner_dir: str

@app.post("/api/cleaner/scan")
def cleaner_scan(req: CleanerScanReq):
    success, msg, counts = DatasetManager.scan_tags(req.cleaner_dir)
    return {"success": success, "message": msg, "counts": counts}

class CleanerExecReq(BaseModel):
    cleaner_dir: str
    find_tag: str
    replace_tag: str

@app.post("/api/cleaner/execute")
def cleaner_exec(req: CleanerExecReq):
    success, msg = DatasetManager.execute_global_modify(req.cleaner_dir, req.find_tag, req.replace_tag)
    return {"success": success, "message": msg}


# --- GRID COMPILER EXECUTION ---
class CompilerConfig(BaseModel):
    comp_in: str
    comp_out: str
    comp_x: int
    comp_y: int
    comp_cols: int
    comp_alt: bool
    mode: str

@app.post("/api/compiler/start")
async def start_compiler(config: CompilerConfig):
    stop_event.clear()
    cfg = config.model_dump()

    def log_cb(msg): asyncio.run(manager.broadcast({"type": "log", "data": msg}))
    def prev_cb(img):
        try:
            import io, base64
            buffered = io.BytesIO()
            preview_img = img.copy().convert("RGB")
            preview_img.thumbnail((700, 850)) 
            preview_img.save(buffered, format="JPEG", quality=85)
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
            asyncio.run(manager.broadcast({"type": "preview", "image": img_str}))
        except Exception: pass

    def run_job():
        import os, random
        log_cb("📄 Initializing Manga Grid Compiler...")
        in_dir = cfg['comp_in']
        
        if not os.path.exists(in_dir):
            log_cb("Error: Input directory does not exist.")
            return
            
        files = [f for f in os.listdir(in_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        if cfg['mode'] == 'random':
            random.shuffle(files)
            
        success, msg = ImageManager.compile_grid(
            files, in_dir, cfg['comp_out'], cfg['comp_x'], cfg['comp_y'], 
            cfg['comp_cols'], cfg['comp_alt'], log_cb, prev_cb, pause_event
        )
        log_cb(msg)

    threading.Thread(target=run_job, daemon=True).start()
    return {"status": "started"}
    
# --- WILDCARD EDITOR ENDPOINTS ---
class WildcardWriteReq(BaseModel):
    path: str
    content: str

@app.get("/api/wildcards/list")
def list_wildcards(directory: str):
    if not os.path.isdir(directory):
        return {"success": False, "files": []}
    files = [f for f in os.listdir(directory) if f.lower().endswith('.txt')]
    return {"success": True, "files": files}

@app.get("/api/wildcards/read")
def read_wildcard(path: str):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return {"success": True, "content": f.read()}
    except Exception as e:
        return {"success": False, "content": str(e)}

@app.post("/api/wildcards/write")
def write_wildcard(req: WildcardWriteReq):
    try:
        with open(req.path, 'w', encoding='utf-8') as f:
            f.write(req.content)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
        
# --- AI STUDIO ENDPOINTS ---
class AIGenerateReq(BaseModel):
    api_url: str
    sys_prompt: str
    user_prompt: str
    temp: float
    tokens: int

@app.post("/api/ai/generate")
def ai_generate(req: AIGenerateReq):
    success, result = AIManager.generate_text(
        req.api_url, req.sys_prompt, req.user_prompt, req.temp, req.tokens
    )
    return {"success": success, "result": result}

class AIValidateReq(BaseModel):
    raw_text: str
    save_dir: str
    file_name: str

@app.post("/api/ai/validate")
def ai_validate(req: AIValidateReq):
    success, msg = AIManager.validate_and_save_captions(
        req.raw_text, req.save_dir, req.file_name
    )
    return {"success": success, "message": msg}
    
# --- WYSIWYG SANDBOX ENDPOINTS ---
@app.get("/api/sandbox/images")
def get_sandbox_images(directory: str):
    if not os.path.isdir(directory):
        return {"success": False, "files": []}
    valid_exts = {'.png', '.jpg', '.jpeg', '.webp'}
    files = [f for f in os.listdir(directory) if os.path.splitext(f)[1].lower() in valid_exts]
    return {"success": True, "files": sorted(files)}

@app.get("/api/sandbox/load")
def load_sandbox_image(path: str):
    try:
        import io, base64
        img = Image.open(path).convert("RGB")
        # Send a high-quality compressed preview to React
        img.thumbnail((1200, 1200))
        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=90)
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        return {"success": True, "image": img_str}
    except Exception as e:
        return {"success": False, "error": str(e)}

class SandboxBubble(BaseModel):
    text: str
    x_pct: float
    y_pct: float

class SandboxSaveReq(BaseModel):
    image_path: str
    out_dir: str
    font_path: str
    font_size: int
    pad_x: int
    pad_y: int
    bubbles: list[SandboxBubble]

@app.post("/api/sandbox/save")
def save_sandbox(req: SandboxSaveReq):
    try:
        import io, base64
        img = Image.open(req.image_path).convert("RGBA")
        draw = ImageDraw.Draw(img)
        fnt = PipelineManager.get_font(req.font_path, req.font_size)

        # Draw each bubble
        for b in req.bubbles:
            wrapped_text = textwrap.fill(b.text, width=15)
            # Convert percentage coordinates back to exact pixel coordinates
            bx = int(b.x_pct * img.width)
            by = int(b.y_pct * img.height)
            
            tb = draw.multiline_textbbox((0,0), wrapped_text, font=fnt)
            bw = (tb[2] - tb[0]) + req.pad_x * 2
            bh = (tb[3] - tb[1]) + req.pad_y * 2
            
            draw.ellipse([bx, by, bx+bw, by+bh], fill=(255,255,255), outline=(0,0,0), width=3)
            draw.multiline_text((bx + req.pad_x, by + req.pad_y), wrapped_text, fill=(0,0,0), font=fnt, align="center")

        out_img = img.convert("RGB")
        out_name = "EDITED_" + os.path.basename(req.image_path)
        out_path = os.path.join(req.out_dir, out_name)
        out_img.save(out_path, quality=100)
        
        # Broadcast the newly saved image to the Live Monitor!
        buffered = io.BytesIO()
        preview = out_img.copy()
        preview.thumbnail((700, 850))
        preview.save(buffered, format="JPEG", quality=85)
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        asyncio.run(manager.broadcast({"type": "preview", "image": img_str}))
        asyncio.run(manager.broadcast({"type": "log", "data": f"💾 WYSIWYG Saved: {out_name}"}))

        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
        
# --- SMART CULLER ENDPOINTS ---
class CullerConfig(BaseModel):
    in_dir: str
    keep_dir: str
    reject_dir: str
    mode: str
    threshold: int
    vlm_url: str
    copy_mode: bool
    vlm_prompt: str
    ref_dir: str

@app.post("/api/culler/start")
async def start_culler(config: CullerConfig):
    stop_event.clear()
    cfg = config.model_dump()

    def log_cb(msg): asyncio.run(manager.broadcast({"type": "log", "data": msg}))
    def prog_cb(current, total): asyncio.run(manager.broadcast({"type": "progress", "current": current, "total": total}))

    def run_job():
        log_cb("⚖️ Initializing Smart Image Culler...")
        success, msg = CullerManager.process_culling(cfg, {'log': log_cb, 'progress': prog_cb}, pause_event, stop_event)
        log_cb(msg)

    threading.Thread(target=run_job, daemon=True).start()
    return {"status": "started"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)