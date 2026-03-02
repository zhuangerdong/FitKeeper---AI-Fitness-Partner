
import dotenv from 'dotenv';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

// Load environment variables
dotenv.config();

const router = express.Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

router.post('/', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Convert OpenAI message format to Anthropic format
    // Anthropic expects system prompt separate from messages array
    const systemMessage = `You are FitKeeper, an AI fitness companion. 
    Your goal is to help users with their fitness journey, providing personalized nutrition advice and workout plans.
    - Be encouraging, supportive, and knowledgeable.
    - If asked about medical advice, clarify that you are an AI and they should consult a doctor.
    - Use emojis occasionally to keep the tone friendly.
    - Keep answers concise but helpful.
    - You can provide specific meal suggestions and workout routines based on user input.`;

    // Filter out system messages from the conversation history as Anthropic handles system prompt separately
    const conversationMessages = messages
      .filter((msg: any) => msg.role !== 'system')
      .map((msg: any) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }));

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'MiniMax-M2.5',
      max_tokens: 1024,
      system: systemMessage,
      messages: conversationMessages,
    });

    // Anthropic response structure for Minimax
    // Minimax returns multiple content blocks including 'thinking', we need to find the 'text' block
    let reply = '';
    if (response.content && Array.isArray(response.content)) {
      const textBlock = response.content.find((block: any) => block.type === 'text');
      if (textBlock && 'text' in textBlock) {
        reply = textBlock.text;
      }
    }

    res.json({ reply });
  } catch (error: any) {
    console.error('Error calling Anthropic/MiniMax API:', error);
    res.status(500).json({ error: 'Failed to get response from AI', details: error.message });
  }
});

export default router;
