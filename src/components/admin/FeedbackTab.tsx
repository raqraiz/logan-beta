import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, RefreshCw, ThumbsUp, ThumbsDown, Heart, Activity } from "lucide-react";
import { format } from "date-fns";

interface Feedback {
  id: string;
  created_at: string;
  insight_id: string;
  participant_id: string;
  emoji_reaction: string | null;
  is_useful: boolean | null;
  emotion: string | null;
  action_taken: boolean | null;
  improvement_suggestion: string | null;
  free_form_text: string | null;
  participants?: {
    full_name: string;
  };
  insights?: {
    content: string;
    insight_type: string | null;
  };
}

export function FeedbackTab() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("feedback")
        .select(`
          *,
          participants(full_name),
          insights(content, insight_type)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFeedback(data || []);
    } catch (error) {
      console.error("Error fetching feedback:", error);
      toast({ title: "Error loading feedback", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <span className="font-medium">{feedback.length} Responses</span>
        </div>
        <Button variant="outline" size="sm" onClick={fetchFeedback}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Summary */}
      {feedback.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <ThumbsUp className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {feedback.filter(f => f.is_useful === true).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Found Useful</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {feedback.filter(f => f.action_taken === true).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Actions Taken</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">
                    {feedback.filter(f => f.emoji_reaction).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Reactions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {feedback.filter(f => f.improvement_suggestion || f.free_form_text).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Comments</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {feedback.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No feedback yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {feedback.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {item.participants?.full_name || "Unknown"}
                      {item.emoji_reaction && (
                        <span className="text-2xl">{item.emoji_reaction}</span>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(item.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {item.is_useful !== null && (
                      <Badge variant={item.is_useful ? "default" : "secondary"}>
                        {item.is_useful ? (
                          <><ThumbsUp className="w-3 h-3 mr-1" /> Useful</>
                        ) : (
                          <><ThumbsDown className="w-3 h-3 mr-1" /> Not useful</>
                        )}
                      </Badge>
                    )}
                    {item.action_taken !== null && (
                      <Badge variant={item.action_taken ? "default" : "outline"}>
                        {item.action_taken ? "Action taken" : "No action"}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {item.insights?.content && (
                  <div className="mb-4 p-3 rounded-lg bg-secondary/30 text-sm">
                    <p className="text-xs text-muted-foreground mb-1">Original insight:</p>
                    <p className="line-clamp-2">{item.insights.content}</p>
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  {item.emotion && (
                    <div>
                      <span className="text-muted-foreground">Emotion: </span>
                      <span>{item.emotion}</span>
                    </div>
                  )}
                  {item.improvement_suggestion && (
                    <div>
                      <span className="text-muted-foreground">Suggestion: </span>
                      <span>{item.improvement_suggestion}</span>
                    </div>
                  )}
                  {item.free_form_text && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <p className="text-xs text-muted-foreground mb-1">Free-form feedback:</p>
                      <p>{item.free_form_text}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
