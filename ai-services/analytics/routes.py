from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Dict, List, Optional
from datetime import datetime, timedelta

from utils.auth import verify_token
from analytics.schemas import AnalyticsRequest, AnalyticsResponse
from analytics.service import AnalyticsService

router = APIRouter()
analytics_service = AnalyticsService()

@router.get("/", response_model=AnalyticsResponse)
async def get_analytics(
    site_id: str,
    data_type: str = Query(..., description="Type of analytics data to retrieve"),
    period: str = Query(..., description="Time period for analytics data"),
    start_date: Optional[str] = Query(None, description="Start date for custom period (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom period (YYYY-MM-DD)"),
    user: Dict = Depends(verify_token),
):
    """
    Get analytics data for a site
    """
    try:
        # Convert string dates to datetime objects if provided
        start_datetime = datetime.strptime(start_date, "%Y-%m-%d") if start_date else None
        end_datetime = datetime.strptime(end_date, "%Y-%m-%d") if end_date else None
        
        # Get analytics data
        analytics_data = await analytics_service.get_analytics(
            site_id=site_id,
            data_type=data_type,
            period=period,
            start_date=start_datetime,
            end_date=end_datetime,
            user_id=user.get("sub"),
            tenant_id=user.get("tenant_id"),
        )
        
        return AnalyticsResponse(
            success=True,
            data=analytics_data,
            message="Analytics data retrieved successfully",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

@router.post("/batch", response_model=AnalyticsResponse)
async def batch_analytics(
    request: AnalyticsRequest,
    user: Dict = Depends(verify_token),
):
    """
    Get batch analytics data for multiple sites
    """
    try:
        # Get batch analytics data
        batch_analytics_data = await analytics_service.get_batch_analytics(
            site_ids=request.site_ids,
            data_type=request.data_type,
            period=request.period,
            start_date=request.start_date,
            end_date=request.end_date,
            user_id=user.get("sub"),
            tenant_id=user.get("tenant_id"),
        )
        
        return AnalyticsResponse(
            success=True,
            data=batch_analytics_data,
            message="Batch analytics data retrieved successfully",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )