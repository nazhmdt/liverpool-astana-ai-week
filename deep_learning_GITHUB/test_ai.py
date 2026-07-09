import torch
import nibabel as nib
import matplotlib.pyplot as plt
import numpy as np
import os
from monai.networks.nets import UNet
from monai.inferers import sliding_window_inference
from monai.transforms import (
    Compose, LoadImage, EnsureChannelFirst, 
    ScaleIntensityRange, ToTensor, Spacing, Orientation
)
from matplotlib.colors import ListedColormap

# 1. Настройка видеокарты
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Используем устройство: {device}")

# 2. Создаем структуру модели (3D UNet)
model = UNet(
    spatial_dims=3, 
    in_channels=1, 
    out_channels=3,
    channels=(16, 32, 64, 128, 256), 
    strides=(2, 2, 2, 2), 
    num_res_units=2,
).to(device)

# Загружаем веса
MODEL_PATH = "liver_pro_v100.pth" 
if not os.path.exists(MODEL_PATH):
    MODEL_PATH = "liver_pro_v60.pth"

if os.path.exists(MODEL_PATH):
    model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
    model.eval()
    print(f"Модель {MODEL_PATH} успешно загружена!")
else:
    print(f"ОШИБКА: Веса модели не найдены!")
    exit()

# 3. Путь к снимку
test_image_path = r"C:\Users\G\Desktop\liver_tumor\volumes\volume_pt1\volume-0.nii"

if not os.path.exists(test_image_path):
    print(f"ОШИБКА: Снимок по пути {test_image_path} не найден!")
    exit()

# 4. ПОДГОТОВКА ДАННЫХ
loader = LoadImage(image_only=True)
image_raw = loader(test_image_path)

pre_process = Compose([
    EnsureChannelFirst(),
    Orientation(axcodes="RAS"),
    Spacing(pixdim=(1.5, 1.5, 2.0), mode="bilinear"),
    ScaleIntensityRange(a_min=-175, a_max=250, b_min=0.0, b_max=1.0, clip=True),
    ToTensor()
])

input_tensor = pre_process(image_raw).unsqueeze(0).to(device)

# 5. ЗАПУСК ИИ (ДЕТЕКЦИЯ И СЕГМЕНТАЦИЯ)
print("ИИ сканирует 3D-объем КТ...")
with torch.no_grad():
    output = sliding_window_inference(input_tensor, (64, 64, 64), 4, model, overlap=0.7)
    mask = torch.argmax(output, dim=1).detach().cpu().numpy()[0]

# Получаем КТ-картинку после обработки
image_transformed = input_tensor[0, 0].cpu().numpy()

# 6. КЛИНИЧЕСКАЯ ПОСТОБРАБОТКА И ПОИСК ПАТОЛОГИИ
voxel_vol_ml = (1.5 * 1.5 * 2.0) / 1000  # Объем 1 вокселя в мл

liver_pixels = np.sum(mask == 1)
tumor_pixels = np.sum(mask == 2)

# Фильтрация шума сегментации (если опухоль меньше 10 вокселей, сбрасываем ее)
if tumor_pixels < 10:
    mask[mask == 2] = 0
    tumor_pixels = 0

liver_vol_ml = liver_pixels * voxel_vol_ml
tumor_vol_ml = tumor_pixels * voxel_vol_ml

# Решение детектора: Да/Нет
has_tumor = tumor_vol_ml > 0.0

# 7. АВТОМАТИЧЕСКИЙ ВЫБОР ЛУЧШЕГО СРЕЗА ДЛЯ ОТОБРАЖЕНИЯ
if has_tumor:
    # Если опухоль обнаружена, находим срез, где её площадь максимальна
    tumor_pixels_per_slice = np.sum(mask == 2, axis=(0, 1))
    best_slice = np.argmax(tumor_pixels_per_slice)
    verdict_text = "ОБНАРУЖЕНО ПАТОЛОГИЧЕСКОЕ ОБРАЗОВАНИЕ"
    verdict_desc = f"Обнаружен очаг объемом {tumor_vol_ml:.2f} мл. Требуется срочный триаж в онкоцентр!"
else:
    # Если опухоли нет, находим центр печени
    liver_pixels_per_slice = np.sum(mask == 1, axis=(0, 1))
    if np.sum(mask == 1) > 0:
        best_slice = np.argmax(liver_pixels_per_slice)
    else:
        best_slice = mask.shape[2] // 2
    verdict_text = "ОЧАГОВЫХ ПАТОЛОГИЙ НЕ ОБНАРУЖЕНО"
    verdict_desc = "Ткань печени без признаков новообразований."

print("\n" + "="*50)
print(f" СИСТЕМА ДЕТЕКЦИИ HepatoGuard AI")
print("="*50)
print(f"ВЕРДИКТ ИИ: {verdict_text}")
print(f"ОПИСАНИЕ:   {verdict_desc}")
print(f"Ориентировочный объем печени: {liver_vol_ml:.1f} мл")
print(f"Показ КТ-среза №: {best_slice}")
print("="*50)

# 8. ВИЗУАЛИЗАЦИЯ С КОНТРАСТНЫМ ПОДСВЕЧИВАНИЕМ
# Маскируем ненужные классы, чтобы они не перекрывали КТ-снимок черным фоном
liver_overlay = np.ma.masked_where(mask != 1, mask)
tumor_overlay = np.ma.masked_where(mask != 2, mask)

# Задаем чистые медицинские цвета (Зеленый для печени, Ярко-Красный для опухоли)
cmap_liver = ListedColormap(['#2ecc71']) # Emerald Green
cmap_tumor = ListedColormap(['#e74c3c']) # Alizarin Red

plt.figure(figsize=(12, 6))

# Левая картинка: Чистый КТ-срез
plt.subplot(1, 2, 1)
plt.title(f"Исходный КТ-срез №{best_slice}")
plt.imshow(image_transformed[:, :, best_slice].T, cmap="gray", origin='lower')
plt.axis('off')

# Правая картинка: Результат работы детектора
plt.subplot(1, 2, 2)
if has_tumor:
    plt.title("ДЕТЕКТОР: НАЙДЕНА ОПУХОЛЬ (КРАСНЫЙ)")
else:
    plt.title("ДЕТЕКТОР: ОПУХОЛЕЙ НЕ НАЙДЕНО")

# Отображаем КТ-снимок
plt.imshow(image_transformed[:, :, best_slice].T, cmap="gray", origin='lower')

# Накладываем печень зеленым цветом (прозрачность alpha=0.25, чтобы структура КТ просвечивала)
plt.imshow(liver_overlay[:, :, best_slice].T, cmap=cmap_liver, alpha=0.25, origin='lower')

# Накладываем опухоль контрастным красным цветом (alpha=0.8, чтобы её сразу было видно)
if has_tumor:
    plt.imshow(tumor_overlay[:, :, best_slice].T, cmap=cmap_tumor, alpha=0.8, origin='lower')

plt.tight_layout()
plt.show()