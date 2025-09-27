from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from datetime import datetime

class AnalyticsRequest(BaseModel):
    """
    Request model for batch analytics
    """
    site_ids: List[str] = Field(..., description="List of site IDs")
    data_type: str = Field(..., description="Type of analytics data to retrieve")
    period: str = Field(..., description="Time period for analytics data")
    start_date: Optional[datetime] = Field(None, description="Start date for custom period")
    end_date: Optional[datetime] = Field(None, description="End date for custom period")

class AnalyticsData(BaseModel):
    """
    Analytics data model
    """
    site_id: str
    data_type: str
    period: str
    timestamp: datetime
    values: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = None

class AnalyticsResponse(BaseModel):
    """
    Response model for analytics endpoints
    """
    success: bool
    data: List[AnalyticsData]
    message: str

class ForecastRequest(BaseModel):
    """
    Request model for forecasts
    """
    site_id: str = Field(..., description="Site ID")
    forecast_type: str = Field(..., description="Type of forecast to generate")
    time_horizon: str = Field(..., description="Time horizon for forecast")
    parameters: Optional[Dict[str, Any]] = Field(None, description="Additional parameters for forecast")

class ForecastData(BaseModel):
    """
    Forecast data model
    """
    site_id: str
    forecast_type: str
    time_horizon: str
    timestamp: datetime
    forecast_values: Dict[str, Any]
    confidence_scores: Optional[Dict[str, float]] = None
    scenarios: Optional[Dict[str, Dict[str, Any]]] = None
    model_version: str
    model_confidence: float
    ai_insights: Optional[str] = None
    key_factors: Optional[List[Dict[str, Any]]] = None
    recommendations: Optional[List[Dict[str, Any]]] = None

class ForecastResponse(BaseModel):
    """
    Response model for forecast endpoints
    """
    success: bool
    data: ForecastData
    message: str