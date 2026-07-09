import torch
import torch.nn.functional as F
import numpy as np
import os
import glob
import matplotlib.pyplot as plt
from monai.networks.nets import UNet
from monai.inferers import sliding_window_inference
from monai.transforms import (
    Compose, LoadImage, EnsureChannelFirst, 
    ScaleIntensityRange, ToTensor, Spacing, Orientation
)
from matplotlib.colors import ListedColormap

# =========================================================================
# НАСТРОЙКА ПАПОК
# =========================================================================
OUTPUT_DIR = r"C:\Users\G\Desktop\hepatoguard-ai\frontend\public\reconstructions"
os.makedirs(OUTPUT_DIR, exist_ok=True)

data_dir = r"C:\Users\G\.cache\kagglehub\datasets\andrewmvd\liver-tumor-segmentation\versions\5"
if not os.path.exists(data_dir):
    data_dir = r"C:\Users\G\Desktop\liver_tumor"

# Находим все снимки
all_volumes = glob.glob(os.path.join(data_dir, "**", "volume-*.nii"), recursive=True)
data_dicts = []
for vol_path in all_volumes:
    file_name = os.path.basename(vol_path)
    file_num = "".join(filter(str.isdigit, file_name))
    seg_path = os.path.join(data_dir, "segmentations", f"segmentation-{file_num}.nii")
    if os.path.exists(seg_path):
        data_dicts.append({"image": vol_path, "label": seg_path, "id": int(file_num)})

# Сортируем по ID
data_dicts.sort(key=lambda x: x["id"])

# 2. ЗАГРУЗКА МОДЕЛИ v300
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = UNet(
    spatial_dims=3, in_channels=1, out_channels=3,
    channels=(32, 64, 128, 256, 512), strides=(2, 2, 2, 2), num_res_units=2,
).to(device)

MODEL_PATH = "liver_pro_v300.pth"
model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
model.eval()

# Препроцессинг КТ
pre_process_img = Compose([
    EnsureChannelFirst(), Orientation(axcodes="RAS"),
    Spacing(pixdim=(1.5, 1.5, 2.0), mode="bilinear"),
    ScaleIntensityRange(a_min=-175, a_max=250, b_min=0.0, b_max=1.0, clip=True),
    ToTensor()
])

# Препроцессинг разметки врача (приводим к той же сетке Spacing!)
pre_process_lbl = Compose([
    EnsureChannelFirst(), Orientation(axcodes="RAS"),
    Spacing(pixdim=(1.5, 1.5, 2.0), mode="nearest"), # nearest для меток классов
    ToTensor()
])

# Медицинские цвета
cmap_liver = ListedColormap(['#2ecc71']) # Зеленый
cmap_tumor = ListedColormap(['#e74c3c']) # Красный

print("Старт пакетного экспорта дашбордов сравнения 2D КТ...")
print(f"Все изображения будут сохранены в: {OUTPUT_DIR}\n")

with torch.no_grad():
    for idx, item in enumerate(data_dicts):
        p_id = item["id"]
        img_path = item["image"]
        lbl_path = item["label"]
        print(f"[{idx+1}/{len(data_dicts)}] Генерация дашборда для пациента №{p_id:02d}...")
        
        # Загрузка и приведение к единой координатной сетке
        loader = LoadImage(image_only=True)
        image_raw = loader(img_path)
        label_raw = loader(lbl_path)
        
        input_tensor = pre_process_img(image_raw).unsqueeze(0).to(device)
        true_mask = pre_process_lbl(label_raw).numpy()[0] # Маска врача на той же сетке!
        
        # Инференс ИИ
        outputs = sliding_window_inference(input_tensor, (96, 96, 96), 4, model, overlap=0.7)
        
        # Пороговая калибровка (Softmax)
        probs = torch.softmax(outputs, dim=1).cpu().numpy()[0]
        ai_mask = np.zeros_like(probs[0], dtype=np.int64)
        ai_mask[probs[1] > 0.35] = 1
        ai_mask[probs[2] > 0.15] = 2 # Опухоль приоритетнее
        
        image_transformed = input_tensor[0, 0].cpu().numpy()
        
        # Поиск лучшего среза, где опухоль наиболее крупная
        if np.sum(true_mask == 2) > 0:
            best_slice = np.argmax(np.sum(true_mask == 2, axis=(0, 1)))
        elif np.sum(ai_mask == 2) > 0:
            best_slice = np.argmax(np.sum(ai_mask == 2, axis=(0, 1)))
        else:
            best_slice = np.argmax(np.sum(true_mask == 1, axis=(0, 1))) if np.sum(true_mask == 1) > 0 else true_mask.shape[2] // 2
            
        # Извлекаем 2D срезы
        img_2d = image_transformed[:, :, best_slice]
        ai_2d = ai_mask[:, :, best_slice]
        true_2d = true_mask[:, :, best_slice]
        
        # Строим профессиональный дашборд сопоставления
        fig, axes = plt.subplots(1, 2, figsize=(14, 7), facecolor='black')
        
        # Маскирование фона
        ai_l_overlay = np.ma.masked_where(ai_2d != 1, ai_2d)
        ai_t_overlay = np.ma.masked_where(ai_2d != 2, ai_2d)
        
        true_l_overlay = np.ma.masked_where(true_2d != 1, true_2d)
        true_t_overlay = np.ma.masked_where(true_2d != 2, true_2d)
        
        # 1. Левая половина: Анализ ИИ
        axes[0].imshow(img_2d.T, cmap="gray", origin='lower')
        axes[0].imshow(ai_l_overlay.T, cmap=cmap_liver, alpha=0.25, origin='lower')
        if np.sum(ai_2d == 2) > 0:
            axes[0].imshow(ai_t_overlay.T, cmap=cmap_tumor, alpha=0.8, origin='lower')
        axes[0].set_title(f"АНАЛИЗ ИИ HepatoGuard", color="white", fontsize=12, pad=10)
        axes[0].axis('off')
        
        # 2. Правая половина: Разметка врача
        axes[1].imshow(img_2d.T, cmap="gray", origin='lower')
        axes[1].imshow(true_l_overlay.T, cmap=cmap_liver, alpha=0.25, origin='lower')
        if np.sum(true_2d == 2) > 0:
            axes[1].imshow(true_t_overlay.T, cmap=cmap_tumor, alpha=0.8, origin='lower')
        axes[1].set_title(f"ВРАЧЕБНЫЙ КОНСИЛИУМ (Ground Truth)", color="white", fontsize=12, pad=10)
        axes[1].axis('off')
        
        plt.suptitle(f"Клинический случай №{p_id:02d} (Срез КТ №{best_slice})", color="white", fontsize=14, y=0.96)
        
        # Сохраняем в единую картинку
        out_path = os.path.join(OUTPUT_DIR, f"patient_{p_id}_comparison.png")
        plt.savefig(out_path, bbox_inches='tight', pad_inches=0.2, facecolor='black', dpi=150)
        plt.close()

print("\n" + "="*60)
print(" ГЕОМЕТРИЧЕСКИЙ ЭКСПОРТ ДАШБОРДОВ ЗАВЕРШЕН!")
print(" Все сравнения сохранены как patient_X_comparison.png")
print("="*60)