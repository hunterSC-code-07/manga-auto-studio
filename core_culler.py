import os
import shutil
import base64
import requests
import json
import re
import io
from pathlib import Path
from PIL import Image

try:
    from transformers import pipeline
    import torch
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False

class CullerManager:
    @staticmethod
    def process_culling(cfg, callbacks, pause_event, stop_event):
        in_dir = cfg.get('in_dir')
        keep_dir = cfg.get('keep_dir')
        reject_dir = cfg.get('reject_dir')
        ref_dir = cfg.get('ref_dir', '').strip() # <--- Clean up the path
        mode = cfg.get('mode', 'Aesthetic Scorer')
        threshold = cfg.get('threshold', 70) / 100.0
        vlm_url = cfg.get('vlm_url', '')
        copy_mode = cfg.get('copy_mode', False)

        if not os.path.exists(in_dir):
            return False, "Input directory does not exist."

        os.makedirs(keep_dir, exist_ok=True)
        os.makedirs(reject_dir, exist_ok=True)

        valid_exts = {'.png', '.jpg', '.jpeg', '.webp'}
        files = [f for f in os.listdir(in_dir) if os.path.splitext(f)[1].lower() in valid_exts]
        total_files = len(files)

        if total_files == 0: return False, "No valid images found in input directory."

        # --- PRELOAD REFERENCE IMAGES (FEW-SHOT PROMPTING) ---
        ref_b64s = []
        if 'VLM' in mode:
            if ref_dir:
                if os.path.exists(ref_dir):
                    callbacks['log'](f"📚 Found Reference Directory! Loading images...")
                    ref_files = [f for f in os.listdir(ref_dir) if os.path.splitext(f)[1].lower() in valid_exts][:10]
                    for rf in ref_files:
                        try:
                            img = Image.open(os.path.join(ref_dir, rf)).convert("RGB")
                            img.thumbnail((512, 512)) # Downscale to save VRAM!
                            buffered = io.BytesIO()
                            img.save(buffered, format="JPEG", quality=85)
                            ref_b64s.append(base64.b64encode(buffered.getvalue()).decode('utf-8'))
                        except Exception: pass
                    
                    if ref_b64s:
                        callbacks['log'](f"✅ Successfully loaded {len(ref_b64s)} reference images into VLM Memory.")
                    else:
                        callbacks['log']("⚠️ Reference folder is empty or has no valid images (.png, .jpg, .webp).")
                else:
                    callbacks['log'](f"⚠️ ERROR: The Reference Folder path does not exist on your computer: {ref_dir}")
            else:
                callbacks['log']("ℹ️ No Reference Folder selected. Proceeding without Few-Shot examples.")

        # --- INITIALIZE AESTHETIC MODEL ---
        classifier = None
        if 'Aesthetic' in mode:
            if not HAS_TRANSFORMERS: return False, "Transformers library missing."
            callbacks['log']("🧠 Loading Aesthetic Model...")
            try:
                device = 0 if torch.cuda.is_available() else -1
                classifier = pipeline("image-classification", model="cafeai/cafe_aesthetic", device=device)
            except Exception as e:
                return False, f"Model load failed: {e}"

        processed_count = 0
        keep_count = 0
        reject_count = 0

        for img_name in files:
            if stop_event.is_set(): return False, "🛑 Process Terminated by User."
            pause_event.wait()
            
            img_path = os.path.join(in_dir, img_name)
            is_kept = False
            reason = ""

            try:
                if 'Aesthetic' in mode:
                    img_pil = Image.open(img_path).convert("RGB")
                    result = classifier(img_pil)
                    score = next(item['score'] for item in result if item['label'] == 'aesthetic')
                    is_kept = score >= threshold
                    reason = f"Aesthetic Score: {int(score * 100)}/100"
                
                elif 'VLM' in mode:
                    with open(img_path, "rb") as f:
                        b64 = base64.b64encode(f.read()).decode('utf-8')
                    
                    sys_prompt = cfg.get('vlm_prompt', "You are a strict QA bot. Analyze the image. Reply ONLY with valid JSON: {\"pass\": true, \"reason\": \"Looks good\"} or {\"pass\": false, \"reason\": \"Extra fingers\"}.")
                    
                    # Construct multi-image prompt
                    user_content = []
                    if ref_b64s:
                        user_content.append({"type": "text", "text": "Here are examples of GOOD, FLAWLESS images for reference:"})
                        for ref_b64 in ref_b64s:
                            user_content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{ref_b64}"}})
                        user_content.append({"type": "text", "text": "Now, closely evaluate this NEW target image against the standard of those examples:"})
                    else:
                        user_content.append({"type": "text", "text": "Inspect this image."})
                        
                    user_content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})

                    payload = {
                        "model": "local-model",
                        "messages": [
                            {"role": "system", "content": sys_prompt},
                            {"role": "user", "content": user_content}
                        ],
                        "temperature": 0.8, 
                        "max_tokens": 15000
                    }
                    
                    res = requests.post(vlm_url, json=payload).json()
                    raw_text = res.get('choices', [{}])[0].get('message', {}).get('content', '')
                    
                    json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
                    if json_match:
                        vlm_data = json.loads(json_match.group(0))
                        is_kept = vlm_data.get('pass', False)
                        reason = vlm_data.get('reason', raw_text.strip())
                    else:
                        is_kept = False
                        reason = "Failed to parse JSON."

            except Exception as e:
                is_kept = False
                reason = f"Error: {str(e)}"

            dest_folder = keep_dir if is_kept else reject_dir
            dest_path = os.path.join(dest_folder, img_name)
            
            if copy_mode: shutil.copy2(img_path, dest_path)
            else: shutil.move(img_path, dest_path)

            if is_kept: keep_count += 1
            else: reject_count += 1

            status_icon = "✅ KEEP" if is_kept else "❌ REJECT"
            callbacks['log'](f"{status_icon} | {img_name} | {reason}")
            
            processed_count += 1
            callbacks['progress'](processed_count, total_files)

        return True, f"Culling Complete! Kept: {keep_count} | Rejected: {reject_count}"