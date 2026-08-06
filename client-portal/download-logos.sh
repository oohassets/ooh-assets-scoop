#!/usr/bin/env bash
# Pull every client logo off scoop.qa into ./images/clients/ with clean names.
# Run once from inside client-portal/, commit the folder — js/scoop-clients.js
# already points its LOGO_BASE at 'images/clients'.

set -euo pipefail
OUT="images/clients"
mkdir -p "$OUT"

# Pairs: <slug> <remote path under wp-content/uploads>
while read -r slug path; do
  [ -z "$slug" ] && continue
  echo "→ $slug"
  curl -sfL "https://scoop.qa/wp-content/uploads/$path" -o "$OUT/$slug.png" \
    || echo "  !! failed: $path"
done <<'EOF'
qnb 2024/09/QNB-Logo.png
cbq 2024/11/CBQ.png
doha-bank 2024/10/Doha-Bank.png
dukhan-bank 2024/11/Dukhan-Bank.png
al-rayyan-bank 2026/01/rayyan-bank.png
ahlibank 2026/01/Alahli-Bank1-1.png
mastercard 2024/06/mastercard.png
qic 2024/09/QIC-logo.png
beema 2025/02/beema.png
daman 2026/01/Daman.png
ooredoo 2024/06/ooredoo-logo.png
vodafone 2024/10/Vodafone.png
udc 2024/05/udc-logo.png
the-pearl-island 2024/05/the-pearl-island.png
gewan-island 2024/05/gewan-island.png
qatari-diar 2024/11/Qatari-Diar.png
hdc 2024/05/hdc.png
betterhomes 2026/01/betterhomes.png
capstone 2024/06/capstone-logo.png
coreo 2026/01/coreo.png
qatarenergy 2026/01/Qatar-Energy.png
qatar-airways 2025/01/Qatar-Airways.png
qatar-museums 2025/01/Qatar-Museum.png
visit-qatar 2025/01/Visit-Qatar.png
qatar-charity 2024/11/Qatar-Charity.png
al-shaqab 2025/02/Al-Shaqab.png
sidra 2026/01/Sidra.png
exxonmobil 2025/02/Exxon-mobil.png
mall-of-qatar 2026/01/mall-of-qatar.png
dfc 2026/01/DFC.png
place-vendome 2024/11/Place-Vendome.png
landmark 2026/01/landmark.png
monoprix 2024/08/monoprix.png
carrefour 2026/01/carrefour.png
51-east 2024/11/51-East.png
ikea 2025/04/ikea.png
sports-corner 2026/01/Sports-Corner.png
david-yurman 2026/01/david-yurman.png
alfardan-jewellery 2025/05/alfardan-jewellery.png
boucheron 2024/11/Boucheron.png
tudor 2024/11/Tudor.png
kfc 2025/01/KFC.png
nandos 2025/01/nandus.png
texas-chicken 2025/04/texas-chicken.png
rayyan 2024/11/Rayyan.png
talabat 2024/11/Talabat.png
snoonu 2024/07/snoonu.png
rafeeq 2024/10/Rafeeq.png
deliveroo 2024/10/Deliveroo-1.png
keeta 2026/01/keeta.png
f1 2026/01/F1.png
fiba 2026/01/fiba.png
global-championship 2025/02/Global-Championship.png
wec 2025/02/WEC.png
atp 2025/02/ATP.png
wta 2025/02/WTA.png
ufc-gym 2025/06/UFC-Gym.png
winter-wonderland 2024/10/Winter-Wonderland.png
ajyal 2024/11/Ajyal.png
abdullah-abdulghani 2026/01/Abdull-abdulghani.png
mercedes-benz 2026/01/Mercedes-Benz.png
jetur 2026/01/jetur.png
corinthia 2024/05/corenthia.png
ronautica 2024/05/ronautica.png
meryal 2026/01/meryal.png
aura-group 2026/01/Aura-Group.png
georgetown 2025/04/Georgetown-univ.png
kmc 2024/08/KMC.png
EOF

echo "Done → $(ls "$OUT" | wc -l) logos in $OUT"
