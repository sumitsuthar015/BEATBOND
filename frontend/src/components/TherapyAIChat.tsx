import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";
import { Send, Loader2, Bot, User } from "lucide-react";
import { toast } from "react-hot-toast";
import { axiosInstance } from "@/lib/axios";
import { Avatar, AvatarFallback } from "./ui/avatar";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

const MAX_CHARS = 500;
// FIX: cap how much history we send to the backend on every request so
// a long-running conversation doesn't silently grow into a huge,
// expensive (or context-limit-breaking) payload.
const MAX_HISTORY_MESSAGES = 20;

export const TherapyAIChat = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi, I'm here to listen and support you. Feel free to share what's on your mind.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  const isOverLimit = input.length > MAX_CHARS;

  const sendMessage = async () => {
    const trimmedInput = input.trim();

    // FIX: the UI displayed a "x/500" counter but never actually enforced
    // it. Now sending is blocked (with feedback) once over the limit,
    // matching what the counter promises.
    if (!trimmedInput || isLoading) return;
    if (trimmedInput.length > MAX_CHARS) {
      toast.error(`Please keep messages under ${MAX_CHARS} characters.`);
      return;
    }

    try {
      setIsLoading(true);
      const userMessage: Message = {
        role: "user",
        content: trimmedInput,
        timestamp: new Date()
      };

      const fullHistory = [...messages, userMessage];
      setMessages(fullHistory);
      setInput("");

      // FIX: only send the most recent MAX_HISTORY_MESSAGES messages,
      // not the entire conversation from the start.
      const historyToSend = fullHistory.slice(-MAX_HISTORY_MESSAGES);

      const response = await axiosInstance.post("/chat", {
        messages: historyToSend.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
      });

      // FIX: check the type explicitly instead of relying on truthiness,
      // so a legitimate (if unhelpful) empty-string reply from the
      // model isn't treated as an error.
      if (typeof response.data?.message === "string") {
        const assistantMessage: Message = {
          role: "assistant",
          content: response.data.message,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: any) {
      console.error('Chat error:', error);

      let errorMessage = "I'm having trouble connecting right now. ";

      if (error.response?.status === 503) {
        errorMessage = "The AI chat service is currently unavailable. Please try again later.";
      } else if (error.response?.status === 400) {
        errorMessage = "There was an issue with your message. Please try rephrasing it.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage += error.message;
      }

      toast.error(errorMessage);

      const errorAssistantMessage: Message = {
        role: "assistant",
        content: "I apologize, but I encountered an error. Please try again in a moment.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorAssistantMessage]);
    } finally {
      setIsLoading(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[600px] w-full max-w-3xl mx-auto bg-background rounded-xl border shadow-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-gradient-to-r from-purple-500/10 to-blue-500/10">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500">
              <Bot className="h-5 w-5 text-white" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-lg">AI Therapy Assistant</h2>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Thinking..." : "Here to listen and support"}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 pb-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className={
                  message.role === "user"
                    ? "bg-primary"
                    : "bg-gradient-to-br from-purple-500 to-blue-500"
                }>
                  {message.role === "user" ? (
                    <User className="h-4 w-4 text-white" />
                  ) : (
                    <Bot className="h-4 w-4 text-white" />
                  )}
                </AvatarFallback>
              </Avatar>

              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
                {message.timestamp && (
                  <p className={`text-xs mt-1 ${
                    message.role === "user"
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}>
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500">
                  <Bot className="h-4 w-4 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t bg-muted/30">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Share your thoughts..."
              // FIX: maxLength now actually enforces the limit the counter
              // advertises, instead of just displaying a number.
              maxLength={MAX_CHARS}
              className="resize-none min-h-[44px] max-h-[120px] pr-12"
              rows={1}
              disabled={isLoading}
            />
            <div
              className={`absolute bottom-2 right-2 text-xs ${
                isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"
              }`}
            >
              {input.length > 0 && `${input.length}/${MAX_CHARS}`}
            </div>
          </div>
          <Button
            onClick={sendMessage}
            disabled={isLoading || !input.trim() || isOverLimit}
            size="icon"
            className="h-11 w-11 rounded-full flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          This is an AI assistant. For professional help, please contact a licensed therapist.
        </p>
      </div>
    </div>
  );
};