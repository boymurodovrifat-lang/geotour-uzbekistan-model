# "Qachon borish kerak": iqlim qulayligi indeksi (CCI)

**Nima ko‘rsatadi.** Har bir oy uchun ochiq havoda sayr qilish va obidalarni ko‘rish qanchalik qulayligi, 0–100 ball. Bu o‘rtacha iqlim, ob-havo prognozi emas.

**Ma’lumot.** TerraClimate (Abatzoglou va boshq., 2018) 1991–2020 yillar oylik qiymatlari: eng yuqori harorat, yog‘in, quyosh radiatsiyasi, shamol tezligi va suv bug‘i bosimi. Asl to‘r 1/24°, har uchinchi katakdan olingan (1/8°, taxminan 11 × 14 km) va 30 yil bo‘yicha o‘rtachalangan.

**Hisob.**

| Qism | Ta’rif | Vazn |
| --- | --- | --- |
| TC — issiqlik qulayligi | Kunduzgi soyadagi seziladigan harorat AT = Tmax + 0,33e − 0,70v − 4,00 (Steadman, 1994). 24 °C da 1; 17 va 33,5 °C da 0,5; −5 va 39 °C da 0. Shkala Holiday Climate Index (Scott va boshq., 2016) asosida | 0,4 |
| A — osmon | Haqiqiy radiatsiyaning ochiq osmon radiatsiyasiga nisbati (FAO-56). 0,35 va kam — 0; 0,75 va ko‘p — 1 | 0,2 |
| P — yog‘in | Oyiga 15 mm va kam — 1; 120 mm va ko‘p — 0 | 0,3 |
| W — shamol | 4 m/s va kam — 1; 10 m/s va ko‘p — 0 | 0,1 |

CCI = 100 · TC^0,4 · A^0,2 · P^0,3 · W^0,1 (vaznli geometrik o‘rtacha: sovuq yoki juda issiq oyni quruq va quyoshli havo “qutqara olmaydi”).

Sinflar: 0–20 juda noqulay, 20–40 noqulay, 40–60 o‘rtacha, 60–80 qulay, 80–100 juda qulay. “Eng qulay oylar” — 60 dan yuqori va eng yaxshi oydan 12 balldan ko‘p farq qilmaydigan oylar.

**Asosiy natijalar.** May va sentabr deyarli butun mamlakatda eng qulay oylar (hududning 94% va 98% ida “juda qulay”). Qishda sovuq, yozda janubda issiq asosiy cheklov. Tog‘larda (Chimyon) eng qulay davr iyun–sentabr.

**Sezgirlik.** Harorat shkalasini ±2 °C surish, yog‘in chegaralarini ±30% o‘zgartirish, teng vaznlar va qo‘shma (arifmetik) shakl sinab ko‘rilgan: ballar darajasi o‘zgaradi, lekin eng qulay oy 96–99% hujayrada o‘zgarmaydi. Batafsil: [summary.json](/science/climate/summary.json).

**Cheklovlar.** Chegaralar tashrif buyuruvchilar xatti-harakati bo‘yicha kalibrlanmagan; TerraClimate o‘zi interpolyatsiya qilingan mahsulot; ma’lum yil yoki kun ob-havosini bildirmaydi.

Kod: `analysis/climate/reduce_terraclimate.py`, `analysis/climate/comfort.py`.
