import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LoganLogo } from "@/components/LoganLogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PROVIDER_NAMES: Record<string, string> = {
  whoop: "Whoop",
  fitbit: "Fitbit",
};

const IntegrationCallback = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { provider = "" } = useParams();
  const [count, setCount] = useState(3);

  const status = params.get("status");
  const message = params.get("message");
  const providerName = PROVIDER_NAMES[provider] ?? provider;

  useEffect(() => {
    if (status !== "ok") return;
    toast.success(`${providerName} connected`, {
      description: "Logan is pulling your data now. You'll see it in your insights and correlations soon.",
    });
    const t = setInterval(() => setCount((c) => c - 1), 1000);
    const r = setTimeout(() => navigate("/", { replace: true }), 3000);
    return () => { clearInterval(t); clearTimeout(r); };
  }, [status, navigate, providerName]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <LoganLogo size="lg" showGlow />
        </div>
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              {status === "ok" ? (
                <CheckCircle2 className="w-12 h-12 text-primary" />
              ) : status === "error" ? (
                <AlertCircle className="w-12 h-12 text-destructive" />
              ) : (
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
              )}
            </div>
            <CardTitle className="text-lg">
              {status === "ok"
                ? `${providerName} connected`
                : status === "error"
                  ? "Connection failed"
                  : "Finishing up…"}
            </CardTitle>
            <CardDescription>
              {status === "ok"
                ? `Pulling your last 30 days from ${providerName}. Redirecting in ${count}…`
                : status === "error"
                  ? message || "Something went wrong."
                  : "One sec."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate("/", { replace: true })} variant={status === "ok" ? "default" : "outline"}>
              Back to Logan
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IntegrationCallback;
