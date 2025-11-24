
// Opens iframe and loads data
function expandCarousel(type) {
    const overlay = document.getElementById("iframeOverlay");
    const iframe = document.getElementById("fullscreenIframe");

    overlay.style.display = "flex";

    // Inject an HTML template inside the iframe
    const content = `
        <html>
        <head>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th, td {
                    border: 1px solid #ccc;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background: #f5f5f5;
                }
            </style>
        </head>
        <body>
            <h2>${type === "digital" ? "Digital Circuits" : "Static Circuits"}</h2>
            <div id="tableContainer">Loading...</div>

            <script>
                window.parent.populateIframeData("${type}");
            </script>
        </body>
        </html>
    `;

    iframe.srcdoc = content;
}

// Close iframe
document.getElementById("iframeCloseBtn").onclick = function() {
    document.getElementById("iframeOverlay").style.display = "none";
};

// Close on ESC
document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
        document.getElementById("iframeOverlay").style.display = "none";
    }
});

// Called by iframe → loads data inside iframe
function populateIframeData(type) {
    const iframe = document.getElementById("fullscreenIframe");
    const tableContainer = iframe.contentWindow.document.getElementById("tableContainer");

    // Use your existing carousel data
    const data = type === "digital" ? window.digitalTableData : window.staticTableData;

    if (!data) {
        tableContainer.innerHTML = "<p>No data found.</p>";
        return;
    }

    let html = `
        <table>
            <thead>
                <tr>
                    ${Object.keys(data[0]).map(c => `<th>${c}</th>`).join("")}
                </tr>
            </thead>
            <tbody>
                ${data.map(row => `
                    <tr>
                        ${Object.values(row).map(v => `<td>${v || "-"}</td>`).join("")}
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = html;
}
