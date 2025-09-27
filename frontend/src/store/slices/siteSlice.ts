import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

interface Site {
  id: string;
  name: string;
  address: string;
  capacity: number;
  installationDate: string;
  tenantId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface SiteState {
  sites: Site[];
  currentSite: Site | null;
  loading: boolean;
  error: string | null;
}

const initialState: SiteState = {
  sites: [],
  currentSite: null,
  loading: false,
  error: null,
};

// Get all sites for tenant
export const getSites = createAsyncThunk(
  'site/getSites',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { auth } = getState() as any;
      
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/sites`, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
      });
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to get sites');
    }
  }
);

// Get site by ID
export const getSiteById = createAsyncThunk(
  'site/getSiteById',
  async (siteId: string, { getState, rejectWithValue }) => {
    try {
      const { auth } = getState() as any;
      
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/sites/${siteId}`, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
      });
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to get site');
    }
  }
);

const siteSlice = createSlice({
  name: 'site',
  initialState,
  reducers: {
    clearSiteError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Get all sites
      .addCase(getSites.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getSites.fulfilled, (state, action) => {
        state.loading = false;
        state.sites = action.payload.sites;
      })
      .addCase(getSites.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      
      // Get site by ID
      .addCase(getSiteById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getSiteById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentSite = action.payload.site;
      })
      .addCase(getSiteById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearSiteError } = siteSlice.actions;

export default siteSlice.reducer;