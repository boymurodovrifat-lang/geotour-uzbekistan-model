# GeoTour Uzbekistan — v0.4 indekslari (1 km, ochiq ma'lumot skriningi)

Versiya: 0.4.0-open-screening-1km. Hisob: 2026-11-13. Kod: `analysis/model_v04/compute.py`.

## Bu nima

To'rt indeks (ESI, TSI, TPI, TRSI) EPSG:6933 teng maydonli 1 km panjarada qayta hisoblandi.
Kirish ma'lumotlari v0.2/v0.3 bilan bir xil: OpenStreetMap turizm nuqtalari (8 465 yozuv),
ESA WorldCover 2021, Copernicus DEM GLO-90 relyefi. Bu **dastlabki saralash**: ekspert kalibrlashi
ham, dala tekshiruvi ham o'tkazilmagan. Yuqori ball tashrif ruxsatini bildirmaydi.

## v0.3 ga nisbatan nima o'zgardi

1. **Qattiq 10 km radius o'rniga uzluksiz yadro.** Resurslar soni 2^(−d/5 km) yadrosi bilan
   yig'iladi (samarali maydoni 10 km doiraga teng). Xaritadagi keskin halqalar yo'qoldi.
2. **Majmualar birlashtirildi.** Bir oiladagi (tabiiy / madaniy / umumiy) 300 m ichidagi yozuvlar
   bitta obyekt sifatida sanaladi: madaniy 1765 → 1056, umumiy 602 → 438, tabiiy 524 → 497.
3. **Xilma-xillik** — uch oila yadro yig'indilarining Shannon tekisligi: D = (1 + 2E)/3.
4. **Vaznli geometrik o'rtacha.** Vaznlar teng vazn bilan Shannon entropiya vaznining o'rtasi.
   Sof entropiya vazni siyrak mezonlarni kuchaytirib, qiyalik va landshaftni deyarli o'chirib
   qo'yadi (masalan TRSI da qiyalik vazni 0.009), shuning uchun u yakka holda ishlatilmadi.
5. **Noaniqlik tahlili.** 500 Monte-Karlo ssenariysi: vaznlar teng va entropiya to'plami orasida,
   yarim masofalar 0.5–2 marta, to'yinish doimiysi 2.5–10. Har katak uchun boshlang'ich sinf
   saqlangan ssenariylar ulushi (barqarorlik) va P5–P95 oralig'i saqlanadi.

## Formulalar

Mezonlar 0–1, natija 0–100; S = 100 · Π xᵢ^wᵢ.

| Indeks | Mezonlar va vaznlar |
|---|---|
| ESI | N 0.665 · Q 0.335 |
| TSI | A 0.374 · U 0.626 |
| TPI | A 0.301 · K 0.509 · D 0.190 |
| TRSI | W 0.364 · F 0.171 · P 0.465 |

N — nomli tabiiy obyektga yaqinlik (yarim masofa 10 km); Q — tabiiy qoplama va relyef/suv bo'yi;
A — tabiiy, madaniy yoki umumiy resursga yaqinlikning kattasi; U — turar joy va axborot
markaziga yaqinlik (5 km); K = 1 − exp(−n/5), n — yadro bilan sanalgan obyektlar; D — xilma-xillik;
W — yashil qoplama yoki suv bo'yi; F — qiyalik (≤5° da 1, ≥30° da 0); P — dam olish joyiga
yaqinlik (3 km). Sinflar: [0,20], (20,40], (40,60], (60,80], (80,100].

## Natijalar (qisqacha)

- Baholangan maydon: 438 100 km². "Yuqori" va "juda yuqori" sinflar ulushi: ESI 7.97 %, TSI 1.42 %,
  TPI 8.96 %, TRSI 1.31 %.
- O'rtacha sinf barqarorligi: ESI 73.5 %, TSI 86.6 %, TPI 70.8 %, TRSI 91.2 %. Chekka sinflar
  (1 va 5) barqaror, o'rta sinflar (2–4) ko'pincha 32–61 % — ularni ehtiyotkorlik bilan o'qing.
- v0.2 mezon rasterlari aynan qayta tiklandi (maksimal farq 0).

## Tashqi tekshiruv (aniqlik bahosi emas)

- **UNESCO madaniy komponentlari (20 ta, 5 obyekt):** TSI AUC 0.94, TPI AUC 0.93 — indekslar bu
  joylarni fon kataklaridan yaxshi ajratadi.
- **UNESCO tabiiy komponentlari (7 ta, 2 obyekt):** ESI AUC 0.48, TRSI AUC 0.33 — ajratmaydi.
  Turon cho'llari kabi olis muhofaza hududlarida OSM nuqtalari yo'q, shuning uchun ESI ularni
  past baholaydi. ESI tabiatni muhofaza qilish qiymatini emas, hujjatlangan tabiiy obyektlar
  yaqinidagi tashrif imkoniyatini ko'rsatadi.
- **Turar joylar (25 km bloklar, 753 ta):** Spearman ρ — TPI 0.57, TRSI 0.57, ESI 0.34
  (TSI 0.71, lekin u turar joyni kirish sifatida ishlatadi).

## Cheklovlar

OSM to'liq emas; nuqta yo'qligi resurs yo'qligini isbotlamaydi. Masofa to'g'ri chiziq bo'yicha,
yo'l vaqti emas. Iqlim, mavsum, xavfsizlik, huquqiy kirish, ekologik sig'im va xizmat sifati
baholanmagan. 1 km katak ichidagi farqlar ko'rinmaydi. Chegara: geoBoundaries 2017.

## Takrorlash

```
pip install numpy scipy tifffile pyproj pillow matplotlib
python analysis/model_v04/compute.py
python analysis/model_v04/figures.py
```

Barcha sonlar `results.json` da, hudud statistikasi `regional-statistics.csv` da, ball va
barqarorlik rasterlari `*-score.tif` / `*-stability.tif` (Float32, EPSG:6933) fayllarida.
Avvalgi 30 m v0.3 mahsuloti `/methodology/archive` sahifasida o'zgarishsiz saqlangan.
