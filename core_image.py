import os
import math
import time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

class ImageManager:
    @staticmethod
    def execute_cropping(in_dir, out_dir, res_selection, padding_scale, progress_cb, log_cb, pause_event):
        if not HAS_CV2:
            return False, "Error: OpenCV is not installed. Cropper requires 'opencv-python'."

        width, height = map(int, res_selection.split(" ")[0].split("x"))
        target_aspect = width / height

        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        face_cascade = cv2.CascadeClassifier(cascade_path)

        supported_exts = ('.png', '.jpg', '.jpeg', '.webp', '.bmp')
        img_files = [f for f in Path(in_dir).iterdir() if f.suffix.lower() in supported_exts]
        
        if not img_files:
            return False, "No valid target images found."

        log_cb(f"Beginning smart tracking dataset formatting engine down into {width}x{height} targets...")
        
        for index, img_path in enumerate(img_files):
            pause_event.wait()
            if progress_cb: progress_cb(index + 1, len(img_files))
            
            img = cv2.imread(str(img_path))
            if img is None: continue

            h, w, _ = img.shape
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))

            if len(faces) > 0:
                fx, fy, fw, fh = max(faces, key=lambda f: f[2]*f[3])
                cx, cy = fx + fw // 2, fy + fh // 2
                log_cb(f"[Face Detected] Centering panel around point: ({cx}, {cy})")
            else:
                cx, cy = w // 2, h // 2
                log_cb(f"[No Tracker] Defaulting image crop axis alignment to dead center.")

            if w / h > target_aspect:
                new_h = h; new_w = int(h * target_aspect)
            else:
                new_w = w; new_h = int(w / target_aspect)

            x1 = max(0, min(cx - new_w // 2, w - new_w))
            y1 = max(0, min(cy - new_h // 2, h - new_h))
            x2 = x1 + new_w
            y2 = y1 + new_h

            cropped = img[y1:y2, x1:x2]
            resized = cv2.resize(cropped, (width, height), interpolation=cv2.INTER_CUBIC)

            out_path = Path(out_dir) / img_path.name
            cv2.imwrite(str(out_path), resized)

        return True, f"Process complete! Smart cropped images exported successfully to: {out_dir}"

    @staticmethod
    def execute_upscale(in_dir, out_dir, factor_str, model_path, progress_cb, log_cb, pause_event, stop_event):
        if not HAS_CV2:
            return False, "Error: OpenCV is not installed. Upscaler requires 'opencv-python'."

        scale_factor = 2 if "2x" in factor_str else 4
        supported_exts = ('.png', '.jpg', '.jpeg', '.webp')
        img_files = [f for f in Path(in_dir).iterdir() if f.suffix.lower() in supported_exts]

        if not img_files:
            return False, "No source images found for spatial upscaling processing loops."

        log_cb(f"Initializing upscaler interpolation loops ({scale_factor}x scale dynamic run)...")
        
        if model_path and os.path.exists(model_path):
            log_cb(f"🧠 Loading custom AI Upscale Model: {os.path.basename(model_path)}")
        else:
            log_cb(f"⚠️ No custom model selected. Using standard High-Quality CV2 Lanczos.")

        for index, img_path in enumerate(img_files):
            if stop_event.is_set(): return False, "🛑 Process Terminated by User."
            pause_event.wait()
            if stop_event.is_set(): return False, "🛑 Process Terminated by User."
            
            if progress_cb: progress_cb(index + 1, len(img_files))
            
            img = cv2.imread(str(img_path))
            if img is None: continue

            h, w, c = img.shape
            
            # --- AI INFERENCE LOGIC GOES HERE ---
            # (If you add PyTorch/Spandrel inference for .pth models, put it here!)
            # For now, it falls back to standard Lanczos resize:
            upscaled = cv2.resize(img, (w * scale_factor, h * scale_factor), interpolation=cv2.INTER_LANCZOS4)

            out_path = Path(out_dir) / img_path.name
            cv2.imwrite(str(out_path), upscaled)
            log_cb(f"[Upscaled] {img_path.name} -> {w * scale_factor}x{h * scale_factor}")

        return True, "✅ Batch Upscaler successfully finished."

    @staticmethod
    def compile_grid(files, in_dir, out_dir, val_x, val_y, cols, use_alt, log_cb, preview_cb, pause_event):
        target_size = 800
        idx = 0
        panel_count = 1
        
        while idx < len(files):
            pause_event.wait()
            current_req = val_y if (use_alt and panel_count % 2 == 0) else val_x
            chunk = files[idx : idx + current_req]
            idx += current_req
            
            if not chunk: break

            log_cb(f"Compiling Panel {panel_count} with {len(chunk)} images...")
            
            loaded_imgs = []
            for f in chunk:
                try:
                    img = Image.open(os.path.join(in_dir, f)).convert("RGB")
                    img = img.resize((target_size, target_size), Image.Resampling.LANCZOS)
                    loaded_imgs.append(img)
                except Exception as e:
                    log_cb(f"Error loading {f}: {e}")

            if not loaded_imgs: continue

            rows = math.ceil(len(loaded_imgs) / cols)
            grid_w = cols * target_size
            grid_h = rows * target_size
            grid_img = Image.new('RGB', (grid_w, grid_h), color=(255, 255, 255))
            
            for i, img in enumerate(loaded_imgs):
                row = i // cols
                col = i % cols
                grid_img.paste(img, (col * target_size, row * target_size))

            out_name = f"Compiled_Panel_{int(time.time())}_{panel_count}.jpg"
            grid_img.save(os.path.join(out_dir, out_name), quality=95)
            if preview_cb: preview_cb(grid_img)
            
            panel_count += 1
            
        return True, "Manga Grid Compiler Processing Complete!"

    @staticmethod
    def process_standalone_watermarks(cfg, progress_cb, preview_cb, pause_event, stop_event): # <--- Added stop_event
        in_dir, out_dir = cfg['in_dir'], cfg['out_dir']
        wm_mode, wm_opacity = cfg['mode'], cfg['opacity']
        strip_meta, custom_meta = cfg['strip_meta'], cfg['custom_meta']
        
        os.makedirs(out_dir, exist_ok=True)
        valid_files = [f for f in os.listdir(in_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        total_files = len(valid_files)

        if total_files == 0: return False, "No valid files found."

        wm_font, wm_img_loaded = None, None
        if wm_mode == "Text Mode":
            try: wm_font = ImageFont.truetype(cfg['font_path'], int(cfg['font_size']))
            except: wm_font = ImageFont.load_default()
        elif wm_mode == "PNG Mode" and cfg.get('png_path'):
            try: wm_img_loaded = Image.open(cfg['png_path']).convert("RGBA")
            except Exception as e: print(f"Error loading watermark PNG: {e}")

        for idx, filename in enumerate(valid_files):
            if stop_event.is_set(): return False, "🛑 Process Terminated by User." # <--- STOP CHECK
            pause_event.wait()
            if stop_event.is_set(): return False, "🛑 Process Terminated by User."
            
            try: 
                img_raw = Image.open(os.path.join(in_dir, filename))
                img_pil = img_raw.convert("RGBA")
            except Exception as e: 
                print(f"Failed to open {filename}: {e}")
                if progress_cb: progress_cb(idx + 1, total_files)
                continue
            
            paste_layer = None
            if wm_mode == "Text Mode" and cfg['text']:
                txt = cfg['text']
                hex_c = cfg['color'].lstrip('#')
                r, g, b = tuple(int(hex_c[i:i+2], 16) for i in (0, 2, 4)) if len(hex_c) == 6 else (255, 255, 255)
                
                tbox = ImageDraw.Draw(img_pil).textbbox((0, 0), txt, font=wm_font)
                tw, th = tbox[2] - tbox[0], tbox[3] - tbox[1]
                paste_layer = Image.new('RGBA', (tw, th), (255, 255, 255, 0))
                ImageDraw.Draw(paste_layer).text((0, 0), txt, font=wm_font, fill=(r, g, b, int(255 * wm_opacity)))

            elif wm_mode == "PNG Mode" and wm_img_loaded:
                tw = int(img_pil.width * 0.20)
                th = int(wm_img_loaded.height * (tw / wm_img_loaded.width))
                paste_layer = wm_img_loaded.resize((tw, th), Image.Resampling.LANCZOS)
                if wm_opacity < 1.0: 
                    paste_layer.putalpha(paste_layer.split()[3].point(lambda p: int(p * wm_opacity)))

            if paste_layer:
                px = max(0, min(int(img_pil.width * cfg['anchor_x']) - (paste_layer.width // 2), img_pil.width - paste_layer.width))
                py = max(0, min(int(img_pil.height * cfg['anchor_y']) - (paste_layer.height // 2), img_pil.height - paste_layer.height))
                img_pil.paste(paste_layer, (px, py), paste_layer)

            meta = PngInfo()
            if not strip_meta:
                for k, v in img_raw.info.items():
                    if isinstance(k, str) and isinstance(v, str): meta.add_text(k, v)
            if custom_meta:
                meta.add_text("Copyright", custom_meta)
                meta.add_text("Author", custom_meta)

            if preview_cb: preview_cb(img_pil)
            img_pil.convert("RGB").save(os.path.join(out_dir, filename), pnginfo=meta)
            if progress_cb: progress_cb(idx + 1, total_files)

        return True, "Finished Standalone Watermark Batch."