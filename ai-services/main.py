import os
import logging
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer

from analytics.routes import router as analytics_router
from chatbot.routes import router as chatbot_router
from bill_processing.routes import router as bill_processing_router
from predictive_models.routes import router as predictive_models_router
from utils.auth import verify_token

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("ai-services")

# Create FastAPI app
app = FastAPI(
    title="Nexus Solar Platform AI Services",
    description="AI and ML services for the Nexus Solar Platform",
    version="0.1.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Include routers
app.include_router(
    analytics_router,
    prefix="/api/v1/analytics",
    tags=["analytics"],
    dependencies=[Depends(verify_token)],
)
app.include_router(
    chatbot_router,
    prefix="/api/v1/chatbot",
    tags=["chatbot"],
    dependencies=[Depends(verify_token)],
)
app.include_router(
    bill_processing_router,
    prefix="/api/v1/bill-processing",
    tags=["bill-processing"],
    dependencies=[Depends(verify_token)],
)
app.include_router(
    predictive_models_router,
    prefix="/api/v1/predictive-models",
    tags=["predictive-models"],
    dependencies=[Depends(verify_token)],
)

# Root endpoint
@app.get("/", tags=["root"])
async def root():
    return {
        "message": "Nexus Solar Platform AI Services",
        "version": "0.1.0",
        "endpoints": {
            "analytics": "/api/v1/analytics",
            "chatbot": "/api/v1/chatbot",
            "bill_processing": "/api/v1/bill-processing",
            "predictive_models": "/api/v1/predictive-models",
        },
    }

# Health check endpoint
@app.get("/health", tags=["health"])
async def health_check():
    return {
        "status": "ok",
        "timestamp": str(datetime.now()),
    }

if __name__ == "__main__":
    import uvicorn
    
    # Get port from environment variable or use default
    port = int(os.environ.get("PORT", 5000))
    
    # Run the application
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True if os.environ.get("ENV") == "development" else False,
    )