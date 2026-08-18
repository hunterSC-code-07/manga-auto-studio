import os
import shutil
import random
import datetime
from pathlib import Path

class PackagerManager:
    @staticmethod
    def get_date_prefix():
        now = datetime.datetime.now()
        day = now.day
        suffix = 'th' if 11 <= day <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(day % 10, 'th')
        return f"{day}{suffix} {now.strftime('%B')}"

    @staticmethod
    def scan_directory(directory):
        if not os.path.isdir(directory):
            return False, "Invalid directory.", 0, []
        
        valid_exts = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
        images = [f for f in os.listdir(directory) if os.path.splitext(f)[1].lower() in valid_exts]
        return True, "Scan complete.", len(images), images

    @staticmethod
    def process_packaging(cfg, callbacks, pause_event, stop_event):
        source_dir = cfg['source_dir']
        out_dir = cfg['out_dir'] or source_dir
        mode = cfg['mode'] # 'Copy' or 'Move'
        allocations = cfg['allocations'] # dict: {platform: [(folder_name, count)]}
        
        success, msg, total_imgs, image_list = PackagerManager.scan_directory(source_dir)
        if not success or total_imgs == 0:
            return False, "No valid images found in the source directory."

        # Verify math
        total_requested = sum(count for platform in allocations.values() for name, count in platform)
        if total_requested > total_imgs:
            return False, f"Math Error: Requested {total_requested} images, but only {total_imgs} are available."

        date_prefix = PackagerManager.get_date_prefix()
        
        # Determine Base Folders & handle collisions
        def get_safe_path(base_path):
            counter = 1
            safe_path = base_path
            while os.path.exists(safe_path):
                safe_path = f"{base_path} (Run {counter})"
                counter += 1
            return safe_path

        # Randomize uniqueness!
        random.shuffle(image_list)
        
        processed_count = 0
        total_to_process = total_imgs # Include leftovers in total workload
        
        for platform, tiers in allocations.items():
            if stop_event.is_set(): return False, "Process Terminated."
            
            # Skip platform if no images requested
            if sum(count for name, count in tiers) == 0:
                continue
                
            base_folder = get_safe_path(os.path.join(out_dir, f"{date_prefix}_{platform}"))
            os.makedirs(base_folder, exist_ok=True)
            
            for tier_name, count in tiers:
                if count == 0: continue
                tier_folder = os.path.join(base_folder, tier_name)
                os.makedirs(tier_folder, exist_ok=True)
                
                # Pop unique images from our randomized list
                tier_images = [image_list.pop() for _ in range(count)]
                
                for img in tier_images:
                    if stop_event.is_set(): return False, "Process Terminated."
                    pause_event.wait()
                    
                    src_path = os.path.join(source_dir, img)
                    dst_path = os.path.join(tier_folder, img)
                    
                    if mode == "Copy Mode": shutil.copy2(src_path, dst_path)
                    else: shutil.move(src_path, dst_path)
                    
                    processed_count += 1
                    callbacks['progress'](processed_count, total_to_process)
                
                # Create Zip safely outside, then move inside
                callbacks['log'](f"Zipping {platform} -> {tier_name}...")
                zip_name = f"{tier_name}_{platform}"
                temp_zip_path = os.path.join(out_dir, f"temp_{zip_name}")
                shutil.make_archive(base_name=temp_zip_path, format='zip', root_dir=tier_folder)
                shutil.move(f"{temp_zip_path}.zip", os.path.join(tier_folder, f"{zip_name}.zip"))

        # Leftovers
        if len(image_list) > 0:
            leftover_folder = get_safe_path(os.path.join(out_dir, f"Leftover {date_prefix}"))
            os.makedirs(leftover_folder, exist_ok=True)
            callbacks['log'](f"Moving {len(image_list)} leftover images to {leftover_folder}...")
            
            for img in image_list:
                if stop_event.is_set(): return False, "Process Terminated."
                pause_event.wait()
                src_path = os.path.join(source_dir, img)
                dst_path = os.path.join(leftover_folder, img)
                if mode == "Copy Mode": shutil.copy2(src_path, dst_path)
                else: shutil.move(src_path, dst_path)
                processed_count += 1
                callbacks['progress'](processed_count, total_to_process)

        return True, "✅ Tiered Packaging Complete! All zip files generated and files distributed."