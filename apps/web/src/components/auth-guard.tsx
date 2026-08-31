import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "#/lib/auth-client";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: "/login" });
    }
  }, [isPending, session, navigate]);

  if (isPending) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!session) return null;

  return <>{children}</>;
}
