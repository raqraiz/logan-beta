import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Shield, ShieldCheck, RefreshCw, UserPlus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

interface AdminUser {
  id: string;
  user_id: string;
  role: "admin" | "super_admin";
  email: string | null;
  full_name: string | null;
}

export function AdminManagement() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
      const { data, error } = await supabase.functions.invoke("manage-admins", {
        body: { action: "list" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAdmins(data.admins || []);
    } catch (error: any) {
      console.error("Error fetching admins:", error);
      toast({ title: "Error loading admins", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const addAdmin = async () => {
    if (!newAdminEmail.trim()) {
      toast({ title: "Please enter an email", variant: "destructive" });
      return;
    }
    setIsAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-admins", {
        body: { action: "set_role", email: newAdminEmail.trim(), role: "admin" },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Admin added 🎉" });
      setNewAdminEmail("");
      fetchAdmins();
    } catch (error: any) {
      console.error(error);
      toast({ title: "Failed to add admin", description: error.message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const setRole = async (userId: string, role: "admin" | "super_admin") => {
    setBusyId(userId);
    try {
      const { data, error } = await supabase.functions.invoke("manage-admins", {
        body: { action: "set_role", user_id: userId, role },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }
      toast({ title: role === "super_admin" ? "Promoted to super admin" : "Demoted to admin" });
      fetchAdmins();
    } catch (error: any) {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const removeAdmin = async (userId: string) => {
    setBusyId(userId);
    try {
      const { data, error } = await supabase.functions.invoke("manage-admins", {
        body: { action: "remove", user_id: userId },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Admin removed" });
      fetchAdmins();
    } catch (error: any) {
      toast({ title: "Failed to remove admin", description: error.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const superAdmins = admins.filter((a) => a.role === "super_admin");
  const regularAdmins = admins.filter((a) => a.role === "admin");

  const renderRow = (admin: AdminUser) => {
    const isSelf = admin.user_id === currentUserId;
    const isSuper = admin.role === "super_admin";
    const Icon = isSuper ? ShieldCheck : Shield;
    return (
      <div
        key={admin.id}
        className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isSuper ? "bg-primary/15" : "bg-primary/10"}`}>
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">
                {admin.full_name || admin.email || admin.user_id.slice(0, 8) + "..."}
              </p>
              <Badge variant={isSuper ? "default" : "secondary"} className="text-[10px] uppercase tracking-wider">
                {isSuper ? "Super admin" : "Admin"}
              </Badge>
              {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {admin.email || `ID: ${admin.user_id.slice(0, 8)}...`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isSuper ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busyId === admin.user_id || isSelf}
              onClick={() => setRole(admin.user_id, "admin")}
              title={isSelf ? "You can't demote yourself" : "Demote to admin"}
            >
              <ArrowDown className="w-4 h-4 mr-1" />
              Demote
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={busyId === admin.user_id}
              onClick={() => setRole(admin.user_id, "super_admin")}
              title="Promote to super admin"
            >
              <ArrowUp className="w-4 h-4 mr-1" />
              Promote
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busyId === admin.user_id || isSelf}
            onClick={() => removeAdmin(admin.user_id)}
            className="text-destructive hover:text-destructive"
            title={isSelf ? "You can't remove yourself" : "Remove admin access"}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <span className="font-medium">{superAdmins.length} Super admin{superAdmins.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <span className="font-medium">{regularAdmins.length} Admin{regularAdmins.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add New Admin</CardTitle>
          <CardDescription>
            Enter the email of a registered user to grant admin access. Promote them to super admin afterwards if needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="admin-email" className="sr-only">Email</Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="user@example.com"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAdmin()}
              />
            </div>
            <Button onClick={addAdmin} disabled={isAdding}>
              <UserPlus className="w-4 h-4 mr-2" />
              {isAdding ? "Adding..." : "Add Admin"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            The user must have already signed up before you can make them an admin.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Super Admins</CardTitle>
          <CardDescription>Full access, including managing other admins.</CardDescription>
        </CardHeader>
        <CardContent>
          {superAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No super admins.</p>
          ) : (
            <div className="space-y-3">{superAdmins.map(renderRow)}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admins</CardTitle>
          <CardDescription>Access to dashboard except Users and Admins tabs.</CardDescription>
        </CardHeader>
        <CardContent>
          {regularAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No admins yet.</p>
          ) : (
            <div className="space-y-3">{regularAdmins.map(renderRow)}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
