import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Shield, RefreshCw, UserPlus, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface AdminUser {
  id: string;
  user_id: string;
  role: string;
  email?: string;
}

export function AdminManagement() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .eq("role", "admin");

      if (error) throw error;
      setAdmins(data || []);
    } catch (error) {
      console.error("Error fetching admins:", error);
      toast({ title: "Error loading admins", variant: "destructive" });
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
      // Call edge function to add admin by email
      const { data, error } = await supabase.functions.invoke("add-admin", {
        body: { email: newAdminEmail.trim() },
      });

      if (error) throw error;

      if (data.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }

      toast({ title: "Admin added successfully! 🎉" });
      setNewAdminEmail("");
      fetchAdmins();
    } catch (error) {
      console.error("Error adding admin:", error);
      toast({ title: "Failed to add admin", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const removeAdmin = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");

      if (error) throw error;

      toast({ title: "Admin removed" });
      fetchAdmins();
    } catch (error) {
      console.error("Error removing admin:", error);
      toast({ title: "Failed to remove admin", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-primary" />
        <span className="font-medium">{admins.length} Admin{admins.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Add New Admin */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add New Admin</CardTitle>
          <CardDescription>
            Enter the email of a registered user to grant admin access
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

      {/* Admin List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current Admins</CardTitle>
        </CardHeader>
        <CardContent>
          {admins.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No admins yet. Add one above!
            </p>
          ) : (
            <div className="space-y-3">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {admin.email || admin.user_id.slice(0, 8) + "..."}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ID: {admin.user_id.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAdmin(admin.user_id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
