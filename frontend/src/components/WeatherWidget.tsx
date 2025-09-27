import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { WeatherData } from '../types/weather';
import { Spinner, Alert } from './ui';

interface WeatherWidgetProps {
  latitude?: number;
  longitude?: number;
  refreshInterval?: number; // in milliseconds
}

const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  latitude,
  longitude,
  refreshInterval = 900000, // 15 minutes default
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [staleData, setStaleData] = useState<boolean>(false);
  
  const { currentSite } = useSelector((state: RootState) => state.site);
  
  // Use site coordinates if not provided as props
  const siteLatitude = latitude || (currentSite?.latitude || 0);
  const siteLongitude = longitude || (currentSite?.longitude || 0);

  const fetchWeatherData = async () => {
    if (!siteLatitude || !siteLongitude) {
      setError('Location coordinates not available');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Add cache-busting parameter to prevent stale data
      const response = await axios.get(`/api/v1/weather`, {
        params: {
          lat: siteLatitude,
          lon: siteLongitude,
          _t: new Date().getTime() // Cache-busting timestamp
        },
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      setWeather(response.data);
      setLastUpdated(new Date());
      setStaleData(false);
      setError(null);
    } catch (err) {
      console.error('Error fetching weather data:', err);
      setError('Failed to load weather data');
      // Don't clear existing weather data on error
      // This prevents flickering but marks data as stale
      if (weather) {
        setStaleData(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Check if data is stale (older than 1 hour)
  const checkDataFreshness = () => {
    if (lastUpdated) {
      const now = new Date();
      const diffMs = now.getTime() - lastUpdated.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      
      if (diffHours > 1) {
        setStaleData(true);
      }
    }
  };

  useEffect(() => {
    fetchWeatherData();
    
    // Set up regular refresh interval
    const intervalId = setInterval(() => {
      fetchWeatherData();
    }, refreshInterval);
    
    // Set up more frequent freshness checks
    const freshnessCheckId = setInterval(() => {
      checkDataFreshness();
    }, 60000); // Check every minute
    
    return () => {
      clearInterval(intervalId);
      clearInterval(freshnessCheckId);
    };
  }, [siteLatitude, siteLongitude, refreshInterval]);

  if (loading && !weather) {
    return <Spinner size="md" />;
  }

  if (error && !weather) {
    return <Alert type="error" message={error} />;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">Weather Conditions</h3>
        {staleData && (
          <span className="text-amber-500 text-xs font-medium px-2 py-1 bg-amber-50 rounded-full">
            Data may be stale
          </span>
        )}
      </div>
      
      {weather && (
        <div className="flex items-center">
          <div className="mr-4">
            <img 
              src={`/images/weather/${weather.icon}.svg`} 
              alt={weather.description} 
              className="w-16 h-16"
            />
          </div>
          <div>
            <div className="text-2xl font-bold">{weather.temperature}°C</div>
            <div className="text-gray-600">{weather.description}</div>
            <div className="flex items-center mt-2 text-sm text-gray-500">
              <span>Humidity: {weather.humidity}%</span>
              <span className="mx-2">|</span>
              <span>Wind: {weather.windSpeed} km/h</span>
            </div>
          </div>
        </div>
      )}
      
      {lastUpdated && (
        <div className="mt-3 text-xs text-gray-500 flex justify-between items-center">
          <span>Last updated: {format(lastUpdated, 'HH:mm:ss')}</span>
          <button 
            onClick={fetchWeatherData} 
            className="text-blue-500 hover:text-blue-700"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      )}
    </div>
  );
};

export default WeatherWidget;