async function fetchWeather() {
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=25.2854&longitude=51.5310&current=temperature_2m&timezone=auto"
    );
    const data = await res.json();
    weatherTemp.textContent = `${data.current.temperature_2m}°C`;
  } catch {
    weatherTemp.textContent = "N/A";
  }
}

fetchWeather();
setInterval(fetchWeather, 600000);

