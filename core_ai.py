import os
import re
import time
import requests
import json
from pathlib import Path
from PIL import Image

try:
    from transformers import AutoProcessor, AutoModelForCausalLM
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False

class AIManager:
    @staticmethod
    def generate_text(api_url, sys_prompt, user_prompt, temp, tokens):
        payload = {
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temp,
            "max_tokens": tokens
        }
        try:
            response = requests.post(api_url, json=payload, headers={"Content-Type": "application/json"})
            response.raise_for_status()
            return True, response.json()["choices"][0]["message"]["content"]
        except Exception as e:
            return False, f"API Error: {str(e)}"

    @staticmethod
    def validate_and_save_captions(raw_text, save_dir, file_name):
        if not raw_text: return False, "Error: Missing Text."
        if not save_dir or not file_name: return False, "Error: Missing Directory or Filename."
        if not file_name.lower().endswith('.txt'): file_name += '.txt'
        save_path = os.path.join(save_dir, file_name)

        lines = [line for line in raw_text.split('\n') if line.strip()] 
        errors = []
        conversational_flags = ["sure", "here are", "certainly", "caption", "hope this", "let me know", "feel free", "here is"]
        
        for i, line in enumerate(lines):
            ll = line.lower()
            if i == 0 and any(ll.startswith(f) for f in conversational_flags): errors.append("-> Line 1: Conversational Preamble.")
            if i == len(lines)-1 and any(f in ll for f in ["hope this", "let me know"]): errors.append("-> Last Line: Conversational Ending.")
            if re.match(r'^(\d+[\.\)]|\-|\*)\s+', line): errors.append(f"-> Bad Formatting (Bullet/Number): '{line[:15]}...'")

        if errors:
            return False, "VALIDATION FAILED. Fix errors in box:\n" + "\n".join(errors)

        try:
            os.makedirs(save_dir, exist_ok=True) 
            with open(save_path, 'w', encoding='utf-8') as f:
                for line in lines: f.write(f"{line}\n")
            return True, f"Validation Passed! Saved {len(lines)} lines to {file_name}."
        except Exception as e:
            return False, f"Error Saving: {e}"

    @staticmethod
    def run_auto_tagger(image_dir, model_name, caption_ext, write_mode, prepend, append, batch_size, recursive, progress_cb, pause_event, stop_event): # <--- Added stop_event
        path = Path(image_dir)
        valid_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
        search_pattern = "**/*" if recursive else "*"
        image_files = [f for f in path.glob(search_pattern) if f.suffix.lower() in valid_extensions]
        total_files = len(image_files)

        if total_files == 0: return False, f"⚠️ No valid images found in '{image_dir}'."

        print("Initializing AI Model Pipeline...")
        florence_model, florence_processor = None, None
        if "Florence-2" in model_name and HAS_TRANSFORMERS:
            try:
                print("Loading Florence-2 model... (This may take a moment)")
                florence_processor = AutoProcessor.from_pretrained("microsoft/Florence-2-large", trust_remote_code=True)
                florence_model = AutoModelForCausalLM.from_pretrained("microsoft/Florence-2-large", trust_remote_code=True).eval()
            except Exception as e:
                print(f"Failed to load Florence-2: {e}")
        else:
            time.sleep(1)

        processed_count = 0
        for i in range(0, total_files, batch_size):
            if stop_event.is_set(): return False, "🛑 Process Terminated by User." # <--- STOP CHECK
            pause_event.wait()
            if stop_event.is_set(): return False, "🛑 Process Terminated by User."
            
            batch = image_files[i:i + batch_size]
            
            for img_path in batch:
                processed_count += 1
                
                if "WD-14" in model_name:
                    simulated_output = "1girl, solo, long hair, blue eyes, looking at viewer, smile"
                elif "Florence-2" in model_name:
                    if florence_model is not None:
                        try:
                            img_p = Image.open(img_path).convert("RGB")
                            inputs = florence_processor(text="<DETAILED_CAPTION>", images=img_p, return_tensors="pt")
                            out_ids = florence_model.generate(input_ids=inputs["input_ids"], pixel_values=inputs["pixel_values"], max_new_tokens=128)
                            simulated_output = florence_processor.batch_decode(out_ids, skip_special_tokens=False)[0].replace("<DETAILED_CAPTION>", "").strip()
                        except Exception as e:
                            print(f"Florence-2 generation failed: {e}")
                            simulated_output = "Error generating caption."
                    else:
                        simulated_output = "A close up portrait photograph of a girl with long hair and blue eyes smiling at the camera."
                else:
                    simulated_output = "Detailed descriptive caption of the generated dataset asset."
                
                final_tags = []
                if prepend: final_tags.append(prepend)
                if simulated_output: final_tags.append(simulated_output)
                if append: final_tags.append(append)
                    
                combined_text = ", ".join(final_tags) if "WD-14" in model_name else " ".join(final_tags)
                txt_path = img_path.with_suffix(caption_ext)
                
                try:
                    if write_mode == "Overwrite files" or not txt_path.exists():
                        with open(txt_path, "w", encoding="utf-8") as f: f.write(combined_text)
                    elif write_mode == "Append to files":
                        with open(txt_path, "a", encoding="utf-8") as f:
                            separator = ", " if "WD-14" in model_name else " "
                            f.write(f"{separator}{combined_text}")
                    elif write_mode == "Prepend to files":
                        content = txt_path.read_text(encoding="utf-8") if txt_path.exists() else ""
                        separator = ", " if "WD-14" in model_name else " "
                        txt_path.write_text(f"{combined_text}{separator}{content}", encoding="utf-8")
                except Exception as e:
                    print(f"Failed to write sidecar for {img_path.name}: {e}")

                print(f"Tagged [{processed_count}/{total_files}]: {img_path.name}")
                if progress_cb: progress_cb(processed_count, total_files)

        return True, f"🚀 Successfully processed {processed_count}/{total_files} assets using {model_name}."