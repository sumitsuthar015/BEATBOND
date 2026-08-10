import dotenv from 'dotenv';

dotenv.config();

let groq = null;
let isGroqAvailable = false;
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';

// Initialize Groq
const initializeGroq = async () => {
  try {
    const { Groq } = await import('groq-sdk');
    if (process.env.GROQ_API_KEY) {
      groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });
      isGroqAvailable = true;
      console.log('✅ Groq API initialized successfully');
      console.log('✅ API Key present:', process.env.GROQ_API_KEY ? 'Yes' : 'No');
    } else {
      console.log('⚠️ GROQ_API_KEY not found in environment variables');
      console.log('⚠️ AI chat features will be disabled');
    }
  } catch (error) {
    console.error('⚠️ Error initializing Groq SDK:', error.message);
    console.log('⚠️ AI chat features will be disabled');
  }
};

// Initialize on startup
initializeGroq();

const systemPrompt = `You are an empathetic AI therapist assistant. Your role is to:
1. Listen carefully to users sharing their emotional struggles
2. Provide supportive and understanding responses
3. Offer gentle guidance and coping strategies when appropriate
4. Maintain a compassionate and non-judgmental tone
5. Encourage professional help when necessary
6. Never give medical advice or try to diagnose conditions

Remember to:
- Validate their feelings
- Show empathy and understanding
- Focus on emotional support
- Be patient and gentle
- Maintain appropriate boundaries
- Keep responses concise (maximum 100 words)
- Use a warm, conversational tone`;

export const chatWithAI = async (req, res) => {
  // Check if Groq is available
  if (!isGroqAvailable) {
    console.log('❌ Groq not available, returning 503');
    return res.status(503).json({ 
      error: 'AI chat service is currently unavailable',
      message: 'The AI chat feature is not configured. Please contact support.'
    });
  }

  try {
    const { messages } = req.body;

    // Validate input
    if (!messages || !Array.isArray(messages)) {
      console.log('❌ Invalid messages format:', messages);
      return res.status(400).json({ 
        error: 'Invalid messages format',
        message: 'Please provide a valid messages array'
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({ 
        error: 'Empty messages array',
        message: 'Please provide at least one message'
      });
    }

    // Validate message structure
    const isValid = messages.every(msg => 
      msg.role && 
      msg.content && 
      (msg.role === 'user' || msg.role === 'assistant')
    );

    if (!isValid) {
      console.log('❌ Invalid message structure:', messages);
      return res.status(400).json({ 
        error: 'Invalid message structure',
        message: 'Each message must have role and content properties'
      });
    }

    console.log('📤 Sending request to Groq API...');
    console.log('Messages count:', messages.length);

    // Create chat completion
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ],
      // mixtral-8x7b-32768 was retired by Groq. Keep this configurable but
      // default to the supported model already used by the mood service.
      model: GROQ_CHAT_MODEL,
      temperature: 0.7,
      max_tokens: 500,
      top_p: 0.8,
      stream: false,
    });

    console.log('✅ Received response from Groq API');

    // Validate response
    if (!completion?.choices?.[0]?.message?.content) {
      console.error('❌ Invalid response structure:', completion);
      return res.status(500).json({ 
        error: 'Invalid response from AI service',
        message: 'Received an unexpected response format'
      });
    }

    const responseContent = completion.choices[0].message.content;
    console.log('✅ Sending response to client, length:', responseContent.length);

    res.json({ 
      message: responseContent,
      model: completion.model,
      usage: completion.usage
    });

  } catch (error) {
    console.error('❌ Chat API Error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status
    });

    // Handle specific Groq API errors
    if (error.status === 401) {
      return res.status(503).json({ 
        error: 'Authentication error',
        message: 'API authentication failed. Please contact support.'
      });
    }

    if (error.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again in a moment.'
      });
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({ 
        error: 'Connection error',
        message: 'Unable to connect to AI service. Please try again.'
      });
    }

    res.status(500).json({ 
      error: 'Internal server error',
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
};

// Health check endpoint
export const checkChatHealth = async (req, res) => {
  res.json({
    available: isGroqAvailable,
    apiKeyConfigured: !!process.env.GROQ_API_KEY,
    status: isGroqAvailable ? 'operational' : 'unavailable'
  });
};
