/* ── Asset rate card data ───────────────────────────────── */

export const assetRate = {
  underpass:           { title:"Underpass Screens",                     screens:"2",   rate:"110,000 QAR", uploadfee:"3,000 QAR",  duration:"2 Weeks", dimension:"6240 × 420 px" },
  "underpass-entrance":{ title:"Underpass Entrance",                    screens:"1",   rate:"65,000 QAR",  uploadfee:"1,500 QAR",  duration:"2 Weeks", dimension:"6240 × 420 px" },
  "underpass-exit":    { title:"Underpass Exit",                        screens:"1",   rate:"65,000 QAR",  uploadfee:"1,500 QAR",  duration:"2 Weeks", dimension:"6240 × 420 px" },
  mupi:                { title:"Mupi Screens",                          screens:"24",  rate:"80,000 QAR",  uploadfee:"3,000 QAR",  duration:"2 Weeks", dimension:"256 × 384 px" },
  "mupi-c1":           { title:"Mupi Circuit 1",                        screens:"12",  rate:"40,000 QAR",  uploadfee:"1,500 QAR",  duration:"2 Weeks", dimension:"256 × 384 px" },
  "mupi-c2":           { title:"Mupi Circuit 2",                        screens:"12",  rate:"40,000 QAR",  uploadfee:"1,500 QAR",  duration:"2 Weeks", dimension:"256 × 384 px" },
  gewan:               { title:"Gewan Crystal Walk Screens",            screens:"24",  rate:"90,000 QAR",  uploadfee:"3,000 QAR",  duration:"2 Weeks", dimension:"512×640 / 384×640 / 640×384 / 384×512 / 640×640 px" },
  "gewan-c1":          { title:"Gewan Crystal Walk Circuit 1",          screens:"12",  rate:"45,000 QAR",  uploadfee:"1,500 QAR",  duration:"2 Weeks", dimension:"512×640 / 384×640 / 640×384 / 384×512 / 640×640 px" },
  "gewan-c2":          { title:"Gewan Crystal Walk Circuit 2",          screens:"12",  rate:"45,000 QAR",  uploadfee:"1,500 QAR",  duration:"2 Weeks", dimension:"512×640 / 384×640 / 640×384 / 384×512 / 640×640 px" },
  "gewan-building":    { title:"Gewan Crystal Building",                screens:"2",   rate:"10,000 QAR",  uploadfee:"1,500 QAR",  duration:"4 Weeks", dimension:"1248 × 728 px" },
  udctower:            { title:"UDC Tower Screens",                     screens:"4",   rate:"45,000 QAR",  uploadfee:"1,500 QAR",  duration:"2 Weeks", dimension:"1664 × 1040 px" },
  qqscreen:            { title:"Qanat Quartier Screen",                 screens:"1",   rate:"20,000 QAR",  uploadfee:"1,500 QAR",  duration:"4 Weeks", dimension:"3742 × 432 px" },
  monoprix:            { title:"Monoprix Screen",                       screens:"8",   rate:"10,000 QAR",  uploadfee:"1,500 QAR",  duration:"4 Weeks", dimension:"1080 × 1920 px" },

  "lightpoles-me-mb":  { title:"Light Poles Main Circuits",             faces:"144 Faces (72 Poles)", rate:"240,000 QAR", installation:"72,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-me":     { title:"Light Poles Main Entrance",             faces:"72 Faces (36 Poles)",  rate:"120,000 QAR", installation:"36,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-me-c1":  { title:"Light Poles Main Entrance Circuit 1",   faces:"24 Faces (12 Poles)",  rate:"40,000 QAR",  installation:"12,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-me-c2":  { title:"Light Poles Main Entrance Circuit 2",   faces:"24 Faces (12 Poles)",  rate:"40,000 QAR",  installation:"12,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-me-c3":  { title:"Light Poles Main Entrance Circuit 3",   faces:"24 Faces (12 Poles)",  rate:"40,000 QAR",  installation:"12,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-mb":     { title:"Light Poles Main Boulevard",            faces:"72 Faces (36 Poles)",  rate:"120,000 QAR", installation:"36,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-mb-c1":  { title:"Light Poles Main Boulevard Circuit 1",  faces:"24 Faces (12 Poles)",  rate:"40,000 QAR",  installation:"12,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-mb-c2":  { title:"Light Poles Main Boulevard Circuit 2",  faces:"24 Faces (12 Poles)",  rate:"40,000 QAR",  installation:"12,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-mb-c3":  { title:"Light Poles Main Boulevard Circuit 3",  faces:"24 Faces (12 Poles)",  rate:"40,000 QAR",  installation:"12,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-mc":     { title:"Light Poles Medina Centrale",           faces:"18 Faces (9 Poles)",   rate:"20,000 QAR",  installation:"9,000 QAR",  duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-pa":     { title:"Light Poles Porto Arabia",              faces:"168 Faces (84 Poles)", rate:"120,000 QAR", installation:"72,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-pa-c1":  { title:"Light Poles Porto Arabia Circuit 1",    faces:"42 Faces (21 Poles)",  rate:"30,000 QAR",  installation:"18,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-pa-c2":  { title:"Light Poles Porto Arabia Circuit 2",    faces:"42 Faces (21 Poles)",  rate:"30,000 QAR",  installation:"18,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-pa-c3":  { title:"Light Poles Porto Arabia Circuit 3",    faces:"42 Faces (21 Poles)",  rate:"30,000 QAR",  installation:"18,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "lightpoles-pa-c4":  { title:"Light Poles Porto Arabia Circuit 4",    faces:"42 Faces (21 Poles)",  rate:"30,000 QAR",  installation:"18,000 QAR", duration:"2 Weeks", dimension:"1 × 3 m" },
  "mupi-pa":           { title:"Mupi Porto Arabia Boardwalk",           faces:"180",                  rate:"90,000 QAR",  installation:"39,000 QAR", duration:"4 Weeks", dimension:"1.2 × 1.76 m" },
  "mupi-pa-c1":        { title:"Mupi Porto Arabia Boardwalk Circuit 1", faces:"60",                   rate:"30,000 QAR",  installation:"13,000 QAR", duration:"4 Weeks", dimension:"1.2 × 1.76 m" },
  "mupi-pa-c2":        { title:"Mupi Porto Arabia Boardwalk Circuit 2", faces:"60",                   rate:"30,000 QAR",  installation:"13,000 QAR", duration:"4 Weeks", dimension:"1.2 × 1.76 m" },
  "mupi-pa-c3":        { title:"Mupi Porto Arabia Boardwalk Circuit 3", faces:"60",                   rate:"30,000 QAR",  installation:"13,000 QAR", duration:"4 Weeks", dimension:"1.2 × 1.76 m" },
};

/**
 * Populate and show the info card for a given map key.
 * Pass null / unknown key to hide the card.
 */
export function updateInfoCard(mapKey) {
  const details = assetRate[mapKey];
  const card    = document.getElementById("infoCard");
  const tbody   = document.getElementById("infoTableBody");
  const header  = document.getElementById("infoHeader");
  if (!card) return;

  if (!details) {
    card.style.display    = "none";
    card.dataset.hasdata  = "false";
    return;
  }

  const isDigital = details.screens !== undefined;
  const isStatic  = details.faces   !== undefined;
  card.dataset.hasdata = "true";
  header.innerHTML = `Asset Rate Card › ${details.title || "Asset"}<span class="close-info" onclick="toggleInfoCard()">✕</span>`;

  let html = "";
  if (isDigital) {
    html = `<tr><th>Screens</th><td>${details.screens}</td></tr>
            <tr><th>Rate</th><td>${details.rate}</td></tr>
            <tr><th>Upload Fee</th><td>${details.uploadfee}</td></tr>
            <tr><th>Campaign Duration</th><td>${details.duration}</td></tr>
            <tr><th>Dimension W×H</th><td>${details.dimension}</td></tr>`;
  } else if (isStatic) {
    html = `<tr><th>Faces</th><td>${details.faces}</td></tr>
            <tr><th>Rate</th><td>${details.rate}</td></tr>
            <tr><th>Production &amp; Installation</th><td>${details.installation}</td></tr>
            <tr><th>Campaign Duration</th><td>${details.duration}</td></tr>
            <tr><th>Dimension W×H</th><td>${details.dimension}</td></tr>`;
  }
  tbody.innerHTML = html;
}

export function toggleInfoCard() {
  const card = document.getElementById("infoCard");
  if (!card || card.dataset.hasdata !== "true") return;
  card.style.display = card.style.display === "block" ? "none" : "block";
}
