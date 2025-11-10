export async function fetchWeather() {
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=25.2854&longitude=51.5310&current=temperature_2m&timezone=auto"
    );

    const data = await res.json();
    const temp = data.current.temperature_2m;

    document.getElementById("weatherTemp").textContent = `${temp}°C`;
  } catch (error) {
    document.getElementById("weatherTemp").textContent = "N/A";
  }
}

setInterval(fetchWeather, 600000);
fetchWeather();

