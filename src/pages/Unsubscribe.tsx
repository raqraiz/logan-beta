import { LoganLogo } from "@/components/LoganLogo";

/**
 * Email unsubscribes are handled on the hosted unsubscribe page linked in the
 * footer of every Logan email. This page only explains that.
 */
export default function Unsubscribe() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full bg-card/80 backdrop-blur-sm rounded-2xl border border-border p-8 shadow-lg text-center">
        <div className="flex justify-center mb-6">
          <LoganLogo size="md" />
        </div>
        <h1 className="text-xl font-semibold mb-3">Manage your email preferences</h1>
        <p className="text-muted-foreground text-sm">
          To stop receiving emails from Logan, use the unsubscribe link at the bottom of any
          email we've sent you. It takes effect immediately.
        </p>
      </div>
    </div>
  );
}
