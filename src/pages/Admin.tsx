import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { LogOut, RefreshCw, Shield, User, BarChart3, Megaphone, TrendingUp, Mail } from "lucide-react";
import { AdminManagement } from "@/components/admin/AdminManagement";
import { ProfilesTab } from "@/components/admin/ProfilesTab";
import { OverviewTab } from "@/components/admin/OverviewTab";
import { NotificationsTab } from "@/components/admin/NotificationsTab";
import { AttributionTab } from "@/components/admin/AttributionTab";
import { EmailsTab } from "@/components/admin/EmailsTab";
import { LoganFullLogo } from "@/components/LoganFullLogo";

const Admin = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (!session) setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      if (!loading) navigate("/auth");
      return;
    }
    const checkAdmin = async (attempt = 0) => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "super_admin"]);

      if (error) {
        console.error("Admin check error:", error);
        if (attempt < 2) {
          setTimeout(() => checkAdmin(attempt + 1), 400);
          return;
        }
        toast({ title: "Couldn't verify admin access", description: "Please try again.", variant: "destructive" });
        navigate("/");
        setLoading(false);
        return;
      }

      const roles = (data ?? []).map((r) => r.role);
      const hasAny = roles.length > 0;
      const isSuper = roles.includes("super_admin" as any);

      if (!hasAny) {
        navigate("/");
        toast({ title: "Access denied", description: "Admin access required.", variant: "destructive" });
      } else {
        setIsAdmin(true);
        setIsSuperAdmin(isSuper);
      }
      setLoading(false);
    };
    checkAdmin();
  }, [session, navigate]);

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

  if (!session || !isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3">
              <LoganFullLogo size="sm" />
            </Link>
            <span className="text-muted-foreground text-sm">Admin Dashboard</span>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <span className="text-sm text-muted-foreground hidden md:block">{session.user.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold mb-2 text-foreground">Pilot Dashboard</h1>
          <p className="text-muted-foreground">
            Manage participants and view chats
            {isSuperAdmin && <span className="ml-2 text-xs uppercase tracking-wider text-primary">· Super admin</span>}
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList
            className={`grid w-full max-w-3xl ${isSuperAdmin ? "grid-cols-5" : "grid-cols-3"} bg-muted border border-border`}
          >
            <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="attribution" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Attribution</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Megaphone className="w-4 h-4" />
              <span className="hidden sm:inline">Notify</span>
            </TabsTrigger>
            {isSuperAdmin && (
              <>
                <TabsTrigger value="users" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">Users</span>
                </TabsTrigger>
                <TabsTrigger value="admins" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Shield className="w-4 h-4" />
                  <span className="hidden sm:inline">Admins</span>
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab />
          </TabsContent>

          <TabsContent value="attribution">
            <AttributionTab />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>

          {isSuperAdmin && (
            <>
              <TabsContent value="users">
                <ProfilesTab />
              </TabsContent>
              <TabsContent value="admins">
                <AdminManagement />
              </TabsContent>
            </>
          )}
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
