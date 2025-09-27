import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

interface AnalyticsData {
  id: string;
  siteId: string;
  dataType: string;
  period: string;
  data: any;
  createdAt: string;
}

interface Forecast {
  id: string;
  siteId: string;
  forecastType: string;
  timeHorizon: string;
  forecastData: any;
  confidenceScores: any;
  scenarios: any;
  modelVersion: string;
  modelConfidence: number;
  aiInsights: string;
  keyFactors: any;
  recommendations: any;
  createdAt: string;
  expiresAt: string;
}

interface AnalyticsState {
  analyticsData: AnalyticsData[];
  forecasts: Forecast[];
  currentForecast: Forecast | null;
  loading: boolean;
  error: string | null;
}

const initialState: AnalyticsState = {
  analyticsData: [],
  forecasts: [],
  currentForecast: null,
  loading: false,
  error: null,
};

// Get analytics data for site
export const getAnalyticsData = createAsyncThunk(
  'analytics/getAnalyticsData',
  async ({ siteId, dataType, period }: { siteId: string; dataType: string; period: string }, { getState, rejectWithValue }) => {
    try {
      const { auth } = getState() as any;
      
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/sites/${siteId}/analytics?dataType=${dataType}&period=${period}`,
        {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }
      );
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to get analytics data');
    }
  }
);

// Get forecasts for site
export const getForecasts = createAsyncThunk(
  'analytics/getForecasts',
  async ({ siteId, forecastType }: { siteId: string; forecastType: string }, { getState, rejectWithValue }) => {
    try {
      const { auth } = getState() as any;
      
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/sites/${siteId}/forecasts?forecastType=${forecastType}`,
        {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }
      );
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to get forecasts');
    }
  }
);

// Get forecast by ID
export const getForecastById = createAsyncThunk(
  'analytics/getForecastById',
  async (forecastId: string, { getState, rejectWithValue }) => {
    try {
      const { auth } = getState() as any;
      
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/forecasts/${forecastId}`, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
      });
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to get forecast');
    }
  }
);

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {
    clearAnalyticsError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Get analytics data
      .addCase(getAnalyticsData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAnalyticsData.fulfilled, (state, action) => {
        state.loading = false;
        state.analyticsData = action.payload.analyticsData;
      })
      .addCase(getAnalyticsData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      
      // Get forecasts
      .addCase(getForecasts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getForecasts.fulfilled, (state, action) => {
        state.loading = false;
        state.forecasts = action.payload.forecasts;
      })
      .addCase(getForecasts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      
      // Get forecast by ID
      .addCase(getForecastById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getForecastById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentForecast = action.payload.forecast;
      })
      .addCase(getForecastById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearAnalyticsError } = analyticsSlice.actions;

export default analyticsSlice.reducer;