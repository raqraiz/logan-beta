import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Users, RefreshCw, Search, Mail, Phone, Calendar
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface NotificationPreference {
  user_id: string;
  frequency: string;
  preferred_time: string;
  timezone: string;
  is_enabled: boolean;
}

export function ProfilesTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [notificationPrefs, setNotificationPrefs] = useState<Map<string, NotificationPreference>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch notification preferences
      const { data: prefsData, error: prefsError } = await supabase
        .from("notification_preferences")
        .select("*");

      if (prefsError) throw prefsError;

      setProfiles(profilesData || []);
      
      // Map preferences by user_id
      const prefsMap = new Map<string, NotificationPreference>();
      prefsData?.forEach(pref => {
        prefsMap.set(pref.user_id, pref);
      });
      setNotificationPrefs(prefsMap);
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error loading profiles", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = profiles.filter(p =>
    p.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.phone?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <span className="font-medium">{profiles.length} User Profiles</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[280px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Profiles Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No profiles found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Notifications</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((profile) => {
                  const prefs = notificationPrefs.get(profile.id);
                  return (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                            {profile.avatar_url ? (
                              <img 
                                src={profile.avatar_url} 
                                alt={profile.full_name}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              (profile.full_name?.[0] || profile.email?.[0] || "?").toUpperCase()
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{profile.full_name}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                              ID: {profile.id.slice(0, 8)}...
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="w-3 h-3 text-muted-foreground" />
                            <span className="truncate max-w-[200px]">{profile.email}</span>
                          </div>
                          {profile.phone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="w-3 h-3" />
                              <span>{profile.phone}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {prefs ? (
                          <div className="space-y-1">
                            <Badge variant={prefs.is_enabled ? "default" : "secondary"}>
                              {prefs.is_enabled ? "Enabled" : "Disabled"}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              {prefs.frequency} · {prefs.preferred_time}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {prefs.timezone}
                            </p>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not configured</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-3 h-3 text-muted-foreground" />
                            <span>{format(new Date(profile.created_at), "MMM d, yyyy")}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Updated {formatDistanceToNow(new Date(profile.updated_at), { addSuffix: true })}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
