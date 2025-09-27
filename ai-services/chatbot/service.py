import logging
import random
from typing import Dict, List, Optional, Any
from datetime import datetime
from uuid import uuid4

from chatbot.schemas import ChatResponseData, Message, Conversation

logger = logging.getLogger(__name__)

class ChatbotService:
    """
    Service for chatbot functionality
    """
    
    # In-memory storage for conversations (would be a database in production)
    conversations: Dict[str, Conversation] = {}
    
    async def process_chat(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> ChatResponseData:
        """
        Process a chat message and generate a response
        """
        logger.info(f"Processing chat message for user {user_id}: {message[:50]}...")
        
        # Get or create conversation
        conversation = None
        if conversation_id and conversation_id in self.conversations:
            conversation = self.conversations[conversation_id]
            
            # Verify user has access to this conversation
            if conversation.user_id != user_id:
                logger.warning(f"User {user_id} attempted to access conversation {conversation_id} belonging to user {conversation.user_id}")
                raise ValueError("You do not have access to this conversation")
        
        if not conversation:
            # Create new conversation
            conversation_id = str(uuid4())
            title = self._generate_title_from_message(message)
            
            conversation = Conversation(
                id=conversation_id,
                user_id=user_id or "anonymous",
                tenant_id=tenant_id or "default",
                title=title,
                metadata={"context": context} if context else {},
            )
            
            self.conversations[conversation_id] = conversation
        
        # Add user message to conversation
        user_message = Message(
            conversation_id=conversation_id,
            user_id=user_id or "anonymous",
            role="user",
            content=message,
            metadata={"context": context} if context else {},
        )
        
        conversation.messages.append(user_message)
        
        # Generate response
        response_text, suggestions, data = self._generate_response(message, conversation, context)
        
        # Add assistant message to conversation
        assistant_message = Message(
            conversation_id=conversation_id,
            user_id="system",
            role="assistant",
            content=response_text,
            metadata={"suggestions": suggestions, "data": data},
        )
        
        conversation.messages.append(assistant_message)
        
        # Update conversation
        conversation.updated_at = datetime.now()
        self.conversations[conversation_id] = conversation
        
        return ChatResponseData(
            message=response_text,
            conversation_id=conversation_id,
            suggestions=suggestions,
            data=data,
        )
    
    async def get_conversations(
        self,
        user_id: str,
        tenant_id: Optional[str] = None,
    ) -> List[Dict]:
        """
        Get all conversations for a user
        """
        user_conversations = []
        
        for conv_id, conv in self.conversations.items():
            if conv.user_id == user_id:
                user_conversations.append({
                    "id": conv.id,
                    "title": conv.title,
                    "created_at": conv.created_at.isoformat(),
                    "updated_at": conv.updated_at.isoformat(),
                    "message_count": len(conv.messages),
                })
        
        return user_conversations
    
    async def get_conversation(
        self,
        conversation_id: str,
        user_id: str,
        tenant_id: Optional[str] = None,
    ) -> Optional[Dict]:
        """
        Get a specific conversation
        """
        if conversation_id not in self.conversations:
            return None
        
        conversation = self.conversations[conversation_id]
        
        # Verify user has access to this conversation
        if conversation.user_id != user_id:
            logger.warning(f"User {user_id} attempted to access conversation {conversation_id} belonging to user {conversation.user_id}")
            return None
        
        return {
            "id": conversation.id,
            "title": conversation.title,
            "created_at": conversation.created_at.isoformat(),
            "updated_at": conversation.updated_at.isoformat(),
            "messages": [
                {
                    "id": msg.id,
                    "role": msg.role,
                    "content": msg.content,
                    "timestamp": msg.timestamp.isoformat(),
                }
                for msg in conversation.messages
            ],
            "metadata": conversation.metadata,
        }
    
    def _generate_title_from_message(self, message: str) -> str:
        """
        Generate a title for a conversation based on the first message
        """
        # In a real implementation, this would use NLP to extract a meaningful title
        if len(message) <= 30:
            return message
        
        return message[:27] + "..."
    
    def _generate_response(
        self,
        message: str,
        conversation: Conversation,
        context: Optional[Dict[str, Any]] = None,
    ) -> tuple[str, List[str], Optional[Dict[str, Any]]]:
        """
        Generate a response to a user message
        """
        # In a real implementation, this would use a language model to generate responses
        # For now, we'll use simple pattern matching
        
        message_lower = message.lower()
        
        # Check for specific patterns
        if any(keyword in message_lower for keyword in ["hello", "hi", "hey", "greetings"]):
            return (
                "Hello! I'm your Nexus Solar assistant. How can I help you today?",
                ["Show me my energy production", "How much have I saved?", "Explain my bill"],
                None,
            )
        
        elif any(keyword in message_lower for keyword in ["production", "generation", "output"]):
            # Mock data for energy production
            data = {
                "daily_production": round(random.uniform(20, 50), 2),
                "monthly_production": round(random.uniform(500, 1500), 2),
                "yearly_production": round(random.uniform(6000, 18000), 2),
                "unit": "kWh",
            }
            
            return (
                f"Your solar system has generated {data['daily_production']} kWh today, {data['monthly_production']} kWh this month, and {data['yearly_production']} kWh this year.",
                ["Compare to last month", "Show me hourly breakdown", "What's my efficiency?"],
                data,
            )
        
        elif any(keyword in message_lower for keyword in ["saving", "saved", "savings", "financial"]):
            # Mock data for savings
            data = {
                "daily_savings": round(random.uniform(30, 100), 2),
                "monthly_savings": round(random.uniform(900, 3000), 2),
                "yearly_savings": round(random.uniform(10000, 36000), 2),
                "currency": "ZAR",
            }
            
            return (
                f"You've saved R{data['daily_savings']} today, R{data['monthly_savings']} this month, and R{data['yearly_savings']} this year with your solar system.",
                ["Show me my ROI", "Compare to grid costs", "Projected annual savings"],
                data,
            )
        
        elif any(keyword in message_lower for keyword in ["bill", "invoice", "reconciliation"]):
            # Mock data for bill reconciliation
            data = {
                "last_bill_amount": round(random.uniform(500, 2000), 2),
                "expected_amount": round(random.uniform(400, 1800), 2),
                "variance": round(random.uniform(-200, 200), 2),
                "variance_percentage": round(random.uniform(-20, 20), 2),
                "currency": "ZAR",
            }
            
            variance_text = "higher than" if data["variance"] > 0 else "lower than"
            
            return (
                f"Your last utility bill was R{data['last_bill_amount']}, which is {abs(data['variance_percentage'])}% {variance_text} expected. The AI analysis shows a variance of R{abs(data['variance'])}.",
                ["Explain the variance", "Show bill history", "How can I reduce my bill?"],
                data,
            )
        
        elif any(keyword in message_lower for keyword in ["forecast", "predict", "future"]):
            # Mock data for forecasts
            data = {
                "tomorrow_production": round(random.uniform(20, 50), 2),
                "next_week_production": round(random.uniform(140, 350), 2),
                "next_month_production": round(random.uniform(600, 1500), 2),
                "confidence": round(random.uniform(70, 95), 2),
                "unit": "kWh",
            }
            
            return (
                f"Based on weather forecasts and historical data, I predict your system will generate {data['tomorrow_production']} kWh tomorrow, {data['next_week_production']} kWh next week, and {data['next_month_production']} kWh next month. This prediction has a {data['confidence']}% confidence level.",
                ["Show me the weather forecast", "What affects production?", "Show best production days"],
                data,
            )
        
        else:
            # Default response
            return (
                "I'm here to help with your solar system. You can ask about energy production, savings, bill reconciliation, or forecasts.",
                ["Show me my energy production", "How much have I saved?", "Explain my bill"],
                None,
            )