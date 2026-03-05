import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, User, Bot, Loader2, Plus, Trash2, MessageSquare, ChevronLeft, ChevronRight, Cloud } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

interface ChatHistory {
  id: string;
  message: string;
  response: string;
  created_at: string;
  session_id: string | null;
}

// 快捷问题建议
const quickQuestions = [
  "我最近的体重变化如何？",
  "帮我记录今天的体重",
  "根据我的情况调整营养计划",
  "给我看看我的训练计划",
];

export default function Chat() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 处理从其他页面跳转过来的初始消息
  useEffect(() => {
    const state = location.state as { initialMessage?: string } | null;
    if (state?.initialMessage && currentSession && !sending) {
      // 清除 location state，避免重复发送
      navigate(location.pathname, { replace: true, state: null });
      // 自动发送初始消息
      setTimeout(() => {
        handleSend(state.initialMessage);
      }, 500);
    }
  }, [currentSession, location.state]);

  // 加载会话列表
  useEffect(() => {
    if (user?.id) {
      loadSessions();
    }
  }, [user?.id]);

  // 加载会话的消息
  useEffect(() => {
    if (currentSession?.id) {
      loadSessionMessages(currentSession.id);
    }
  }, [currentSession?.id]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      // 获取所有会话及其消息数量
      const { data: sessionsData, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // 获取每个会话的消息数量
      if (sessionsData && sessionsData.length > 0) {
        const sessionsWithCount = await Promise.all(
          sessionsData.map(async (session) => {
            const { count } = await supabase
              .from('chat_history')
              .select('*', { count: 'exact', head: true })
              .eq('session_id', session.id);
            return { ...session, message_count: count || 0 };
          })
        );
        setSessions(sessionsWithCount);

        // 如果没有当前会话，选择第一个
        if (!currentSession && sessionsWithCount.length > 0) {
          setCurrentSession(sessionsWithCount[0]);
        } else if (currentSession) {
          // 更新当前会话的信息
          const updated = sessionsWithCount.find(s => s.id === currentSession.id);
          if (updated) setCurrentSession(updated);
        }
      } else {
        // 没有会话，创建一个新的
        await createNewSession();
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
    setLoading(false);
  };

  const loadSessionMessages = async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_history')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const historyMessages: Message[] = [];
        data.forEach((item: ChatHistory) => {
          historyMessages.push(
            {
              id: `${item.id}-user`,
              text: item.message,
              sender: 'user',
              timestamp: new Date(item.created_at),
            },
            {
              id: `${item.id}-ai`,
              text: item.response,
              sender: 'ai',
              timestamp: new Date(item.created_at),
            }
          );
        });
        setMessages(historyMessages);
      } else {
        setMessages([
          {
            id: 'welcome',
            text: "你好！我是 FitKeeper AI 健身助手 💪\n\n我可以帮你：\n• 查看和分析你的体重变化\n• 记录体重数据\n• 调整营养计划\n• 查看训练计划\n\n有什么可以帮你的吗？",
            sender: 'ai',
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      setMessages([]);
    }
  };

  const createNewSession = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: '新对话',
        })
        .select()
        .single();

      if (error) throw error;

      const newSession = { ...data, message_count: 0 };
      setSessions([newSession, ...sessions]);
      setCurrentSession(newSession);
      setMessages([
        {
          id: 'welcome',
          text: "你好！我是 FitKeeper AI 健身助手 💪\n\n有什么可以帮你的吗？",
          sender: 'ai',
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('确定要删除这个对话吗？')) return;

    try {
      // 删除会话（会自动删除关联的消息，因为设置了 ON DELETE CASCADE）
      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      const remainingSessions = sessions.filter(s => s.id !== sessionId);
      setSessions(remainingSessions);

      if (currentSession?.id === sessionId) {
        if (remainingSessions.length > 0) {
          setCurrentSession(remainingSessions[0]);
        } else {
          createNewSession();
        }
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const updateSessionTitle = async (sessionId: string, firstMessage: string) => {
    // 取前20个字符作为标题
    const title = firstMessage.slice(0, 20) + (firstMessage.length > 20 ? '...' : '');
    await supabase
      .from('chat_sessions')
      .update({ title })
      .eq('id', sessionId);
  };

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || sending || !currentSession) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          messages: messages.concat(userMessage).map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text,
          })),
        }),
      });

      const data = await response.json();

      if (data.reply) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: data.reply,
          sender: 'ai',
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, aiMessage]);

        // 保存到数据库
        await supabase.from('chat_history').insert({
          user_id: user!.id,
          session_id: currentSession.id,
          message: userMessage.text,
          response: data.reply,
        });

        // 如果是第一条消息，更新会话标题
        if (messages.length <= 1) {
          await updateSessionTitle(currentSession.id, text);
        }

        // 更新会话的 updated_at
        await supabase
          .from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', currentSession.id);

        // 重新加载会话列表以更新顺序
        loadSessions();
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: '抱歉，连接服务器出现问题，请稍后再试。',
          sender: 'ai',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return '今天';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '昨天';
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  // 按日期分组会话
  const groupedSessions = sessions.reduce((acc, session) => {
    const dateKey = formatDate(session.updated_at);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(session);
    return acc;
  }, {} as Record<string, ChatSession[]>);

  return (
    <div className="flex h-[calc(100vh-6rem)] bg-white rounded-lg shadow overflow-hidden">
      {/* 侧边栏 - 会话列表 */}
      <div
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } flex-shrink-0 border-r border-gray-200 transition-all duration-300 overflow-hidden flex flex-col bg-gray-50`}
      >
        <div className="p-3 border-b border-gray-200 flex justify-between items-center">
          <span className="font-medium text-gray-700">对话列表</span>
          <button
            onClick={createNewSession}
            className="p-1.5 hover:bg-gray-200 rounded-md text-gray-600 hover:text-gray-900"
            title="新建对话"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {Object.entries(groupedSessions).map(([date, dateSessions]) => (
            <div key={date}>
              <div className="px-3 py-2 text-xs text-gray-400 font-medium">{date}</div>
              {dateSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => setCurrentSession(session)}
                  className={`group px-3 py-2 mx-2 rounded-lg cursor-pointer flex items-center justify-between ${
                    currentSession?.id === session.id
                      ? 'bg-orange-100 text-orange-900'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <MessageSquare className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm truncate">{session.title}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 存储位置指示 */}
        <div className="p-3 border-t border-gray-200 text-xs text-gray-500 flex items-center gap-2">
          <Cloud className="h-4 w-4 text-green-500" />
          <span>数据存储在云端数据库</span>
        </div>
      </div>

      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col">
        {/* 头部 */}
        <div className="p-3 border-b border-gray-200 flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600"
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <h2 className="font-medium text-gray-900">
            {currentSession?.title || '新对话'}
          </h2>
          <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
            <Cloud className="h-3.5 w-3.5 text-green-500" />
            <span>云端</span>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] ${
                    message.sender === 'user'
                      ? 'bg-orange-600 text-white rounded-l-xl rounded-tr-xl'
                      : 'bg-gray-100 text-gray-900 rounded-r-xl rounded-tl-xl'
                  } p-3 shadow-sm`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-0.5">
                      {message.sender === 'user' ? (
                        <User className="h-4 w-4 text-orange-200" />
                      ) : (
                        <Bot className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:my-1 prose-table:my-2 prose-th:p-2 prose-td:p-2 prose-th:border prose-td:border prose-th:border-gray-300 prose-td:border-gray-300">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                      </div>
                      <span className="text-xs opacity-60 mt-1 block text-right">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-900 rounded-r-xl rounded-tl-xl p-3 shadow-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-gray-500" />
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                <span className="text-sm text-gray-500">正在思考...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 快捷问题 */}
        {messages.length <= 1 && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap gap-2">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  className="text-xs px-3 py-1.5 bg-orange-50 text-orange-700 rounded-full hover:bg-orange-100 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 输入框 */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="问你的 AI 教练..."
              className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-sm p-3 border"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}