const axios = require('axios');
const { createLogger } = require('../utils/logger');
const { redisClient } = require('../services/redis.service');

const logger = createLogger('weather-controller');

/**
 * Weather controller for handling weather data requests
 */
class WeatherController {
  /**
   * Get current weather data for a location
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getCurrentWeather(req, res) {
    try {
      const { lat, lon, _t } = req.query;
      
      if (!lat || !lon) {
        return res.status(400).json({ 
          success: false, 
          message: 'Latitude and longitude are required' 
        });
      }
      
      // Generate cache key
      const cacheKey = `weather:${lat}:${lon}`;
      
      // Check if client explicitly requested fresh data with cache-busting
      const bypassCache = _t ? true : false;
      
      // Try to get from cache if not bypassing
      if (!bypassCache) {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
          const parsedData = JSON.parse(cachedData);
          const cacheTime = new Date(parsedData.timestamp);
          const now = new Date();
          
          // Only use cache if it's less than 30 minutes old
          if ((now - cacheTime) < 30 * 60 * 1000) {
            logger.debug(`Returning cached weather data for ${lat},${lon}`);
            return res.json(parsedData.data);
          }
          
          logger.debug(`Cached weather data for ${lat},${lon} is stale, fetching fresh data`);
        }
      }
      
      // Fetch fresh data from weather API
      const apiKey = process.env.WEATHER_API_KEY;
      const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
      
      const response = await axios.get(weatherApiUrl, {
        timeout: 5000, // 5 second timeout
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.status !== 200) {
        throw new Error(`Weather API returned status ${response.status}`);
      }
      
      // Transform the data
      const weatherData = {
        temperature: Math.round(response.data.main.temp),
        feelsLike: Math.round(response.data.main.feels_like),
        humidity: response.data.main.humidity,
        pressure: response.data.main.pressure,
        windSpeed: response.data.wind.speed,
        windDirection: response.data.wind.deg,
        description: response.data.weather[0].description,
        icon: response.data.weather[0].icon,
        location: response.data.name,
        country: response.data.sys.country,
        sunrise: response.data.sys.sunrise * 1000, // Convert to milliseconds
        sunset: response.data.sys.sunset * 1000, // Convert to milliseconds
        timestamp: new Date().toISOString()
      };
      
      // Cache the data with timestamp for 30 minutes
      const cacheData = {
        data: weatherData,
        timestamp: new Date().toISOString()
      };
      
      await redisClient.set(cacheKey, JSON.stringify(cacheData), 'EX', 1800); // 30 minutes
      
      logger.debug(`Fetched and cached fresh weather data for ${lat},${lon}`);
      return res.json(weatherData);
    } catch (error) {
      logger.error('Error fetching weather data:', error);
      
      // Try to return stale cache as fallback if available
      if (req.query.lat && req.query.lon) {
        const cacheKey = `weather:${req.query.lat}:${req.query.lon}`;
        const cachedData = await redisClient.get(cacheKey);
        
        if (cachedData) {
          const parsedData = JSON.parse(cachedData);
          logger.debug(`Returning stale cached weather data as fallback for ${req.query.lat},${req.query.lon}`);
          return res.json({
            ...parsedData.data,
            isFallback: true
          });
        }
      }
      
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch weather data',
        error: error.message
      });
    }
  }
  
  /**
   * Get weather forecast for a location
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getForecast(req, res) {
    try {
      const { lat, lon, days = 5 } = req.query;
      
      if (!lat || !lon) {
        return res.status(400).json({ 
          success: false, 
          message: 'Latitude and longitude are required' 
        });
      }
      
      // Generate cache key
      const cacheKey = `forecast:${lat}:${lon}:${days}`;
      
      // Try to get from cache
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        const cacheTime = new Date(parsedData.timestamp);
        const now = new Date();
        
        // Only use cache if it's less than 3 hours old
        if ((now - cacheTime) < 3 * 60 * 60 * 1000) {
          logger.debug(`Returning cached forecast data for ${lat},${lon}`);
          return res.json(parsedData.data);
        }
      }
      
      // Fetch fresh data from weather API
      const apiKey = process.env.WEATHER_API_KEY;
      const forecastApiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=${days * 8}&appid=${apiKey}`;
      
      const response = await axios.get(forecastApiUrl, {
        timeout: 5000 // 5 second timeout
      });
      
      if (response.status !== 200) {
        throw new Error(`Weather API returned status ${response.status}`);
      }
      
      // Transform the data
      const forecastData = {
        location: response.data.city.name,
        country: response.data.city.country,
        forecast: response.data.list.map(item => ({
          timestamp: item.dt * 1000, // Convert to milliseconds
          temperature: Math.round(item.main.temp),
          feelsLike: Math.round(item.main.feels_like),
          humidity: item.main.humidity,
          pressure: item.main.pressure,
          windSpeed: item.wind.speed,
          windDirection: item.wind.deg,
          description: item.weather[0].description,
          icon: item.weather[0].icon
        }))
      };
      
      // Cache the data with timestamp for 3 hours
      const cacheData = {
        data: forecastData,
        timestamp: new Date().toISOString()
      };
      
      await redisClient.set(cacheKey, JSON.stringify(cacheData), 'EX', 10800); // 3 hours
      
      logger.debug(`Fetched and cached fresh forecast data for ${lat},${lon}`);
      return res.json(forecastData);
    } catch (error) {
      logger.error('Error fetching forecast data:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch forecast data',
        error: error.message
      });
    }
  }
}

module.exports = new WeatherController();