export async function fetchWeather() {
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=25.2854&longitude=51.5310&current_weather=true&timezone=auto"
    );

    const data = await res.json();
    const temp = data.current_weather.temperature;

    document.getElementById("weatherTemp").textContent = `${temp}°C`;
  } catch (error) {
    console.error("Weather fetch error:", error);
    document.getElementById("weatherTemp").textContent = "--°C";
  }
}

setInterval(fetchWeather, 600000);
fetchWeather();
