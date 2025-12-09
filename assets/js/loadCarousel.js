// Firebase Imports
import { rtdb } from "../../firebase/firebase.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// ===============================
// Load all top-level nodes
// ===============================
async function loadAllTables() {
  try {
    const rootRef = ref(rtdb, "/");
    const snap = await get(rootRef);
    return snap.exists() ? snap.val() : {};
  } catch (error) {
    console.error("❌ Error loading database:", error);
    return {};
  }
}

// ===============================
// Format date as dd/mmm/yyyy
// ===============================
function formatDateDDMMMYYYY(value) {
  if (!value) return "—";
  value = value.trim();
  const parts = value.split("/").map(x => x.trim()).filter(x => x !== "");
  if (parts.length < 2) return "—";

  let [month, day, year] = parts;
  month = month.padStart(2,"0");
  day = day.padStart(2,"0");
  if(!year) year = new Date().getFullYear();
  else { if(/^\d{2}$/.test(year)) year="20"+year; if(!/^\d{4}$/.test(year)) year=new Date().getFullYear(); }

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mIndex = parseInt(month,10)-1;
  if(mIndex<0||mIndex>11) return "—";
  return `${day}-${monthNames[mIndex]}-${year}`;
}

// ===============================
// Convert JSON → HTML table
// ===============================
function jsonToTableAuto(dataObj, columns, highlightColumns=[]) {
  if(!dataObj||Object.keys(dataObj).length===0) return "<p>No data</p>";
  const today = new Date(); today.setHours(0,0,0,0);

  let html=`<table class="json-table"><thead><tr>${columns.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>`;

  for(const key in dataObj){
    const row = dataObj[key]||{};
    html+="<tr>";
    columns.forEach(col=>{
      let val = row[col]??"—";
      let cls="";
      let match = val.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
      let numericDate = null;
      if(match){
        const d=parseInt(match[1]), mmm=match[2], y=parseInt(match[3]);
        const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const m=months.indexOf(mmm);
        numericDate = new Date(y,m,d); numericDate.setHours(0,0,0,0);
      }

      if(col==="Start Date" && numericDate && numericDate.getTime()===today.getTime()) cls="date-today";
      if(highlightColumns.includes(col) && numericDate && cls===""){
        const diff=(numericDate-today)/(1000*60*60*24);
        if(diff===0) cls="date-today";
        else if(diff===1) cls="date-tomorrow";
        else if(diff>1 && diff<=7) cls="date-week";
        else if(diff<0) cls="date-less-than-today";
      }

      html+=`<td class="${cls}">${val}</td>`;
    });
    html+="</tr>";
  }

  html+="</tbody></table>";
  return html;
}

// ===============================
// Create Card
// ===============================
function createCard(title, data, columns, highlightColumns=[]){
  const card=document.createElement("div");
  card.className="card";
  card.innerHTML=`<h2>${title}</h2><div class="table-container">${jsonToTableAuto(data,columns,highlightColumns)}</div>`;
  return card;
}

// ===============================
// TODAY Campaign Section
// ===============================
function publishCampaignToday(allTables){
  const todayCarousel=document.getElementById("carouselPublishToday");
  const expandedCarousel=document.getElementById("expandedPublishToday");
  if(!todayCarousel||!expandedCarousel) return;

  const today=new Date(); today.setHours(0,0,0,0);
  const digitalToday=[], staticToday=[];

  for(const tableName in allTables){
    const data=allTables[tableName];
    if(!data) continue;
    if(!tableName.startsWith("d_") && !tableName.startsWith("s_")) continue;

    const cleanLocation=tableName.replace(/^d_|^s_/,"").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
    const rows=Array.isArray(data)?data:Object.values(data);

    rows.forEach(row=>{
      if(!row||!row["Start Date"]) return;
      const formatted=formatDateDDMMMYYYY(row["Start Date"]);
      const [d, mmm, y]=formatted.split("-");
      const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const m=months.indexOf(mmm);
      const rowDate=new Date(parseInt(y),m,parseInt(d)); rowDate.setHours(0,0,0,0);

      if(rowDate.getTime()===today.getTime()){
        const newRow={ Client:row.Client??"—", Location:cleanLocation, "Start Date":formatted };
        if(tableName.startsWith("d_")) digitalToday.push(newRow);
        if(tableName.startsWith("s_")) staticToday.push(newRow);
      }
    });
  }

  todayCarousel.innerHTML="";
  expandedCarousel.innerHTML="";

  function addCards(array, title){
    if(array.length===0){
      if(title==="Today") return;
      const msg=document.createElement("div"); msg.textContent="No campaign publish today"; msg.classList.add("no-data-message");
      todayCarousel.appendChild(msg);
      expandedCarousel.appendChild(msg.cloneNode(true));
      return;
    }
    const obj=Object.fromEntries(array.map((r,i)=>[i,r]));
    const card=createCard(title,obj,["Client","Location","Start Date"],["Start Date"]);
    todayCarousel.appendChild(card);
    const expCard=card.cloneNode(true);
    expCard.style.width="400px"; expCard.style.flex="0 0 auto"; expCard.style.margin="10px";
    expandedCarousel.appendChild(expCard);
  }

  addCards(digitalToday,"Digital");
  addCards(staticToday,"Static");
}

// ===============================
// Load Carousel + Expanded
// ===============================
export async function loadCarousel(){
  const digitalCarousel=document.getElementById("carouselDigital");
  const staticCarousel=document.getElementById("carouselStatic");
  const upcomingCarousel=document.getElementById("carouselUpcoming");

  const expandedDigital=document.getElementById("expandedDigital");
  const expandedStatic=document.getElementById("expandedStatic");
  const expandedPublishToday=document.getElementById("expandedPublishToday");
  const expandedUpcoming=document.getElementById("expandedUpcoming");

  const allTables=await loadAllTables();

  publishCampaignToday(allTables);

  // -------------------------------
  // DIGITAL & STATIC CAROUSEL
  // -------------------------------
  for(const tableName in allTables){
    const data=allTables[tableName]; if(!data) continue;

    let columns=[], targetCarousel=null, highlightCols=[];
    if(tableName.startsWith("d_")){ columns=["SN","Client","Start Date","End Date"]; targetCarousel=digitalCarousel; highlightCols=["End Date"]; }
    else if(tableName.startsWith("s_")){ columns=["Circuit","Client","Start Date","End Date"]; targetCarousel=staticCarousel; highlightCols=["End Date"]; }
    else continue;

    const rows=Array.isArray(data)?data:Object.values(data);
    const dateCols=columns.filter(c=>c.toLowerCase().includes("date"));
    rows.forEach(row=>{
      if(!row||typeof row!=="object") return;
      columns.forEach(col=>{
        if(dateCols.includes(col)) row[col]=row[col]?formatDateDDMMMYYYY(row[col]):"—";
        else row[col]=row[col]??"—";
      });
    });

    const validRows=rows.filter(r=>r && typeof r==="object");
    if(validRows.length===0) continue;

    const dataObj=Object.fromEntries(validRows.map((r,i)=>[i,r]));
    targetCarousel.appendChild(createCard(
      tableName.replace(/^d_|^s_/,"").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()),
      dataObj,columns,highlightCols
    ));
  }

  // -------------------------------
  // UPCOMING CAMPAIGNS
  // -------------------------------
  const upcomingRows=[];
  for(const tableName in allTables){
    const data=allTables[tableName]; if(!data||!tableName.startsWith("Upcoming_")) continue;
    const rows=Array.isArray(data)?data:Object.values(data);
    rows.forEach(row=>{
      if(!row||!row["Start Date"]) return;
      const formatted=formatDateDDMMMYYYY(row["Start Date"]);
      upcomingRows.push({ Client:row.Client??"—", Location:row.Location??"—", Circuit:row.Circuit??"—", "Start Date":formatted });
    });
  }

  upcomingCarousel.innerHTML=""; expandedUpcoming.innerHTML="";
  if(upcomingRows.length>0){
    const dataObj=Object.fromEntries(upcomingRows.map((r,i)=>[i,r]));
    const card=createCard("Upcoming Campaigns", dataObj, ["Client","Location","Circuit","Start Date"],["Start Date"]);
    upcomingCarousel.appendChild(card);

    const expCard=card.cloneNode(true);
    expCard.style.width="400px"; expCard.style.flex="0 0 auto"; expCard.style.margin="10px";
    expandedUpcoming.appendChild(expCard);
  } else {
    const msg=document.createElement("div");
    msg.textContent="No Upcoming Campaigns";
    msg.classList.add("no-data-message");
    upcomingCarousel.appendChild(msg);
    expandedUpcoming.appendChild(msg.cloneNode(true));
  }

  // -------------------------------
  // EXPAND BUTTONS
  // -------------------------------
  document.querySelector(".expand-digital-btn")?.addEventListener("click", e=>{ e.preventDefault(); toggleExpanded(digitalCarousel, expandedDigital); });
  document.querySelector(".expand-static-btn")?.addEventListener("click", e=>{ e.preventDefault(); toggleExpanded(staticCarousel, expandedStatic); });
  document.querySelector(".expand-upcoming-btn")?.addEventListener("click", e=>{ e.preventDefault(); toggleExpanded(upcomingCarousel, expandedUpcoming); });
  document.querySelector(".expand-publish-today-btn")?.addEventListener("click", e=>{ e.preventDefault(); toggleExpanded(document.getElementById("carouselPublishToday"), expandedPublishToday); });
}

// ===============================
// TOGGLE EXPANDED VIEW
// ===============================
function toggleExpanded(normalContainer, expandedContainer){
  if(expandedContainer.style.display==="none"){
    normalContainer.style.display="none";
    expandedContainer.style.display="flex";
    expandedContainer.style.flexWrap="wrap";
  } else {
    expandedContainer.style.display="none";
    normalContainer.style.display="flex";
  }
}

document.addEventListener("DOMContentLoaded", loadCarousel);
