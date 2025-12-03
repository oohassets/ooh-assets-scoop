function expandCarousel(type) {
  const overlay = document.getElementById("fullscreenOverlay");
  overlay.classList.add("show");

  const digitalOverlay = document.getElementById("digitalOverlay");
  const staticOverlay  = document.getElementById("staticOverlay");

  digitalOverlay.style.display = "none";
  staticOverlay.style.display = "none";

  // Clear previous content
  digitalOverlay.innerHTML = `<h2>Digital Circuits</h2>`;
  staticOverlay.innerHTML = `<h2>Static Circuits</h2>`;

  let targetOverlay, allRows, columns, highlightCols;

  if (type === "digital") {
    targetOverlay = digitalOverlay;
    allRows = window.digitalTodayRows || [];
    columns = ["SN", "Client", "BO", "Start Date", "End Date", "Days"];
    highlightCols = ["Start Date", "End Date"];
  } 
  if (type === "static") {
    targetOverlay = staticOverlay;
    allRows = window.staticTodayRows || [];
    columns = ["SN", "Client", "BO", "Start Date", "End Date", "Days"];
    highlightCols = ["Start Date", "End Date"];
  }

  if (!targetOverlay) return;

  if (allRows.length === 0) {
    targetOverlay.innerHTML += `<p>No campaigns today.</p>`;
  } else {
    // Auto-add SN and Days if missing
    const enrichedRows = allRows.map((row, i) => {
      return {
        SN: i + 1,
        Client: row.Client ?? "—",
        BO: row.BO ?? "-",
        "Start Date": row["Start Date"] ?? "—",
        "End Date": row["End Date"] ?? "—",
        Days: row.Days ?? "-"
      };
    });

    const obj = Object.fromEntries(enrichedRows.map((r, i) => [i, r]));
    const card = createCard("Campaigns Today", obj, columns, highlightCols);
    targetOverlay.appendChild(card);
  }

  targetOverlay.style.display = "block";
}
