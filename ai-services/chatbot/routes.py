from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, List, Optional

from utils.auth import verify_token
from chatbot.schemas import ChatRequest, ChatResponse
from chatbot.service import ChatbotService

router = APIRouter()
chatbot_service = ChatbotService()

@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    user: Dict = Depends(verify_token),
):
    """
    Chat with the AI assistant
    """
    try:
        # Process chat request
        response = await chatbot_service.process_chat(
            message=request.message,
            conversation_id=request.conversation_id,
            user_id=user.get("sub"),
            tenant_id=user.get("tenant_id"),
            context=request.context,
        )
        
        return ChatResponse(
            success=True,
            message=response.message,
            conversation_id=response.conversation_id,
            suggestions=response.suggestions,
            data=response.data,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

@router.get("/conversations", response_model=List[Dict])
async def get_conversations(
    user: Dict = Depends(verify_token),
):
    """
    Get all conversations for the user
    """
    try:
        # Get conversations
        conversations = await chatbot_service.get_conversations(
            user_id=user.get("sub"),
            tenant_id=user.get("tenant_id"),
        )
        
        return conversations
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

@router.get("/conversation/{conversation_id}", response_model=Dict)
async def get_conversation(
    conversation_id: str,
    user: Dict = Depends(verify_token),
):
    """
    Get a specific conversation
    """
    try:
        # Get conversation
        conversation = await chatbot_service.get_conversation(
            conversation_id=conversation_id,
            user_id=user.get("sub"),
            tenant_id=user.get("tenant_id"),
        )
        
        if not conversation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Conversation {conversation_id} not found",
            )
        
        return conversation
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )