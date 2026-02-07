import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { LoganLogo } from "@/components/LoganLogo";
import { Phone, ArrowLeft, MessageCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

interface ParticipantInfo {
  participantId: string;
  firstName: string;
  telegramConnected: boolean;
  consentGiven: boolean;
}

const Resume = () => {
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [participant, setParticipant] = useState<ParticipantInfo | null>(null);
  const [chatId, setChatId] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const lookupParticipant = async () => {
    if (!phone.trim()) {
      toast({ title: "Please enter your phone number", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-participant", {
        body: { phone: phone.trim() },
      });

      if (error) throw error;

      if (!data.found) {
        toast({
          title: "No signup found",
          description: "We couldn't find a signup with that phone number. Please sign up first.",
          variant: "destructive",
        });
        return;
      }

      setParticipant(data);

      if (data.telegramConnected) {
        toast({
          title: "You're all set! ✨",
          description: "Your Telegram is already connected. You'll receive messages from Logan soon!",
        });
      }
    } catch (error) {
      console.error("Lookup error:", error);
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const connectTelegram = async () => {
    if (!chatId.trim() || !participant) {
      toast({ title: "Please enter your Telegram Chat ID", variant: "destructive" });
      return;
    }

    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-participant", {
        body: { 
          action: "connect-telegram",
          participantId: participant.participantId,
          chatId: chatId.trim()
        },
      });

      if (error) throw error;

      if (data.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }

      toast({ title: "Telegram connected! 🎉", description: "You'll start receiving insights from Logan soon." });
      setParticipant({ ...participant, telegramConnected: true });
    } catch (error) {
      console.error("Connect error:", error);
      toast({ title: "Failed to connect Telegram", variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  };

  const telegramBotUrl = "https://t.me/AskLoganBot?start=getchatid";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <LoganLogo size="lg" showGlow />
          </div>
          <h1 className="text-2xl font-display font-bold text-primary">Resume Your Signup</h1>
          <p className="text-muted-foreground mt-2">
            Enter your phone number to pick up where you left off
          </p>
        </div>

        {!participant ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Find Your Signup
              </CardTitle>
              <CardDescription>
                Enter the phone number you used when signing up
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 234 567 8900"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && lookupParticipant()}
                  className="h-12"
                />
              </div>
              <Button
                onClick={lookupParticipant}
                disabled={isLoading}
                className="w-full h-12"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Looking up...
                  </>
                ) : (
                  "Find My Signup"
                )}
              </Button>
            </CardContent>
          </Card>
        ) : participant.telegramConnected ? (
          <Card className="border-green-500/50 bg-green-500/5">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  You're all set, {participant.firstName}!
                </h2>
                <p className="text-muted-foreground mt-2">
                  Your Telegram is connected. Logan will send you personalized insights based on your cycle.
                </p>
              </div>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/">Back to Home</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-[#0088cc]" />
                Connect Telegram
              </CardTitle>
              <CardDescription>
                Hi {participant.firstName}! Complete your setup by connecting Telegram.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step 1: Open Telegram */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-sm flex items-center justify-center font-medium">1</span>
                  <span className="font-medium">Open our Telegram bot</span>
                </div>
                <div className="flex justify-center">
                  <QRCodeSVG
                    value={telegramBotUrl}
                    size={120}
                    bgColor="transparent"
                    fgColor="currentColor"
                    className="text-foreground"
                  />
                </div>
                <Button asChild variant="outline" className="w-full">
                  <a href={telegramBotUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Open @AskLoganBot
                  </a>
                </Button>
              </div>

              {/* Step 2: Get Chat ID */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-sm flex items-center justify-center font-medium">2</span>
                  <span className="font-medium">Press START and copy your Chat ID</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  The bot will send you a number. Paste it below.
                </p>
              </div>

              {/* Step 3: Enter Chat ID */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-sm flex items-center justify-center font-medium">3</span>
                  <span className="font-medium">Enter your Chat ID</span>
                </div>
                <Input
                  type="text"
                  placeholder="e.g. 123456789"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && connectTelegram()}
                  className="h-12"
                />
                <Button
                  onClick={connectTelegram}
                  disabled={isConnecting || !chatId.trim()}
                  className="w-full h-12"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Complete Setup"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Resume;
