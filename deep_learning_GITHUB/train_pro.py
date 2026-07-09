import torch
import os
import glob
import numpy as np
from monai.networks.nets import UNet
from monai.losses import DiceCELoss
from monai.transforms import (
    Compose, LoadImaged, EnsureChannelFirstd, Spacingd, Orientationd,
    ScaleIntensityRanged, CropForegroundd, RandCropByPosNegLabeld, ToTensord, SpatialPadd,
    RandFlipd, RandGaussianNoised, RandScaleIntensityd
)
from monai.data import CacheDataset, DataLoader
from torch.cuda.amp import GradScaler

# 1. ПУТИ (Используем путь из KaggleHub)
data_dir = r"C:\Users\G\.cache\kagglehub\datasets\andrewmvd\liver-tumor-segmentation\versions\5"

all_volumes = glob.glob(os.path.join(data_dir, "**", "volume-*.nii"), recursive=True)

data_dicts = []
for vol_path in all_volumes:
    file_name = os.path.basename(vol_path)
    file_num = "".join(filter(str.isdigit, file_name))
    seg_path = os.path.join(data_dir, "segmentations", f"segmentation-{file_num}.nii")
    if os.path.exists(seg_path):
        data_dicts.append({"image": vol_path, "label": seg_path})

print(f"--- TURBO MODE PRO ---")
print(f"Успешно создано пар для обучения: {len(data_dicts)}")

# 2. МЕДИЦИНСКИЙ ПРЕПРОЦЕССИНГ + ТЯЖЕЛАЯ АУГМЕНТАЦИЯ ДЛЯ УСТРАНЕНИЯ ПРОПУСКОВ
train_transforms = Compose([
    LoadImaged(keys=["image", "label"]),
    EnsureChannelFirstd(keys=["image", "label"]),
    Spacingd(keys=["image", "label"], pixdim=(1.5, 1.5, 2.0), mode=("bilinear", "nearest")),
    Orientationd(keys=["image", "label"], axcodes="RAS"),
    ScaleIntensityRanged(keys=["image"], a_min=-175, a_max=250, b_min=0.0, b_max=1.0, clip=True),
    CropForegroundd(keys=["image", "label"], source_key="image"),
    SpatialPadd(keys=["image", "label"], spatial_size=(96, 96, 96)),
    
    RandCropByPosNegLabeld(
        keys=["image", "label"], label_key="label",
        spatial_size=(96, 96, 96), 
        pos=3,                     # В 3 раза чаще вырезаем зоны с опухолью
        neg=1, 
        num_samples=2,             # Если возникнет ошибка памяти CUDA Out of Memory, уменьшите до 1
        image_key="image", image_threshold=0,
    ),
    
    # --- АУГМЕНТАЦИЯ ДЛЯ УЛУЧШЕНИЯ ОБОБЩАЮЩЕЙ СПОСОБНОСТИ (Решает проблему Пациента 4) ---
    RandFlipd(keys=["image", "label"], prob=0.5, spatial_axis=0), # Отражение по вертикали
    RandFlipd(keys=["image", "label"], prob=0.5, spatial_axis=1), # Отражение по горизонтали
    RandGaussianNoised(keys=["image"], prob=0.15, mean=0.0, std=0.1), # Имитация шума КТ-аппарата
    RandScaleIntensityd(keys=["image"], factors=0.1, prob=0.15), # Случайное изменение яркости/контраста КТ
    # ----------------------------------------------------------------------------------
    
    ToTensord(keys=["image", "label"]),
])

# 3. УЛЬТРА-ЗАГРУЗКА (RAM CACHE)
train_ds = CacheDataset(
    data=data_dicts, 
    transform=train_transforms, 
    cache_rate=1.0, 
    num_workers=4
)
train_loader = DataLoader(train_ds, batch_size=1, shuffle=True)

# 4. МОДЕЛЬ С УДВОЕННОЙ ЕМКОСТЬЮ (PRO АРХИТЕКТУРА)
device = torch.device("cuda")
model = UNet(
    spatial_dims=3, 
    in_channels=1, 
    out_channels=3,
    # Увеличили количество базовых каналов с 16 до 32 для точной детекции мелких очагов
    channels=(32, 64, 128, 256, 512), 
    strides=(2, 2, 2, 2), 
    num_res_units=2,
).to(device)

print("Создана мощная архитектура UNet-3D (32 базовых канала).")

# Взвешенный лосс: жестко штрафуем за пропуск опухолей
class_weights = torch.tensor([0.2, 1.0, 10.0]).to(device)
loss_function = DiceCELoss(
    to_onehot_y=True, 
    softmax=True, 
    weight=class_weights,
    lambda_dice=1.0, 
    lambda_ce=1.0
)

# Оптимизатор и планировщик на 300 эпох
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-5)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=300, eta_min=1e-6)
scaler = GradScaler()

# 5. ЦИКЛ ОБУЧЕНИЯ (С 0 по 300 эпоху)
print("\n--- ЗАПУСК МОЩНОГО ОБУЧЕНИЯ С НУЛЯ: ЭПОХИ 1 - 300 ---")
for epoch in range(300):
    model.train()
    epoch_loss = 0
    step = 0
    for batch_data in train_loader:
        step += 1
        inputs, labels = batch_data["image"].to(device), batch_data["label"].to(device)
        optimizer.zero_grad()
        
        with torch.amp.autocast("cuda"):
            outputs = model(inputs)
            loss = loss_function(outputs, labels)
        
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        
        epoch_loss += loss.item()
        if step % 5 == 0:
            print(f"Эпоха {epoch+1}, шаг {step}/{len(train_loader)}, Loss: {loss.item():.4f}")
            
    scheduler.step()
    current_lr = optimizer.param_groups[0]['lr']
    print(f">>> ИТОГ ЭПОХИ {epoch+1}: Средняя ошибка {epoch_loss/len(train_loader):.4f} | LR: {current_lr:.6f}")
    
    # Сохраняем модель каждые 50 эпох и финальную на 300
    if (epoch + 1) % 50 == 0 or (epoch + 1) == 300:
        save_name = f"liver_pro_v{epoch+1}.pth"
        torch.save(model.state_dict(), save_name)
        print(f"Модель сохранена на диск: {save_name}")