import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { 
  Users, RefreshCw, Search, Clock, MessageSquare, ChevronRight 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { ChatUserDetailPanel } from "./ChatUserDetailPanel";

interface ChatUserSummary {
  user_id: string;
  email: string | null;
  full_name: string | null;
  lastActivity: string | null;
  lastUserMessage: string | null;
  messageCount: number;
  hasUnreadFromUser: boolean;
}

interface ChatUsersTabProps {
  adminUserId: string;
}

export function ChatUsersTab({ adminUserId }: ChatUsersTabProps) {
  const [users, setUsers] = useState<ChatUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Get all chat messages with user info
      const { data: messages, error: messagesError } = await supabase
        .from("chat_messages")
        .select("user_id, role, created_at, content")
        .order("created_at", { ascending: false });

      if (messagesError) throw messagesError;

      // Get profiles for user info
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name");

      if (profilesError) throw profilesError;

      // Group messages by user_id
      const userMap = new Map<string, {
        messages: typeof messages;
        lastActivity: string | null;
        lastUserMessage: string | null;
        hasUnreadFromUser: boolean;
      }>();

      messages?.forEach((msg) => {
        const existing = userMap.get(msg.user_id);
        if (!existing) {
          userMap.set(msg.user_id, {
            messages: [msg],
            lastActivity: msg.created_at,
            lastUserMessage: msg.role === "user" ? msg.created_at : null,
            hasUnreadFromUser: msg.role === "user",
          });
        } else {
          existing.messages.push(msg);
          // Track last user message time
          if (msg.role === "user" && (!existing.lastUserMessage || new Date(msg.created_at) > new Date(existing.lastUserMessage))) {
            existing.lastUserMessage = msg.created_at;
          }
          // Check if there's a recent user message after last assistant message
          if (msg.role === "user") {
            const lastAssistant = existing.messages.find(m => m.role === "assistant");
            if (!lastAssistant || new Date(msg.created_at) > new Date(lastAssistant.created_at)) {
              existing.hasUnreadFromUser = true;
            }
          }
        }
      });

      // Build summaries
      const summaries: ChatUserSummary[] = Array.from(userMap.entries()).map(([userId, data]) => {
        const profile = profiles?.find(p => p.id === userId);
        return {
          user_id: userId,
          email: profile?.email || null,
          full_name: profile?.full_name || null,
          lastActivity: data.lastActivity,
          lastUserMessage: data.lastUserMessage,
          messageCount: data.messages.length,
          hasUnreadFromUser: data.hasUnreadFromUser,
        };
      });

      // Sort by last user engagement (most recent user message first)
      summaries.sort((a, b) => {
        // Prioritize unread
        if (a.hasUnreadFromUser && !b.hasUnreadFromUser) return -1;
        if (b.hasUnreadFromUser && !a.hasUnreadFromUser) return 1;
        // Then by last user message (who engaged last)
        const aTime = a.lastUserMessage ? new Date(a.lastUserMessage).getTime() : 0;
        const bTime = b.lastUserMessage ? new Date(b.lastUserMessage).getTime() : 0;
        return bTime - aTime;
      });

      setUsers(summaries);
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error loading chat users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filtered = users.filter(u =>
    (u.full_name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
    (u.email?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // If a user is selected, show the detail panel
  if (selectedUserId) {
    const selectedUser = users.find(u => u.user_id === selectedUserId);
    return (
      <div className="space-y-4">
        {/* Mobile: Back button */}
        <div className="lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedUserId(null)}
            className="gap-2"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            All Users ({users.length})
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[600px]">
          {/* Left: User list (collapsed on mobile) */}
          <div className="hidden lg:block border rounded-lg overflow-hidden">
            <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
              <span className="font-medium text-sm">{users.length} Users</span>
              <Button variant="ghost" size="sm" onClick={fetchUsers}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
              {filtered.map((u) => (
                <div
                  key={u.user_id}
                  onClick={() => setSelectedUserId(u.user_id)}
                  className={cn(
                    "px-3 py-2 cursor-pointer border-b transition-colors flex items-center gap-3",
                    selectedUserId === u.user_id ? "bg-primary/10" : "hover:bg-muted/50"
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                    {(u.full_name?.[0] || u.email?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate text-sm">
                        {u.full_name || u.email || "Unknown"}
                      </span>
                      {u.hasUnreadFromUser && (
                        <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                    {u.lastActivity && (
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(u.lastActivity), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Detail panel */}
          <div className="lg:col-span-2 border rounded-lg overflow-hidden">
            <ChatUserDetailPanel
              userId={selectedUserId}
              userName={selectedUser?.full_name || selectedUser?.email || "Unknown"}
              onClose={() => setSelectedUserId(null)}
              onRefresh={fetchUsers}
            />
          </div>
        </div>
      </div>
    );
  }

  // Default: Full user list view
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <span className="font-medium">{users.length} Chat Users</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchUsers}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* User Cards */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No chat conversations yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((u) => (
            <Card
              key={u.user_id}
              className="cursor-pointer transition-colors hover:bg-muted/50"
              onClick={() => setSelectedUserId(u.user_id)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                    {(u.full_name?.[0] || u.email?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">
                        {u.full_name || u.email || "Unknown User"}
                      </span>
                      {u.hasUnreadFromUser && (
                        <Badge variant="default" className="text-xs">New</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {u.messageCount} messages
                      </span>
                      {u.lastActivity && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(u.lastActivity), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
