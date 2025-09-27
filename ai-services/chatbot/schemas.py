from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from datetime import datetime
from uuid import uuid4

class ChatRequest(BaseModel):
    """
    Request model for chat
    """
    message: str = Field(..., description="User message")
    conversation_id: Optional[str] = Field(None, description="Conversation ID for continuing a conversation")
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context for the conversation")

class ChatResponseData(BaseModel):
    """
    Chat response data model
    """
    message: str
    conversation_id: str
    suggestions: Optional[List[str]] = None
    data: Optional[Dict[str, Any]] = None

class ChatResponse(BaseModel):
    """
    Response model for chat endpoint
    """
    success: bool
    message: str
    conversation_id: str
    suggestions: Optional[List[str]] = None
    data: Optional[Dict[str, Any]] = None

class Message(BaseModel):
    """
    Message model
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    conversation_id: str
    user_id: str
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: Optional[Dict[str, Any]] = None

class Conversation(BaseModel):
    """
    Conversation model
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    tenant_id: str
    title: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    messages: List[Message] = []
    metadata: Optional[Dict[str, Any]] = None