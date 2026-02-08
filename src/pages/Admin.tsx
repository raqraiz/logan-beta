import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, LogOut, RefreshCw, Shield } from "lucide-react";
import { ChatUsersTab } from "@/components/admin/ChatUsersTab";
import { AdminManagement } from "@/components/admin/AdminManagement";
import { LoganLogo } from "@/components/LoganLogo";

const Admin = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading && !session) {
      navigate("/auth");
    }
  }, [session, loading, navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
    toast({ title: "Signed out successfully" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3">
              <LoganLogo size="sm" showGlow={false} />
              <span className="font-display font-semibold text-lg text-foreground">Logan</span>
            </Link>
            <span className="text-muted-foreground text-sm">Admin Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden md:block">{session.user.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2 text-foreground">Pilot Dashboard</h1>
          <p className="text-muted-foreground">
            Manage participants, approve insights, and track feedback
          </p>
        </div>

        <Tabs defaultValue="chats" className="space-y-6">
          <TabsList className="grid w-full max-w-xs grid-cols-2 bg-muted border border-border">
            <TabsTrigger value="chats" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Chats</span>
            </TabsTrigger>
            <TabsTrigger value="admins" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Admins</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chats">
            <ChatUsersTab adminUserId={session.user.id} />
          </TabsContent>

          <TabsContent value="admins">
            <AdminManagement />
          </TabsContent>
        </Tabs>

      </main>
    </div>
  );
};

export default Admin;
