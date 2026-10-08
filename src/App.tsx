import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Chat from "./pages/Chat";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import BackOfficeShell from "./components/backoffice/BackOfficeShell";
import TodayPage from "./components/backoffice/TodayPage";
import GrowthPage from "./components/backoffice/GrowthPage";
import FeedbackPage from "./components/backoffice/FeedbackPage";
import UsersPage from "./components/backoffice/UsersPage";
import UserPage from "./components/backoffice/UserPage";
import SuperOnly from "./components/backoffice/SuperOnly";
import Consent from "./pages/Consent";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Unsubscribe from "./pages/Unsubscribe";
import ShortRedirect from "./pages/ShortRedirect";

import IntegrationCallback from "./pages/IntegrationCallback";
import { Seo } from "@/components/Seo";
import { AnalyticsGate } from "@/components/AnalyticsGate";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Seo />
          <AnalyticsGate />
          <main>
            <Routes>
              <Route path="/" element={<Chat />} />
              <Route path="/s/:slug" element={<ShortRedirect />} />
              
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/logan-admin-access" element={<Auth />} />
              <Route path="/admin/classic" element={<Admin />} />
              <Route path="/admin" element={<BackOfficeShell />}>
                <Route index element={<TodayPage />} />
                <Route path="growth" element={<GrowthPage />} />
                <Route path="feedback" element={<FeedbackPage />} />
                <Route path="users" element={<SuperOnly><UsersPage /></SuperOnly>} />
                <Route path="users/:id" element={<SuperOnly><UserPage /></SuperOnly>} />
              </Route>
              <Route path="/consent" element={<Consent />} />
              <Route path="/privacy" element={<Consent />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/integrations/:provider/callback" element={<IntegrationCallback />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
