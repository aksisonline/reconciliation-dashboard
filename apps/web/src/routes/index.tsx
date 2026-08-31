import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSession } from "#/lib/auth-client";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isPending) return;
    navigate({ to: session ? "/dashboard" : "/login" });
  }, [isPending, session, navigate]);

  return null;
}
