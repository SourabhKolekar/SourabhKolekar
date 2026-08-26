const fs = require('fs/promises')
const got = require('got')

const OPENWEATHER_KEY = process.env.OPENWEATHER_KEY
const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5/forecast'
const MELBOURNE = {
  latitude: -37.8136,
  longitude: 144.9631,
}

function getWeatherEmoji(conditionId) {
  if (conditionId >= 200 && conditionId < 300) return '⛈'
  if (conditionId >= 300 && conditionId < 400) return '🌦'
  if (conditionId >= 500 && conditionId < 600) return '🌧'
  if (conditionId >= 600 && conditionId < 700) return '❄️'
  if (conditionId >= 700 && conditionId < 800) return '🌫'
  if (conditionId === 800) return '☀️'
  if (conditionId === 801) return '🌤'
  if (conditionId === 802) return '🌥'
  return '☁️'
}

function getLocalDateKey(timestampSeconds, timezoneOffsetSeconds) {
  return new Date(
    (timestampSeconds + timezoneOffsetSeconds) * 1000
  ).toISOString().slice(0, 10)
}

async function generateProfileSvg() {
  if (!OPENWEATHER_KEY) {
    throw new Error('OPENWEATHER_KEY is not configured')
  }

  const { body } = await got(OPENWEATHER_URL, {
    searchParams: {
      lat: MELBOURNE.latitude,
      lon: MELBOURNE.longitude,
      appid: OPENWEATHER_KEY,
      units: 'metric',
    },
    responseType: 'json',
    timeout: {
      request: 10000,
    },
    retry: {
      limit: 2,
    },
  })

  if (!Array.isArray(body.list) || body.list.length === 0) {
    throw new Error('OpenWeather returned no forecast data')
  }

  const timezoneOffsetSeconds = Number(body.city?.timezone ?? 0)
  const todayDateKey = getLocalDateKey(
    Math.floor(Date.now() / 1000),
    timezoneOffsetSeconds
  )

  const todayForecasts = body.list.filter(
    (forecast) =>
      getLocalDateKey(forecast.dt, timezoneOffsetSeconds) === todayDateKey
  )
  const relevantForecasts =
    todayForecasts.length > 0 ? todayForecasts : [body.list[0]]

  const warmestForecast = relevantForecasts.reduce((warmest, forecast) => {
    const warmestTemperature = warmest.main.temp_max ?? warmest.main.temp
    const forecastTemperature = forecast.main.temp_max ?? forecast.main.temp

    return forecastTemperature > warmestTemperature ? forecast : warmest
  })

  const degC = Math.round(
    Number(warmestForecast.main.temp_max ?? warmestForecast.main.temp)
  )
  const conditionId = Number(warmestForecast.weather?.[0]?.id)
  const weatherEmoji = getWeatherEmoji(conditionId)
  const todayDay = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'Australia/Melbourne',
  }).format(new Date())

  let data = await fs.readFile('template.svg', 'utf-8')
  const replacements = {
    '{degC}': degC,
    '{weatherEmoji}': weatherEmoji,
    '{todayDay}': todayDay,
  }

  for (const [placeholder, value] of Object.entries(replacements)) {
    if (!data.includes(placeholder)) {
      throw new Error(`Missing template placeholder: ${placeholder}`)
    }
    data = data.replace(placeholder, String(value))
  }

  await fs.writeFile('chat.svg', data)
  console.log(
    `Generated chat.svg for ${todayDay}: ${degC}°C ${weatherEmoji}`
  )
}

generateProfileSvg().catch((error) => {
  const message = error.response?.statusCode
    ? `OpenWeather request failed with HTTP ${error.response.statusCode}`
    : error.message

  console.error(message)
  process.exitCode = 1
})
