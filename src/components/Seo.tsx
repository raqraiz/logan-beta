import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const SITE = "https://asklogan.ai";

type Meta = { title: string; description: string };

const ROUTE_META: Record<string, Meta> = {
  "/": {
    title: "Logan — Intelligent Cycle Guidance",
    description:
      "Your AI-powered cycle companion. Personalized insights to optimize energy, focus, and recovery across your menstrual cycle.",
  },
  "/community": {
    title: "Community — Logan",
    description:
      "Share feedback, ideas, and questions with the Logan community of women optimizing health and performance.",
  },
  "/auth/callback": {
    title: "Signing you in — Logan",
    description: "Completing your secure sign-in to Logan.",
  },
  "/logan-admin-access": {
    title: "Sign in — Logan",
    description: "Sign in to Logan to access your personalized cycle guidance.",
  },
  "/admin": {
    title: "Admin — Logan",
    description: "Logan admin dashboard.",
  },
  "/consent": {
    title: "Consent — Logan",
    description: "Review and provide consent to use Logan.",
  },
  "/reset-password": {
    title: "Reset password — Logan",
    description: "Reset your Logan account password.",
  },
};

const DEFAULT_META: Meta = {
  title: "Logan — Intelligent Cycle Guidance",
  description:
    "Your AI-powered cycle companion for energy, focus, and recovery.",
};

export const Seo = () => {
  const { pathname } = useLocation();
  const meta = ROUTE_META[pathname] ?? DEFAULT_META;
  const url = `${SITE}${pathname === "/" ? "/" : pathname}`;
  const noindex =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth/") ||
    pathname === "/logan-admin-access" ||
    pathname === "/reset-password" ||
    pathname === "/consent" ||
    pathname.startsWith("/integrations/");

  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
    </Helmet>
  );
};
