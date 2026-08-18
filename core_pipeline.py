import os
import textwrap
import random
import math
import sys
import json
import re
import base64
import requests
import concurrent.futures
import threading
from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo
import numpy as np

try:
    from ultralytics import YOLO
    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

class PipelineManager:
    
    @staticmethod
    def get_font(path, size):
        try: return ImageFont.truetype(path, size)
        except OSError:
            try: return ImageFont.truetype("arial.ttf", size)
            except OSError: return ImageFont.load_default()

    @staticmethod
    def draw_bubble(draw, wrapped_text, font, pad_x, pad_y, face_cx, y1, y2, img_width, img_height, drawn_bubbles, edge_map, tail_len, tail_thick, autofit):
        c_font_size = font.size
        c_font = font
        text_bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=c_font)
        bubble_w = int((text_bbox[2] - text_bbox[0]) + (pad_x * 2))
        bubble_h = int((text_bbox[3] - text_bbox[1]) + (pad_y * 2))
        
        if autofit:
            while (bubble_w > img_width - 40 or bubble_h > img_height - 40) and c_font_size > 12:
                c_font_size -= 2
                c_font = PipelineManager.get_font(font.path if hasattr(font, 'path') else "arial.ttf", c_font_size)
                text_bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=c_font)
                bubble_w = int((text_bbox[2] - text_bbox[0]) + (pad_x * 2))
                bubble_h = int((text_bbox[3] - text_bbox[1]) + (pad_y * 2))

        bubble_y = max(10, int(y1) - (bubble_h // 2))
        if face_cx > (img_width / 2):
            bubble_x = max(10, int(face_cx) - bubble_w - 60)
        else:
            bubble_x = min(img_width - bubble_w - 10, int(face_cx) + 60)

        for _ in range(15): 
            collision = False
            for (dx1, dy1, dx2, dy2) in drawn_bubbles:
                if (bubble_x < dx2 + 15 and bubble_x + bubble_w + 15 > dx1 and 
                    bubble_y < dy2 + 15 and bubble_y + bubble_h + 15 > dy1):
                    collision = True
                    bubble_y = dy2 + 20 
            
            if not collision and edge_map is not None:
                by_min, by_max = max(0, int(bubble_y)), min(edge_map.shape[0], int(bubble_y+bubble_h))
                bx_min, bx_max = max(0, int(bubble_x)), min(edge_map.shape[1], int(bubble_x+bubble_w))
                if by_max > by_min and bx_max > bx_min:
                    edge_crop = edge_map[by_min:by_max, bx_min:bx_max]
                    density = np.sum(edge_crop) / ((by_max-by_min) * (bx_max-bx_min) * 255)
                    if density > 0.08:  
                        collision = True
                        bubble_y += 20
            if not collision: break
        
        bubble_y = min(bubble_y, img_height - bubble_h - 10)
        drawn_bubbles.append((bubble_x, bubble_y, bubble_x + bubble_w, bubble_y + bubble_h))
        
        bubble_cx = bubble_x + (bubble_w / 2)
        bubble_cy = bubble_y + (bubble_h / 2)
        target_x = face_cx
        target_y = y1 + ((y2 - y1) * 0.2)
        angle = math.atan2(target_y - bubble_cy, target_x - bubble_cx)

        rx, ry = bubble_w / 2, bubble_h / 2
        edge_dist = (rx * ry) / math.sqrt((ry * math.cos(angle))**2 + (rx * math.sin(angle))**2)

        tip_dist = edge_dist + tail_len
        tip_x = bubble_cx + (tip_dist * math.cos(angle))
        tip_y = bubble_cy + (tip_dist * math.sin(angle))

        base1_x = bubble_cx + (rx * math.cos(angle - tail_thick))
        base1_y = bubble_cy + (ry * math.sin(angle - tail_thick))
        base2_x = bubble_cx + (rx * math.cos(angle + tail_thick))
        base2_y = bubble_cy + (ry * math.sin(angle + tail_thick))

        # --- 🌟 NEW: BEZIER CURVE MANGA TAIL LOGIC 🌟 ---
        def make_bezier(p0, p1, p2, steps=20):
            return [
                (
                    (1-t/steps)**2 * p0[0] + 2*(1-t/steps)*(t/steps) * p1[0] + (t/steps)**2 * p2[0],
                    (1-t/steps)**2 * p0[1] + 2*(1-t/steps)*(t/steps) * p1[1] + (t/steps)**2 * p2[1]
                ) for t in range(steps + 1)
            ]

        # Calculate a control point to give the tail a nice "swoop"
        dir_x, dir_y = tip_x - bubble_cx, tip_y - bubble_cy
        perp_x, perp_y = -dir_y, dir_x
        length = math.hypot(perp_x, perp_y)
        if length != 0:
            perp_x, perp_y = perp_x / length, perp_y / length
        
        # The bend intensity (40% of the tail length)
        bend_amount = tail_len * 0.4
        control_x = bubble_cx + (dir_x * 0.5) + (perp_x * bend_amount)
        control_y = bubble_cy + (dir_y * 0.5) + (perp_y * bend_amount)

        # Generate the smooth outer polygon for the black outline
        outer_curve = make_bezier((base1_x, base1_y), (control_x, control_y), (tip_x, tip_y)) + \
                      make_bezier((tip_x, tip_y), (control_x, control_y), (base2_x, base2_y))[1:]

        # Pull the white inner tip back slightly so the border thickness is maintained
        inner_tip_x = tip_x - (6 * math.cos(angle))
        inner_tip_y = tip_y - (6 * math.sin(angle))
        
        # Generate the smooth inner polygon for the white fill
        inner_curve = make_bezier((base1_x, base1_y), (control_x, control_y), (inner_tip_x, inner_tip_y)) + \
                      make_bezier((inner_tip_x, inner_tip_y), (control_x, control_y), (base2_x, base2_y))[1:]

        # Draw the Outer Shape (Black)
        draw.polygon(outer_curve, fill=(0,0,0,255))
        draw.ellipse([bubble_x, bubble_y, bubble_x + bubble_w, bubble_y + bubble_h], fill=(0,0,0,255))
        
        # Draw the Inner Shape (White)
        draw.polygon(inner_curve, fill=(255,255,255,255))
        draw.ellipse([bubble_x + 4, bubble_y + 4, bubble_x + bubble_w - 4, bubble_y + bubble_h - 4], fill=(255,255,255,255))
        
        # Draw the Text
        draw.multiline_text((bubble_x + pad_x, bubble_y + pad_y), wrapped_text, fill=(0,0,0,255), font=c_font, align="center")

    @staticmethod
    def apply_watermark(img_pil, cfg):
        wm_mode = cfg.get('wm_mode')
        wm_opacity = cfg.get('wm_opacity', 1.0)
        paste_layer = None
        
        if wm_mode == "Text Mode" and cfg.get('wm_text'):
            txt = cfg['wm_text']
            hex_c = cfg['wm_color'].lstrip('#')
            r, g, b = tuple(int(hex_c[i:i+2], 16) for i in (0, 2, 4)) if len(hex_c) == 6 else (255, 255, 255)
            wm_font = PipelineManager.get_font(cfg.get('wm_font', ''), cfg.get('wm_size', 32))
            tbox = ImageDraw.Draw(img_pil).textbbox((0, 0), txt, font=wm_font)
            tw, th = tbox[2] - tbox[0], tbox[3] - tbox[1]
            paste_layer = Image.new('RGBA', (tw, th), (255, 255, 255, 0))
            ImageDraw.Draw(paste_layer).text((0, 0), txt, font=wm_font, fill=(r, g, b, int(255 * wm_opacity)))

        elif wm_mode == "PNG Mode" and cfg.get('wm_png'):
            try:
                wm_img_loaded = Image.open(cfg['wm_png']).convert("RGBA")
                tw = int(img_pil.width * 0.20)
                th = int(wm_img_loaded.height * (tw / wm_img_loaded.width))
                paste_layer = wm_img_loaded.resize((tw, th), Image.Resampling.LANCZOS)
                if wm_opacity < 1.0: 
                    paste_layer.putalpha(paste_layer.split()[3].point(lambda p: int(p * wm_opacity)))
            except Exception as e:
                print(f"Watermark PNG Error: {e}")

        if paste_layer:
            px = max(0, min(int(img_pil.width * cfg.get('wm_ax', 0.95)) - (paste_layer.width // 2), img_pil.width - paste_layer.width))
            py = max(0, min(int(img_pil.height * cfg.get('wm_ay', 0.95)) - (paste_layer.height // 2), img_pil.height - paste_layer.height))
            img_pil.paste(paste_layer, (px, py), paste_layer)
            
        return img_pil

    @staticmethod
    def process_standard_batch(cfg, callbacks, pause_event, stop_event, mode="single"):
        if not HAS_YOLO:
            return False, "Error: 'ultralytics' (YOLO) is not installed."

        in_dir, out_dir = cfg['in_dir'], cfg['out_dir']
        os.makedirs(out_dir, exist_ok=True)
        if cfg['needs_review']: os.makedirs(os.path.join(out_dir, "Needs_Review"), exist_ok=True)

        try: model = YOLO(cfg['model_path'])
        except Exception as e: return False, f"Model Error: {e}"

        base_font = PipelineManager.get_font(cfg['font_path'], cfg['font_size'])
        all_files = [f for f in os.listdir(in_dir) if f.lower().endswith('.png')]
        
        # --- NEW: OVERWRITE VS RESUME LOGIC ---
        if cfg.get('overwrite', False):
            valid_files = all_files
        else:
            valid_files = [f for f in all_files if not os.path.exists(os.path.join(out_dir, f))]
        
        if not valid_files: return False, "No valid unprocessed files found."

        yolo_lock = threading.Lock()
        count_lock = threading.Lock()
        processed_count = 0
        total_files = len(valid_files)

        def worker(filename):
            if stop_event.is_set(): return # --- NEW: STOP CHECK ---
            pause_event.wait()
            if stop_event.is_set(): return # --- NEW: STOP CHECK ---
            
            # ... (Rest of your worker code stays exactly the same)
            nonlocal processed_count
            img_path = os.path.join(in_dir, filename)
            nonlocal processed_count
            img_path = os.path.join(in_dir, filename)
            try:
                img_raw = Image.open(img_path)
                img_metadata = str(img_raw.info).lower()
                img_pil = img_raw.convert("RGBA")
                draw = ImageDraw.Draw(img_pil)
                
                edge_map = None
                if cfg['safe_zones'] and HAS_CV2:
                    open_cv_image = np.array(img_pil.convert('RGB'))[:, :, ::-1].copy()
                    gray = cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY)
                    edge_map = cv2.Canny(gray, 50, 150)
            except Exception as e:
                callbacks['log'](f"Error opening {filename}: {e}")
                return

            callbacks['log'](f"\nAnalyzing {filename}...")
            with yolo_lock:
                results = model(img_path, conf=cfg['conf'], verbose=False)
                
            face_boxes = [box for box in results[0].boxes if int(box.cls[0]) == 0]

            if not face_boxes and cfg['needs_review']:
                img_raw.save(os.path.join(out_dir, "Needs_Review", filename))
                with count_lock: processed_count += 1
                callbacks['progress'](processed_count, total_files)
                return

            faces_to_process = []
            if mode == "single":
                if face_boxes:
                    faces_to_process.append((sorted(face_boxes, key=lambda x: x.xyxy[0][1].item())[0], "top"))
            elif mode == "dual":
                if len(face_boxes) >= 2:
                    sorted_faces = sorted(face_boxes, key=lambda x: x.xyxy[0][1].item())
                    faces_to_process = [(sorted_faces[0], "top"), (sorted_faces[-1], "bot")]
                elif len(face_boxes) == 1:
                    faces_to_process = [(face_boxes[0], "top")]

            drawn_bubbles = []
            for face_box, pos in faces_to_process:
                sel_file = cfg['default_file']
                if pos == "top":
                    for trigger, target_file in cfg['mappings'].items():
                        if trigger in img_metadata: sel_file = target_file; break
                else:
                    sel_file = cfg.get('char2_file', sel_file)

                options = cfg['wildcards'].get(sel_file, ["..."])
                wrapped_text = textwrap.fill(random.choice(options), width=15)

                x1, y1, x2, y2 = face_box.xyxy[0].tolist()
                face_cx = (x1 + x2) / 2

                PipelineManager.draw_bubble(draw, wrapped_text, base_font, cfg['pad_x'], cfg['pad_y'], 
                                            face_cx, y1, y2, img_pil.width, img_pil.height, 
                                            drawn_bubbles, edge_map, cfg['tail_len'], cfg['tail_thick'], cfg['autofit'])

            if cfg.get('wm_enabled'):
                img_pil = PipelineManager.apply_watermark(img_pil, cfg)

            callbacks['preview'](img_pil)
            
            meta = PngInfo()
            if not cfg['strip_meta']:
                for k, v in img_raw.info.items():
                    if isinstance(k, str) and isinstance(v, str): meta.add_text(k, v)
            if cfg['custom_meta']:
                meta.add_text("Copyright", cfg['custom_meta'])

            img_pil.convert("RGB").save(os.path.join(out_dir, filename), pnginfo=meta)
            
            with count_lock: processed_count += 1
            callbacks['progress'](processed_count, total_files)

        if cfg['multicore']:
            with concurrent.futures.ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as executor:
                executor.map(worker, valid_files)
        else:
            for f in valid_files: worker(f)

        return True, "Batch Processing Complete!"

    @staticmethod
    def process_vlm_batch(cfg, callbacks, pause_event, stop_event):
        if not HAS_YOLO:
            return False, "Error: 'ultralytics' (YOLO) is not installed."

        in_dir, out_dir = cfg['in_dir'], cfg['out_dir']
        os.makedirs(out_dir, exist_ok=True)
        
        try: model = YOLO(cfg['model_path']) 
        except Exception as e: return False, f"Error loading YOLO: {e}"
            
        base_font = PipelineManager.get_font(cfg['font_path'], cfg['font_size'])
        all_files = sorted([f for f in os.listdir(in_dir) if f.lower().endswith(('.png', '.jpg'))])
        
        # --- NEW: OVERWRITE VS RESUME LOGIC ---
        if cfg.get('overwrite', False):
            valid_files = all_files
        else:
            valid_files = [f for f in all_files if not os.path.exists(os.path.join(out_dir, f))]

        if not valid_files: return False, "No new images found to process. (Or uncheck 'Resume' to overwrite)."

        total_files = len(valid_files)
        running_story_context = []

        for i, filename in enumerate(valid_files):
            if stop_event.is_set(): # --- NEW: STOP CHECK ---
                callbacks['log']("🛑 Process Terminated by User.")
                break
                
            pause_event.wait()
            if stop_event.is_set(): break
            
            # ... (Rest of the loop stays exactly the same)
            img_path = os.path.join(in_dir, filename)
            callbacks['log'](f"\n[{i+1}/{total_files}] Connecting to VLM for {filename}...")

            try:
                img_raw = Image.open(img_path)
                img_info = img_raw.info
                img_pil = img_raw.convert("RGBA")
                draw = ImageDraw.Draw(img_pil)
                edge_map = None
                if cfg['safe_zones'] and HAS_CV2:
                    open_cv_image = np.array(img_pil.convert('RGB'))[:, :, ::-1].copy()
                    edge_map = cv2.Canny(cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY), 50, 150)
            except Exception as e:
                callbacks['log'](f"Error opening image: {e}"); continue

            with open(img_path, "rb") as img_file:
                b64_img = base64.b64encode(img_file.read()).decode('utf-8')

            extracted_names = ""
            if cfg['use_smart_extract']:
                matches = re.findall(r'(?:woman|man|girl|boy|character)\s+is\s+([a-zA-Z0-9\s]+?)(?:\s+and|\s*,|\.|$)', str(img_info), re.IGNORECASE)
                valid_names = [m.strip().title() for m in matches if len(m.strip()) > 1]
                if valid_names: extracted_names = f"\n\nCRITICAL CONTEXT: The metadata identifies characters as: {', '.join(valid_names)}."

            meta_context = ""
            if cfg['use_full_meta']:
                meta_data = img_info.get("parameters", img_info.get("prompt", str(img_info)[:2500]))
                meta_context = f"\n\nIMAGE CONCEPT DATA: {str(meta_data)[:2500]}"
            
            story_memory = ""
            ext_mem = ""
            if cfg.get('use_memory', True):
                story_memory = "\n\nSTORY SO FAR:\n" + "\n".join(running_story_context[-4:]) if running_story_context else ""
                user_memory = cfg['external_memory']
                ext_mem = f"\n\nGLOBAL STORY CONTEXT: {user_memory}" if user_memory else ""

            try:
                # ==========================================
                # 2-STEP AGENTIC CHAINING
                # ==========================================
                if cfg.get('dual_agent'):
                    vlm_user_prompt = f"Describe the characters, their expressions, and the action happening in this scene in explicit detail.{meta_context}{extracted_names}"
                    vlm_payload = {
                        "model": "local-model",
                        "messages": [
                            {"role": "system", "content": cfg['sys_prompt']},
                            {"role": "user", "content": [
                                {"type": "text", "text": vlm_user_prompt},
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}}
                            ]}
                        ],
                        "temperature": cfg['temp'], "max_tokens": cfg['tokens']
                    }
                    callbacks['log']("-> Agent 1 (VLM) is analyzing the image...")
                    v1_resp = requests.post(cfg['api_url'], json=vlm_payload).json()
                    scene_description = v1_resp.get("choices", [{}])[0].get("message", {}).get("content", "")
                    callbacks['log'](f"-> Vision Report: {scene_description}")
                    
                    user_prompt_text = f"Based on this scene description: '{scene_description}', generate JSON dialogue for Character A and B.{meta_context}{extracted_names}{story_memory}{ext_mem}"
                    llm_payload = {
                        "model": "local-model",
                        "messages": [
                            {"role": "system", "content": cfg.get('llm_sys_prompt', cfg['sys_prompt'])},
                            {"role": "user", "content": user_prompt_text} 
                        ],
                        "temperature": cfg['temp'], "max_tokens": cfg['tokens']
                    }
                    callbacks['log']("-> Agent 2 (LLM) is writing the script...")
                    response = requests.post(cfg['llm_url'], json=llm_payload)
                
                # ==========================================
                # STANDARD SINGLE VLM (Pure Fallback)
                # ==========================================
                else:
                    user_prompt_text = f"Analyze this image and generate dialogue for Character A (Top) and Character B (Bottom) that logically continues the narrative.{meta_context}{extracted_names}{story_memory}{ext_mem}"
                    payload = {
                        "model": "local-model",
                        "messages": [
                            {"role": "system", "content": cfg.get('fallback_prompt', cfg['sys_prompt'])},
                            {"role": "user", "content": [{"type": "text", "text": user_prompt_text}, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}}]}
                        ],
                        "temperature": cfg['temp'], "max_tokens": cfg['tokens']
                    }
                    response = requests.post(cfg['api_url'], json=payload)

                # --- Pure JSON Parsing ---
                if response.status_code != 200:
                    callbacks['log'](f"❌ API Error {response.status_code}: {response.text}")
                    continue
                    
                response_data = response.json()
                raw_response = response_data.get("choices", [{}])[0].get("message", {}).get("content", "")
                
                if not raw_response or not str(raw_response).strip():
                    callbacks['log'](f"❌ API returned an empty string. Raw Output: {response_data}")
                    continue

                json_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
                clean_json_str = json_match.group(0) if json_match else raw_response.strip()
                clean_json_str = re.sub(r'```json\s*|\s*```', '', clean_json_str).strip()
                
                try:
                    vlm_data = json.loads(clean_json_str)
                except json.JSONDecodeError:
                    callbacks['log']("⚠️ AI failed to format JSON. Attempting raw text recovery...")
                    vlm_data = {"char_a": raw_response.strip(), "char_b": "..."}
                
                # Pure extraction (No dict checking needed anymore)
                char_a = str(vlm_data.get("char_a", "...")).strip()
                char_b = str(vlm_data.get("char_b", "...")).strip()

                callbacks['log'](f"Script Success! Char A: '{char_a}' | Char B: '{char_b}'")
                
                new_entry = f"Panel {i+1} -> Top: '{char_a}' | Bottom: '{char_b}'"
                running_story_context.append(new_entry)
                callbacks['memory'](new_entry)
                
            except Exception as e:
                callbacks['log'](f"VLM critical pipeline failure: {e}")
                continue 

            results = model(img_path, conf=cfg['conf'], verbose=False)
            face_boxes = [box for box in results[0].boxes if int(box.cls[0]) == 0]

            faces_to_process = []
            if len(face_boxes) >= 2:
                sorted_faces = sorted(face_boxes, key=lambda x: x.xyxy[0][1].item())
                faces_to_process = [(sorted_faces[0], char_a), (sorted_faces[-1], char_b)]
            elif len(face_boxes) == 1:
                faces_to_process = [(face_boxes[0], char_a)]

            drawn_bubbles = [] 
            for face_box, raw_text in faces_to_process:
                wrapped_text = textwrap.fill(str(raw_text), width=15) 
                
                x1, y1, x2, y2 = face_box.xyxy[0].tolist()
                face_cx = (x1 + x2) / 2

                PipelineManager.draw_bubble(draw, wrapped_text, base_font, cfg['pad_x'], cfg['pad_y'], 
                                            face_cx, y1, y2, img_pil.width, img_pil.height, 
                                            drawn_bubbles, edge_map, cfg['tail_len'], cfg['tail_thick'], cfg['autofit'])

            callbacks['preview'](img_pil)
            img_pil.convert("RGB").save(os.path.join(out_dir, filename))
            callbacks['progress'](i+1, total_files)

        return True, "Finished VLM Batch!"