import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

interface Bill {
  id: string;
  siteId: string;
  utilityCompany: string;
  billPeriodStart: string;
  billPeriodEnd: string;
  totalAmount: number;
  kwhConsumed: number;
  status: string;
  pdfUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface Reconciliation {
  id: string;
  billId: string;
  solarProduction: number;
  gridImport: number;
  gridExport: number;
  expectedBill: number;
  actualBill: number;
  variance: number;
  variancePercentage: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface BillState {
  bills: Bill[];
  currentBill: Bill | null;
  reconciliations: Reconciliation[];
  currentReconciliation: Reconciliation | null;
  loading: boolean;
  error: string | null;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  uploadProgress: number;
}

const initialState: BillState = {
  bills: [],
  currentBill: null,
  reconciliations: [],
  currentReconciliation: null,
  loading: false,
  error: null,
  uploadStatus: 'idle',
  uploadProgress: 0,
};

// Get all bills for site
export const getBills = createAsyncThunk(
  'bill/getBills',
  async (siteId: string, { getState, rejectWithValue }) => {
    try {
      const { auth } = getState() as any;
      
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/sites/${siteId}/bills`, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
      });
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to get bills');
    }
  }
);

// Get bill by ID
export const getBillById = createAsyncThunk(
  'bill/getBillById',
  async (billId: string, { getState, rejectWithValue }) => {
    try {
      const { auth } = getState() as any;
      
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/bills/${billId}`, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
      });
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to get bill');
    }
  }
);

// Upload bill PDF
export const uploadBill = createAsyncThunk(
  'bill/uploadBill',
  async ({ siteId, formData }: { siteId: string; formData: FormData }, { getState, rejectWithValue, dispatch }) => {
    try {
      const { auth } = getState() as any;
      
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/sites/${siteId}/bills/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
            dispatch(setUploadProgress(percentCompleted));
          },
        }
      );
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to upload bill');
    }
  }
);

// Get reconciliation for bill
export const getReconciliation = createAsyncThunk(
  'bill/getReconciliation',
  async (billId: string, { getState, rejectWithValue }) => {
    try {
      const { auth } = getState() as any;
      
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/bills/${billId}/reconciliation`, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
      });
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to get reconciliation');
    }
  }
);

const billSlice = createSlice({
  name: 'bill',
  initialState,
  reducers: {
    clearBillError: (state) => {
      state.error = null;
    },
    setUploadProgress: (state, action) => {
      state.uploadProgress = action.payload;
    },
    resetUploadStatus: (state) => {
      state.uploadStatus = 'idle';
      state.uploadProgress = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      // Get all bills
      .addCase(getBills.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getBills.fulfilled, (state, action) => {
        state.loading = false;
        state.bills = action.payload.bills;
      })
      .addCase(getBills.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      
      // Get bill by ID
      .addCase(getBillById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getBillById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentBill = action.payload.bill;
      })
      .addCase(getBillById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      
      // Upload bill
      .addCase(uploadBill.pending, (state) => {
        state.uploadStatus = 'uploading';
        state.error = null;
      })
      .addCase(uploadBill.fulfilled, (state, action) => {
        state.uploadStatus = 'success';
        state.bills = [...state.bills, action.payload.bill];
        state.currentBill = action.payload.bill;
      })
      .addCase(uploadBill.rejected, (state, action) => {
        state.uploadStatus = 'error';
        state.error = action.payload as string;
      })
      
      // Get reconciliation
      .addCase(getReconciliation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getReconciliation.fulfilled, (state, action) => {
        state.loading = false;
        state.currentReconciliation = action.payload.reconciliation;
      })
      .addCase(getReconciliation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearBillError, setUploadProgress, resetUploadStatus } = billSlice.actions;

export default billSlice.reducer;