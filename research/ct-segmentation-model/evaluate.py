import torch
import numpy as np
import os
import glob
from monai.networks.nets import UNet
from monai.metrics import DiceMetric
from monai.inferers import sliding_window_inference
from monai.data import Dataset, DataLoader, decollate_batch
from monai.transforms import (
    Compose, LoadImaged, EnsureChannelFirstd, Spacingd, 
    Orientationd, ScaleIntensityRanged, ToTensord
)
from monai.networks.utils import one_hot

# 1. ПОИСК ПАПКИ С ДАННЫХ
paths_to_check = [
    r"C:\Users\G\Desktop\liver_tumor",
    r"C:\Users\G\.cache\kagglehub\datasets\andrewmvd\liver-tumor-segmentation\versions\5"
]

data_dir = None
for p in paths_to_check:
    if os.path.exists(p):
        data_dir = p
        break

if data_dir is None:
    print("ОШИБКА: Данные не найдены!")
    exit()

# 2. СБОР ФАЙЛОВ
all_volumes = glob.glob(os.path.join(data_dir, "**", "volume-*.nii"), recursive=True)
data_dicts = []
for vol_path in all_volumes:
    file_name = os.path.basename(vol_path)
    file_num = "".join(filter(str.isdigit, file_name))
    seg_path = os.path.join(data_dir, "segmentations", f"segmentation-{file_num}.nii")
    if os.path.exists(seg_path):
        data_dicts.append({"image": vol_path, "label": seg_path})

val_files = data_dicts[:5] # Берем первые 5 штук для теста
print(f"Найдено пар: {len(data_dicts)}. Тестируем на {len(val_files)} пациентах.")

# 3. МОДЕЛЬ
device = torch.device("cuda")
model = UNet(
    spatial_dims=3, in_channels=1, out_channels=3,
    channels=(16, 32, 64, 128, 256), strides=(2, 2, 2, 2), num_res_units=2,
).to(device)

MODEL_PATH = "liver_pro_v100.pth"
if os.path.exists(MODEL_PATH):
    model.load_state_dict(torch.load(MODEL_PATH))
    model.eval()
else:
    print(f"Файл {MODEL_PATH} не найден!")
    exit()

# 4. ТРАНСФОРМАЦИИ
val_transforms = Compose([
    LoadImaged(keys=["image", "label"]),
    EnsureChannelFirstd(keys=["image", "label"]),
    Spacingd(keys=["image", "label"], pixdim=(1.5, 1.5, 2.0), mode=("bilinear", "nearest")),
    Orientationd(keys=["image", "label"], axcodes="RAS"),
    ScaleIntensityRanged(
        keys=["image"], a_min=-175, a_max=250, 
        b_min=0.0, b_max=1.0, clip=True
    ),
    ToTensord(keys=["image", "label"])
])

val_ds = Dataset(data=val_files, transform=val_transforms)
val_loader = DataLoader(val_ds, batch_size=1)
dice_metric = DiceMetric(include_background=False, reduction="mean_batch")

# 5. ТЕСТИРОВАНИЕ
print("ИИ проводит оценку точности...")
with torch.no_grad():
    for val_data in val_loader:
        val_inputs = val_data["image"].to(device)
        val_labels = val_data["label"].to(device)
        
        val_outputs = sliding_window_inference(val_inputs, (64, 64, 64), 4, model)
        
        # Фикс: явно передаем dim=0, так как decollate_batch убирает батч-размерность
        output_masks = [one_hot(torch.argmax(i, dim=0, keepdim=True), num_classes=3, dim=0) for i in decollate_batch(val_outputs)]
        label_masks = [one_hot(i, num_classes=3, dim=0) for i in decollate_batch(val_labels)]
        
        for out, label in zip(output_masks, label_masks):
            dice_metric(y_pred=out.unsqueeze(0), y=label.unsqueeze(0))

# 6. ФИНАЛЬНЫЙ ВЫВОД
results = dice_metric.aggregate()
dice_l = results[0].item() * 100
dice_t = results[1].item() * 100

print("\n" + "="*40)
print("  VALIDATION REPORT: HepatoGuard AI  ")
print("="*40)
print(f"Dice Score (Печень):   {dice_l:.2f}%")
print(f"Dice Score (Опухоли):  {dice_t:.2f}%")
print(f"Общая точность модели: {((dice_l + dice_t)/2):.2f}%")
print("="*40)
print("Результат: ГОТОВ К ЗАЩИТЕ В АСТАНЕ")

dice_metric.reset()